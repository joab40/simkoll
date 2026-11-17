import { getRole, sendJson, supabaseRequest } from './supabase.js'
import { coachFromRequest } from './coach-auth.js'
import { getSessionProfile } from './profile-auth.js'

const validId = value => typeof value === 'string' && /^[1-9]\d{0,17}$/.test(value)
const validRequest = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
export const isFeedbackDialogRequest = request => request.query?.feedbackDialog === 'true' || ['feedback-message', 'feedback-read'].includes(request.body?.action)

export async function handleFeedbackDialog(request, response) {
  const role = getRole(String(request.headers['x-simkoll-code'] || ''))
  let actor
  if (role === 'coach') {
    const coach = coachFromRequest(request)
    if (coach?.role !== 'superadmin') return sendJson(response,403,{error:'Endast superadmin kan läsa feedbackdialoger.'})
    actor = { p_coach_id:coach.sub,p_session_version:coach.ver ?? 0 }
  } else if (role === 'swimmer') {
    const profile = await getSessionProfile(request)
    if (!profile) return sendJson(response,403,{error:'Logga in på din profil för att läsa din feedbackdialog.'})
    actor = { p_profile_id:profile.id }
  } else return sendJson(response,403,{error:'Logga in för att öppna feedbackdialogen.'})
  let action, id, before, through, requestId, content
  if (request.method === 'GET') {
    action = request.query.count === 'true' ? 'count' : request.query.id ? 'thread' : request.query.unreadOnly === 'true' ? 'unread' : 'list'
    id = request.query.id; before = request.query.before
  } else if (request.method === 'POST') {
    action = request.body.action === 'feedback-message' ? 'send' : request.body.action === 'feedback-read' ? 'read' : null
    id = String(request.body.id || ''); through = request.body.throughId
    requestId = request.body.requestId; content = typeof request.body.content === 'string' ? request.body.content.trim() : ''
  } else return sendJson(response,405,{error:'Metoden stöds inte.'})
  if (!action || (id !== undefined && !validId(id)) || (before !== undefined && !validId(before)) ||
    (action === 'read' && !(through === '0' || validId(through))) ||
    (action === 'send' && (!validRequest(requestId) || !content || content.length>1000))) return sendJson(response,400,{error:'Kontrollera dialog, meddelande (1–1000 tecken) och försöks-ID.'})
  const params = { ...actor,p_action:action,...(id ? {p_feedback_id:id}:{}),...(before ? {p_before_id:before}:{}),
    ...(action==='read'?{p_through_id:through}:{}),...(action==='send'?{p_request_id:requestId,p_content:content}:{}) }
  const result = await supabaseRequest('rpc/app_feedback_dialog',{method:'POST',body:JSON.stringify(params)})
  if (!result.ok) {
    const error = await result.json().catch(()=>({}))
    const status = error.code==='42501'?403:error.code==='P0002'?404:error.code==='22023'?400:error.code==='P0001'?429:503
    return sendJson(response,status,{error:status===404?'Dialogen kunde inte hittas.':status===403?'Du har inte åtkomst till dialogen.':status===429?'Vänta en stund innan du skickar igen.':status===400?'Meddelandet eller försöks-ID:t kunde inte användas.':'Feedbackdialogen är inte tillgänglig. Kontrollera att SQL 130 är körd och försök igen.'})
  }
  return sendJson(response,200,await result.json())
}
