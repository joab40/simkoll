import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {applyWeeklySession,pendingWeeklySessions,createWeeklyTrainingSync,weeklyTrainingVolume} from '../src/weekly-training-sync.js'

const day='2026-11-20',slot='afternoon_swim'
const initial=()=>({sessions:[{date:'2026-11-19',slot,type:'swim',distanceMeters:14200,durationMinutes:455,distanceBasis:'reported',durationBasis:'reported'}],plannedSessions:[{date:day,slot}]})
const extra={date:day,slot,type:'swim',distanceMeters:1500,durationMinutes:120,distanceBasis:'estimated',durationBasis:'estimated'}
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject}}
const drain=async()=>{await Promise.resolve();await Promise.resolve()}
function harness(request){let training=initial();const sync=createWeeklyTrainingSync({request,code:'fixture',profileId:'p',onChange:value=>{training=typeof value==='function'?value(training):value}});return {sync,get data(){return training}}}
test('confirmed manual registration refreshes shared counts/amounts without any after-check-in and survives a remounted card',async()=>{
  const calls=[],fresh={...initial(),sessions:[...initial().sessions,extra]}
  const h=harness(async(path,code,options)=>{calls.push({path,options});return options?.method==='POST'?{ok:true}:fresh})
  await h.sync.saveSession(day,slot,true)
  assert.equal(h.data.sessions.length,2)
  assert.deepEqual(weeklyTrainingVolume(h.data.sessions),{meters:{value:15700,missing:0,estimated:true},minutes:{value:575,missing:0,estimated:true}})
  assert.equal(pendingWeeklySessions(h.data.sessions,new Map()).length,2,'a fresh card derives the tick from shared state')
  assert.equal(calls[1].path,'/api/training?summary=true');assert.equal(JSON.parse(calls[0].options.body).action,'toggle-session')
  assert.equal(calls[0].options.retry,false);assert(!calls.some(c=>c.path.includes('responses')))
})
test('leaving the card during POST does not cancel shared readback, while leaving the profile does',async()=>{
  const post=deferred(),fresh={...initial(),sessions:[...initial().sessions,extra]},h=harness(async(path,code,options)=>options?.method==='POST'?post.promise:fresh)
  const save=h.sync.saveSession(day,slot,true);await drain()
  // The app-level coordinator remains mounted when only the Home card leaves.
  post.resolve({ok:true});await save;assert.equal(h.data.sessions.length,2)
  const read=deferred(),other=harness(()=>read.promise),pending=other.sync.refresh();other.sync.dispose();read.resolve(fresh);await pending
  assert.equal(other.data.sessions.length,1,'the old profile must never update a new profile')
})
test('a failed readback keeps confirmed registration with unknown quantities, never rolls it back or invents amounts',async()=>{
  const h=harness(async(path,code,options)=>{if(options?.method==='POST')return {ok:true};throw new Error('offline')})
  const result=await h.sync.saveSession(day,slot,true)
  assert.match(result.message,/Passet är sparat/);assert.equal(h.data.sessions.length,2)
  assert.equal(h.data.sessions[1].distanceMeters,undefined);assert.equal(weeklyTrainingVolume(h.data.sessions).meters.missing,1)
})
test('failed writes keep canonical state and do not poison the queue for other slots',async()=>{
  let post=0;const h=harness(async(path,code,options)=>{if(options?.method==='POST'){if(++post===1)throw new Error('denied');return {ok:true}}return {...initial(),sessions:[...initial().sessions,{date:day,slot:'strength',type:'strength'}]}})
  await assert.rejects(h.sync.saveSession(day,slot,true),/denied/);assert.equal(h.data.sessions.length,1)
  await h.sync.saveSession(day,'strength',true);assert.equal(h.data.sessions.length,2)
})
test('background snapshots started before/during a write cannot restore an old checkbox or amount',async()=>{
  const stale=deferred(),post=deferred();let reads=0
  const fresh={...initial(),sessions:[...initial().sessions,extra]},h=harness(async(path,code,options)=>options?.method==='POST'?post.promise:++reads===1?stale.promise:fresh)
  const old=h.sync.refresh(),save=h.sync.saveSession(day,slot,true);await drain();post.resolve({ok:true});await save;stale.resolve(initial());await old
  assert.equal(h.data.sessions.length,2)
  const oldRead=deferred();let n=0
  const j=harness(async()=>++n===1?oldRead.promise:fresh),before=j.sync.refresh();await j.sync.refresh();oldRead.resolve(initial());await before
  assert.equal(j.data.sessions.length,2,'out-of-order successful reads keep the newest applied snapshot')
})
test('queued writes/readbacks stay ordered and an unmarked session is removed from counts and volume',async()=>{
  const order=[],one=deferred();let posts=0,rows=initial()
  const h=harness(async(path,code,options)=>{if(options?.method==='POST'){const body=JSON.parse(options.body);order.push(body.completed?'mark':'unmark');if(++posts===1)await one.promise;rows={...rows,sessions:body.completed?[...initial().sessions,extra]:initial().sessions};return {ok:true}}order.push('read');return rows})
  const a=h.sync.saveSession(day,slot,true),b=h.sync.saveSession(day,slot,false);await drain();assert.deepEqual(order,['mark']);one.resolve();await Promise.all([a,b]);assert.deepEqual(order,['mark','read','unmark','read'])
  assert.equal(h.data.sessions.length,1);assert.equal(weeklyTrainingVolume(h.data.sessions).meters.value,14200)
})
test('pending edits survive background updates and duplicate intent never duplicates an existing session',()=>{
  const rows=[...initial().sessions,extra],edits=new Map([['a',{date:day,slot,completed:false}],['b',{date:day,slot:'strength',completed:true}]])
  assert.equal(pendingWeeklySessions(rows,edits).length,2);assert(!pendingWeeklySessions(rows,edits).some(row=>row.date===day&&row.slot===slot))
  assert.equal(applyWeeklySession(rows,{date:day,slot,completed:true}),rows)
})
test('totals distinguish estimates, reported/personal amounts, valid zero and unknown values',()=>{
  assert.equal(weeklyTrainingVolume([{...extra,distanceBasis:'reported'}]).meters.estimated,false)
  assert.equal(weeklyTrainingVolume([{...extra,personalSession:true}]).meters.estimated,false)
  assert.deepEqual(weeklyTrainingVolume([{type:'swim'}]).meters,{value:null,missing:1,estimated:false})
  assert.equal(weeklyTrainingVolume([{type:'swim',distanceMeters:0,distanceBasis:'reported'}]).meters.value,0)
  assert.equal(weeklyTrainingVolume([{type:'strength',distanceMeters:900}]).meters.value,null)
})
test('the real app uses shared registration/readback and pending overlays, without manual DOM volume injection',()=>{
  const source=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8')
  assert.match(source,/onToggleSession=\{weeklyTrainingSync.saveSession\}/)
  assert.match(source,/pendingWeeklySessions\(training\?\.sessions,sessionEdits\)/)
  assert.match(source,/<WeeklyTrainingVolume sessions=\{weeklySessions\}/)
  assert.doesNotMatch(source,/volume.innerHTML|setLocalSessions/)
})
