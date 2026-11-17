import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
process.env.SUPABASE_URL='https://feedback-dialog.invalid'
process.env.SUPABASE_SECRET_KEY='fixture'
process.env.COACH_SESSION_SECRET='feedback-test'
process.env.SIMKOLL_SWIMMER_CODE='swim-feedback'
const {default:handler}=await import('../api/community.js')
const {createCoachToken}=await import('../server/coach-auth.js')
const profile='11111111-1111-4111-8111-111111111111',admin='22222222-2222-4222-8222-222222222222',requestId='33333333-3333-4333-8333-333333333333'
const json=(data,status=200)=>new Response(JSON.stringify(data),{status})
const call=async(options={})=>{
  const response={setHeader(){},status(code){this.code=code;return this},json(data){this.data=data;return this}}
  await handler({method:'GET',headers:{'x-simkoll-code':'swim-feedback',cookie:'simkoll_session=fixture'},query:{feedbackDialog:'true'},...options},response)
  return response
}
test('real route scopes own dialog through cookie, ignores supplied identity and never uses normal private chat or AI',async()=>{
  globalThis.fetch=async(raw,options)=>{
    const table=new URL(raw).pathname.split('/').at(-1)
    if(table==='profile_sessions')return json([{profile_id:profile}])
    if(table==='profiles')return json([{id:profile}])
    assert.equal(table,'app_feedback_dialog')
    assert.deepEqual(JSON.parse(options.body),{p_profile_id:profile,p_action:'send',p_feedback_id:'8',p_request_id:requestId,p_content:'En följdfråga'})
    return json({id:'12',created:true})
  }
  const response=await call({method:'POST',query:{},body:{action:'feedback-message',id:'8',requestId,content:'En följdfråga',profileId:admin,coachId:admin}})
  assert.equal(response.code,200);assert.equal(response.data.created,true)
})
test('ordinary/head coaches, anonymous and revoked admins cannot load any dialog',async()=>{
  for(const role of ['coach','head_coach']){
    const calls=[];globalThis.fetch=async raw=>{const table=new URL(raw).pathname.split('/').at(-1);calls.push(table);assert.equal(table,'coach_accounts');return json([{id:admin}])}
    assert.equal((await call({headers:{'x-simkoll-code':createCoachToken({id:admin,role})}})).code,403)
    assert.deepEqual(calls,['coach_accounts'])
  }
  globalThis.fetch=async()=>{assert.fail('No request permitted')}
  assert.equal((await call({headers:{}})).code,403)
  globalThis.fetch=async()=>json([])
  assert.equal((await call({headers:{'x-simkoll-code':createCoachToken({id:admin,role:'superadmin'})}})).code,401)
  assert.equal((await call({headers:{'x-simkoll-code':'swim-feedback'}})).code,403)
})
test('superadmin RPC includes live actor/version; read cursors are explicit; invalid and missing SQL never look empty',async()=>{
  let params
  globalThis.fetch=async(raw,options)=>{
    const table=new URL(raw).pathname.split('/').at(-1)
    if(table==='coach_accounts')return json([{id:admin}])
    if(table==='profile_sessions')return json([{profile_id:profile}])
    if(table==='profiles')return json([{id:profile}])
    assert.equal(table,'app_feedback_dialog');params=JSON.parse(options.body);return json({read:true})
  }
  assert.equal((await call({headers:{'x-simkoll-code':createCoachToken({id:admin,role:'superadmin',session_version:4})},method:'POST',body:{action:'feedback-read',id:'2',throughId:'17'}})).code,200)
  assert.deepEqual(params,{p_coach_id:admin,p_session_version:4,p_action:'read',p_feedback_id:'2',p_through_id:'17'})
  for(const body of [{action:'feedback-message',id:'1',content:'hi',requestId:'bad'},{action:'feedback-read',id:'1',throughId:99},{action:'feedback-message',id:'1',content:'x'.repeat(1001),requestId}])assert.equal((await call({method:'POST',body})).code,400)
  globalThis.fetch=async raw=>new URL(raw).pathname.endsWith('/profile_sessions')?json([{profile_id:profile}]):new URL(raw).pathname.endsWith('/profiles')?json([{id:profile}]):json({code:'PGRST202'},404)
  const missing=await call();assert.equal(missing.code,503);assert.match(missing.data.error,/SQL 130/)
})
test('UI keeps original workflow separate, only opens read cursors in a dialog, and adds superadmin badges and own inbox',async()=>{
  const ui=await readFile(new URL('../src/app-feedback-dialog.jsx',import.meta.url),'utf8'),main=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8')
  assert.match(ui,/dialog.current.showModal\(\)/);assert.match(ui,/document.hidden/)
  assert.match(ui,/throughId:data.readThrough/);assert.match(ui,/attempt.current \|\|= \{requestId:crypto.randomUUID/)
  assert.match(ui,/Visa äldre meddelanden/);assert.match(ui,/requestId|pending/)
  assert.match(main,/useFeedbackCount\(code, accountRole === 'superadmin'\)/)
  assert.match(main,/<FeedbackInbox key=\{profile.id\}/)
  assert.match(main,/<FeedbackThreadButton id=\{String\(item.id\)\} code=\{code\}/)
  assert.doesNotMatch(ui,/innerHTML|generate|OpenAI|private_messages/)
  const css=await readFile(new URL('../src/app-feedback-dialog.css',import.meta.url),'utf8')
  assert.match(css,/\.feedback-inbox > ul > li>button>p \{.*-webkit-line-clamp:2/)
  assert.doesNotMatch(css,/\.feedback-inbox li p/,'preview truncation must never truncate messages inside a nested dialog')
})

test('swimmer feedback is grouped after the suggestion card and reachable from a badged menu without marking read',async()=>{
  const main=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8')
  const home=main.slice(main.indexOf('function Home('),main.indexOf('function StrengthProgramCard('))
  assert.ok(home.indexOf('<FeedbackSection')>home.indexOf('</SwimmerHeroCarousel>'))
  assert.match(home,/<FeedbackSection jumpRequest=\{feedbackJumpRequest\}>\s*\{appFeedbackEnabled && <AppFeedbackCard code=\{code\} \/>\}\s*<FeedbackInbox key=\{profile.id\} code=\{code\} \/>/)
  assert.match(main,/onFeedback=\{\(\) => \{ setScreen\('home'\); setFeedbackJumpRequest\(value => value \+ 1\) \}\}/)
  assert.match(main,/if \(screen !== 'home'\) setFeedbackJumpRequest\(0\)/,'returning from another screen must not repeat an old jump')
  assert.match(main,/useFeedbackCount\(code, role === 'swimmer' && Boolean\(profile\), apiRequest, profile\?\.id\)/)
  const header=await readFile(new URL('../src/swimmer-header.jsx',import.meta.url),'utf8')
  assert.match(header,/item.key === 'feedback' && feedbackNotice/)
  assert.match(header,/Stäng' : 'Meny'\} \{feedbackNotice\}/)
  assert.match(header,/>Mer \{feedbackNotice\}/)
  const ui=await readFile(new URL('../src/app-feedback-dialog.jsx',import.meta.url),'utf8')
  const section=ui.slice(ui.indexOf('export function FeedbackSection'),ui.indexOf('export function FeedbackDialog'))
  assert.match(section,/focus\(\{preventScroll:true\}\)/)
  assert.match(section,/prefers-reduced-motion/)
  assert.doesNotMatch(section,/feedback-read|post\(/,'menu navigation never acknowledges unread messages')
  assert.match(ui,/state.code===code && state.scopeKey===scopeKey/,'never show a previous profile’s unread count')
})
