import { supabaseRequest } from './supabase.js'
import { loadPrivateChatReplies } from './private-chat-replies.js'
import { loadOpenChatEngagement } from './open-chat-engagement.js'

const emptyChat = settings => ({ enabled: settings.openChat?.enabled === true, coachOnly: settings.openChat?.coachOnly === true, swimmerPrivate: settings.openChat?.swimmerPrivate !== false, backgroundImage: settings.openChat?.backgroundImage || '/assets/open-chat-bg.png', messages: [] })

// Read only the trainer-information channel. Do not wait for the public feed,
// reactions, private inbox or kudos to display this chat.
const displayProfile = row => ({ id: row.id, displayName: row.display_name, emoji: row.emoji })

export async function loadInfoChannel(settings, role, viewer, read = supabaseRequest) {
  const profileId = viewer?.id
  if (role !== 'coach' && (role !== 'swimmer' || !/^[0-9a-f-]{36}$/i.test(profileId || ''))) throw new Error('An authenticated channel reader is required')
  const chat = emptyChat(settings)
  if (!chat.enabled) return { openChat: chat }

  const result = await read(`open_chat_messages?deleted_at=is.null${role === 'coach' ? '' : `&or=(visibility.neq.coaches,sender_profile_id.eq.${profileId})`}&select=id,sender_role,sender_profile_id,content,visibility,created_at&order=created_at.desc&limit=300`)
  if (!result.ok) throw new Error('Information channel unavailable')
  const visibleRows = (await result.json())
    .filter(row => !row.deleted_at && (role === 'coach' || row.visibility !== 'coaches' || row.sender_profile_id === profileId))
  const messages = visibleRows.map(row => ({ id: row.id, content: row.content, createdAt: row.created_at, senderRole: row.sender_role, senderProfileId: row.sender_profile_id || null }))
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))

  const otherSenders = [...new Set(messages.map(row => row.senderProfileId).filter(id => id && id !== profileId))]
  const loadSenders = async () => {
    if (!otherSenders.length) return []
    const senderFilter = otherSenders.length <= 100 ? `&id=in.(${otherSenders.join(',')})` : ''
    const directory = await read(`profiles?select=id,display_name,emoji&active=eq.true${senderFilter}`)
    if (!directory.ok) throw new Error('Information channel profiles unavailable')
    return directory.json()
  }
  const [senders, threaded, engagement] = await Promise.all([
    loadSenders(),
    loadPrivateChatReplies(messages, role, profileId, read),
    loadOpenChatEngagement(visibleRows, profileId, read),
  ])
  const profiles = new Map(senders.map(row => [row.id, displayProfile(row)]))
  if (viewer) profiles.set(profileId, displayProfile(viewer))

  return { openChat: { ...chat, privateRepliesWarning: threaded.warning, messages: threaded.messages.map(message => ({
    ...message,
    ...(engagement.has(message.id) ? { engagement: engagement.get(message.id) } : {}),
    sender: message.senderProfileId ? profiles.get(message.senderProfileId) : { displayName: 'Tränare', emoji: '🧑‍🏫' },
  })).filter(message => message.sender) } }
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
