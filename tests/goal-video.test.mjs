import test from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { sampleVideo, atom } from './fixtures/goal-video.mjs'
import { inspectGoalVideo, GOAL_VIDEO_MAX_BYTES } from '../shared/goal-video.js'
import { uploadGoalVideo, uploadVideoFile } from '../src/goal-video-upload.js'

process.env.SUPABASE_SECRET_KEY = 'fixture-only-secret'
process.env.SUPABASE_URL = 'https://goal-video-test.invalid'
const { beginGoalVideo, finishGoalVideo, replaceGoalImage, clearGoalMedia, signedGoalVideo, cancelGoalVideo } = await import('../server/goal-video.js')
const owner = '11111111-1111-4111-8111-111111111111', goalId = '22222222-2222-4222-8222-222222222222'
const goal = { id: goalId, profile_id: owner, updated_at: '2026-10-30T08:00:00Z', image_path: null }
const json = (data, status = 200) => new Response(JSON.stringify(data), { status })
function fixture({ conflict = false, rejectPatch = false, publicBucket = false } = {}) {
  const files = new Map(), writes = [], removedImages = []
  let row = { ...goal }
  const deps = {
    storage: async (path, options = {}) => {
      if (path.startsWith('bucket/')) return json({ public: publicBucket, file_size_limit: GOAL_VIDEO_MAX_BYTES })
      if (path.startsWith('object/list/')) return json([])
      if (path.startsWith('object/upload/sign/')) return json({ url: `/${path}?token=fixture-upload-token` })
      if (path.startsWith('object/sign/')) { writes.push({ signed: true, options }); return json({ signedURL: `/${path}?token=private-read` }) }
      const prefix = 'object/goal-analysis-videos/'
      if (path === 'object/goal-analysis-videos' && options.method === 'DELETE') { const names = JSON.parse(options.body).prefixes; writes.push({ removed: names }); names.forEach((name) => files.delete(name)); return json({}) }
      if (path.startsWith(prefix)) {
        const name = path.slice(prefix.length)
        if (options.method === 'POST') { files.set(name, Buffer.from(options.body)); writes.push({ uploaded: name }); return json({}) }
        return files.has(name) ? new Response(files.get(name)) : json({}, 404)
      }
      throw new Error(`Unexpected storage path: ${path}`)
    },
    db: async (path, options = {}) => {
      if (!options.method) return json([])
      writes.push({ patch: JSON.parse(options.body), path })
      if (rejectPatch) return json({}, 500)
      if (conflict) return json([])
      row = { ...row, ...JSON.parse(options.body) }; return json([row])
    },
    saveImage: async () => `${owner}/33333333-3333-4333-8333-333333333333.jpg`,
    removeImage: async (path) => removedImages.push(path),
  }
  return { deps, files, writes, removedImages, get row() { return row } }
}
async function startUpload(f, bytes = sampleVideo(), record = goal) {
  const started = await beginGoalVideo(record, { bytes: bytes.length }, f.deps)
  const path = JSON.parse(Buffer.from(started.ticket.split('.')[0], 'base64url').toString()).path
  f.files.set(path, bytes)
  return { ...started, path }
}

test('MP4/MOV metadata supports H.264/HEVC and 64-bit clocks, retaining original dimensions', () => {
  for (const codec of ['avc1', 'avc3', 'hvc1', 'hev1']) for (const version of [0, 1]) {
    const info = inspectGoalVideo(sampleVideo({ codec, version, seconds: 30 }))
    assert.equal(info.durationMs, 30000); assert.equal(info.codec, codec)
    assert.equal(info.width, 1280); assert.equal(info.height, 720)
  }
})
test('too long, oversized, audio-only, encrypted, unknown and malformed files are refused', () => {
  assert.throws(() => inspectGoalVideo(sampleVideo({ seconds: 31 })), /30 sekunder/)
  assert.throws(() => inspectGoalVideo(sampleVideo({ audioSeconds: 31 })), /ljudspår/)
  assert.throws(() => inspectGoalVideo(new Uint8Array(GOAL_VIDEO_MAX_BYTES + 1)), /25 MB/)
  assert.throws(() => inspectGoalVideo(sampleVideo({ handler: 'soun' })), /videospår/)
  for (const codec of ['encv', 'vp09', 'jpeg']) assert.throws(() => inspectGoalVideo(sampleVideo({ codec })), /MP4/)
  assert.throws(() => inspectGoalVideo(sampleVideo({ seconds: 0 })), /längd/)
  assert.throws(() => inspectGoalVideo(Buffer.from('<html>not a video</html>')))
  assert.throws(() => inspectGoalVideo(sampleVideo().subarray(0, 20)))
  const invalid = atom('ftyp', Buffer.alloc(8)); invalid.writeUInt32BE(999999)
  assert.throws(() => inspectGoalVideo(invalid), /Skadad/)
})
test('private storage and a real goal are required before a bounded upload URL is issued', async () => {
  await assert.rejects(beginGoalVideo({ ...goal, profile_id: '../other' }, { bytes: 100 }), /hittas/)
  await assert.rejects(beginGoalVideo(goal, { bytes: GOAL_VIDEO_MAX_BYTES + 1 }), /25 MB/)
  await assert.rejects(beginGoalVideo(goal, { bytes: 100 }, fixture({ publicBucket: true }).deps), /109/)
  const f = fixture(), started = await startUpload(f)
  assert.match(started.uploadUrl, /object\/upload\/sign\/goal-analysis-videos/)
  assert.doesNotMatch(JSON.stringify(started), /fixture-only-secret/)
})
test('validated bytes go to a new immutable path; an old upload token cannot modify the published video', async () => {
  const f = fixture(), bytes = sampleVideo(), started = await startUpload(f, bytes)
  const saved = await finishGoalVideo(goal, { ticket: started.ticket }, f.deps)
  assert.notEqual(saved.video_path, started.path)
  assert.ok(saved.video_path.startsWith(`${owner}/${goalId}/`))
  assert.equal(saved.video_duration_ms, 5000); assert.equal(saved.video_bytes, bytes.length)
  assert.deepEqual(f.files.get(saved.video_path), bytes)
  assert.equal(f.files.has(started.path), false)
  f.files.set(started.path, Buffer.from('changed via old upload token'))
  assert.deepEqual(f.files.get(saved.video_path), bytes)
  assert.deepEqual(Object.keys(f.writes.find((row) => row.patch).patch).sort(), ['image_path', 'updated_at', 'video_bytes', 'video_codec', 'video_duration_ms', 'video_path', 'video_poster_path'])
})
test('forged, expired, cross-goal, changed-version and mismatched-size tickets cannot attach a file', async () => {
  const f = fixture(), started = await startUpload(f)
  await assert.rejects(finishGoalVideo(goal, { ticket: started.ticket + 'x' }, f.deps), /ogiltig/)
  await assert.rejects(finishGoalVideo({ ...goal, id: owner }, { ticket: started.ticket }, f.deps), /hör inte/)
  await assert.rejects(finishGoalVideo({ ...goal, updated_at: 'newer' }, { ticket: started.ticket }, f.deps), /ändrades/)
  const data = JSON.parse(Buffer.from(started.ticket.split('.')[0], 'base64url').toString()); data.expires = 1
  const encoded = Buffer.from(JSON.stringify(data)).toString('base64url'), signature = createHmac('sha256', process.env.SUPABASE_SECRET_KEY).update(`goal-video-v1:${encoded}`).digest('base64url')
  await assert.rejects(finishGoalVideo(goal, { ticket: `${encoded}.${signature}` }, f.deps), /gått ut/)
  f.files.set(started.path, sampleVideo({ seconds: 31 }))
  await assert.rejects(finishGoalVideo(goal, { ticket: started.ticket }, f.deps), /30 sekunder/)
  f.files.set(started.path, Buffer.from('wrong size'))
  await assert.rejects(finishGoalVideo(goal, { ticket: started.ticket }, f.deps), /storlek/)
  assert.ok(f.writes.every((row) => !row.patch))
})
test('confirmed conflicts remove only the new immutable upload; uncertain failures retain it', async () => {
  const conflict = fixture({ conflict: true }), started = await startUpload(conflict)
  await assert.rejects(finishGoalVideo(goal, { ticket: started.ticket }, conflict.deps), /någon annan/)
  assert.equal(conflict.files.size, 1); assert.ok(conflict.files.has(started.path))
  const uncertain = fixture({ rejectPatch: true }), pending = await startUpload(uncertain)
  await assert.rejects(finishGoalVideo(goal, { ticket: pending.ticket }, uncertain.deps), /kontrollera/)
  assert.equal(uncertain.files.size, 2)
})
test('image/video replacement and removal preserve text and history with version protection', async () => {
  const f = fixture(), started = await startUpload(f), video = await finishGoalVideo(goal, { ticket: started.ticket }, f.deps)
  await assert.rejects(replaceGoalImage(video, { expectedUpdatedAt: 'stale' }, f.deps), /ändrats/)
  const image = await replaceGoalImage(video, { expectedUpdatedAt: video.updated_at, imageData: 'fixture' }, f.deps)
  assert.equal(image.video_path, null); assert.ok(image.image_path); assert.equal(f.files.size, 0)
  const cleared = await clearGoalMedia(image, { expectedUpdatedAt: image.updated_at }, f.deps)
  assert.equal(cleared.image_path, null); assert.deepEqual(f.removedImages, [image.image_path])
  assert.ok(f.writes.filter((row) => row.patch).every(({ patch }) => !Object.hasOwn(patch, 'profile_id') && !Object.hasOwn(patch, 'title') && !Object.hasOwn(patch, 'status')))
})
test('cancel only removes the ticket-scoped staging object; signed playback cannot use another owner path', async () => {
  const f = fixture(), started = await startUpload(f)
  await cancelGoalVideo(goal, { ticket: started.ticket }, f.deps)
  assert.equal(f.files.size, 0)
  const record = { ...goal, video_path: `${owner}/${goalId}/33333333-3333-4333-8333-333333333333.mp4` }
  assert.match(await signedGoalVideo(record, false, f.deps), /object\/sign/)
  assert.equal(JSON.parse(f.writes.find((row) => row.signed).options.body).expiresIn, 1800)
  assert.equal(await signedGoalVideo({ ...record, profile_id: goalId }, false, f.deps), null)
})
test('client upload sends bytes directly to storage and only ticket/thumbnail to the API', async () => {
  const requests = [], file = new Blob([sampleVideo()], { type: 'video/mp4' })
  const request = async (url, code, options) => { requests.push({ url, code, body: JSON.parse(options.body) }); return requests.length === 1 ? { ticket: 'signed-ticket', uploadUrl: 'https://storage.invalid/upload?token=fixture' } : { goal: { id: goalId } } }
  const result = await uploadGoalVideo(request, 'private-coach-session', goalId, { file, posterData: null }, { upload: async (url, uploaded) => { assert.match(url, /storage.invalid/); assert.equal(uploaded, file) } })
  assert.equal(result.goal.id, goalId)
  assert.equal(requests[0].body.bytes, file.size)
  assert.deepEqual(requests[1].body, { action: 'finish-goal-video', goalId, ticket: 'signed-ticket', posterData: null })
  assert.doesNotMatch(JSON.stringify(requests), /data:video|ftyp/)
})
test('failed client uploads cancel the temporary object and do not finalize', async () => {
  const actions = []
  await assert.rejects(uploadGoalVideo(async (_, __, options) => { const body = JSON.parse(options.body); actions.push(body.action); return { ticket: 'ticket', uploadUrl: 'https://storage.invalid/upload' } }, 'coach', goalId, { file: new Blob(['file']) }, { upload: async () => { throw new Error('network error') } }), /network/)
  assert.deepEqual(actions, ['begin-goal-video', 'cancel-goal-video'])
})
test('direct XHR does not forward Simkoll credentials and reports upload progress', async () => {
  let xhr, sent, progress
  await uploadVideoFile('https://storage.invalid/upload?token=fixture', new Blob(['file']), { onProgress: (value) => { progress = value }, makeXhr: () => (xhr = { upload: {}, open: (method, url) => { assert.equal(method, 'PUT'); assert.match(url, /storage.invalid/) }, setRequestHeader: (key) => assert.equal(key, 'x-upsert'), send: (body) => { sent = body; xhr.upload.onprogress({ lengthComputable: true, loaded: 2, total: 4 }); xhr.status = 200; xhr.onload() } }) })
  assert.equal(xhr.withCredentials, false); assert.equal(progress, 50)
  assert.equal(sent.get('cacheControl'), '0'); assert.equal(sent.get('').size, 4)
})
