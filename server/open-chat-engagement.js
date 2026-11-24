import { supabaseRequest } from './supabase.js'

const OPEN_CHAT_VIEW_BATCH = 40
const isMessageId = value => typeof value === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value)

export function parseOpenChatEngagement(body) {
  const isLike = body.action === 'set-open-chat-like'
  if (isLike && (typeof body.liked !== 'boolean' || !isMessageId(body.messageId))) return null
  const ids = isLike ? [body.messageId] : body.messageIds
  if (!Array.isArray(ids) || !ids.length || ids.length > OPEN_CHAT_VIEW_BATCH || !ids.every(isMessageId)) return null
  return { ids: [...new Set(ids.map(id => id.toLowerCase()))], liked: isLike ? body.liked : null }
}

export function isPublicCoachMessage(row) {
  return row.sender_role === 'coach' && row.visibility === 'group' && !row.deleted_at && isMessageId(row.id)
}

const presentTotals = rows => rows.map(row => ({
  messageId: row.message_id,
  seenCount: row.seen_count,
  likeCount: row.like_count,
  seen: row.seen === true,
  liked: row.liked === true,
}))

async function openChatRpc(read, name, body) {
  const result = await read(`rpc/${name}`, { method: 'POST', body: JSON.stringify(body) })
  if (!result.ok) throw new Error(`Open chat engagement unavailable (${result.status})`)
  return result.json()
}

export async function loadOpenChatEngagement(rows, profileId, read = supabaseRequest, { coach = false } = {}) {
  const ids = rows.filter(isPublicCoachMessage).map(row => row.id)
  if (!ids.length) return new Map()
  if (coach) {
    try {
      const totals = await openChatRpc(read, 'open_chat_coach_read_totals', { p_message_ids: ids })
      return new Map(totals.map(row => [row.message_id, {
        seenCount: row.seen_count,
        recipientCount: row.recipient_count,
        likeCount: row.like_count,
      }]))
    } catch {
      // Preserve the existing counts while the read receipt migration is unavailable.
    }
  }
  try {
    const totals = presentTotals(await openChatRpc(read, 'open_chat_engagement_totals', { p_message_ids: ids, p_profile_id: profileId || null }))
    return new Map(totals.map(({ messageId, ...counts }) => [messageId, counts]))
  } catch {
    // A missing migration or a transient stats error must not hide trainer messages.
    return new Map()
  }
}

export async function saveOpenChatEngagement(profileId, { ids, liked }, read = supabaseRequest) {
  return presentTotals(await openChatRpc(read, 'save_open_chat_engagement', { p_message_ids: ids, p_profile_id: profileId, p_liked: liked }))
}

export async function loadOpenChatReadDetails(messageId, read = supabaseRequest) {
  if (!isMessageId(messageId)) return null
  const [row] = await openChatRpc(read, 'open_chat_coach_read_details', { p_message_id: messageId })
  if (!row) return null
  return { seenCount: row.seen_count, recipientCount: row.recipient_count, unseen: row.unseen }
}
