import { coachCategory, isCoachCard, isCoachCategory } from '../shared/coach-card-categories.js'
import { writeAuditLog } from './audit.js'
import { getRole, sendJson, supabaseRequest } from './supabase.js'

const CARD_PREFIX = 'coach_card_category.'
const CARD_EDIT_DENIED = 'Endast superadmin med kortvyn Exp kan ändra kortkategorier.'

export async function readCoachCardLayout(request, response, actor) {
  if (getRole(request.headers['x-simkoll-code']) !== 'coach') {
    return sendJson(response, 403, { error: 'Tränarsession saknas.' })
  }
  try {
    const [cardsResult, accountResult] = await Promise.all([
      supabaseRequest(`app_settings?setting_key=like.${CARD_PREFIX}*&select=setting_key,setting_value`),
      actor && supabaseRequest(`coach_accounts?id=eq.${encodeURIComponent(actor.sub)}&select=view_category&limit=1`),
    ])
    if (!cardsResult.ok || (actor && !accountResult.ok)) throw new Error('Coach card layout unavailable')
    const cards = Object.fromEntries((await cardsResult.json())
      .filter(row => row.setting_key.startsWith(CARD_PREFIX))
      .map(row => [row.setting_key.slice(CARD_PREFIX.length), row.setting_value])
      .filter(([cardId, category]) => isCoachCard(cardId) && isCoachCategory(category)))
    const account = actor ? (await accountResult.json())[0] : null
    return sendJson(response, 200, { cards, accountId: actor?.sub, category: coachCategory(account?.view_category) })
  } catch {
    return sendJson(response, 503, { error: 'Kortkategorierna kunde inte hämtas. Försök igen.' })
  }
}

export async function saveCoachCardCategory(request, response, actor) {
  if (actor?.role !== 'superadmin') {
    return sendJson(response, 403, { error: CARD_EDIT_DENIED })
  }
  try {
    const result = await supabaseRequest(`coach_accounts?id=eq.${encodeURIComponent(actor.sub)}&status=eq.active&role=eq.superadmin&select=view_category&limit=1`)
    if (!result.ok) throw new Error('Coach category lookup failed')
    const [account] = await result.json()
    if (account?.view_category !== 'exp') return sendJson(response, 403, { error: CARD_EDIT_DENIED })
  } catch {
    return sendJson(response, 503, { error: 'Din kortvy kunde inte kontrolleras. Försök igen.' })
  }
  const { cardId, category } = request.body
  if (!isCoachCard(cardId) || !isCoachCategory(category)) {
    return sendJson(response, 400, { error: 'Välj ett giltigt kort och en kategori.' })
  }
  const result = await supabaseRequest('app_settings?on_conflict=setting_key', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ setting_key: CARD_PREFIX + cardId, setting_value: category, updated_at: new Date().toISOString() }),
  })
  if (!result.ok) return sendJson(response, 503, { error: 'Kortets kategori kunde inte sparas. Försök igen.' })
  await writeAuditLog(request, { eventType: 'coach_card_category_change', role: 'coach', details: { actorName: actor.name, cardId, category } })
  return sendJson(response, 200, { cardId, category })
}

export async function saveCoachViewCategory(request, response, actor, accountId) {
  const { category } = request.body
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(accountId) || !isCoachCategory(category)) {
    return sendJson(response, 400, { error: 'Välj ett giltigt tränarkonto och en kategori.' })
  }
  const result = await supabaseRequest(`coach_accounts?id=eq.${encodeURIComponent(accountId)}&select=id,view_category`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ view_category: category }),
  })
  if (!result.ok) return sendJson(response, 503, { error: 'Tränarens visningskategori kunde inte sparas. Kontrollera att SQL 153 är körd.' })
  const [account] = await result.json()
  if (!account) return sendJson(response, 404, { error: 'Tränarkontot hittades inte.' })
  await writeAuditLog(request, { eventType: 'coach_view_category_change', role: 'coach', details: { actorName: actor.name, targetAccountId: accountId, category } })
  return sendJson(response, 200, { account, ownAccount: account.id === actor.sub })
}
