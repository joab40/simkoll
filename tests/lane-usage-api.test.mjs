import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
process.env.COACH_SESSION_SECRET='lane-usage-fixture-only'
const {createCoachToken}=await import('../server/coach-auth.js')
const {handleLaneUsage,decodeLanePhoto}=await import('../server/lane-usage.js')
const {defaultLaneUsage}=await import('../shared/lane-usage.js')
const actor=randomUUID(),id=randomUUID(),settings={...defaultLaneUsage(),enabled:true,updated_at:'2026-11-20T00:00:00+00:00'},group=settings.participants[0]
const json=(value,status=200)=>new Response(JSON.stringify(value),{status})
const photo='data:image/jpeg;base64,'+Buffer.from('ffd8ff00ffd9','hex').toString('base64')
const input=()=>({action:'save-lane-measurement',id,date:'2026-11-20',time:'19:00',location:'Pool',entries:[{participantId:group.id,lanes:2,swimmers:12}],expectedUpdatedAt:settings.updated_at})
function fixture({role='coach',status='active',enabled=true,existing=null,saveStatus=200,saveError='',lostResponse=false,publicBucket=false}={}){
  const calls=[],storageCalls=[],audit=[],token=createCoachToken({id:actor,role}),saved=[]
  const db=async(path,options={})=>{
    calls.push({path,options});if(path.startsWith('coach_accounts'))return json([{id:actor,role,status}])
    if(path.startsWith('lane_usage_settings'))return json([{...settings,enabled}])
    if(path.startsWith('lane_usage_measurements?id'))return json(existing?[existing]:saved)
    if(path.startsWith('lane_usage_measurements?'))return json([])
    if(path==='rpc/save_lane_usage_settings')return json(settings)
    if(path==='rpc/save_lane_usage_measurement'){
      if(saveStatus!==200)return json({error:saveError},saveStatus)
      const p=JSON.parse(options.body),row={id:p.p_id,measurement_date:p.p_date,observed_time:p.p_time,location:p.p_location,entries:p.p_entries,photo_path:p.p_photo_path,created_by:actor};saved.push(row)
      if(lostResponse)throw new Error('lost response');return json(row)
    }
    throw new Error('Unexpected DB call: '+path)
  }
  const storage=async(path,options={})=>{storageCalls.push({path,options});return json(path.startsWith('bucket')?{public:publicBucket}:path.startsWith('object/sign')?{signedURL:'/object/sign/private?token=fixture'}:{})}
  const call=async({method='GET',query={laneUsage:'settings'},body={},code=token}={})=>{
    const response={setHeader(){},status(code){this.code=code;return this},json(data){this.data=data;return this}}
    await handleLaneUsage({method,headers:{'x-simkoll-code':code},query,body},response,{db,storage,audit:async(...args)=>audit.push(args),today:()=> '2026-11-20',storageUrl:path=>'https://private.invalid'+path})
    return response
  }
  return {call,calls,storageCalls,audit,saved}
}
test('legacy/shared codes, swimmers, suspended coaches and live demotions cannot bypass access checks',async()=>{
  const f=fixture();for(const code of ['legacy-coach','swimmer','coach.bad'])assert.equal((await f.call({code})).code,403)
  assert.equal(f.calls.length,0)
  assert.equal((await fixture({status:'suspended'}).call()).code,403)
  assert.equal((await fixture({role:'swimmer'}).call()).code,403)
  assert.equal((await f.call()).code,200)
  assert.equal((await f.call({method:'POST',body:{action:'save-lane-settings',...settings,expectedUpdatedAt:settings.updated_at}})).code,403)
  const admin=fixture({role:'superadmin'});assert.equal((await admin.call({method:'POST',body:{action:'save-lane-settings',...settings,expectedUpdatedAt:settings.updated_at}})).code,200)
})
test('save captures trusted names, actor and one atomic observation; repeat submission is idempotent',async()=>{
  const f=fixture(),body=input(),first=await f.call({method:'POST',body})
  assert.equal(first.code,200);assert.equal(first.data.measurement.entries[0].name,'Sundsvall');assert.equal(first.data.measurement.hasPhoto,false)
  const p=JSON.parse(f.calls.find(c=>c.path==='rpc/save_lane_usage_measurement').options.body)
  assert.equal(p.p_actor,actor);assert.equal(p.p_entries.length,1)
  assert.equal((await f.call({method:'POST',body})).code,200);assert.equal(f.saved.length,1)
  assert(f.calls.every(c=>!/(personal_training|responses|attendance|point_events)/.test(c.path)))
})
test('invalid, disabled, future and stale measurements cannot write or upload',async()=>{
  for(const body of [{...input(),date:'2026-11-21'},{...input(),expectedUpdatedAt:'old'},{...input(),entries:[]},{...input(),entries:[{participantId:group.id,lanes:9,swimmers:12}]}]){
    const f=fixture(),result=await f.call({method:'POST',body});assert(result.code>=400);assert.equal(f.storageCalls.length,0);assert.equal(f.saved.length,0)
  }
  const disabled=fixture({enabled:false});assert.equal((await disabled.call({method:'POST',body:input()})).code,400)
  assert.equal((await disabled.call({query:{laneUsage:'measurements',start:'2026-11-01',end:'2026-11-20'}})).code,200)
})
test('private photos require explicit confirmation and signing is scoped to an existing measurement',async()=>{
  const f=fixture();assert.equal((await f.call({method:'POST',body:{...input(),photo}})).code,400);assert.equal(f.storageCalls.length,0)
  const saved=await f.call({method:'POST',body:{...input(),photo,photoConsent:true}});assert.equal(saved.code,200);assert.equal(saved.data.measurement.hasPhoto,true)
  assert.equal(f.storageCalls[0].path,'bucket/lane-usage-evidence');assert.equal(f.storageCalls[1].options.headers['x-upsert'],'false')
  assert.equal(Object.hasOwn(saved.data.measurement,'photo_path'),false)
  const signed=await f.call({query:{laneUsage:'photo',id}});assert.equal(signed.code,200);assert.match(signed.data.url,/private.invalid/)
  assert.equal(JSON.parse(f.storageCalls.at(-1).options.body).expiresIn,300)
  assert.equal((await f.call({query:{laneUsage:'photo',id:'../../other'}})).code,400)
  const exposed=fixture({publicBucket:true});assert.equal((await exposed.call({method:'POST',body:{...input(),photo,photoConsent:true}})).code,503);assert.equal(exposed.saved.length,0)
})
test('rejected transactions remove only the new upload; ambiguous responses recover the committed observation',async()=>{
  const rejected=fixture({saveStatus:409,saveError:'LANE_CONFLICT'}),body={...input(),photo,photoConsent:true}
  assert.equal((await rejected.call({method:'POST',body})).code,409)
  assert.equal(rejected.storageCalls.at(-1).options.method,'DELETE');assert.match(JSON.parse(rejected.storageCalls.at(-1).options.body).prefixes[0],new RegExp('^'+actor+'/'+id+'/'))
  const lost=fixture({lostResponse:true}),result=await lost.call({method:'POST',body})
  assert.equal(result.code,200);assert.equal(lost.saved.length,1);assert(!lost.storageCalls.some(c=>c.options.method==='DELETE'))
})
test('photo bytes and statistics periods are bounded and validated',async()=>{
  assert.equal(decodeLanePhoto(photo).length,6)
  for(const value of ['data:image/svg+xml;base64,PHN2Zz4=','data:image/jpeg;base64,YmFk',photo+'x','x'.repeat(2_666_751)])assert.throws(()=>decodeLanePhoto(value))
  const f=fixture();for(const query of [{laneUsage:'measurements',start:'2024-01-01',end:'2026-11-20'},{laneUsage:'measurements',start:'2026-11-21',end:'2026-11-20'},{laneUsage:'measurements',start:'2026-11-01',end:'2026-11-21'}])assert.equal((await f.call({query})).code,400)
})
