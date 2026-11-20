import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {defaultLaneUsage,validateLaneSettings,validateLaneMeasurement,laneUsageStatistics} from '../shared/lane-usage.js'
const settings={...defaultLaneUsage(),enabled:true},[a,b]=settings.participants
const measurement=()=>({id:randomUUID(),date:'2026-11-20',time:'19:00',location:' Himlabadet ',entries:[{participantId:a.id,lanes:3,swimmers:24},{participantId:b.id,lanes:2,swimmers:12}]})
test('lane settings are off by default, nameable and restricted to 1–5 distinct clubs/groups',()=>{
  assert.equal(defaultLaneUsage().enabled,false)
  assert.equal(validateLaneSettings(settings).participants.length,2)
  for(const participants of [[],Array(6).fill(a),[a,a],[a,{...b,name:' sundsvall '}],[{...a,id:'injected'}],[{...a,name:' '}]])assert.throws(()=>validateLaneSettings({...settings,participants}))
  assert.throws(()=>validateLaneSettings({...settings,enabled:'true'}))
  assert.throws(()=>validateLaneSettings({...settings,title:'x'.repeat(81)}))
})
test('one observation covers multiple clubs with explicit integer lanes/swimmers and historical name snapshots',()=>{
  const input=measurement(),saved=validateLaneMeasurement(input,settings,'2026-11-20')
  assert.equal(saved.location,'Himlabadet');assert.equal(saved.entries[0].name,'Sundsvall');assert.equal(saved.entries[0].swimmers/saved.entries[0].lanes,8)
  input.entries[0].name='Spoofed';assert.equal(validateLaneMeasurement(input,settings,'2026-11-20').entries[0].name,'Sundsvall')
  for(const lanes of [0,9,1.5,'2',null,NaN])assert.throws(()=>validateLaneMeasurement({...input,entries:[{participantId:a.id,lanes,swimmers:20}]},settings,'2026-11-20'))
  for(const swimmers of [-1,501,1.5,'20',null,NaN])assert.throws(()=>validateLaneMeasurement({...input,entries:[{participantId:a.id,lanes:2,swimmers}]},settings,'2026-11-20'))
  assert.equal(validateLaneMeasurement({...input,entries:[{participantId:a.id,lanes:1,swimmers:0}]},settings,'2026-11-20').entries[0].swimmers,0)
  for(const date of ['2026-11-21','2026-02-30','1999-12-31','bad'])assert.throws(()=>validateLaneMeasurement({...input,date},settings,'2026-11-20'))
  for(const time of ['24:00','19:70','x'])assert.throws(()=>validateLaneMeasurement({...input,time},settings,'2026-11-20'))
  for(const entries of [[],[input.entries[0],input.entries[0]],[{participantId:randomUUID(),lanes:1,swimmers:2}]])assert.throws(()=>validateLaneMeasurement({...input,entries},settings,'2026-11-20'))
  assert.throws(()=>validateLaneMeasurement(input,{...settings,enabled:false},'2026-11-20'))
})
test('time statistics use lane-weighted observations, keep missing days absent and never merge different group ids',()=>{
  const rows=[{date:'2026-11-19',entries:[{participantId:a.id,name:'Old name',lanes:1,swimmers:20}]},{date:'2026-11-20',entries:[{participantId:a.id,name:'New name',lanes:3,swimmers:12},{participantId:b.id,name:'New name',lanes:2,swimmers:0}]}]
  const summary=laneUsageStatistics(rows)
  assert.equal(summary.groups.length,2);assert.equal(summary.groups[0].ratio,8);assert.equal(summary.groups[0].name,'New name');assert.equal(summary.groups[0].observations,2)
  assert.equal(summary.groups[1].ratio,0);assert.equal(summary.days.length,3);assert.equal(summary.days[0].date,'2026-11-20')
  assert.deepEqual(laneUsageStatistics([]),{groups:[],days:[]})
})
