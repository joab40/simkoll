import { supabaseRequest } from './supabase.js'

// Read fresh on every question: deleted messages and disabled channels must
// not survive in the assistant's shared five-minute context cache.
export async function assistantCoachMessages(requestRows = supabaseRequest) {
  try {
    const settings = await requestRows('app_settings?setting_key=eq.webapp&select=setting_value&limit=1')
    if (!settings.ok) return { status: 'unavailable', messages: [] }
    const enabled = (await settings.json())[0]?.setting_value?.openChat?.enabled === true
    if (!enabled) return { status: 'disabled', messages: [] }
    const result = await requestRows('open_chat_messages?deleted_at=is.null&sender_role=eq.coach&visibility=eq.group&select=id,content,created_at&order=created_at.desc&limit=10')
    if (!result.ok) return { status: 'unavailable', messages: [] }
    return {
      status: 'available',
      messages: (await result.json()).map((item) => ({
        id: item.id,
        sentAt: item.created_at,
        content: String(item.content || '').slice(0, 1000),
        source: 'Info från tränarna',
      })),
    }
  } catch { return { status: 'unavailable', messages: [] } }
}
