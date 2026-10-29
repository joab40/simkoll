import { supabaseRequest } from './supabase.js'

export async function loadCommunityPreview(settings, templates, read = supabaseRequest) {
  const chat = settings.openChat || {}
  const [postsResult, pepResult, chatResult] = await Promise.all([
    read('community_posts?deleted_at=is.null&select=id,content,created_at&order=created_at.desc,id.desc&limit=2'),
    read('group_pep?or=(moderation_status.eq.approved,moderation_status.is.null)&select=id,sender_profile_id,template_key,content,created_at,moderation_status&order=created_at.desc,id.desc&limit=2'),
    chat.enabled === true ? read('open_chat_messages?deleted_at=is.null&sender_role=eq.coach&visibility=neq.coaches&select=id,content,created_at,sender_role&order=created_at.desc,id.desc&limit=2') : Promise.resolve({ ok: true, json: async () => [] }),
  ])
  if (![postsResult, pepResult, chatResult].every((result) => result.ok)) throw new Error('Community preview lookup failed')
  const [posts, pep, messages] = await Promise.all([postsResult.json(), pepResult.json(), chatResult.json()])
  const ids = [...new Set(pep.map((row) => row.sender_profile_id).filter(Boolean))]
  const profilesResult = ids.length ? await read(`profiles?id=in.(${ids.join(',')})&active=eq.true&select=id,display_name,emoji`) : null
  if (profilesResult && !profilesResult.ok) throw new Error('Preview senders lookup failed')
  const profiles = new Map((profilesResult ? await profilesResult.json() : []).map((row) => [row.id, { id: row.id, displayName: row.display_name, emoji: row.emoji }]))
  const items = [
    ...posts.map((row) => ({ id: row.id, type: 'coach', content: row.content, createdAt: row.created_at })),
    ...pep.filter((row) => (!row.moderation_status || row.moderation_status === 'approved') && profiles.has(row.sender_profile_id)).map((row) => ({ id: row.id, type: 'group', content: row.content || templates[row.template_key], createdAt: row.created_at, sender: profiles.get(row.sender_profile_id) })),
  ].filter((row) => row.content).sort((a,b) => b.createdAt.localeCompare(a.createdAt)).slice(0,2)
  return {
    items,
    openChat: { enabled: chat.enabled === true, coachOnly: chat.coachOnly === true, backgroundImage: chat.backgroundImage || '/assets/open-chat-bg.png', messages: messages.map((row) => ({ id: row.id, content: row.content, createdAt: row.created_at, senderRole: 'coach', sender: { displayName: 'Tränare', emoji: '🧑‍🏫' } })).reverse() },
  }
}

export async function loadCoachMessageCount(since, chatEnabled, read = supabaseRequest) {
  const filter = since ? `&created_at=gt.${encodeURIComponent(new Date(since).toISOString())}` : ''
  const [privateResult, chatResult] = await Promise.all([
    read(`private_messages?recipient_role=eq.coach&sender_role=eq.swimmer${filter}&select=id&limit=1`, { headers: { Prefer: 'count=exact' } }),
    chatEnabled ? read(`open_chat_messages?deleted_at=is.null&sender_role=eq.swimmer${filter}&select=id&limit=1`, { headers: { Prefer: 'count=exact' } }) : Promise.resolve({ ok: true, json: async () => [] }),
  ])
  if (!privateResult.ok || !chatResult.ok) throw new Error('Coach message count failed')
  const count = async (result) => {
    const total = result.headers?.get('content-range')?.split('/')[1]
    return total && total !== '*' ? Number(total) : (await result.json()).length
  }
  return { count: await count(privateResult) + await count(chatResult) }
}
