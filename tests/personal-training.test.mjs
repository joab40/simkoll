import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { normalizePersonalDetails, personalCheckinDetails, personalSlot, isPersonalSlot, METER_PRESETS, MINUTE_PRESETS } from '../shared/personal-training.js'
import { validCheckinActivity, checkinTraining } from '../shared/checkin-activity.js'
import { buildDiaryEntries, summarizeDiary } from '../shared/training-diary.js'
import { buildSwimmerPasses } from '../server/individual-analysis.js'
import { attendanceFromCheckins } from '../src/attendance.js'
import { trainingHeartAfterReports } from '../shared/training-heart.js'
import { planningGoalWeeks } from '../shared/weekly-planning.js'

const id = randomUUID(), id2 = randomUUID(), day = '2026-11-19'
const details = normalizePersonalDetails({ activityType:'swim',origin:'niu',focus:'f2_spec',distanceMeters:3500,durationMinutes:75,timeOfDay:'morning' })
const body = { personalSessionId:id,identified:true,type:'after',activityType:'swim',trainingOrigin:'niu',activityFocus:'f2_spec',activityDistanceMeters:3500,activityMinutes:75,personalTimeOfDay:'morning',registerTraining:true }
test('personal amounts and focus use quick presets without invented defaults; supported sports have stable types',()=>{
  assert.deepEqual(METER_PRESETS,[1000,2000,3000,4000,5000,6000]);assert.deepEqual(MINUTE_PRESETS,[30,60,90,120])
  assert.equal(details.title,'NIU-simning');assert.equal(details.distanceMeters,3500)
  assert.deepEqual(personalCheckinDetails(body),details)
  assert.equal(normalizePersonalDetails({activityType:'swim',origin:'self'}).durationMinutes,null)
  assert.equal(normalizePersonalDetails({activityType:'other',origin:'self',sport:'running',durationMinutes:60}).title,'Löpning')
  for(const patch of [{activityType:'bogus'},{origin:'club'},{activityType:'strength'},{distanceMeters:-1},{durationMinutes:0},{durationMinutes:1.2},{focus:'bogus'},{timeOfDay:'noon'},{distanceMeters:'3500'}])assert.throws(()=>normalizePersonalDetails({...details,...patch}))
})
test('new check-ins require own identified identity, never a club reference; legacy remains valid',()=>{
  assert(validCheckinActivity(body));assert(validCheckinActivity({...body,type:'before',registerTraining:false}))
  assert.deepEqual(checkinTraining(body),{activity_type:'swim',session_slot:personalSlot(id)})
  assert.equal(checkinTraining({...body,type:'before'}),null)
  assert(isPersonalSlot(personalSlot(id)))
  for(const patch of [{identified:false},{trainingSlot:'morning_swim'},{workoutReference:`workout:${randomUUID()}`},{competition:true},{registerTraining:false},{personalSessionId:'invalid'},{activityMinutes:1441}])assert(!validCheckinActivity({...body,...patch}))
  assert(validCheckinActivity({type:'after',activityType:'swim',trainingSlot:'morning_swim'}))
})
test('two own swims on the same morning plus club session remain three distinct diary entries and one club attendance',()=>{
  const session = (uuid, meters) => ({id:uuid,session_date:day,session_slot:personalSlot(uuid),activity_type:'swim',source:'checkin',personal_details:{...details,distanceMeters:meters}})
  const report = (uuid, meters) => ({id:uuid,profile_id:'p',activity_date:day,day_type:'after',session_slot:personalSlot(uuid),personal_session_id:uuid,activity_type:'swim',training_origin:'niu',activity_focus:'f2_spec',activity_distance_meters:meters,activity_minutes:75,rpe:6,feeling:4,created_at:`${day}T09:00:00Z`})
  const sessions=[session(id,3500),session(id2,2000),{id:'club',session_date:day,session_slot:'afternoon_swim',activity_type:'swim',source:'checkin'}]
  const responses=[report(id,3500),report(id2,2000),{...report('club',4000),personal_session_id:null,session_slot:'afternoon_swim',training_origin:null}]
  const personalPlans=[id,id2].map(uuid=>({id:uuid,planned_date:day,session_slot:personalSlot(uuid),personal_details:details}))
  const entries=buildDiaryEntries({sessions,responses,personalPlans,today:day,workouts:[{id:'club',workout_date:day,title:'KLUBB',time_of_day:'afternoon',distance_meters:5000,duration_minutes:120}]})
  assert.equal(entries.length,3);assert.equal(entries.filter(e=>e.title==='NIU-simning').length,2)
  assert.equal(entries.filter(e=>e.linked).length,1)
  const summary=summarizeDiary(entries,responses,day,day)
  assert.equal(summary.sessions,3);assert.equal(summary.swimMeters,9500);assert.equal(summary.minutes,225)
  const ui=responses.map(r=>({profileId:'p',type:'after',trainingSlot:r.session_slot,activityType:'swim',createdAt:r.created_at}))
  assert.deepEqual(attendanceFromCheckins([],ui.filter(r=>r.trainingSlot!=='afternoon_swim'),'afternoon_swim'),{})
  assert.deepEqual(attendanceFromCheckins([],ui,'afternoon_swim'),{p:true})
  assert.equal(trainingHeartAfterReports(responses.map(r=>({id:r.id,date:day,type:'after',trainingSlot:r.session_slot,activityType:'swim'}))).length,3)
})
test('planned-only personal training is not completed and missing actual amounts never inherit plan or club amounts',()=>{
  const plan={id,planned_date:day,session_slot:personalSlot(id),personal_details:details}
  let entries=buildDiaryEntries({personalPlans:[plan],today:day})
  assert.equal(entries[0].state,'planned');assert.equal(summarizeDiary(entries,[],day,day).sessions,0)
  entries=buildDiaryEntries({personalPlans:[plan],responses:[{id,activity_date:day,day_type:'after',activity_type:'swim',session_slot:personalSlot(id),personal_session_id:id,training_origin:'niu',activity_minutes:null,activity_distance_meters:null}],sessions:[{id,session_date:day,session_slot:personalSlot(id),activity_type:'swim',personal_details:{...details,distanceMeters:null,durationMinutes:null}}],today:day})
  assert.equal(entries.length,1);assert.equal(entries[0].reportedMeters,null);assert.equal(entries[0].estimatedMeters,null);assert.equal(entries[0].estimatedMinutes,null)
  const [pass]=buildSwimmerPasses({sessions:[{session_date:day,session_slot:personalSlot(id),activity_type:'swim'}],responses:[],workouts:[{workout_date:day,distance_meters:9000,title:'Wrong club plan'}]})
  assert.equal(pass.matchStatus,'personal');assert.equal(pass.distanceMeters,null);assert.equal(pass.title,'Eget simpass')
})

test('coach attendance first does not swallow a later explicit choice between two evening alternatives',()=>{
  const workouts=[{id:'a',workout_date:day,title:'Distans frisim',time_of_day:'afternoon',distance_meters:4000,duration_minutes:115},{id:'b',workout_date:day,title:'Distans',time_of_day:'afternoon',distance_meters:4800,duration_minutes:95}]
  const sessions=[{id:'registered',session_date:day,session_slot:'afternoon_swim',activity_type:'swim',source:'manual'},{id:'attendance',session_date:day,session_slot:'afternoon_swim',activity_type:'swim',source:'coach-attendance'}]
  const before={id:'before',activity_date:day,day_type:'before',activity_type:'swim',session_slot:'afternoon_swim',feeling:3,created_at:`${day}T16:00:00Z`}
  let entries=buildDiaryEntries({sessions,responses:[before],workouts,today:day})
  assert.equal(entries.length,1);assert.equal(entries[0].state,'completed');assert.equal(entries[0].workoutChoiceMissing,true);assert.equal(entries[0].reportedMeters,null);assert.equal(entries[0].estimatedMinutes,null)
  const after={id:'after',activity_date:day,day_type:'after',activity_type:'swim',session_slot:'afternoon_swim',workout_reference:'workout:b',planned_completion:'full',rpe:7,feeling:4,created_at:`${day}T20:00:00Z`}
  entries=buildDiaryEntries({sessions,responses:[before,after],workouts,today:day})
  assert.equal(entries.length,1);assert.equal(entries[0].title,'Distans');assert.equal(entries[0].rpe,7);assert.equal(entries[0].estimatedMeters,4800);assert.equal(entries[0].estimatedMinutes,95)
  assert.equal(summarizeDiary(entries,[before,after],day,day).sessions,1)
  const swapped=buildDiaryEntries({sessions:sessions.slice().reverse(),responses:[after,before],workouts,today:day})
  assert.equal(swapped[0].estimatedMeters,4800);assert.equal(swapped[0].estimatedMinutes,95)
})

test('personal and club plans share one weekly planning reward; unplanned completion is not planning',()=>{
  const plans=[{profileId:'p',date:'2026-11-16'},{profileId:'p',date:'2026-11-17',personalSession:true},{profileId:'p',date:'2026-11-17',personalSession:true},{profileId:'p',date:'2026-11-18',wasPlanned:false}]
  assert.deepEqual(planningGoalWeeks(plans),[])
  plans.push({profileId:'p',date:'2026-11-19',personalSession:true})
  assert.deepEqual(planningGoalWeeks(plans),[{profileId:'p',sourceKey:'planning:p:2026-11-16'}])
})
