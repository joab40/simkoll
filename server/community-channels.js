import { supabaseRequest } from './supabase.js'
import { loadCoachQuestionPreviews, loadPrivateChatReplies } from './private-chat-replies.js'
import { loadOpenChatEngagement } from './open-chat-engagement.js'
import { presentTrainerMessage, trainerMessageColumns } from './trainer-private-threads.js'
import { summarizePrivateThreads } from '../src/private-thread-preview.js'

const emptyChat = settings => ({ enabled: settings.openChat?.enabled === true, coachOnly: settings.openChat?.coachOnly === true, swimmerPrivate: settings.openChat?.swimmerPrivate !== false, backgroundImage: settings.openChat?.backgroundImage || '/assets/open-chat-bg.png', messages: [] })

async function loadDirectCoachPreviews(read) {
  const result = await read(`private_messages?reply_to_open_chat_id=is.null&or=(and(sender_role.eq.coach,recipient_role.eq.swimmer),and(sender_role.eq.swimmer,recipient_role.eq.coach))&select=${trainerMessageColumns}&order=created_at.desc,id.desc&limit=200`)
  if (!result.ok) throw new Error('Private coach messages unavailable')
  const rows = (await result.json()).filter(row => !row.reply_to_open_chat_id)
  return [...summarizePrivateThreads(rows.map(presentTrainerMessage)).values()]
}
const displayProfile = row => ({ id: row.id, displayName: row.display_name, emoji: row.emoji })

export async function loadInfoChannel(settings, role, viewer, read = supabaseRequest) {
  const profileId = viewer?.id
  if (role !== 'coach' && (role !== 'swimmer' || !/^[0-9a-f-]{36}$/i.test(profileId || ''))) throw new Error('An authenticated channel reader is required')
  const chat = emptyChat(settings)
  if (!chat.enabled) return { openChat: chat }

  const directPreviews = role === 'coach'
    ? loadDirectCoachPreviews(read).then(threads => ({ threads }), () => ({ threads: [], failed: true }))
    : Promise.resolve({ threads: [] })
  const result = await read(`open_chat_messages?deleted_at=is.null${role === 'coach' ? '' : `&or=(visibility.neq.coaches,sender_profile_id.eq.${profileId})`}&select=id,sender_role,sender_profile_id,content,visibility,created_at&order=created_at.desc&limit=300`)
  if (!result.ok) throw new Error('Information channel unavailable')
  const visibleRows = (await result.json())
    .filter(row => !row.deleted_at && (role === 'coach' || row.visibility !== 'coaches' || row.sender_profile_id === profileId))
  const messages = visibleRows.map(row => ({ id: row.id, content: row.content, createdAt: row.created_at, senderRole: row.sender_role, senderProfileId: row.sender_profile_id || null }))
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))

  const otherSenders = [...new Set(messages.map(row => row.senderProfileId).filter(id => id && id !== profileId))]
  const loadSenders = async () => {
    const { threads } = await directPreviews
    const ids = [...new Set([...otherSenders, ...threads.map(thread => thread.latest.thread.id)])]
    if (!ids.length) return []
    const senderFilter = ids.length <= 100 ? `&id=in.(${ids.join(',')})` : ''
    const directory = await read(`profiles?select=id,display_name,emoji&active=eq.true${senderFilter}`)
    if (!directory.ok) throw new Error('Information channel profiles unavailable')
    return directory.json()
  }
  const [senders, threaded, engagement] = await Promise.all([
    loadSenders(),
    role === 'coach' ? loadCoachQuestionPreviews(messages, read) : loadPrivateChatReplies(messages, role, profileId, read),
    loadOpenChatEngagement(visibleRows, profileId, read, { coach: role === 'coach' }),
  ])
  const profiles = new Map(senders.map(row => [row.id, displayProfile(row)]))
  if (viewer) profiles.set(profileId, displayProfile(viewer))

  const { threads, failed } = await directPreviews
  const direct = role === 'coach' ? {
    privateThreads: threads.filter(thread => profiles.has(thread.latest.thread.id)).map(thread => ({
      ...thread, swimmer: profiles.get(thread.latest.thread.id),
    })),
    privateThreadsWarning: failed ? 'Privata direktmeddelanden kunde inte hämtas.' : '',
  } : {}
  return { openChat: { ...chat, ...direct, privateRepliesWarning: threaded.warning, messages: threaded.messages.map(message => ({
    ...message,
    ...(engagement.has(message.id) ? { engagement: engagement.get(message.id) } : {}),
    sender: message.senderProfileId ? profiles.get(message.senderProfileId) : { displayName: 'Tränare', emoji: '🧑‍🏫' },
  })).filter(message => message.sender) } }
}

export async function loadCoachInbox(read = supabaseRequest) {
  const [result, directory] = await Promise.all([
    read('private_messages?or=(recipient_role.eq.coach,sender_role.eq.coach)&select=id,content,created_at,sender_role,recipient_role,sender_profile_id,recipient_profile_id,read_at,reply_to_open_chat_id&order=created_at.desc,id.desc&limit=200'),
    read('profiles?select=id,display_name,emoji&active=eq.true'),
  ])
  if (!result.ok || !directory.ok) throw new Error('Coach inbox unavailable')
  const profiles = Object.fromEntries((await directory.json()).map(row => [row.id, { id: row.id, displayName: row.display_name, emoji: row.emoji }]))
  const messages = (await result.json()).filter(row => row.sender_role === 'coach' || row.recipient_role === 'coach').map(row => ({ id: row.id, content: row.content, createdAt: row.created_at, fromCoach: row.sender_role === 'coach', toCoach: row.recipient_role === 'coach', sender: profiles[row.sender_profile_id], recipient: profiles[row.recipient_profile_id], readAt: row.read_at, thread: row.reply_to_open_chat_id ? { kind: 'question', id: row.reply_to_open_chat_id } : { kind: 'direct', id: row.sender_role === 'coach' ? row.recipient_profile_id : row.sender_profile_id } }))
  return { messages }
}
