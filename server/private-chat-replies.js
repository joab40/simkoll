import { supabaseRequest } from './supabase.js'
const isId = (value) => typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value)
const fail = (message,status) => Object.assign(new Error(message),{status})

export async function saveLinkedPrivateReply(body, read = supabaseRequest) {
  const { recipientId, replyToMessageId } = body
  const content = String(body.content || '').trim()
  if (!isId(recipientId) || !isId(replyToMessageId) || !content || content.length > 1000) throw fail('Välj meddelande och skriv ett privat svar på högst 1000 tecken.',400)
  const recipient = await read(`profiles?id=eq.${recipientId}&active=eq.true&approval_status=eq.approved&select=id&limit=1`)
  if (!recipient.ok || !(await recipient.json()).length) throw fail('Simmaren kunde inte hittas.',404)
  const parent = await read(`open_chat_messages?id=eq.${replyToMessageId}&sender_role=eq.swimmer&sender_profile_id=eq.${recipientId}&deleted_at=is.null&select=id&limit=1`)
  if (!parent.ok || !(await parent.json()).length) throw fail('Ursprungsmeddelandet finns inte eller tillhör en annan simmare.',404)
  const result = await read('private_messages', {method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({sender_role:'coach',recipient_profile_id:recipientId,recipient_role:'swimmer',content,reply_to_open_chat_id:replyToMessageId})})
  if (!result.ok) {
    const detail = await result.json().catch(() => ({}))
    if (['PGRST204','42703'].includes(detail.code)) throw fail('Privata svar behöver databasuppdatering 101. Inget svar har skickats.',503)
    throw fail('Det privata svaret kunde inte sparas. Försök igen.',502)
  }
  const [row] = await result.json()
  return {id:row.id,content:row.content,createdAt:row.created_at,recipientId:row.recipient_profile_id,replyToMessageId:row.reply_to_open_chat_id}
}

export function attachPrivateReplies(messages, rows, role, profileId) {
  return messages.map((message) => ({...message, privateReplies:rows.filter((row) =>
    row.reply_to_open_chat_id === message.id && row.recipient_profile_id === message.senderProfileId && row.sender_role === 'coach' && row.recipient_role === 'swimmer' &&
    (role === 'coach' || (role === 'swimmer' && profileId && row.recipient_profile_id === profileId))
  ).map((row) => ({id:row.id,content:row.content,createdAt:row.created_at,recipientId:row.recipient_profile_id,replyToMessageId:row.reply_to_open_chat_id}))}))
}

export async function loadPrivateChatReplies(messages,role,profileId,read = supabaseRequest) {
  const ids = messages.filter((message) => message.senderRole === 'swimmer' && isId(message.id) && (role === 'coach' || (role === 'swimmer' && message.senderProfileId === profileId))).map((message) => message.id)
  if (!ids.length) return {messages:attachPrivateReplies(messages,[],role,profileId),warning:''}
  try {
    const rows = []
    for (let offset=0;offset<6000;offset+=500) {
      const result = await read(`private_messages?reply_to_open_chat_id=in.(${ids.join(',')})&sender_role=eq.coach&recipient_role=eq.swimmer${role === 'coach' ? '' : `&recipient_profile_id=eq.${profileId}`}&select=id,content,created_at,recipient_profile_id,recipient_role,sender_role,reply_to_open_chat_id&order=created_at.asc,id.asc&limit=500&offset=${offset}`)
      if (!result.ok) throw new Error('unavailable')
      const page = await result.json(); rows.push(...page)
      if (page.length < 500) return {messages:attachPrivateReplies(messages,rows,role,profileId),warning:''}
    }
    throw new Error('too-many')
  } catch {
    return {messages:attachPrivateReplies(messages,[],role,profileId),warning:'Privata svar kunde inte hämtas. Uppdatera sidan. Om funktionen är ny behöver administratören köra databasuppdatering 101.'}
  }
}
