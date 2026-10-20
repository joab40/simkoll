import test from 'node:test'
import assert from 'node:assert/strict'
import { startTalkRecording, appendTalkTranscript } from '../src/talk-dictation.js'

function setup(extra = {}) {
  let recorder, stopped = 0
  const results = [], errors = []
  const stream = { getTracks: () => [{ stop: () => stopped++ }] }
  class Recorder {
    static isTypeSupported(type) { return type === 'audio/mp4' }
    constructor(source, options) { this.stream = source; this.mimeType = options.mimeType; this.state = 'inactive'; recorder = this }
    start() { this.state = 'recording' }
    stop() { this.state = 'inactive'; this.onstop?.() }
    data(text) { this.ondataavailable({ data: new Blob([text]) }) }
  }
  return { options: { Recorder, mediaDevices: { getUserMedia: async () => stream }, onResult: (blob) => results.push(blob), onError: (error) => errors.push(error), ...extra }, results, errors, stream, get recorder() { return recorder }, get stopped() { return stopped } }
}

test('explicit stop produces an in-memory audio blob and releases the microphone', async () => {
  const state = setup(), session = await startTalkRecording(state.options)
  await session.ready
  assert.equal(state.results.length, 0)
  state.recorder.data('spoken note'); session.stop()
  assert.equal(state.results.length, 1)
  assert.equal(state.results[0].type, 'audio/mp4')
  assert.equal(await state.results[0].text(), 'spoken note')
  assert.ok(state.stopped > 0)
})

test('cancelled recording is not submitted, including while permission is pending', async () => {
  let allow
  const state = setup()
  state.options.mediaDevices.getUserMedia = () => new Promise((resolve) => { allow = resolve })
  const session = await startTalkRecording(state.options)
  session.cancel(); allow(state.stream); await session.ready
  assert.equal(state.recorder, undefined)
  assert.equal(state.results.length, 0)
  assert.ok(state.stopped > 0)
  const active = setup(), recording = await startTalkRecording(active.options)
  await recording.ready; active.recorder.data('discard'); recording.cancel()
  assert.equal(active.results.length, 0)
  assert.ok(active.stopped > 0)
})

test('oversized and empty recordings fail locally without submitting audio', async () => {
  const state = setup({ maxBytes: 3 }), session = await startTalkRecording(state.options)
  await session.ready; state.recorder.data('too large')
  assert.equal(state.results.length, 0); assert.match(state.errors[0].message, /för stor/)
  const empty = setup(), recording = await startTalkRecording(empty.options)
  await recording.ready; recording.stop()
  assert.equal(empty.results.length, 0); assert.match(empty.errors[0].message, /Inget ljud/)
})

test('the recording stops automatically at the time limit', async () => {
  const state = setup({ maxMs: 5 }), session = await startTalkRecording(state.options)
  await session.ready; state.recorder.data('note')
  await new Promise((resolve) => setTimeout(resolve, 15))
  assert.equal(state.recorder.state, 'inactive'); assert.equal(state.results.length, 1)
})

test('reviewed text appends without replacing notes and enforces the note limit', () => {
  assert.equal(appendTalkTranscript('Existing', ' New '), 'Existing\n\nNew')
  assert.throws(() => appendTalkTranscript('a'.repeat(10000), 'b'), /10 000/)
})
