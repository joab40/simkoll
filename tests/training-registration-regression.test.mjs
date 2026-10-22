import test from 'node:test'
import assert from 'node:assert/strict'
process.env.SUPABASE_URL = 'https://registration-fixture.invalid'
process.env.SUPABASE_SECRET_KEY = 'fixture-only'
process.env.SIMKOLL_SWIMMER_CODE = 'registration-swimmer'
process.env.SIMKOLL_COACH_CODE = 'registration-coach'
const { default: training } = await import('../api/training.js')
const { default: checkin } = await import('../api/responses.js')
const profileId = '11111111-1111-4111-8111-111111111111'
const json = (rows) => new Response(JSON.stringify(rows), { status: 200 })
async function call(handler, method, body, code = 'registration-swimmer') {
  const response = { setHeader() {}, status(value) { this.code = value; return this }, json(value) { this.data = value; return this } }
  await handler({ method, query: {}, body, headers: { 'x-simkoll-code': code, cookie: 'simkoll_session=fixture' } },response)
  assert.ok(response.code < 300, JSON.stringify(response.data))
  return response.data
}
function fixture() {
  const sessions = [], responses = [], writes = []
  globalThis.fetch = async (raw,options = {}) => {
    const url = new URL(raw), table = url.pathname.split('/').at(-1), params = url.searchParams
    assert.equal(url.hostname,'registration-fixture.invalid')
    const method = options.method || 'GET'
    if (method !== 'GET') writes.push({ table, method })
    if (table === 'profile_sessions') return json([{profile_id:profileId}])
    if (table === 'profiles') return json([{id:profileId}])
    if (table === 'responses') {
      if (method === 'POST') { const row = {...JSON.parse(options.body),id:`r${responses.length}`,created_at:new Date().toISOString()}; responses.push(row); return json([row]) }
      return json(responses)
    }
    if (table === 'personal_training_sessions') {
      const matches = (row) => ['profile_id','session_date','session_slot'].every((key) => !params.has(key) || params.get(key) === `eq.${row[key]}`)
      if (method === 'POST') { const row = {...JSON.parse(options.body),id:`s${sessions.length}`,completed_at:new Date().toISOString()}; if (!sessions.some((item) => item.profile_id === row.profile_id && item.session_date === row.session_date && item.session_slot === row.session_slot)) sessions.push(row); return json([row]) }
      if (method === 'DELETE') { for (let i=sessions.length-1;i>=0;i--) if (matches(sessions[i])) sessions.splice(i,1); return json([]) }
      return json(sessions.filter(matches))
    }
    if (['season_swim_goals','cross_training_goals','planned_training_sessions','program_assignments','training_programs','program_goals','daily_workouts','strength_program_logs','point_events','artifact_catalog','profile_daily_activity','workout_unlocks'].includes(table)) return json([])
    throw new Error(`Unexpected query: ${table}`)
  }
  return {sessions,responses,writes}
}
test('removing yesterday PM survives a new check-in and repeated swimmer/coach reads',async(t) => {
  t.mock.timers.enable({apis:['Date'],now:new Date('2026-10-22T10:00:00Z')})
  const data = fixture()
  await call(checkin,'POST',{type:'after',feeling:4,activityType:'swim',trainingSlot:'morning_swim',registerTraining:true,identified:true,activityDate:'2026-10-21'})
  data.sessions.push({id:'old-wrong-pm',profile_id:profileId,activity_type:'swim',session_slot:'afternoon_swim',session_date:'2026-10-21',source:'checkin'})
  await call(training,'POST',{action:'toggle-session',date:'2026-10-21',slot:'afternoon_swim',completed:false,profileId:'ignored-profile'})
  assert.equal(data.sessions.length,1)
  await call(checkin,'POST',{type:'after',feeling:4,activityType:'swim',trainingSlot:'morning_swim',registerTraining:true,identified:true,activityDate:'2026-10-22'})
  const writeCount = data.writes.filter((row) => row.table === 'personal_training_sessions').length
  for (const code of ['registration-swimmer','registration-swimmer','registration-coach']) {
    const loaded = await call(training,'GET',null,code)
    assert.deepEqual(loaded.sessions.map((row) => `${row.date}:${row.slot}`).sort(),['2026-10-21:morning_swim','2026-10-22:morning_swim'])
  }
  assert.equal(data.writes.filter((row) => row.table === 'personal_training_sessions').length,writeCount,'reads must never create or remove sessions')
  assert.equal(data.responses.length,2,'the original feedback remains intact')
})
test('legacy responses without an explicit registration never synthesize PM or change training on read',async(t) => {
  t.mock.timers.enable({apis:['Date'],now:new Date('2026-10-22T10:00:00Z')})
  const data = fixture()
  data.responses.push(...[
    {activity_type:'swim',session_slot:'morning_swim'},
    {activity_type:'cycling'}, {competition:true}, {training_registered:false}, {},
  ].map((extra,index) => ({profile_id:profileId,id:`r${index}`,created_at:'2026-10-22T08:00:00Z',activity_date:'2026-10-21',day_type:'after',...extra})))
  for (const code of ['registration-swimmer','registration-coach']) assert.deepEqual((await call(training,'GET',null,code)).sessions,[])
  assert.equal(data.sessions.length,0)
  assert.equal(data.writes.some((row) => row.table === 'personal_training_sessions'),false)
})
