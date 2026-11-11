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

test('failed polling backs off, respects the cap and resets after recovery', async () => {
  let time = 0, calls = 0, fail = true
  const loop = createVisibleRefresh(() => { calls++; if (fail) throw new Error('server error') }, {
    visible: () => true, now: () => time, minInterval: 0, errorInterval: 60000, maxErrorInterval: 180000,
  })
  await assert.rejects(loop.refresh())
  time = 59999; await loop.refresh(); assert.equal(calls, 1)
  time = 60000; await assert.rejects(loop.refresh()); assert.equal(calls, 2)
  time = 179999; await loop.refresh(); assert.equal(calls, 2)
  time = 180000; await assert.rejects(loop.refresh()); assert.equal(calls, 3)
  time = 359999; await loop.refresh(); assert.equal(calls, 3)
  fail = false; time = 360000; await loop.refresh(); assert.equal(calls, 4)
  fail = true; time++; await assert.rejects(loop.refresh()); assert.equal(calls, 5)
  time += 60000; await assert.rejects(loop.refresh()); assert.equal(calls, 6)
})

test('focus and custom update events cannot bypass backoff; hidden tabs and disposed loops stay idle', async () => {
  let time = 0, calls = 0, timer
  const events = new Map()
  const surface = { hidden: false,
    setInterval(fn) { timer = fn; return 1 }, clearInterval() {},
    addEventListener(name, fn) { events.set(name, fn) }, removeEventListener(name) { events.delete(name) },
  }
  const stop = startVisiblePolling(async () => { calls++; throw new Error('failure') }, 60000, {
    target: surface, visibilityTarget: surface, now: () => time, events: ['focus', 'changed'],
  })
  const settle = () => new Promise(resolve => setImmediate(resolve))
  await settle(); assert.equal(calls, 1)
  time = 30000; events.get('focus')(); events.get('changed')(); await settle(); assert.equal(calls, 1)
  surface.hidden = true; time = 60000; timer(); await settle(); assert.equal(calls, 1)
  surface.hidden = false; events.get('visibilitychange')(); await settle(); assert.equal(calls, 2)
  stop(); time = 300000; timer(); await settle(); assert.equal(calls, 2); assert.equal(events.size, 0)
})
