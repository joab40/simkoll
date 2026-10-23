import test from 'node:test'
import assert from 'node:assert/strict'
import {attachPrivateReplies,loadPrivateChatReplies,saveLinkedPrivateReply} from '../server/private-chat-replies.js'
const affe='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',parent='33333333-3333-4333-8333-333333333333'
const messages=[{id:parent,senderRole:'swimmer',senderProfileId:affe,content:'Testfråga'}]
const reply={id:'reply',sender_role:'coach',recipient_role:'swimmer',recipient_profile_id:affe,reply_to_open_chat_id:parent,content:'Privat testtext',created_at:'2026-10-22T18:00:00Z'}
const json=(rows,status=200)=>new Response(JSON.stringify(rows),{status})
test('linked replies appear only for recipient and coaches, never another swimmer or anonymous caller',()=>{
 for(const [role,id,count] of [['coach',null,1],['swimmer',affe,1],['swimmer',other,0],['swimmer',null,0],[null,null,0]]) assert.equal(attachPrivateReplies(messages,[reply],role,id)[0].privateReplies.length,count)
 assert.equal(attachPrivateReplies(messages,[{...reply,recipient_profile_id:other}],'coach')[0].privateReplies.length,0,'reply cannot be attached to someone else’s message')
 assert.equal(attachPrivateReplies(messages,[{...reply,sender_role:'swimmer'}],'coach')[0].privateReplies.length,0)
})
test('swimmer reads filter recipient and parent ids on server and page through replies',async()=>{
 const offsets=[]
 const result=await loadPrivateChatReplies(messages,'swimmer',affe,async(query)=>{
  const url=new URL(`https://fixture.invalid/${query}`)
  assert.equal(url.searchParams.get('recipient_profile_id'),`eq.${affe}`)
  assert.equal(url.searchParams.get('reply_to_open_chat_id'),`in.(${parent})`)
  offsets.push(url.searchParams.get('offset'))
  return json(offsets.length===1?Array.from({length:500},(_,i)=>({...reply,id:`r${i}`})):[])
 })
 assert.equal(result.messages[0].privateReplies.length,500);assert.deepEqual(offsets,['0','500'])
 const denied=await loadPrivateChatReplies(messages,'swimmer',other,async()=>assert.fail('must not query another swimmer’s thread'))
 assert.equal(denied.messages[0].privateReplies.length,0)
})
test('a linked reply writes only private_messages after validating the parent and recipient',async()=>{
 const writes=[]
 const result=await saveLinkedPrivateReply({recipientId:affe,replyToMessageId:parent,content:'  Tack för informationen.  '},async(query,options={})=>{
  if(query.startsWith('profiles?')){assert.match(query,/approval_status=eq.approved/);return json([{id:affe}])}
  if(query.startsWith('open_chat_messages?')){assert.match(query,new RegExp(`sender_profile_id=eq.${affe}`));assert.match(query,/sender_role=eq.swimmer&.*deleted_at=is.null/);return json([{id:parent}])}
  assert.equal(query,'private_messages');assert.equal(options.method,'POST')
  const row=JSON.parse(options.body);writes.push(row);return json([{...row,id:'created',created_at:'now'}])
 })
 assert.equal(writes.length,1);assert.equal(writes[0].recipient_profile_id,affe);assert.equal(writes[0].reply_to_open_chat_id,parent);assert.equal(writes[0].content,'Tack för informationen.')
 assert.equal(result.replyToMessageId,parent)
})
test('wrong recipient, deleted parent and invalid fields cannot create replies',async()=>{
 let writes=0
 const read=async(query,options={})=>{
  if(options.method){writes++;return json([])}
  if(query.startsWith('profiles?'))return json([{id:other}])
  return json([])
 }
 await assert.rejects(saveLinkedPrivateReply({recipientId:other,replyToMessageId:parent,content:'Test'},read),{status:404})
 await assert.rejects(saveLinkedPrivateReply({recipientId:affe,replyToMessageId:'bad',content:'Test'},read),{status:400})
 await assert.rejects(saveLinkedPrivateReply({recipientId:affe,replyToMessageId:parent,content:' '},read),{status:400})
 assert.equal(writes,0)
})
test('missing migration reports unavailable instead of pretending there are no private replies',async()=>{
 const loaded=await loadPrivateChatReplies(messages,'swimmer',affe,async()=>json({code:'42703'},400))
 assert.match(loaded.warning,/101/)
 await assert.rejects(saveLinkedPrivateReply({recipientId:affe,replyToMessageId:parent,content:'Test'},async(query,options)=>options?.method?json({code:'PGRST204'},400):json([{id:affe}])),{status:503})
})
