import { supabaseRequest } from './supabase.js'
import { loadPrivateChatReplies } from './private-chat-replies.js'

const emptyChat = settings => ({ enabled: settings.openChat?.enabled === true, coachOnly: settings.openChat?.coachOnly === true, swimmerPrivate: settings.openChat?.swimmerPrivate !== false, backgroundImage: settings.openChat?.backgroundImage || '/assets/open-chat-bg.png', messages: [] })

// Read only the trainer-information channel. Do not wait for the public feed,
// reactions, private inbox or kudos to display this chat.
export async function loadInfoChannel(settings, role, profileId, read = supabaseRequest) {
  if (role !== 'coach' && (role !== 'swimmer' || !/^[0-9a-f-]{36}$/i.test(profileId || ''))) throw new Error('An authenticated channel reader is required')
  const chat = emptyChat(settings)
  if (!chat.enabled) return { openChat: chat }
  const [result, directory] = await Promise.all([
    read(`open_chat_messages?deleted_at=is.null${role === 'coach' ? '' : `&or=(visibility.neq.coaches,sender_profile_id.eq.${profileId})`}&select=id,sender_role,sender_profile_id,content,visibility,created_at&order=created_at.desc&limit=300`),
    read('profiles?select=id,display_name,emoji&active=eq.true'),
  ])
  if (!result.ok || !directory.ok) throw new Error('Information channel unavailable')
  const profiles = Object.fromEntries((await directory.json()).map(row => [row.id, { id: row.id, displayName: row.display_name, emoji: row.emoji }]))
  const messages = (await result.json())
    .filter(row => !row.deleted_at && (role === 'coach' || row.visibility !== 'coaches' || row.sender_profile_id === profileId))
    .map(row => ({ id: row.id, content: row.content, createdAt: row.created_at, senderRole: row.sender_role, senderProfileId: row.sender_profile_id || null, sender: row.sender_profile_id ? profiles[row.sender_profile_id] : { displayName: 'Tränare', emoji: '🧑‍🏫' } }))
    .filter(row => row.sender).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
  const threaded = await loadPrivateChatReplies(messages, role, profileId, read)
  return { openChat: { ...chat, messages: threaded.messages, privateRepliesWarning: threaded.warning } }
}

export async function loadCoachInbox(read = supabaseRequest) {
  const [result, directory] = await Promise.all([
    read('private_messages?or=(recipient_role.eq.coach,sender_role.eq.coach)&select=id,content,created_at,sender_role,recipient_role,sender_profile_id,recipient_profile_id,read_at&order=created_at.desc&limit=200'),
    read('profiles?select=id,display_name,emoji&active=eq.true'),
  ])
  if (!result.ok || !directory.ok) throw new Error('Coach inbox unavailable')
  const profiles = Object.fromEntries((await directory.json()).map(row => [row.id, { id: row.id, displayName: row.display_name, emoji: row.emoji }]))
  const messages = (await result.json()).filter(row => row.sender_role === 'coach' || row.recipient_role === 'coach').map(row => ({ id: row.id, content: row.content, createdAt: row.created_at, fromCoach: row.sender_role === 'coach', toCoach: row.recipient_role === 'coach', sender: profiles[row.sender_profile_id], recipient: profiles[row.recipient_profile_id], readAt: row.read_at }))
  return { messages }
}
