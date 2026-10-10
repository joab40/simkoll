import test from 'node:test'
import assert from 'node:assert/strict'
import {pepTimeline,pepDay,pepTime} from '../src/pep-chat.js'
test('messages are chronological, group only adjacent same-sender posts within five minutes',()=>{
  const items=[{id:'c',type:'group',sender:{id:'2'},createdAt:'2026-10-10T10:02:00Z'},{id:'b',type:'group',sender:{id:'1'},createdAt:'2026-10-10T10:01:00Z'},{id:'a',type:'group',sender:{id:'1'},createdAt:'2026-10-10T10:00:00Z'}]
  const result=pepTimeline(items)
  assert.deepEqual(result.map(x=>x.id),['a','b','c'])
  assert.deepEqual(result.map(x=>x.grouped),[false,true,false])
  assert.equal(items[0].id,'c')
})
test('Stockholm midnight separates days even when UTC date is unchanged',()=>{
  const result=pepTimeline([{id:'a',type:'group',createdAt:'2026-10-10T21:59:00Z'},{id:'b',type:'group',createdAt:'2026-10-10T22:01:00Z'}])
  assert.deepEqual(result.map(x=>x.newDay),[true,true])
  assert.equal(result[1].grouped,false)
  assert.equal(pepDay(result[1].createdAt),'2026-10-11')
  assert.equal(pepTime(result[1].createdAt),'00:01')
})
