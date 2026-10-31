import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { agreementText, agreementPlainText, agreementExcerpt, latestCompletedAgreement } from '../shared/swimmer-agreement.js'
process.env.SUPABASE_URL = 'https://agreement-card.invalid'
process.env.SUPABASE_SECRET_KEY = 'fixture-only'
process.env.SIMKOLL_COACH_CODE = 'agreement-coach'
process.env.SIMKOLL_SWIMMER_CODE = 'agreement-swimmer'
const { loadSwimmerAgreement } = await import('../server/swimmer-agreement.js')
const { default: handler } = await import('../api/goals.js')
const owner = '11111111-1111-4111-8111-111111111111', other = '22222222-2222-4222-8222-222222222222', talkId = '33333333-3333-4333-8333-333333333333'
const talk = (extra = {}) => ({ id: talkId, swimmerId: owner, status: 'completed', meetingDate: '2026-10-20', createdAt: '2026-10-20T12:00:00Z', agreement: { summary: 'Vi mäter vändningarna.' }, ...extra })
const db = (extra = {}) => ({ id: talkId, swimmer_id: owner, status: 'completed', meeting_date: '2026-10-20', created_at: '2026-10-20T12:00:00Z', agreement: { summary: 'Vi mäter vändningarna.' }, ...extra })
const json = (value, status = 200) => new Response(JSON.stringify(value), { status })
const call = async (query = { agreementCard: 'true', profileId: owner }, code = 'agreement-coach') => {
  const response = { headers: {}, setHeader(key, value) { this.headers[key] = value }, status(code) { this.code = code; return this }, json(data) { this.data = data; return this } }
  await handler({ method: 'GET', query, headers: { 'x-simkoll-code': code } }, response)
  return response
}

test('a new preparation, empty completed record or other swimmer cannot replace a completed agreement', () => {
  const original = talk(), rows = [
    talk({ id: 'prepared', status: 'prepared', meetingDate: '2026-10-31' }),
    talk({ id: 'draft', status: 'draft', meetingDate: '2026-10-31' }),
    talk({ id: 'empty', agreement: { summary: '  ' }, meetingDate: '2026-10-30' }),
    talk({ id: 'other', swimmerId: other, meetingDate: '2026-10-31' }),
    talk({ id: 'bad-date', meetingDate: '2026-02-30' }), original,
  ]
  assert.equal(latestCompletedAgreement(rows, owner).id, original.id)
  assert.equal(latestCompletedAgreement(rows, 'absent'), null)
  assert.equal(rows.at(-1), original) // Input order/objects are not mutated.
})

test('meeting date then creation order selects the source, not a recent edit to an older meeting', () => {
  const result = latestCompletedAgreement([
    talk({ id: 'old-edited', meetingDate: '2025-10-20', updatedAt: '2026-10-31' }),
    talk({ id: 'same-date-older', createdAt: '2026-10-20T11:00:00Z' }),
    talk({ enabled: false, followUpDate: '2026-11-20', coachNotes: { summary: 'PRIVATE NOTE' }, swimmerAnswers: { answer: 'PRIVATE ANSWER' }, coachPreparation: { text: 'PRIVATE ANALYSIS' } }),
  ], owner)
  assert.equal(result.id, talkId)
  assert.equal(result.followUpDate, '2026-11-20')
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE|coachNotes|swimmerAnswers|coachPreparation/)
})

test('legacy agreement text is supported, but a cleared canonical summary stays empty', () => {
  assert.equal(agreementText({ goals: 'Vändningar', next: 'Mäta igen', ignored: 4 }), 'Vändningar\n\nMäta igen')
  assert.equal(agreementText({ summary: '', old: 'Must not return' }), '')
  assert.equal(agreementText(' Text '), 'Text')
  for (const value of [null, undefined, 5, [], {}]) assert.equal(agreementText(value), '')
})

test('excerpt is source text, not generated goals, preserves units and avoids split Unicode characters', () => {
  const text = '### Tidsmål\n**50 m fjärilsim:** under 30 sekunder.\n- Gym 2–3 gånger per vecka.\n' + 'Vi följer upp tillsammans. '.repeat(30)
  const full = agreementPlainText(text), excerpt = agreementExcerpt(text)
  assert.match(full, /^Tidsmål\n50 m fjärilsim: under 30 sekunder.\n• Gym 2–3 gånger per vecka./)
  assert.equal(excerpt.truncated, true)
  assert.ok(full.startsWith(excerpt.text.slice(0, -1)))
  assert.ok(Array.from(excerpt.text).length <= 321)
  assert.equal(agreementExcerpt('Kort text').truncated, false)
  const unicode = agreementExcerpt('🏊'.repeat(400))
  assert.equal(Array.from(unicode.text).length, 321)
  assert.ok(!unicode.text.includes('\ufffd'))
  assert.equal(agreementPlainText('<img src=x onerror=alert(1)>'), '<img src=x onerror=alert(1)>') // Displayed as React text, not HTML.
})

test('loader pages past empty completed records and only reads projected agreement fields', async () => {
  const calls = []
  const result = await loadSwimmerAgreement(owner, async (path) => {
    const url = new URL(path, 'https://agreement-card.invalid')
    calls.push(Number(url.searchParams.get('offset')))
    assert.equal(url.searchParams.get('swimmer_id'), `eq.${owner}`)
    assert.equal(url.searchParams.get('status'), 'eq.completed')
    assert.equal(url.searchParams.get('order'), 'meeting_date.desc,created_at.desc,id.desc')
    assert.doesNotMatch(url.searchParams.get('select'), /\*|coach_notes|coach_preparation|swimmer_answers/)
    return json(calls.length === 1 ? Array(50).fill(db({ agreement: {} })) : [db()])
  })
  assert.deepEqual(calls, [0, 50])
  assert.equal(result.id, talkId)
})

test('no agreement, a failed page and the safety ceiling remain distinguishable', async () => {
  assert.equal(await loadSwimmerAgreement(owner, async () => json([])), null)
  let calls = 0
  await assert.rejects(loadSwimmerAgreement(owner, async () => ++calls === 1 ? json(Array(50).fill(db({ agreement: {} }))) : json({}, 503)), /kunde inte hämtas/)
  await assert.rejects(loadSwimmerAgreement(owner, async () => json(Array(50).fill(db({ agreement: {} })))), /för stor/)
})

test('agreement-card API denies unauthorized reads and invalid IDs before any storage access', async () => {
  globalThis.fetch = () => assert.fail('unauthorized or invalid read')
  for (const code of ['agreement-swimmer', 'unknown']) assert.equal((await call(undefined, code)).code, 403)
  for (const profileId of ['', 'bad', owner + '&select=*']) assert.equal((await call({ agreementCard: 'true', profileId })).code, 400)
})

test('API card response is private, minimal and does not perform AI calls or writes', async () => {
  globalThis.fetch = async (raw, options = {}) => {
    const url = new URL(raw)
    assert.equal(url.hostname, 'agreement-card.invalid')
    assert.equal(options.method, undefined)
    assert.equal(url.searchParams.get('swimmer_id'), `eq.${owner}`)
    return json([db({ coach_notes: { summary: 'PRIVATE' }, swimmer_answers: { answer: 'PRIVATE' }, coach_preparation: { text: 'PRIVATE' } })])
  }
  const result = await call()
  assert.equal(result.code, 200)
  assert.match(result.headers['Cache-Control'], /\bno-store\b/)
  assert.equal(result.data.talk.id, talkId)
  assert.doesNotMatch(JSON.stringify(result.data), /PRIVATE|coach_notes|swimmer_answers|coachPreparation/)
})

test('API read failures are not reported as absence of an agreement', async () => {
  globalThis.fetch = async () => json({}, 503)
  const result = await call()
  assert.equal(result.code, 502)
  assert.match(result.data.error, /kunde inte hämtas/)
  assert.equal(Object.hasOwn(result.data, 'talk'), false)
})

test('exact talk navigation scopes by profile and ID rather than the latest 200 club-wide records', async () => {
  globalThis.fetch = async (raw) => {
    const url = new URL(raw)
    if (url.pathname.endsWith('/app_settings')) return json([])
    assert.equal(url.searchParams.get('id'), `eq.${talkId}`)
    assert.equal(url.searchParams.get('swimmer_id'), `eq.${owner}`)
    assert.equal(url.searchParams.get('limit'), '1')
    return json([db()])
  }
  const result = await call({ talks: 'true', profileId: owner, talkId })
  assert.equal(result.code, 200)
  assert.equal(result.data.talks[0].id, talkId)
  globalThis.fetch = () => assert.fail('unscoped exact talk read')
  assert.equal((await call({ talks: 'true', talkId })).code, 400)
})

test('card is mounted only inside expanded swimmer details and exact navigation retains dirty-change guards', async () => {
  const main = await readFile(new URL('../src/main.jsx', import.meta.url), 'utf8')
  const card = await readFile(new URL('../src/swimmer-agreement-card.jsx', import.meta.url), 'utf8')
  const editor = await readFile(new URL('../src/development-talk-editor.jsx', import.meta.url), 'utf8')
  assert.ok(main.indexOf('<SwimmerAgreementCard') > main.indexOf('{isExpanded && <div className="swimmer-card-details">'))
  assert.ok(main.indexOf('<SwimmerAgreementCard') < main.indexOf('<SwimmerCompactWeek training={training} profileId={profile.id} />', main.indexOf('function Swimmers(')))
  assert.match(main, /onOpenTalk=\{coachVisible\('talks'\)/)
  assert.match(main, /initialTalkId=\{talkNavigation\?\.talkId/)
  assert.match(main, /item.id === initialTalkId && item.swimmerId === initialProfileId/)
  assert.match(editor, /if \(!dirty \|\| window.confirm/)
  assert.match(card, /result\?\.key !== key/)
  assert.match(card, /data.talk.swimmerId !== profile.id/)
  assert.doesNotMatch(card, /dangerouslySetInnerHTML|method: 'POST'|OpenAI|setInterval/)
})

test('agreement uses the shared collapsed disclosure and keeps full text and actions outside its summary', async () => {
  const card = await readFile(new URL('../src/swimmer-agreement-card.jsx', import.meta.url), 'utf8')
  assert.match(card, /<details key=\{`\$\{code\}:\$\{profile.id\}`\} className="swimmer-agreement-card swimmer-disclosure">/)
  assert.match(card, /<SwimmerCardSummary icon="🤝" eyebrow="Utvecklingssamtal" title="Vår överenskommelse" description=\{description\}/)
  assert.doesNotMatch(card, /<details[^>]*\bopen=|agreementExcerpt|Visa hela|is-excerpt/)
  assert.match(card, /agreementPlainText\(talk.text\)/)
  assert.ok(card.indexOf('className="swimmer-agreement-body"') < card.indexOf('Öppna utvecklingssamtalet'))
  assert.match(card, /'Kunde inte hämtas'/)
  assert.match(card, /'Ingen överenskommelse sparad'/)
})
