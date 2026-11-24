import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { loadOpenChatEngagement, parseOpenChatEngagement } from '../server/open-chat-engagement.js'

const coachPost = '11111111-1111-4111-8111-111111111111'
const privatePost = '22222222-2222-4222-8222-222222222222'
const question = '33333333-3333-4333-8333-333333333333'
const deleted = '44444444-4444-4444-8444-444444444444'
const swimmer = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const other = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const pgliteModule = process.env.SIMKOLL_PGLITE_MODULE

test('only public coach messages enter the engagement aggregate request', async () => {
  const rows = [
    { id: coachPost, sender_role: 'coach', visibility: 'group' },
    { id: question, sender_role: 'swimmer', visibility: 'group' },
    { id: privatePost, sender_role: 'coach', visibility: 'coaches' },
    { id: deleted, sender_role: 'coach', visibility: 'group', deleted_at: '2026-11-23' },
  ]
  const result = await loadOpenChatEngagement(rows, swimmer, async (path, options) => {
    assert.equal(path, 'rpc/open_chat_engagement_totals')
    assert.deepEqual(JSON.parse(options.body), { p_message_ids: [coachPost], p_profile_id: swimmer })
    return { ok: true, json: async () => [{ message_id: coachPost, seen_count: 4, like_count: 2, seen: true, liked: false }] }
  })
  assert.deepEqual([...result], [[coachPost, { seenCount: 4, likeCount: 2, seen: true, liked: false }]])
  assert.equal((await loadOpenChatEngagement(rows, swimmer, async () => ({ ok: false, status: 404 }))).size, 0)
})

test('requests are bounded, deduplicated, and expect a boolean for reactions', () => {
  assert.deepEqual(parseOpenChatEngagement({ action: 'record-open-chat-views', messageIds: [swimmer.toUpperCase(), swimmer] }), { ids: [swimmer], liked: null })
  assert.deepEqual(parseOpenChatEngagement({ action: 'set-open-chat-like', messageId: coachPost, liked: false }), { ids: [coachPost], liked: false })
  assert.equal(parseOpenChatEngagement({ action: 'set-open-chat-like', messageId: coachPost, liked: 'true' }), null)
  assert.equal(parseOpenChatEngagement({ action: 'record-open-chat-views', messageIds: Array(41).fill(coachPost) }), null)
})

test('SQL 147 handles repeated views, unlike, visibility and aggregate-only access', { skip: !pgliteModule }, async () => {
  const { PGlite } = await import(pgliteModule)
  const db = new PGlite()
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create table public.profiles(id uuid primary key);
      create table public.app_settings(setting_key text primary key, setting_value jsonb);
      insert into public.app_settings values ('webapp', '{"openChat":{"enabled":true}}');
    `)
    await db.exec(await readFile(new URL('../supabase/migrations/061_open_group_chat.sql', import.meta.url), 'utf8'))
    await db.exec(await readFile(new URL('../supabase/migrations/062_open_chat_visibility.sql', import.meta.url), 'utf8'))
    const sql = await readFile(new URL('../supabase/migrations/147_open_chat_engagement.sql', import.meta.url), 'utf8')
    await db.exec(sql)
    await db.exec(sql)
    await db.exec('grant select, update on public.open_chat_messages to service_role; grant select on public.app_settings to service_role;')
    await db.query('insert into public.profiles values ($1),($2)', [swimmer, other])
    await db.query(`
      insert into public.open_chat_messages(id, sender_role, visibility, content, deleted_at) values
      ($1, 'coach', 'group', 'Info', null),
      ($2, 'coach', 'coaches', 'Privat', null),
      ($3, 'swimmer', 'group', 'Fråga', null),
      ($4, 'coach', 'group', 'Borttaget', now())
    `, [coachPost, privatePost, question, deleted])
    await db.exec('set role authenticated')
    await assert.rejects(db.query('select * from public.open_chat_engagement'), /permission denied/)
    await assert.rejects(db.query('select * from public.open_chat_engagement_totals($1, $2)', [[coachPost], swimmer]), /permission denied/)
    await assert.rejects(db.query('select * from public.save_open_chat_engagement($1, $2, $3)', [[coachPost], swimmer, true]), /permission denied/)
    await db.exec('set role service_role')
    const save = async (ids, profile, liked = null) => (await db.query('select * from public.save_open_chat_engagement($1, $2, $3)', [ids, profile, liked])).rows
    const totals = async (ids, profile) => (await db.query('select * from public.open_chat_engagement_totals($1, $2)', [ids, profile])).rows
    assert.deepEqual(await totals([coachPost], swimmer), [{ message_id: coachPost, seen_count: 0, like_count: 0, seen: false, liked: false }])
    assert.deepEqual((await save([coachPost, coachPost, privatePost, question, deleted], swimmer)).map(row => row.message_id), [coachPost])
    assert.equal((await save([coachPost], swimmer))[0].seen_count, 1)
    assert.equal((await save([coachPost], swimmer, true))[0].like_count, 1)
    assert.equal((await save([coachPost], swimmer, true))[0].like_count, 1)
    assert.equal((await save([coachPost], swimmer))[0].liked, true)
    assert.equal((await save([coachPost], other, true))[0].seen_count, 2)
    const [unliked] = await save([coachPost], swimmer, false)
    assert.deepEqual(unliked, { message_id: coachPost, seen_count: 2, like_count: 1, seen: true, liked: false })
    assert.deepEqual(await totals([coachPost, privatePost, question, deleted], null), [{ ...unliked, seen: false }])
    await db.exec(`reset role; update public.app_settings set setting_value = '{"openChat":{"enabled":false}}'; set role service_role;`)
    assert.deepEqual(await save([coachPost], swimmer, true), [])
  } finally { await db.close() }
})

test('SQL 150 counts current recipients and restricts access to unseen names', { skip: !pgliteModule }, async () => {
  const { PGlite } = await import(pgliteModule)
  const db = new PGlite()
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create table public.profiles(
        id uuid primary key, display_name text, emoji text,
        active boolean default true, approval_status text default 'approved', is_test_profile boolean default false
      );
      create table public.app_settings(setting_key text primary key, setting_value jsonb);
    `)
    for (const migration of ['061_open_group_chat', '062_open_chat_visibility', '147_open_chat_engagement', '150_open_chat_read_receipts']) {
      await db.exec(await readFile(new URL(`../supabase/migrations/${migration}.sql`, import.meta.url), 'utf8'))
    }
    const former = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
    const pending = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
    const demo = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
    await db.query("insert into public.profiles values ($1, 'Sett', '🐬', true, 'approved', false), ($2, 'Anna', '🐳', true, 'approved', false), ($3, 'Inaktiv', null, false, 'approved', false), ($4, 'Väntande', null, true, 'pending', false), ($5, 'Test', null, true, 'approved', true)", [swimmer, other, former, pending, demo])
    await db.query(`
      insert into public.open_chat_messages(id, sender_role, visibility, content, deleted_at) values
      ($1, 'coach', 'group', 'Info', null), ($2, 'coach', 'coaches', 'Privat', null),
      ($3, 'swimmer', 'group', 'Fråga', null), ($4, 'coach', 'group', 'Borttaget', now())
    `, [coachPost, privatePost, question, deleted])
    await db.query('insert into public.open_chat_engagement values ($1, $2, false), ($1, $3, true), ($1, $4, false)', [coachPost, swimmer, former, demo])
    await db.exec('grant select on public.profiles, public.open_chat_messages to service_role; set role authenticated;')
    await assert.rejects(db.query('select * from public.open_chat_coach_read_details($1)', [coachPost]), /permission denied/)
    await assert.rejects(db.query('select * from public.open_chat_coach_read_totals($1)', [[coachPost]]), /permission denied/)
    await db.exec('set role service_role;')
    const totals = async ids => (await db.query('select * from public.open_chat_coach_read_totals($1)', [ids])).rows
    const details = async id => (await db.query('select * from public.open_chat_coach_read_details($1)', [id])).rows
    assert.deepEqual(await totals([coachPost, privatePost, question, deleted]), [{ message_id: coachPost, seen_count: 1, recipient_count: 2, like_count: 1 }])
    assert.deepEqual(await details(coachPost), [{ seen_count: 1, recipient_count: 2, unseen: [{ id: other, displayName: 'Anna', emoji: '🐳' }] }])
    for (const id of [privatePost, question, deleted]) assert.deepEqual(await details(id), [])
    await db.query('insert into public.open_chat_engagement values ($1, $2, false)', [coachPost, other])
    assert.deepEqual(await details(coachPost), [{ seen_count: 2, recipient_count: 2, unseen: [] }])
    await db.exec('reset role; update public.profiles set active = false; set role service_role;')
    assert.deepEqual(await details(coachPost), [{ seen_count: 0, recipient_count: 0, unseen: [] }])
  } finally { await db.close() }
})
