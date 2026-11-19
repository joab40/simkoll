import test from 'node:test'
import assert from 'node:assert/strict'
import {buildDiaryEntries,summarizeDiary} from '../shared/training-diary.js'
import {sessionSwimMetrics} from '../server/session-swim-metrics.js'

const date='2026-11-17',slot='afternoon_swim'
const workouts=[{id:'a',title:'F2 Spec',distance_meters:4000,duration_minutes:110},{id:'b',title:'Distans Frisim',distance_meters:4000,duration_minutes:115},{id:'c',title:'Distans',distance_meters:4800,duration_minutes:95}].map(w=>({...w,workout_date:date,time_of_day:'afternoon',target_groups:['junior']}))
const session={id:'s',profile_id:'p',session_date:date,session_slot:slot,activity_type:'swim',source:'manual'}
const before={id:'before',activity_date:date,created_at:date+'T14:00:00Z',session_slot:slot,day_type:'before',activity_type:'swim',feeling:3}
const build=(sessions=[session],responses=[before])=>buildDiaryEntries({sessions,responses,workouts,trainingGroup:'junior',today:'2026-11-19'})
test('missing choice can be repaired on registered club swimming only, without fabricating an after-report',()=>{
  assert.equal(build()[0].canChooseWorkout,true)
  assert.equal(build([])[0].canChooseWorkout,undefined)
  const updated=build([{...session,workout_reference:'workout:c'}])
  assert.equal(updated.length,1);assert.equal(updated[0].title,'Distans');assert.equal(updated[0].estimatedMeters,4800);assert.equal(updated[0].estimatedMinutes,95)
  assert.equal(updated[0].rpe,null);assert.equal(updated[0].feeling,3);assert.equal(before.day_type,'before')
  assert.equal(updated[0].workoutChoiceSource,'diary');assert.equal(updated[0].canChooseWorkout,false)
  assert.equal(summarizeDiary(updated,[before],date,date).sessions,1)
  const attendance={...session,id:'attendance',source:'coach-attendance',workout_reference:undefined}
  assert.equal(build([attendance,{...session,workout_reference:'workout:a'}])[0].estimatedMinutes,110)
})
test('all three alternatives resolve independently; real after-reports and reported amounts take precedence',()=>{
  for(const workout of workouts){const [entry]=build([{...session,workout_reference:'workout:'+workout.id}]);assert.equal(entry.estimatedMeters,workout.distance_meters);assert.equal(entry.estimatedMinutes,workout.duration_minutes)}
  const after={...before,id:'after',day_type:'after',workout_reference:'workout:b',planned_completion:'partial',activity_distance_meters:2500,activity_minutes:50,rpe:7}
  const [entry]=build([{...session,workout_reference:'workout:c'}],[before,after])
  assert.equal(entry.title,'Distans Frisim');assert.equal(entry.reportedMeters,2500);assert.equal(entry.reportedMinutes,50);assert.equal(entry.rpe,7);assert.equal(entry.workoutChoiceSource,null)
  const metrics=sessionSwimMetrics({sessions:[{...session,workout_reference:'workout:c'}],responses:[before],workouts,plans:[],profiles:[{id:'p',training_group:'junior'}]})
  assert.equal(metrics.get('p|'+date+'|'+slot).distanceMeters,4800)
  const [partial]=build([{...session,workout_reference:'workout:c'}],[before,{...after,workout_reference:null,activity_distance_meters:null,activity_minutes:null}])
  assert.equal(partial.estimatedMeters,null);assert.equal(partial.estimatedMinutes,95);assert.equal(partial.rpe,7)
})
