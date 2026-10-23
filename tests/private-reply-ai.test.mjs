import test from 'node:test'
import assert from 'node:assert/strict'
process.env.SUPABASE_URL='https://reply-ai-fixture.invalid'
process.env.SUPABASE_SECRET_KEY='fixture-only'
process.env.SIMKOLL_SWIMMER_CODE='reply-swimmer'
process.env.OPENAI_API_KEY='fixture-only-not-real'
const {proposePrivateReply}=await import('../server/private-reply-ai.js')
const {default:handler}=await import('../api/community.js')
const messageId='11111111-1111-4111-8111-111111111111',owner='22222222-2222-4222-8222-222222222222'
const json=(data,status=200)=>new Response(JSON.stringify(data),{status})
const payload=(draft={reply:'Passet börjar 17:00 enligt veckoplaneringen.',sourceIds:['plan0'],checks:[]})=>({status:'completed',output_text:JSON.stringify(draft),usage:{input_tokens:20,output_tokens:12,total_tokens:32}})
function fixture(options={}) {
  const reads=[],calls=[],logs=[]
  const read=async(query,write)=>{
    assert.equal(write,undefined,'AI proposals must not write attendance, messages or goals')
    reads.push(query)
    if(query.startsWith('open_chat_messages?id='))return json(options.deleted?[]:[{id:messageId,sender_profile_id:owner,content:options.question || 'När börjar träningen inför tävlingen?'}])
    if(query.startsWith('profiles?')){assert.match(query,/select=training_group/);return json([{training_group:'junior',display_name:'NAME_MUST_NOT_BE_SENT'}])}
    if(query.startsWith('training_plans?'))return options.unavailable?json({},503):json([{plan_date:'2026-10-23',title:'Juniorpass',time_of_day:'17:00',target_groups:['junior'],notes:'PRIVATE_NOTES_MUST_NOT_BE_SENT'},{plan_date:'2026-10-23',title:'OTHER_GROUP_MUST_NOT_BE_SENT',target_groups:['other']}])
    if(query.startsWith('daily_workouts?'))return json([{workout_date:'2026-10-23',title:'Simning',time_of_day:'morning',target_groups:['junior'],content:'LOCKED_SERIES_MUST_NOT_BE_SENT'}])
    if(query.startsWith('competition_calendar?'))return json([{title:'Tävling',start_date:'2026-10-24',end_date:'2026-10-25',notes:'Samling 08:00',target_groups:['junior']},{title:'OTHER_RACE_MUST_NOT_BE_SENT',target_groups:['other']}])
    if(query.startsWith('app_settings?'))return json([{setting_value:{openChat:{enabled:true}}}])
    if(query.startsWith('open_chat_messages?deleted_at=')){assert.match(query,/sender_role=eq.coach&visibility=eq.group/);return json([{id:'info',content:'Kom ihåg vattenflaska.',created_at:'2026-10-22T18:00:00Z'}])}
    assert.fail(`Unexpected data source: ${query}`)
  }
  const deps={read,availability:async()=>({allowed:true}),today:()=> '2026-10-23',log:async(request,row)=>logs.push(row),fetch:async(url,init)=>{
    assert.equal(url,'https://api.openai.com/v1/responses');calls.push(JSON.parse(init.body));return json(options.payload || payload())
  }}
  return {deps,reads,calls,logs}
}
test('coach proposal grounds in fresh selected message and own group, with no private or locked context',async()=>{
  const f=fixture()
  const result=await proposePrivateReply({}, {messageId,draft:'Mitt eget utkast',question:'CLIENT_QUESTION_IGNORED',recipientId:'CLIENT_OWNER_IGNORED'},f.deps)
  assert.equal(result.sources[0].label,'Veckoplanering 2026-10-23: Juniorpass')
  assert.equal(f.calls.length,1);assert.equal(f.calls[0].store,false)
  const input=f.calls[0].input[1].content
  assert.match(input,/När börjar träningen/);assert.match(input,/Mitt eget utkast/)
  for(const forbidden of ['NAME_MUST_NOT_BE_SENT','OTHER_GROUP_MUST_NOT_BE_SENT','OTHER_RACE_MUST_NOT_BE_SENT','PRIVATE_NOTES_MUST_NOT_BE_SENT','LOCKED_SERIES_MUST_NOT_BE_SENT','CLIENT_QUESTION_IGNORED','CLIENT_OWNER_IGNORED',owner])assert.equal(input.includes(forbidden),false,forbidden)
  assert.equal(f.logs.length,1);assert.deepEqual(f.logs[0].response,{usage:{input_tokens:20,output_tokens:12,total_tokens:32}})
  assert.equal(JSON.stringify(f.logs).includes('Mitt eget utkast'),false)
})
test('a simple acknowledgement does not load calendar or unrelated trainer messages',async()=>{
  const f=fixture({question:'Tack!',payload:payload({reply:'Tack själv!',sourceIds:[],checks:[]})})
  await proposePrivateReply({}, {messageId},f.deps)
  assert.equal(f.reads.length,2)
  assert.equal(JSON.parse(f.calls[0].input[1].content).sources.length,1)
})
test('disabled AI and deleted source prevent model requests',async()=>{
  const f=fixture()
  await assert.rejects(proposePrivateReply({}, {messageId},{...f.deps,availability:async()=>({allowed:false})}),{status:403})
  assert.equal(f.reads.length,0);assert.equal(f.calls.length,0)
  const removed=fixture({deleted:true})
  await assert.rejects(proposePrivateReply({}, {messageId},removed.deps),{status:404})
  assert.equal(removed.calls.length,0)
})
test('missing context is explicitly marked, not treated as proof no training exists',async()=>{
  const f=fixture({unavailable:true,payload:payload({reply:'Jag behöver kontrollera tiden och återkommer.',sourceIds:[],checks:['Kontrollera passets starttid.']})})
  const result=await proposePrivateReply({}, {messageId},f.deps)
  assert.ok(result.unavailable.includes('Veckoplanering'))
  assert.ok(JSON.parse(f.calls[0].input[1].content).unavailable.includes('Veckoplanering'))
})
test('incomplete output, fabricated source ids and oversized answers never become proposals',async()=>{
  for(const response of [{...payload(),status:'incomplete'},payload({reply:'Test',sourceIds:['made-up-source'],checks:[]}),payload({reply:'x'.repeat(1001),sourceIds:[],checks:[]})]){
    const f=fixture({payload:response})
    await assert.rejects(proposePrivateReply({}, {messageId},f.deps),/inget användbart förslag/)
    assert.equal(f.logs.length,1);assert.equal(f.logs[0].status,'failure')
  }
})
test('swimmer and anonymous callers cannot invoke the coach AI route',async()=>{
  globalThis.fetch=async()=>assert.fail('must reject before any database or model request')
  for(const code of ['reply-swimmer','']){
    const res={setHeader(){},status(value){this.code=value;return this},json(data){this.data=data;return this}}
    await handler({method:'POST',headers:{'x-simkoll-code':code},body:{action:'propose-private-reply',messageId}},res)
    assert.equal(res.code,403)
  }
})
