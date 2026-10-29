import test from 'node:test'
import assert from 'node:assert/strict'
process.env.SUPABASE_URL='https://preview-test.invalid'
process.env.SUPABASE_SECRET_KEY='fixture'
process.env.SIMKOLL_COACH_CODE='coach-fixture'
process.env.SIMKOLL_SWIMMER_CODE='swimmer-fixture'
const {default:handler}=await import('../api/community.js')
const {loadCommunityPreview}=await import('../server/community-preview.js')
const id='11111111-1111-4111-8111-111111111111'
const json=(data,headers)=>new Response(JSON.stringify(data),{headers})
const call=async(query,code='swimmer-fixture',cookie='simkoll_session=fixture')=>{
  const response={setHeader(){},status(code){this.code=code;return this},json(data){this.data=data;return this}}
  await handler({method:'GET',headers:{'x-simkoll-code':code,cookie},query},response)
  return response
}
test('home preview fetches only small public message slices, without reactions or private threads',async()=>{
  const queries=[]
  globalThis.fetch=async(raw,options={})=>{
    const url=new URL(raw),table=url.pathname.split('/').at(-1);queries.push(url)
    assert.equal(url.hostname,'preview-test.invalid')
    if(table==='profile_sessions')return json([{profile_id:id}])
    if(table==='profiles')return json([{id,display_name:'Ebba',emoji:'🐬'}])
    if(table==='profile_daily_activity'){assert.equal(options.method,'POST');return json([])}
    if(table==='point_events'){assert.equal(options.method,'POST');return json([])}
    if(table==='app_settings')return json([{setting_value:{openChat:{enabled:true,coachOnly:true}}}])
    if(table==='community_posts'){assert.equal(url.searchParams.get('limit'),'2');return json([{id:'post',content:'Tränarinfo',created_at:'2026-10-29T10:00:00Z'}])}
    if(table==='group_pep'){assert.match(url.searchParams.get('or'),/moderation_status.eq.approved/);return json([{id:'pep',sender_profile_id:id,template_key:'group_start',moderation_status:'approved',created_at:'2026-10-29T11:00:00Z'}])}
    if(table==='open_chat_messages'){assert.equal(url.searchParams.get('sender_role'),'eq.coach');assert.equal(url.searchParams.get('visibility'),'neq.coaches');return json([{id:'chat',content:'Samling 18',created_at:'2026-10-29T12:00:00Z'}])}
    assert.fail(`Unexpected expensive lookup: ${table}`)
  }
  const response=await call({preview:'true'})
  assert.equal(response.code,200)
  assert.equal(response.data.items.length,2)
  assert.equal(response.data.items[0].content,'Nu kör vi! 🔥')
  assert.equal(response.data.openChat.messages[0].content,'Samling 18')
  assert.equal(response.data.openChat.coachOnly,true)
  assert(queries.length<=9)
  assert(!('messages' in response.data),'no private-message payload')
})
test('closed channels do not fetch chat; moderation excludes pending/rejected messages',async()=>{
  const preview=await loadCommunityPreview({}, {},async(query)=>{
    if(query.startsWith('open_chat_messages'))assert.fail('closed chat must not be queried')
    if(query.startsWith('group_pep'))return json([{id:'pending',sender_profile_id:id,content:'pending text',moderation_status:'pending'}, {id:'rejected',sender_profile_id:id,content:'rejected text',moderation_status:'rejected'}])
    if(query.startsWith('profiles'))return json([{id}])
    return json([])
  })
  assert.deepEqual(preview.items,[])
  assert.equal(preview.openChat.enabled,false)
})
test('coach badge counts metadata without downloading chats, including counts above old feed limits',async()=>{
  const queries=[]
  globalThis.fetch=async(raw,options={})=>{
    const url=new URL(raw),table=url.pathname.split('/').at(-1);queries.push(url)
    if(table==='app_settings')return json([{setting_value:{openChat:{enabled:true}}}])
    assert.equal(options.headers.Prefer,'count=exact')
    assert.equal(url.searchParams.get('select'),'id');assert.equal(url.searchParams.get('limit'),'1')
    assert.equal(url.searchParams.get('sender_role'),'eq.swimmer')
    assert.equal(url.searchParams.get('created_at'),'gt.2026-10-29T08:00:00.000Z')
    if(table==='private_messages'){assert.equal(url.searchParams.get('recipient_role'),'eq.coach');return json([{id:'private'}],{'Content-Range':'0-0/220'})}
    if(table==='open_chat_messages'){assert.equal(url.searchParams.get('deleted_at'),'is.null');return json([{id:'question'}],{'Content-Range':'0-0/320'})}
    assert.fail(table)
  }
  const response=await call({messageCount:'true',since:String(Date.parse('2026-10-29T08:00:00Z'))},'coach-fixture')
  assert.equal(response.code,200);assert.deepEqual(response.data,{count:540});assert.equal(queries.length,3)
})
test('message counts reject swimmers and anonymous callers before database access',async()=>{
  globalThis.fetch=async()=>assert.fail('unauthorized query')
  for(const code of ['swimmer-fixture',''])assert.equal((await call({messageCount:'true'},code)).code,403)
  assert.equal((await call({preview:'true'},'','')).code,403)
})
