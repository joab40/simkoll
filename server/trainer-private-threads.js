import { supabaseRequest } from './supabase.js'

const isId = value => typeof value === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value)
const fail = (message, status) => Object.assign(new Error(message), { status })
export const trainerMessageColumns = 'id,content,created_at,sender_role,recipient_role,sender_profile_id,recipient_profile_id,reply_to_open_chat_id'

export function trainerMessageSwimmerId(row) {
  if (row.sender_role === 'coach' && row.recipient_role === 'swimmer') return row.recipient_profile_id
  if (row.sender_role === 'swimmer' && row.recipient_role === 'coach') return row.sender_profile_id
  return null
}

export function presentTrainerMessage(row) {
  const id = row.reply_to_open_chat_id
  return {
    id: row.id, content: row.content, createdAt: row.created_at, senderRole: row.sender_role,
    thread: id ? { kind: 'question', id } : { kind: 'direct', id: trainerMessageSwimmerId(row) },
  }
}

export async function loadTrainerPrivateMessages(profileId, limit, read = supabaseRequest) {
  if (!isId(profileId)) return []
  const result = await read(`private_messages?recipient_profile_id=eq.${profileId}&recipient_role=eq.swimmer&sender_role=eq.coach&select=${trainerMessageColumns}&order=created_at.desc,id.desc&limit=${limit}`)
  if (!result.ok) throw fail('Privata meddelanden kunde inte hämtas.', 502)
  const rows = (await result.json()).filter(row => row.sender_role === 'coach' && trainerMessageSwimmerId(row) === profileId)
  const threads = new Map()
  for (const row of rows) {
    const message = presentTrainerMessage(row)
    const key = `${message.thread.kind}:${message.thread.id}`
    if (!threads.has(key)) threads.set(key, message)
  }
  return [...threads.values()]
}

async function threadContext(kind, id, role, profileId, read) {
  if (role !== 'coach' && (role !== 'swimmer' || !isId(profileId))) throw fail('Logga in för att öppna privata dialoger.', 403)
  if (!['question', 'direct'].includes(kind) || !isId(id)) throw fail('Välj en giltig dialog.', 400)
  if (kind === 'direct') {
    if (role === 'swimmer' && id !== profileId) throw fail('Dialogen kunde inte hittas.', 404)
    return { swimmerId: id, question: null }
  }
  const result = await read(`open_chat_messages?id=eq.${id}&sender_role=eq.swimmer${role === 'swimmer' ? `&sender_profile_id=eq.${profileId}` : ''}&select=id,sender_role,sender_profile_id,content,created_at,deleted_at&limit=1`)
  if (!result.ok) throw fail('Dialogen kunde inte hämtas.', 502)
  const [row] = await result.json()
  if (row?.id !== id || row.sender_role !== 'swimmer' || !isId(row.sender_profile_id) || (role === 'swimmer' && row.sender_profile_id !== profileId)) throw fail('Dialogen kunde inte hittas.', 404)
  return {
    swimmerId: row.sender_profile_id,
    question: row.deleted_at ? null : { id, content: row.content, createdAt: row.created_at, senderRole: 'swimmer' },
    deleted: Boolean(row.deleted_at),
  }
}

function scopedMessages(kind, id, swimmerId) {
  const link = kind === 'question' ? `eq.${id}` : 'is.null'
  return `private_messages?reply_to_open_chat_id=${link}&or=(and(sender_role.eq.coach,recipient_role.eq.swimmer,recipient_profile_id.eq.${swimmerId}),and(sender_role.eq.swimmer,recipient_role.eq.coach,sender_profile_id.eq.${swimmerId}))`
}

export async function loadTrainerThread({ kind, id, role, profileId }, read = supabaseRequest) {
  const context = await threadContext(kind, id, role, profileId, read)
  const result = await read(`${scopedMessages(kind, id, context.swimmerId)}&select=${trainerMessageColumns}&order=created_at.desc,id.desc&limit=150`)
  if (!result.ok) throw fail('Dialogen kunde inte hämtas.', 502)
  const messages = (await result.json()).filter(row => trainerMessageSwimmerId(row) === context.swimmerId
    && (kind === 'question' ? row.reply_to_open_chat_id === id : !row.reply_to_open_chat_id))
  return { question: context.question, messages: messages.reverse().map(presentTrainerMessage) }
}

export async function sendTrainerThreadMessage({ kind, id, role, profileId, content }, read = supabaseRequest) {
  const text = typeof content === 'string' ? content.trim() : ''
  if (!text || text.length > 1000) throw fail('Skriv ett meddelande på högst 1000 tecken.', 400)
  const context = await threadContext(kind, id, role, profileId, read)
  if (context.deleted || (kind === 'direct' && role === 'swimmer')) {
    const result = await read(`${scopedMessages(kind, id, context.swimmerId)}&select=id&limit=1`)
    if (!result.ok) throw fail('Dialogen kunde inte hämtas.', 502)
    if (!(await result.json()).length) throw fail('Dialogen kunde inte hittas.', 404)
  }
  if (role === 'coach') {
    const result = await read(`profiles?id=eq.${context.swimmerId}&active=eq.true&approval_status=eq.approved&select=id&limit=1`)
    if (!result.ok) throw fail('Mottagaren kunde inte kontrolleras.', 502)
    if (!(await result.json()).some(row => row.id === context.swimmerId)) throw fail('Simmaren kunde inte hittas.', 404)
  }
  const row = role === 'coach'
    ? { sender_role: 'coach', recipient_role: 'swimmer', recipient_profile_id: context.swimmerId }
    : { sender_role: 'swimmer', recipient_role: 'coach', sender_profile_id: context.swimmerId }
  const { message } = await storeTrainerMessage({ ...row, content: text, ...(kind === 'question' ? { reply_to_open_chat_id: id } : {}) }, read)
  return { message, recipientId: context.swimmerId }
}

export async function storeTrainerMessage(row, read = supabaseRequest) {
  const id = row.id
  const result = await read(id ? 'private_messages?on_conflict=id' : 'private_messages', {
    method: 'POST',
    headers: { Prefer: id ? 'resolution=ignore-duplicates,return=representation' : 'return=representation' },
    body: JSON.stringify(row),
  })
  if (!result.ok) throw fail('Meddelandet kunde inte skickas. Försök igen.', 502)
  const [saved] = await result.json()
  if (saved) return { message: presentTrainerMessage(saved), created: true }
  if (!id) throw fail('Meddelandet kunde inte bekräftas. Försök igen.', 502)
  const previous = await read(`private_messages?id=eq.${id}&select=${trainerMessageColumns}&limit=1`)
  if (!previous.ok) throw fail('Meddelandet kunde inte bekräftas. Försök igen.', 502)
  const [existing] = await previous.json()
  if (!existing || Object.entries(row).some(([key, value]) => existing[key] !== value) || existing.reply_to_open_chat_id) {
    throw fail('Påminnelsen kunde inte bekräftas. Uppdatera sidan.', 409)
  }
  return { message: presentTrainerMessage(existing), created: false }
}
