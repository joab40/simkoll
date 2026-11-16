import { supabaseRequest, sendJson } from './supabase.js'
import { coachFromRequest } from './coach-auth.js'
import { analyticsRows } from './analytics-rows.js'
import { artworkUrl, compatibleRewardArt } from './reward-art.js'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const validReference = value => value === null || (typeof value === 'string' && uuid.test(value))
const selection = row => ({ backgroundId: row.background_art_id ?? null, emblemId: row.emblem_art_id ?? null })
export async function handleRewardCardLibrary(request, response, { read = supabaseRequest } = {}) {
  const actor = coachFromRequest(request)
  if (!actor?.sub || !['head_coach', 'superadmin'].includes(actor.role)) return sendJson(response, 403, { error: 'Endast huvudtränare och superadmin kan använda nivåbiblioteket.' })
  if (!['GET', 'POST'].includes(request.method)) return sendJson(response, 405, { error: 'Metoden stöds inte.' })
  const body = request.body || {}, rawId = request.method === 'GET' ? request.query?.levelId : body.levelId
  const levelId = typeof rawId === 'string' && /^\d+$/.test(rawId) ? Number(rawId) : typeof rawId === 'number' ? rawId : NaN
  if (!Number.isSafeInteger(levelId) || levelId <= 0) return sendJson(response, 400, { error: 'Välj en giltig nivå.' })
  try {
    const result = await read(`reward_levels?id=eq.${levelId}&select=id,name,emoji,background_art_id,emblem_art_id&limit=1`)
    if (!result.ok) throw new Error('Level unavailable')
    const [level] = await result.json()
    if (!level) return sendJson(response, 404, { error: 'Nivån finns inte längre.' })
    if (request.method === 'GET') {
      const [assetResult, cardResult] = await Promise.all([
        analyticsRows(`reward_level_art?or=(kind.eq.background,level_id.eq.${levelId})&status=eq.ready&select=id,level_id,kind,style,source_emoji,storage_path,created_at&order=created_at.desc,id.desc`, read),
        analyticsRows(`reward_level_cards?level_id=eq.${levelId}&select=id,name,source_emoji,background_art_id,emblem_art_id,created_at&order=created_at.desc,id.desc`, read),
      ])
      if (!assetResult.ok || assetResult.truncated || !cardResult.ok || cardResult.truncated) throw new Error('Library incomplete')
      const assets = (await assetResult.json()).map(row => ({ id: row.id, kind: row.kind, style: row.style, emoji: row.source_emoji, createdAt: row.created_at, url: artworkUrl(row.storage_path), compatible: compatibleRewardArt(row, level) }))
      const compatibleIds = new Map(assets.filter(asset => asset.compatible).map(asset => [asset.id, asset.kind]))
      const cards = (await cardResult.json()).map(row => ({ id: row.id, name: row.name, emoji: row.source_emoji, createdAt: row.created_at, ...selection(row), compatible: row.source_emoji === level.emoji && (!row.background_art_id || compatibleIds.get(row.background_art_id) === 'background') && (!row.emblem_art_id || compatibleIds.get(row.emblem_art_id) === 'emblem') }))
      return sendJson(response, 200, { level: { id: level.id, name: level.name, emoji: level.emoji }, assets, cards, active: selection(level) })
    }
    if (!['save-level-card', 'publish-level-card'].includes(body.action)) return sendJson(response, 400, { error: 'Okänd biblioteksåtgärd.' })
    if (!validReference(body.backgroundId) || !validReference(body.emblemId) || typeof body.sourceEmoji !== 'string' || body.sourceEmoji !== level.emoji) return sendJson(response, 400, { error: 'Välj giltiga bilder för nivåns aktuella emoji. Hämta biblioteket igen om emojin har ändrats.' })
    const saving = body.action === 'save-level-card'
    if (saving && (typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > 60 || typeof body.cardId !== 'string' || !uuid.test(body.cardId))) return sendJson(response, 400, { error: 'Ange ett kortnamn på 1–60 tecken och en giltig sparreferens.' })
    if (!saving && (body.confirmed !== true || !validReference(body.expectedBackgroundId) || !validReference(body.expectedEmblemId))) return sendJson(response, 400, { error: 'Bekräfta aktiveringen från ett aktuellt bibliotek.' })
    const configured = await read('rpc/configure_reward_level_card', { method: 'POST', body: JSON.stringify({
      p_actor_id: actor.sub, p_session_version: actor.ver || 0, p_level_id: levelId, p_action: saving ? 'save' : 'activate', p_source_emoji: body.sourceEmoji,
      p_background_id: body.backgroundId, p_emblem_id: body.emblemId, p_name: saving ? body.name.trim() : null, p_card_id: saving ? body.cardId : null,
      p_expected_background_id: saving ? null : body.expectedBackgroundId, p_expected_emblem_id: saving ? null : body.expectedEmblemId,
    }) })
    if (!configured.ok) {
      const failure = await configured.json().catch(() => ({}))
      if (failure.code === '42501' || configured.status === 403) return sendJson(response, 403, { error: 'Tränarbehörigheten är inte längre giltig. Logga in igen.' })
      if (['22023', '40001'].includes(failure.code)) return sendJson(response, 409, { error: 'Nivån, bilderna eller den aktiva kombinationen har ändrats. Hämta biblioteket igen innan du sparar eller aktiverar.' })
      throw new Error('Configuration unavailable')
    }
    return sendJson(response, 200, { ...await configured.json(), message: saving ? 'Kortkombinationen är sparad. Simmarnas kort är oförändrade.' : 'Hela kortkombinationen är aktiverad för nivån. Inga poäng har ändrats.' })
  } catch {
    return sendJson(response, 503, { error: 'Biblioteket eller ändringen kunde inte bekräftas. Hämta biblioteket igen. Kontrollera att SQL 125 och 126 är körda.' })
  }
}
