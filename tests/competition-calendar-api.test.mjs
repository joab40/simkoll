import { coachSessionFixture } from './helpers/coach-session-fixture.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
process.env.SUPABASE_URL = 'https://competition-test.invalid'
process.env.SUPABASE_SECRET_KEY = 'fixture-only'
process.env.COACH_SESSION_SECRET = 'fixture-only'
const { default: handler } = await import('../api/workouts.js')
const { createCoachToken } = await import('../server/coach-auth.js')
const { decodeCompetitionPm, canReadCompetition } = await import('../server/competition-pm.js')
const coach = createCoachToken({ id: 'fixture-coach', role: 'coach' })
const id = '11111111-1111-4111-8111-111111111111'
const profileId = '22222222-2222-4222-8222-222222222222'
const pdf = `data:application/pdf;base64,${Buffer.from('%PDF-1.7\nfixture').toString('base64')}`
const competition = { id, title: 'Testtävling', start_date: '2026-11-01', end_date: '2026-11-02', target_groups: ['junior'], entries_open: false, pm_document: null }
const reply = (data, ok = true) => ({ ok, status: ok ? 200 : 400, json: async () => data, text: async () => '' })
async function call(body, { method = 'POST', query = {}, code = coach, swimmer = false } = {}) {
  const response = { setHeader() {}, status(value) { this.code = value; return this }, json(data) { this.data = data; return this } }
  await coachSessionFixture(handler)({ method, query, body, headers: { 'x-simkoll-code': swimmer ? '' : code, ...(swimmer ? { cookie: 'simkoll_session=fixture' } : {}) } }, response)
  return response
}

test('competition validation rejects invalid dates and empty groups without writing', async () => {
  globalThis.fetch = async () => { throw new Error('No write expected') }
  for (const input of [{ startDate: '2026-02-30', endDate: '2026-03-01', targetGroups: ['junior'] }, { startDate: '2026-11-02', endDate: '2026-11-01', targetGroups: ['junior'] }, { startDate: '2026-11-01', endDate: '2026-11-01', targetGroups: [] }]) {
    assert.equal((await call({ action: 'save-competition', title: 'Test', ...input })).code, 400)
  }
})

test('creating and editing competition details preserves attached PM and entry settings', async () => {
  for (const existing of [false, true]) {
    globalThis.fetch = async (url, options) => {
      assert.equal(options.method, existing ? 'PATCH' : 'POST')
      const payload = JSON.parse(options.body)
      assert.equal(Object.hasOwn(payload, 'pm_document'), false)
      assert.equal(Object.hasOwn(payload, 'entries_open'), false)
      return reply([{ ...competition, ...payload }])
    }
    assert.equal((await call({ action: 'save-competition', ...(existing ? { id } : {}), title: 'Uppdaterad', startDate: '2026-11-01', endDate: '2026-11-02', targetGroups: ['junior'] })).code, 200)
  }
})

test('the coach can choose, preserve or clear the Flight Record building', async () => {
  let saved = { ...competition, flight_building: null }
  const writes = []
  globalThis.fetch = async (_url, options) => {
    const payload = JSON.parse(options.body)
    writes.push(payload.flight_building)
    saved = { ...saved, ...payload }
    return reply([saved])
  }
  const body = { action: 'save-competition', id, title: 'Norrlandsmästerskapen', startDate: '2026-11-01', targetGroups: ['junior'] }
  assert.equal((await call({ ...body, flightBuilding: 'championship' })).data.competition.flightBuilding, 'championship')
  assert.equal((await call(body)).data.competition.flightBuilding, 'championship')
  assert.equal((await call({ ...body, flightBuilding: 'regional-final' })).data.competition.flightBuilding, 'regional-final')
  assert.equal((await call({ ...body, flightBuilding: null })).data.competition.flightBuilding, null)
  assert.equal((await call({ ...body, flightBuilding: 'custom.png' })).code, 400)
  assert.deepEqual(writes, ['championship', undefined, 'regional-final', null])
})

test('opening entries with no selectable program reports an actionable error', async () => {
  const writes = []
  globalThis.fetch = async (url, options = {}) => { if (options.method) writes.push(options.method); return reply(String(url).includes('competition_calendar') ? [competition] : []) }
  const result = await call({ action: 'set-competition-entries-open', competitionId: id, open: true })
  assert.equal(result.code, 422)
  assert.match(result.data.error, /Spara ett grenprogram/)
  assert.deepEqual(writes, [])
})

test('PM types and content are checked; documents are scoped to assigned groups', () => {
  assert.equal(decodeCompetitionPm(pdf, 'Inbjudan.pdf').mime, 'application/pdf')
  assert.throws(() => decodeCompetitionPm('data:application/pdf;base64,YmFk', 'falsk.pdf'))
  assert.throws(() => decodeCompetitionPm('data:image/svg+xml;base64,YmFk', 'bild.svg'))
  assert.equal(canReadCompetition(competition, 'coach', null), true)
  assert.equal(canReadCompetition(competition, 'swimmer', { training_group: 'junior' }), true)
  assert.equal(canReadCompetition(competition, 'swimmer', { training_group: 'ungdom_orange' }), false)
  assert.equal(canReadCompetition(competition, 'swimmer', {}), false)
})

test('upload stores a private document pointer but never returns its storage path', async () => {
  globalThis.fetch = async (url, options = {}) => {
    const path = String(url)
    if (path.includes('/bucket/')) return reply({ public: false })
    if (path.includes('/storage/v1/object/')) { assert.equal(options.method, 'POST'); assert.equal(options.headers['Content-Type'], 'application/pdf'); return reply({}) }
    if (options.method === 'PATCH') {
      const payload = JSON.parse(options.body)
      assert.match(payload.pm_document.path, new RegExp(`^${id}/`))
      assert.equal(Object.hasOwn(payload, 'program_metadata'), false)
      return reply([{ ...competition, ...payload }])
    }
    return reply([competition])
  }
  const result = await call({ action: 'upload-competition-pm', competitionId: id, fileData: pdf, fileName: 'Inbjudan.pdf' })
  assert.equal(result.code, 200)
  assert.equal(result.data.competition.pmDocument.name, 'Inbjudan.pdf')
  assert.equal(Object.hasOwn(result.data.competition.pmDocument, 'path'), false)
})

test('failed attachment linking cleans up new upload; old PM is not deleted', async () => {
  const oldPath = `${id}/33333333-3333-4333-8333-333333333333.pdf`
  const deleted = []
  globalThis.fetch = async (url, options = {}) => {
    const path = String(url)
    if (path.includes('/bucket/')) return reply({ public: false })
    if (path.includes('/storage/')) { if (options.method === 'DELETE') deleted.push(...JSON.parse(options.body).prefixes); return reply({}) }
    if (options.method === 'PATCH') return reply({ message: 'failure' }, false)
    return reply([{ ...competition, pm_document: { path: oldPath } }])
  }
  assert.equal((await call({ action: 'upload-competition-pm', competitionId: id, fileData: pdf, fileName: 'Nytt.pdf' })).code, 422)
  assert.equal(deleted.length, 1)
  assert.notEqual(deleted[0], oldPath)
})

test('swimmer in another group cannot obtain PM link or remove competition', async () => {
  globalThis.fetch = async (url) => {
    const path = String(url)
    if (path.includes('profile_sessions?')) return reply([{ profile_id: profileId }])
    if (path.includes('profiles?')) return reply([{ id: profileId, active: true, approval_status: 'approved', training_group: 'ungdom_orange' }])
    assert(path.includes('competition_calendar?'))
    return reply([competition])
  }
  assert.equal((await call(null, { method: 'GET', query: { competitionPm: 'true', id }, swimmer: true })).code, 404)
  globalThis.fetch = async () => { throw new Error('No delete expected') }
  assert.equal((await call(null, { method: 'DELETE', query: { calendar: 'true', id }, swimmer: true })).code, 403)
})

test('assigned swimmer can open PM before entries open using a temporary link', async () => {
  globalThis.fetch = async (url, options = {}) => {
    const path = String(url)
    if (path.includes('profile_sessions?')) return reply([{ profile_id: profileId }])
    if (path.includes('profiles?')) return reply([{ id: profileId, active: true, approval_status: 'approved', training_group: 'junior' }])
    if (path.includes('/object/sign/competition-pm/')) { assert.equal(JSON.parse(options.body).expiresIn, 3600); return reply({ signedURL: '/object/sign/competition-pm/fixture.pdf?token=fixture' }) }
    return reply([{ ...competition, pm_document: { name: 'Inbjudan.pdf', path: `${id}/33333333-3333-4333-8333-333333333333.pdf` } }])
  }
  const result = await call(null, { method: 'GET', query: { competitionPm: 'true', id }, swimmer: true })
  assert.equal(result.code, 200)
  assert.equal(result.data.document.name, 'Inbjudan.pdf')
  assert.match(result.data.document.url, /^https:\/\/competition-test.invalid\/storage\/v1\/object\/sign\//)
})

test('failed entry save uses one transaction and never deletes existing selections via HTTP', async () => {
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).includes('competition_calendar?')) return reply([competition])
    assert(String(url).endsWith('/rpc/save_competition_entries'))
    assert.equal(options.method, 'POST')
    assert.equal(JSON.parse(options.body).p_coach, true)
    return reply({ message: 'INVALID_SELECTION' }, false)
  }
  const result = await call({ action: 'coach-update-competition-entry', competitionId: id, profileId, eventIds: [profileId] })
  assert.equal(result.code, 409)
  assert.match(result.data.error, /tidigare val finns kvar/)
})

test('individual choices override groups in the calendar and program without sharing the roster', async () => {
  const included = { ...competition, id, participant_overrides: { [profileId]: true, [id]: false } }
  const excluded = { ...competition, id: profileId, target_groups: ['ungdom_orange'], participant_overrides: { [profileId]: false } }
  globalThis.fetch = async input => {
    const url = new URL(input)
    if (url.pathname.endsWith('/profile_sessions')) return reply([{ profile_id: profileId }])
    if (url.pathname.endsWith('/profiles')) return reply([{ id: profileId, active: true, approval_status: 'approved', training_group: 'ungdom_orange' }])
    if (url.pathname.endsWith('/competition_calendar')) {
      const filter = url.searchParams.get('id')
      return reply([included, excluded].filter(row => !filter || filter === `eq.${row.id}`))
    }
    return reply([])
  }
  const calendar = await call(null, { method: 'GET', query: { calendar: 'true' }, swimmer: true })
  assert.deepEqual(calendar.data.competitions.map(row => row.id), [id])
  assert.equal(Object.hasOwn(calendar.data.competitions[0], 'participantOverrides'), false)
  for (const [competitionId, status] of [[id, 200], [profileId, 404]]) {
    const program = await call(null, { method: 'GET', query: { program: 'true', id: competitionId }, swimmer: true })
    assert.equal(program.code, status)
  }
})

test('coach can save and reset individual choices while stale writes preserve the latest saved list', async () => {
  const existing = '33333333-3333-4333-8333-333333333333'
  const start = '2026-11-20T10:00:00.000Z'
  let row = { ...competition, updated_at: start, participant_overrides: { [existing]: true, [id]: false } }
  let writes = 0
  globalThis.fetch = async (input, options) => {
    const url = new URL(input)
    if (url.pathname.endsWith('/profiles')) return reply([{ id: profileId }])
    assert(url.pathname.endsWith('/competition_calendar'))
    if (options.method === 'PATCH') {
      writes++
      assert.equal(url.searchParams.get('updated_at'), `eq.${row.updated_at}`)
      row = { ...row, ...JSON.parse(options.body) }
    }
    return reply([row])
  }
  const body = { action: 'save-competition-participants', competitionId: id, updatedAt: start, changes: { [profileId]: true, [id]: null } }
  const saved = await call(body)
  assert.equal(saved.code, 200)
  assert.deepEqual(saved.data.competition.participantOverrides, { [existing]: true, [profileId]: true })
  assert.equal((await call(body)).code, 409)
  assert.equal((await call(body, { swimmer: true })).code, 403)
  assert.equal(writes, 1)
})

test('competition logos are scoped to visible competitions and use temporary links', async () => {
  const version = '33333333-3333-4333-8333-333333333333'
  const row = { ...competition, logo_document: { version, surface: 'dark', path: `${id}/${version}.png` } }
  let group = 'ungdom_orange', signs = 0
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(input)
    if (url.pathname.endsWith('/profile_sessions')) return reply([{ profile_id: profileId }])
    if (url.pathname.endsWith('/profiles')) return reply([{ id: profileId, training_group: group }])
    if (url.pathname.endsWith('/competition_calendar')) return reply([row])
    assert(url.pathname.endsWith(`/object/sign/competition-logos/${row.logo_document.path}`))
    signs += 1
    if (options.headers['Content-Type'] !== 'application/json') return reply({ message: 'expiresIn is required' }, false)
    assert.equal(JSON.parse(options.body).expiresIn, 3600)
    return reply({ signedURL: '/object/sign/competition-logos/logo.png?token=fixture' })
  }
  const query = { competitionLogo: 'true', id }
  const read = params => call(null, { method: 'GET', query: params, swimmer: true })
  assert.equal((await read(query)).code, 404)
  assert.equal(signs, 0)
  group = 'junior'
  assert.deepEqual((await read({ calendar: 'true' })).data.competitions[0].logo, { version, surface: 'dark' })
  const result = await read(query)
  assert.equal(result.code, 200)
  assert.match(result.data.url, /^https:\/\/competition-test.invalid\/storage\/v1\/object\/sign\//)
  assert.equal(signs, 1)
  assert.equal((await call(null, { method: 'GET', query })).code, 200)
  assert.equal(signs, 2)
})

test('a coach can reuse an uploaded logo, clear an association and choose a standard logo', async () => {
  const previousVersion = '33333333-3333-4333-8333-333333333333'
  const uploadId = '44444444-4444-4444-8444-444444444444'
  const otherId = '55555555-5555-4555-8555-555555555555'
  const oldPath = `${id}/${previousVersion}.png`
  const rows = {
    [id]: { ...competition, logo_document: { version: previousVersion, path: oldPath } },
    [otherId]: { ...competition, id: otherId, logo_document: null },
  }
  const assets = new Map()
  let uploads = 0
  const removed = []
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(input)
    if (url.pathname.endsWith('/profile_sessions')) return reply([{ profile_id: profileId }])
    if (url.pathname.endsWith('/profiles')) return reply([{ id: profileId, training_group: 'junior' }])
    if (url.pathname.endsWith('/competition_logo_library')) {
      if (options.method === 'POST') {
        const asset = JSON.parse(options.body)
        assets.set(asset.id, asset)
        return reply([])
      }
      const assetId = url.searchParams.get('id')?.slice(3)
      if (assetId) return reply(assets.has(assetId) ? [assets.get(assetId)] : [])
      return reply([...assets.values()].map(({ id, name }) => ({ id, name })))
    }
    if (url.pathname.endsWith('/bucket/competition-logos')) return reply({ public: false })
    if (url.pathname.endsWith('/storage_usage_events')) return reply([])
    if (url.pathname.includes('/object/sign/competition-logos/')) {
      assert.equal(url.pathname.split('/competition-logos/')[1], `library/${uploadId}.png`)
      return reply({ signedURL: '/object/sign/competition-logos/logo.png?token=fixture' })
    }
    if (url.pathname.includes('/object/competition-logos')) {
      if (options.method === 'POST') {
        uploads += 1
        assert.equal(options.headers['Content-Type'], 'image/png')
      } else {
        assert.equal(options.headers['Content-Type'], 'application/json')
        removed.push(...JSON.parse(options.body).prefixes)
      }
      return reply({})
    }
    assert(url.pathname.endsWith('/competition_calendar'))
    const competitionId = url.searchParams.get('id').slice(3)
    const row = rows[competitionId]
    if (options.method === 'PATCH') {
      if (row.logo_document) assert.equal(url.searchParams.get('logo_document->>version'), `eq.${row.logo_document.version}`)
      else assert.equal(url.searchParams.get('logo_document'), 'is.null')
      rows[competitionId] = { ...row, ...JSON.parse(options.body) }
    }
    return reply([rows[competitionId]])
  }
  const logoData = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j3ioAAAAASUVORK5CYII='
  const body = { action: 'set-competition-logo', competitionId: id, logoData, logoName: 'Min tävlingslogga', logoUploadId: uploadId, previousVersion }
  assert.equal((await call({ ...body, logoData: pdf })).code, 422)
  assert.equal((await call({ ...body, presetId: 'club' })).code, 400)
  assert.equal(uploads, 0)
  const result = await call(body)
  assert.equal(result.code, 200)
  assert.notEqual(result.data.competition.logo.version, previousVersion)
  assert.equal(uploads, 1)
  assert.deepEqual(removed, [oldPath])
  assert.equal((await call(body)).code, 409)
  assert.equal(uploads, 1)

  const catalog = { method: 'GET', query: { competitionLogoLibrary: 'true' } }
  assert.deepEqual((await call(null, catalog)).data.logos, [{ id: uploadId, name: 'Min tävlingslogga' }])
  assert.equal((await call(null, { ...catalog, swimmer: true })).code, 403)
  const preview = { method: 'GET', query: { competitionLogoAsset: uploadId } }
  assert.equal((await call(null, preview)).code, 200)
  assert.equal((await call(null, { ...preview, swimmer: true })).code, 403)

  const shared = await call({ action: body.action, competitionId: otherId, previousVersion: null, libraryId: uploadId })
  assert.equal(shared.code, 200)
  assert.equal(rows[otherId].logo_document.path, rows[id].logo_document.path)
  assert.notEqual(rows[otherId].logo_document.version, rows[id].logo_document.version)
  const cleared = await call({ action: body.action, competitionId: id, previousVersion: rows[id].logo_document.version, logoData: null })
  assert.equal(cleared.code, 200)
  assert.equal(cleared.data.competition.logo, null)
  assert.equal((await call(null, { method: 'GET', query: { competitionLogo: 'true', id: otherId }, swimmer: true })).code, 200)
  assert.equal(uploads, 1)
  assert.deepEqual(removed, [oldPath])

  const preset = await call({ action: body.action, competitionId: id, previousVersion: null, presetId: 'regional' })
  assert.equal(preset.code, 200)
  assert.equal(preset.data.competition.logo.presetId, 'regional')
  assert.equal((await call(null, { method: 'GET', query: { competitionLogo: 'true', id }, swimmer: true })).data.url, '/competition-logos/regional.png')
  assert.equal(uploads, 1)
})

test('the swimmer home logo starts on the Monday of competition week', async () => {
  const { showCompetitionLogoThisWeek } = await import('../shared/competition-logo-presets.js')
  const meet = { startDate: '2026-11-27', endDate: '2026-11-29', logo: { presetId: 'club' } }
  assert.equal(showCompetitionLogoThisWeek(meet, '2026-11-22'), false)
  assert.equal(showCompetitionLogoThisWeek(meet, '2026-11-23'), true)
  assert.equal(showCompetitionLogoThisWeek(meet, '2026-11-29'), true)
  assert.equal(showCompetitionLogoThisWeek(meet, '2026-11-30'), false)
  assert.equal(showCompetitionLogoThisWeek({ ...meet, endDate: '2026-11-30' }, '2026-11-30'), true)
  assert.equal(showCompetitionLogoThisWeek({ ...meet, logo: null }, '2026-11-26'), false)
})

test('competition uploads still attach to a meet while the library migration is pending', async () => {
  let row = { ...competition, logo_document: null }
  let uploadedPath = ''
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(input)
    if (url.pathname.endsWith('/competition_logo_library')) return reply({ code: 'PGRST205' }, false)
    if (url.pathname.endsWith('/bucket/competition-logos')) return reply({ public: false })
    if (url.pathname.endsWith('/storage_usage_events')) return reply([])
    if (url.pathname.includes('/object/competition-logos/')) {
      assert.equal(options.method, 'POST')
      uploadedPath = url.pathname.split('/competition-logos/')[1]
      return reply({})
    }
    assert(url.pathname.endsWith('/competition_calendar'))
    if (options.method === 'PATCH') row = { ...row, ...JSON.parse(options.body) }
    return reply([row])
  }
  const logoData = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j3ioAAAAASUVORK5CYII='
  const saved = await call({ action: 'set-competition-logo', competitionId: id, previousVersion: null, logoData })
  assert.equal(saved.code, 200)
  assert.equal(uploadedPath, `${id}/${saved.data.competition.logo.version}.png`)
  assert.equal(row.logo_document.path, uploadedPath)
  assert.equal(row.logo_document.libraryId, undefined)
})
