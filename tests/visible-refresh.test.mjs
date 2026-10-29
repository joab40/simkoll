import test from 'node:test'
import assert from 'node:assert/strict'
import { createVisibleRefresh, startVisiblePolling } from '../src/visible-refresh.js'

test('overlapping focus and visibility events share a request and apply a cooldown', async () => {
  let time=0,calls=0,finish
  const loop=createVisibleRefresh(()=>{calls++;return new Promise(resolve=>{finish=resolve})},{visible:()=>true,now:()=>time})
  const first=loop.refresh(),second=loop.refresh()
  assert.equal(first,second)
  await Promise.resolve();assert.equal(calls,1)
  finish();await first
  time=1000;await loop.refresh();assert.equal(calls,1)
  time=2000;const next=loop.refresh();await Promise.resolve();assert.equal(calls,2);finish();await next
})
test('hidden apps skip requests and a disposed profile cannot start a new refresh', async () => {
  let visible=false,calls=0
  const loop=createVisibleRefresh(()=>{calls++},{visible:()=>visible,minInterval:0})
  await loop.refresh();assert.equal(calls,0)
  visible=true;await loop.refresh();assert.equal(calls,1)
  loop.dispose();await loop.refresh();assert.equal(calls,1)
})
test('a failed refresh can be retried; polling removes timers and listeners on navigation', async () => {
  let calls=0
  const loop=createVisibleRefresh(()=>{if(!calls++)throw new Error('offline')},{visible:()=>true,minInterval:0})
  await assert.rejects(loop.refresh(),/offline/);await loop.refresh();assert.equal(calls,2)
  const events=new Map(),removed=[],timers=[]
  const target={setInterval(callback){timers.push(callback);return 7},clearInterval(id){removed.push(id)},addEventListener(key,fn){events.set(key,fn)},removeEventListener(key,fn){assert.equal(events.get(key),fn);events.delete(key)}}
  globalThis.document={hidden:false}
  const stop=startVisiblePolling(async()=>{},30000,{target,visibilityTarget:target})
  assert.equal(events.size,3)
  stop();assert.equal(events.size,0);assert.deepEqual(removed,[7])
  await timers[0]()
})
