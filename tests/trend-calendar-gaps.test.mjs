import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { trendCalendarItems, trendSegments, trendGapSegments } from '../src/trend-curve.js'
import { swimMeterDay, swimMeterCalendar } from '../shared/swim-meter-day.js'
import { withTrendSwimMeters, diaryPlotMeters, SWIM_METER_COLOR } from '../src/trend-swim-meters.js'
import { buildDiaryEntries, summarizeDiary } from '../shared/training-diary.js'

const swim = (extra={}) => ({type:'swim',state:'completed',reportedMeters:null,estimatedMeters:null,...extra})
test('calendar gaps have dashed endpoint pairs only, never filled values or extrapolated endpoints', () => {
  const input = [null, 2, null, null, 4, 3, null].map((v,index)=>({date:`2026-10-${String(21+index).padStart(2,'0')}`,v}))
  const before=structuredClone(input)
  assert.deepEqual(trendSegments(input,'v').map(segment=>segment.map(point=>point.index)),[[1],[4,5]])
  assert.deepEqual(trendGapSegments(input,'v'),[[{index:1,value:2},{index:4,value:4}]])
  assert.deepEqual(input,before)
  assert.deepEqual(trendGapSegments([{v:null},{v:3},{v:null}],'v'),[])
  const skipped=[{date:'2026-10-21',v:2},{date:'2026-10-23',v:4}]
  assert.equal(trendSegments(skipped,'v').length,2)
  assert.equal(trendGapSegments(skipped,'v').length,1)
})
test('calendar positions include non-training days without adding response values or changing the source list', () => {
  const items=[{date:'2026-10-21',feeling:2},{date:'2026-10-23',feeling:4},{date:'2026-10-23',feeling:3}], before=structuredClone(items)
  const rows=trendCalendarItems(items,{start:'2026-10-20',endExclusive:'2026-10-25'})
  assert.equal(rows.length,6)
  assert.deepEqual(rows.filter(row=>row.calendarOnly).map(row=>row.date),['2026-10-20','2026-10-22','2026-10-24'])
  assert.ok(rows.filter(row=>row.calendarOnly).every(row=>row.feeling===undefined&&row.count===0))
  assert.deepEqual(items,before)
  assert.deepEqual(trendCalendarItems([],{}),[])
})
test('zero is no registered swimming, not a completed session with unknown meters', () => {
  for(const entries of [[],[{type:'rest',state:'status'}],[{type:'strength',state:'completed'}],[{type:'cycling',state:'completed',reportedMeters:10000}],[{type:'competition',state:'completed'}],[{type:'swim',state:'planned',plannedMeters:5000}]]) assert.equal(swimMeterDay(entries).swimMetersPlot,0)
  for(const entries of [[swim()],[swim({partial:true})],[{type:'unknown',state:'completed'}],[{type:'swim',state:'feedback'}],[swim({reportedMeters:2000}),swim()]]) assert.equal(swimMeterDay(entries).swimMetersPlot,null)
  assert.equal(swimMeterDay([swim({reportedMeters:0})]).swimMetersPlot,0)
})
test('reported and estimated meters add across real sessions, with own values taking precedence', () => {
  const result=swimMeterDay([swim({reportedMeters:2000,estimatedMeters:5000}),swim({estimatedMeters:3000})])
  assert.equal(result.swimMetersPlot,5000)
  assert.match(result.swimMeterPlotSource,/Rapporterat \+ uppskattat/)
  const [plot]=withTrendSwimMeters([{distanceMeters:99000,...result}])
  assert.equal(plot.swimMeterScale,5)
  assert.equal(diaryPlotMeters(result),5000)
  assert.equal(diaryPlotMeters({swimMetersPlot:null,swimMeters:5000}),null)
})
test('daily calendar never fabricates zeros from incomplete reads and is bounded and DST-safe', () => {
  const days=swimMeterCalendar([],'2026-10-24','2026-10-28')
  assert.deepEqual(days.map(day=>day.date),['2026-10-24','2026-10-25','2026-10-26','2026-10-27'])
  assert.ok(days.every(day=>day.swimMetersPlot===0))
  assert.ok(swimMeterCalendar([],'2026-10-24','2026-10-28',{complete:false}).every(day=>day.swimMetersPlot===null))
  assert.deepEqual(swimMeterCalendar([],'2026-02-30','2026-03-02'),[])
  assert.deepEqual(swimMeterCalendar([],'2025-01-01','2026-10-28'),[])
})
test('diary keeps original period totals and no-report values while providing plot-only zero days', () => {
  const entries=buildDiaryEntries({sessions:[{session_date:'2026-10-21',session_slot:'afternoon_swim',activity_type:'swim'}],workouts:[{id:'w',workout_date:'2026-10-21',time_of_day:'afternoon',distance_meters:3000}],trainingGroup:'junior',today:'2026-11-02'})
  const summary=summarizeDiary(entries,[],'2026-10-21','2026-10-23')
  assert.equal(summary.swimMeters,null)
  assert.equal(summary.estimatedSwimMeters,3000)
  assert.equal(summary.sessions,1)
  assert.deepEqual(summary.days.map(day=>day.swimMetersPlot),[3000,0,0])
  assert.ok(summary.days.every(day=>day.rpe===null))
})
test('both line graphs use black meters, dashed rating gaps, and leave tabular values un-interpolated', () => {
  assert.equal(SWIM_METER_COLOR,'#111111')
  const source=file=>readFileSync(new URL(`../${file}`,import.meta.url),'utf8')
  for(const file of ['src/trend-line-chart.jsx','src/training-diary.jsx']) {
    const view=source(file)
    assert.match(view,/SWIM_METER_COLOR/)
    assert.match(view,/trendGapSegments/)
    assert.match(view,/strokeDasharray="6 5"/)
  }
  assert.doesNotMatch(source('src/trend-line-chart.jsx'),/Simmeter \(streckad\)/)
  assert.match(source('src/main.jsx'),/TrendLineChart items=\{analysis.trend \|\| \[\]\} range=\{analysis.range\} meterDays=\{analysis.meterDays\}/)
})
