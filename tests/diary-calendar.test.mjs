import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {diaryMonthRange,diaryMoveMonth,missingSwimDetails} from '../shared/diary-calendar.js'
import {buildDiaryEntries} from '../shared/training-diary.js'

test('month arrows cross period and year boundaries, include leap days and stop after the current month',()=>{
  assert.deepEqual(diaryMoveMonth('2026-11',-1,'2026-11-20'),{start:'2026-10-01',end:'2026-10-31'})
  assert.deepEqual(diaryMoveMonth('2026-10',1,'2026-11-20'),{start:'2026-11-01',end:'2026-11-20'})
  assert.equal(diaryMoveMonth('2026-11',1,'2026-11-20'),null)
  assert.deepEqual(diaryMoveMonth('2026-01',-1,'2026-11-20'),{start:'2025-12-01',end:'2025-12-31'})
  assert.deepEqual(diaryMoveMonth('2028-03',-1,'2028-03-20'),{start:'2028-02-01',end:'2028-02-29'})
  assert.deepEqual(diaryMonthRange('2026-02','2026-11-20'),{start:'2026-02-01',end:'2026-02-28'})
  for(const month of ['','2026-13','2026-00','bad','2027-01'])assert.equal(diaryMonthRange(month,'2026-11-20'),null)
  assert.equal(diaryMoveMonth('2026-11',7,'2026-11-20'),null)
})
const complete={type:'swim',state:'completed',reportedMeters:4000,reportedMinutes:90,focus:'f2_spec'}
test('only genuinely missing swim fields are marked; valid estimates count as known and other activities are not judged',()=>{
  assert.deepEqual(missingSwimDetails(complete),[])
  assert.deepEqual(missingSwimDetails({...complete,reportedMeters:null}),['meter'])
  assert.deepEqual(missingSwimDetails({...complete,reportedMinutes:null,focus:'  '}),['tid','inriktning'])
  assert.deepEqual(missingSwimDetails({type:'swim',state:'completed'}),['meter','tid','inriktning'])
  assert.deepEqual(missingSwimDetails({...complete,reportedMeters:null,reportedMinutes:null,estimatedMeters:4000,estimatedMinutes:90}),[])
  assert.deepEqual(missingSwimDetails({...complete,reportedMeters:0,estimatedMeters:NaN,reportedMinutes:-1,estimatedMinutes:Infinity}),['meter','tid'])
  assert.deepEqual(missingSwimDetails({...complete,reportedMeters:null,plannedMeters:4000}),['meter'])
  for(const state of ['planned','feedback','status'])assert.deepEqual(missingSwimDetails({type:'swim',state}),[])
  for(const type of ['rest','sick','competition','strength','dryland','other'])assert.deepEqual(missingSwimDetails({type,state:'completed'}),[])
})
test('retrospective pass selection clears the missing-data indication without changing effort or session count',()=>{
  const day='2026-11-17',session={session_date:day,session_slot:'afternoon_swim',activity_type:'swim',source:'manual'}
  const workouts=['a','b','c'].map(id=>({id,workout_date:day,time_of_day:'afternoon',title:id,focus:'f2_spec',distance_meters:4000,duration_minutes:90}))
  const build=sessions=>buildDiaryEntries({sessions,workouts,today:'2026-11-20'})
  assert.deepEqual(missingSwimDetails(build([session])[0]),['meter','inriktning'])
  const entries=build([{...session,workout_reference:'workout:b'}])
  assert.equal(entries.length,1);assert.equal(entries[0].rpe,null);assert.deepEqual(missingSwimDetails(entries[0]),[])
})
test('the calendar updates the owned diary range with unsaved-text protection and gives non-colour missing-data labels',()=>{
  const source=readFileSync(new URL('../src/training-diary.jsx',import.meta.url),'utf8')
  assert.match(source,/onMonthChange=\{changeCalendarMonth\}/)
  assert.match(source,/if \(changeRange\(next\)\) calendarNavigation.current/)
  assert.match(source,/if \(!allowLeave\(\)\) return false/)
  assert.match(source,/request\(`\/api\/training\?diary=true&start=\$\{range.start\}&end=\$\{range.end\}`/)
  assert.doesNotMatch(source,/disabled=\{month <= range.start/)
  assert.match(source,/simpass saknar uppgifter/);assert.match(source,/diary-calendar-missing/)
})
