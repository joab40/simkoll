import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
process.env.SUPABASE_URL='https://diary-choice.invalid'
process.env.SUPABASE_SECRET_KEY='fixture'
process.env.SIMKOLL_SWIMMER_CODE='fixture-swimmer'
const {default:handler}=await import('../api/training.js')
const owner=randomUUID(),id=randomUUID(),day='2026-11-17',ref='workout:'+id
const json=(value,status=200)=>new Response(JSON.stringify(value),{status})
let writes,after,session,attendance,workout,plans,migration
const reset=()=>{
  writes=[];after=[];session=[{activity_type:'swim'}];attendance=[];plans=[];migration=false
  workout={id,workout_date:day,title:'F2 Spec',distance_meters:4000,duration_minutes:110,time_of_day:'afternoon',target_groups:['junior']}
  globalThis.fetch=async(raw,options={})=>{
    const url=new URL(raw),table=url.pathname.split('/').at(-1)
    if(table==='profile_sessions')return json([{profile_id:owner}])
    if(table==='profiles')return json([{id:owner,active:true,approval_status:'approved',training_group:'junior'}])
    if(options.method==='POST'){writes.push({table,body:JSON.parse(options.body)});assert.equal(table,'save_diary_workout_choice');return migration?json({code:'PGRST202'},404):json({id:'saved'})}
    if(!['daily_workouts','training_plans'].includes(table))assert.equal(url.searchParams.get('profile_id'),'eq.'+owner)
    if(table==='personal_training_sessions')return json(session)
    if(table==='session_attendance')return json(attendance)
    if(table==='responses')return json(after)
    if(table==='daily_workouts')return json(Array.isArray(workout)?workout:[workout])
    if(table==='training_plans')return json(plans)
    throw Error(table)
  }
}
const call=async(body=null,query={diaryChoices:'true',date:day,slot:'afternoon_swim'},headers={'x-simkoll-code':'fixture-swimmer',cookie:'simkoll_session=fixture'})=>{
  const res={setHeader(){},status(n){this.code=n;return this},json(data){this.data=data;return this}}
  await handler({method:body?'POST':'GET',query,body,headers},res);return res
}
const body={action:'diary-workout-choice',date:day,slot:'afternoon_swim',workoutReference:ref,profileId:'foreign'}
test('choices are own-profile and metadata only; saving performs one service-only RPC and no answers, points or attendance writes',async()=>{
  reset();assert.equal((await call()).data.options[0].workoutReference,ref);assert.equal(writes.length,0)
  const saved=await call(body);assert.equal(saved.code,200);assert.equal(saved.data.saved,true)
  assert.deepEqual(writes,[{table:'save_diary_workout_choice',body:{p_profile_id:owner,p_date:day,p_slot:'afternoon_swim',p_reference:ref}}])
})
test('only existing own club swimming can be linked; future, foreign-group, wrong-slot and stale choices fail without writing',async()=>{
  reset();session=[];assert.equal((await call(body)).code,404)
  attendance=[{id:'present'}];assert.equal((await call()).code,200)
  reset();workout.target_groups=['other'];assert.equal((await call(body)).code,400)
  reset();workout.time_of_day='morning';assert.equal((await call(body)).code,400)
  reset();assert.equal((await call({...body,date:'2099-01-01'})).code,400)
  assert.equal((await call({...body,slot:'extra_'+id})).code,400)
  reset();after=[{activity_type:'swim',workout_reference:ref}];assert.equal((await call(body)).code,409)
  reset();session=[{activity_type:'swim',workout_reference:'workout:'+randomUUID()}];assert.equal((await call(body)).code,409)
  assert.equal(writes.length,0)
})
test('authentication is required; identical retries work and a missing migration is an honest unsaved error',async()=>{
  reset();assert.equal((await call(null,{}, {'x-simkoll-code':'invalid'})).code,403)
  session=[{activity_type:'swim',workout_reference:ref}];assert.equal((await call(body)).code,200)
  migration=true;const result=await call(body);assert.equal(result.code,503);assert.match(result.data.error,/SQL 132/)
})
test('three alternatives retain separate 17:00/19:00 labels including unpublished linked base plans',async()=>{
  reset()
  const second=randomUUID(),manual=randomUUID()
  workout=[workout,{...workout,id:second,title:'Distans',distance_meters:4800,duration_minutes:95}]
  const plan={plan_date:day,activity_type:'swim',time_of_day:'afternoon',target_groups:['junior'],calendar_link:{mode:'linked',time:'19:00',location:'Himlabadet'}}
  plans=[{...plan,id:randomUUID(),source_workout_id:id},{...plan,id:randomUUID(),source_workout_id:second},{...plan,id:manual,title:'F2 Spec Övriga',distance_meters:4000,duration_minutes:110,calendar_link:{...plan.calendar_link,time:'17:00'}}]
  const result=await call()
  assert.equal(result.code,200);assert.equal(result.data.options.length,3)
  assert.equal(result.data.options.find(option=>option.workoutReference==='plan:'+manual).time,'17:00')
  assert.equal(result.data.options.filter(option=>option.time==='19:00').length,2)
  assert(result.data.options.every(option=>option.location==='Himlabadet'))
})
