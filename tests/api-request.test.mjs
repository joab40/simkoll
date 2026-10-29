import test from 'node:test'
import assert from 'node:assert/strict'
import { createApiRequest } from '../src/api-request.js'

test('authorization and validation errors return immediately instead of three slow retries',async()=>{
  for(const status of [400,401,403,404,409,422]){
    let calls=0
    const request=createApiRequest({fetcher:async()=>{calls++;return new Response(JSON.stringify({error:'Åtkomst saknas'}),{status})},pause:()=>assert.fail('must not wait')})
    await assert.rejects(request('/api/test','code'),/Åtkomst saknas/)
    assert.equal(calls,1)
  }
})
test('transient read failures retry with the same identity; mutations and aborted reads never repeat',async()=>{
  let calls=0;const waits=[]
  const request=createApiRequest({fetcher:async(url,options)=>{calls++;assert.equal(options.headers['x-simkoll-code'],'session-code');return new Response(JSON.stringify({ok:true}),{status:calls===1?503:200})},pause:async(ms)=>{waits.push(ms)}})
  assert.deepEqual(await request('/api/test','session-code'),{ok:true});assert.equal(calls,2);assert.deepEqual(waits,[600])
  for(const options of [{method:'POST'},{}]){
    calls=0
    const failed=createApiRequest({fetcher:async()=>{calls++;throw Object.assign(new Error('stopped'),{name:options.method?'Error':'AbortError'})},pause:()=>assert.fail('must not wait')})
    await assert.rejects(failed('/api/test','code',options),/stopped/);assert.equal(calls,1)
  }
})

test('exhausted reads stop after the final attempt without an extra delay',async()=>{
  let calls=0;const waits=[]
  const request=createApiRequest({fetcher:async()=>{calls++;return new Response('{}',{status:503})},pause:async(ms)=>{waits.push(ms)}})
  await assert.rejects(request('/api/test','code'))
  assert.equal(calls,3);assert.deepEqual(waits,[600,1200])
})
