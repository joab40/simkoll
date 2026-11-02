import test from 'node:test'
import assert from 'node:assert/strict'
process.env.SUPABASE_URL='https://meter-days.invalid'
process.env.SUPABASE_SECRET_KEY='fixture-only'
process.env.SIMKOLL_COACH_CODE='meter-coach'
const {default:handler}=await import('../api/analytics.js')
const profileId='11111111-1111-4111-8111-111111111111'
const query={profileId,start:'2026-10-25T23:00:00Z',end:'2026-11-01T23:00:00Z',previousStart:'2026-10-18T22:00:00Z'}
const invoke=async(params=query)=>{const response={setHeader(){},status(code){this.code=code;return this},json(data){this.data=data;return this}};await handler({method:'GET',headers:{'x-simkoll-code':'meter-coach'},query:params},response);return response}
function fixture({missingAttendance=false}={}) {
  const calls=[]
  globalThis.fetch=async(raw,options={})=>{
    const url=new URL(raw),table=url.pathname.split('/').at(-1);calls.push(table)
    assert.equal(url.hostname,'meter-days.invalid')
    assert.equal(options.method||'GET','GET')
    if(table==='session_attendance') {
      assert.equal(url.searchParams.get('profile_id'),`eq.${profileId}`)
      assert.equal(url.searchParams.get('present'),'eq.true')
      assert.equal(url.searchParams.get('select'),'attendance_date,session_slot')
      if(missingAttendance)return new Response('{}',{status:404})
    }
    const data={
      profiles:[{id:profileId,training_group:'junior'}],
      personal_training_sessions:[{profile_id:profileId,session_date:'2026-10-27',session_slot:'afternoon_swim',activity_type:'swim'},{profile_id:profileId,session_date:'2026-10-30',session_slot:'morning_swim',activity_type:'swim'}],
      daily_workouts:[{id:'w',workout_date:'2026-10-27',time_of_day:'afternoon',target_groups:['junior'],distance_meters:4200},{id:'am',workout_date:'2026-10-31',time_of_day:'morning',target_groups:['junior'],distance_meters:3000}],
      session_attendance:[{attendance_date:'2026-10-31',session_slot:'morning_swim'}],
      responses:[{profile_id:profileId,activity_date:'2026-10-27',created_at:'2026-10-28T08:00:00Z',day_type:'after',activity_type:'swim',session_slot:'afternoon_swim',rpe:5},{profile_id:profileId,activity_date:'2026-10-29',created_at:'2026-10-29T18:00:00Z',day_type:'after',activity_type:'strength',activity_distance_meters:10000},{profile_id:profileId,activity_date:'2026-11-01',created_at:'2026-11-01T18:00:00Z',day_type:'after'}],
    }[table]||[]
    return new Response(JSON.stringify(data))
  }
  return calls
}
test('personal meter days include 0 on rest days, preserve unknown swims, and include coach attendance without self-reporting',async()=>{
  const calls=fixture(),result=await invoke()
  assert.equal(result.code,200)
  const days=result.data.workoutAnalysis.meterDays
  assert.deepEqual(days.map(day=>day.swimMetersPlot),[0,4200,0,0,null,3000,null])
  assert.equal(days.length,7)
  assert.equal(result.data.workoutAnalysis.trend.find(row=>row.date==='2026-10-27').rpe,5)
  assert.equal(calls.filter(table=>table==='session_attendance').length,1)
  assert.doesNotMatch(JSON.stringify(days),/profile_id|created_at|comment|workout_reference/)
})
test('missing attendance source cannot be rendered as proof of zero swimming',async()=>{
  fixture({missingAttendance:true})
  const result=await invoke()
  assert.equal(result.code,200)
  assert.ok(result.data.workoutAnalysis.meterDays.every(day=>day.swimMetersPlot===null))
})
test('group chart retains its existing planning meaning and does not fetch individual attendance',async()=>{
  const calls=fixture(),result=await invoke({...query,profileId:undefined})
  assert.equal(result.code,200)
  assert.equal(result.data.workoutAnalysis.meterDays,undefined)
  assert.ok(!calls.includes('session_attendance'))
})
