import { supabaseRequest } from './supabase.js'
import { presentTrainerMessage, trainerMessageColumns, trainerMessageSwimmerId } from './trainer-private-threads.js'
import { privateThreadKey, summarizePrivateThreads } from '../src/private-thread-preview.js'
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

const unavailable = 'Privata svar kunde inte hämtas. Uppdatera sidan. Om funktionen är ny behöver administratören köra databasuppdatering 101.'

async function readLinkedMessages(ids, scope, columns, read) {
  const rows = []
  for (let offset = 0; offset < 6000; offset += 500) {
    const result = await read(`private_messages?reply_to_open_chat_id=in.(${ids.join(',')})${scope}&select=${columns}&order=created_at.asc,id.asc&limit=500&offset=${offset}`)
    if (!result.ok) throw new Error('Linked messages unavailable')
    const page = await result.json()
    rows.push(...page)
    if (page.length < 500) return rows
  }
  throw new Error('Too many linked messages')
}

export async function loadPrivateChatReplies(messages, role, profileId, read = supabaseRequest) {
  const ids = messages.filter(message => message.senderRole === 'swimmer' && isId(message.id)
    && (role === 'coach' || (role === 'swimmer' && message.senderProfileId === profileId))).map(message => message.id)
  const scope = `&sender_role=eq.coach&recipient_role=eq.swimmer${role === 'coach' ? '' : `&recipient_profile_id=eq.${profileId}`}`
  try {
    const rows = ids.length ? await readLinkedMessages(ids, scope, 'id,content,created_at,recipient_profile_id,recipient_role,sender_role,reply_to_open_chat_id', read) : []
    return { messages: attachPrivateReplies(messages, rows, role, profileId), warning: '' }
  } catch {
    return { messages: attachPrivateReplies(messages, [], role, profileId), warning: unavailable }
  }
}

export async function loadCoachQuestionPreviews(messages, read) {
  const owners = new Map(messages.filter(message => message.senderRole === 'swimmer'
    && isId(message.id) && isId(message.senderProfileId)).map(message => [message.id, message.senderProfileId]))
  if (!owners.size) return { messages, warning: '' }
  try {
    const rows = await readLinkedMessages([...owners.keys()],
      '&or=(and(sender_role.eq.coach,recipient_role.eq.swimmer),and(sender_role.eq.swimmer,recipient_role.eq.coach))',
      trainerMessageColumns, read)
    const previews = summarizePrivateThreads(rows.filter(row => owners.get(row.reply_to_open_chat_id) === trainerMessageSwimmerId(row))
      .map(presentTrainerMessage))
    return { warning: '', messages: messages.map(message => {
      const preview = previews.get(privateThreadKey({ kind: 'question', id: message.id }))
      return preview ? { ...message, privateThread: preview } : message
    }) }
  } catch {
    return { messages, warning: unavailable }
  }
}
