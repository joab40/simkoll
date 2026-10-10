import test from 'node:test'
import assert from 'node:assert/strict'
process.env.SUPABASE_URL='https://pep-test.invalid'
process.env.SUPABASE_SECRET_KEY='fixture'
process.env.SIMKOLL_SWIMMER_CODE='swimmer-fixture'
delete process.env.OPENAI_API_KEY
const {default:handler}=await import('../api/community.js')
const id='11111111-1111-4111-8111-111111111111',profile={id,display_name:'Test',emoji:'🙂'}
async function call(body){const response={setHeader(){},status(code){this.code=code;return this},json(data){this.data=data;return this}};await handler({method:body?'POST':'GET',headers:{'x-simkoll-code':'swimmer-fixture',cookie:'simkoll_session=fixture'},body,query:{}},response);return response}
function mock({count=0,target=true,groupRows=[],coachRows=[],custom=true}={}){
  const writes=[]
  globalThis.fetch=async(url,options={})=>{
    const path=String(url).split('/rest/v1/')[1];let data=[]
    if(options.method){writes.push({path,body:JSON.parse(options.body||'{}')});if(path==='group_pep')data=[{id}]}
    else if(path.startsWith('profile_sessions?'))data=[{profile_id:id}]
    else if(path.startsWith('profiles?'))data=[profile]
    else if(path.startsWith('app_settings?'))data=[{setting_value:{swimmer:{customPep:custom}}}]
    else if(path.includes('select=created_at'))data=Array.from({length:path.startsWith('group_pep')?count:0},()=>({created_at:new Date().toISOString()}))
    else if(path.includes('id=eq.')&&path.includes('select=id'))data=target?[{id}]:[]
    else if(path.startsWith('group_pep?'))data=groupRows
    else if(path.startsWith('community_posts?'))data=coachRows
    return {ok:true,json:async()=>data,text:async()=>''}
  };return writes
}
test('fifth group message is accepted but earns no extra pep points',async()=>{
  const writes=mock({count:4}),response=await call({mode:'group',templateKey:'group_start'})
  assert.equal(response.code,201);assert.equal(response.data.awardedPoints,0)
  assert.ok(writes.some(x=>x.path==='group_pep'))
  assert.ok(!writes.some(x=>x.body.event_type==='kudos_sent'))
})
test('eligible group message awards one point, while private pep quota is retained',async()=>{
  let writes=mock();let response=await call({mode:'group',templateKey:'group_start'})
  assert.equal(response.data.awardedPoints,1)
  assert.equal(writes.filter(x=>x.body.event_type==='kudos_sent').length,1)
  writes=mock({count:4});response=await call({mode:'private',templateKey:'great_job',recipientId:'other'})
  assert.equal(response.code,429);assert.equal(writes.length,0)
})
test('reply accepts only an existing public message and never trusts a supplied quote',async()=>{
  let writes=mock(),response=await call({mode:'group',templateKey:'group_start',reply:{type:'group',id,content:'forged'}})
  assert.equal(response.code,201)
  const inserted=writes.find(x=>x.path==='group_pep').body
  assert.equal(inserted.reply_id,id);assert.equal(inserted.reply_type,'group');assert.ok(!('reply_content' in inserted))
  writes=mock({target:false});response=await call({mode:'group',templateKey:'group_start',reply:{type:'coach',id}})
  assert.equal(response.code,404);assert.equal(writes.length,0)
  response=await call({mode:'group',templateKey:'group_start',reply:{type:'private',id}})
  assert.equal(response.code,400)
})
test('own text restrictions and language checks still apply after the quota',async()=>{
  let writes=mock({count:4,custom:false}),response=await call({mode:'group',templateKey:'custom',content:'En fråga?'})
  assert.equal(response.code,403);assert.equal(writes.length,0)
  writes=mock({count:4});response=await call({mode:'group',templateKey:'custom',content:'idiot'})
  assert.equal(response.code,422);assert.equal(writes.length,0)
})
test('deleted coach text is not resurrected in a quote',async()=>{
  mock({groupRows:[{id,sender_profile_id:id,template_key:'group_start',created_at:new Date().toISOString(),reply_type:'coach',reply_id:'22222222-2222-4222-8222-222222222222'}],coachRows:[{id:'22222222-2222-4222-8222-222222222222',content:'Deleted text',deleted_at:new Date().toISOString()}]})
  const response=await call()
  assert.equal(response.code,200);assert.equal(response.data.items[0].reply.content,null)
})
