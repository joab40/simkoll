import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
process.env.SUPABASE_URL='https://personal-training.invalid'
process.env.SUPABASE_SECRET_KEY='fixture'
process.env.COACH_SESSION_SECRET='personal-training-test'
process.env.SIMKOLL_SWIMMER_CODE='fixture-swimmer'
const {default:training}=await import('../api/training.js')
const {default:responses,checkinPointAwards}=await import('../api/responses.js')
const {createCoachToken}=await import('../server/coach-auth.js')
const {stockholmDate}=await import('../server/profile-auth.js')
const owner=randomUUID(),foreign=randomUUID(),id=randomUUID(),today=stockholmDate()
const json=(data,status=200)=>new Response(JSON.stringify(data),{status})
const call=async(handler,options={})=>{
  const res={setHeader(){},status(code){this.code=code;return this},json(data){this.data=data;return this}}
  await handler({method:'GET',headers:{'x-simkoll-code':'fixture-swimmer',cookie:'simkoll_session=fixture'},query:{},...options},res)
  return res
}
const details={activityType:'swim',origin:'niu',focus:'fart',distanceMeters:4000,durationMinutes:90}
const body={personalSessionId:id,identified:true,type:'after',feeling:4,rpe:6,activityType:'swim',trainingOrigin:'niu',activityFocus:'fart',activityDistanceMeters:4000,activityMinutes:90,registerTraining:true}

function fixture(visit){return async(raw,options={})=>{
  const url=new URL(raw),table=url.pathname.split('/').at(-1)
  if(table==='profile_sessions')return json([{profile_id:owner}])
  if(table==='profiles')return json([{id:owner,active:true,approval_status:'approved'}])
  return visit(table,url,options)
}}
test('own personal-session API scopes reads to cookie identity and validates dates before fetching records',async()=>{
  globalThis.fetch=fixture((table,url)=>{
    assert.equal(url.searchParams.get('profile_id'),`eq.${owner}`)
    if(table==='planned_training_sessions')return json([{id,profile_id:owner,planned_date:today,session_slot:`extra_${id}`,personal_details:details}])
    assert.equal(table,'personal_training_sessions');return json([{session_slot:`extra_${id}`,session_date:today}])
  })
  const loaded=await call(training,{query:{personalSessions:'true',start:today,end:today,profileId:foreign}})
  assert.equal(loaded.code,200);assert.equal(loaded.data.sessions.length,1);assert.equal(loaded.data.sessions[0].completed,true)
  globalThis.fetch=fixture(()=>{assert.fail('invalid range must not load training')})
  assert.equal((await call(training,{query:{personalSessions:'true',start:'2026-02-30',end:today}})).code,400)
})
test('plan writes derive owner, use only the service RPC and preserve explicit unknown amounts',async()=>{
  globalThis.fetch=fixture((table,url,options)=>{
    assert.equal(table,'personal_training_action');assert.equal(options.method,'POST')
    const params=JSON.parse(options.body)
    assert.equal(params.p_profile_id,owner);assert.equal(params.p_details.durationMinutes,null);assert.equal(params.p_details.title,'NIU-simning')
    return json({plan:{id,planned_date:today,session_slot:`extra_${id}`,personal_details:params.p_details}})
  })
  assert.equal((await call(training,{method:'POST',body:{action:'save-personal-session',id,date:today,profileId:foreign,details:{...details,durationMinutes:null}}})).code,200)
  globalThis.fetch=fixture(()=>json({code:'PGRST202'},404))
  const missing=await call(training,{method:'POST',body:{action:'save-personal-session',id,date:today,details}})
  assert.equal(missing.code,503);assert.match(missing.data.error,/SQL 131/)
})
test('personal report is one atomic RPC, never the old separate response/session writes, and point credit is bounded per activity/day',async()=>{
  const writes=[]
  globalThis.fetch=fixture((table,url,options)=>{
    if(options.method==='POST')writes.push({table,body:JSON.parse(options.body)})
    if(table==='personal_training_action'){
      const params=JSON.parse(options.body);assert.equal(params.p_profile_id,owner);assert.equal(params.p_response.profile_id,owner);assert.equal(params.p_id,id)
      return json({created:true,response:{...params.p_response,id:'saved',created_at:new Date().toISOString()}})
    }
    return json([])
  })
  const saved=await call(responses,{method:'POST',body:{...body,profileId:foreign,activityDate:today}})
  assert.equal(saved.code,201);assert.equal(saved.data.response.personalSessionId,id);assert.equal(saved.data.response.trainingSlot,`extra_${id}`)
  assert(writes.some(row=>row.table==='personal_training_action'))
  assert(!writes.some(row=>['responses','personal_training_sessions'].includes(row.table)))
  assert.equal(checkinPointAwards(body,today)[0].sourceKey,`${today}:personal:swim`)
  assert.equal(checkinPointAwards({...body,personalSessionId:randomUUID()},today)[0].sourceKey,`${today}:personal:swim`)
})
test('anonymous users, coaches, spoofed club references and migration failures cannot save a personal report',async()=>{
  globalThis.fetch=async()=>json([])
  assert.equal((await call(training,{headers:{'x-simkoll-code':'fixture-swimmer'},query:{personalSessions:'true',start:today,end:today}})).code,403)
  globalThis.fetch=fixture(()=>{assert.fail('invalid personal payload must not write')})
  for(const patch of [{identified:false},{workoutReference:`workout:${randomUUID()}`},{trainingSlot:'afternoon_swim'},{registerTraining:false},{activityDistanceMeters:-1}])assert.equal((await call(responses,{method:'POST',body:{...body,...patch}})).code,400)
  globalThis.fetch=fixture(()=>json({code:'PGRST202'},404))
  const missing=await call(responses,{method:'POST',body})
  assert.equal(missing.code,503);assert.match(missing.data.error,/SQL 131/)
  globalThis.fetch=async()=>json([{id:foreign}])
  const coachHeaders={'x-simkoll-code':createCoachToken({id:foreign,role:'superadmin',session_version:1})}
  assert.equal((await call(training,{headers:coachHeaders,query:{personalSessions:'true',start:today,end:today}})).code,403)
  assert.equal((await call(responses,{headers:coachHeaders,method:'POST',body})).code,403)
})
