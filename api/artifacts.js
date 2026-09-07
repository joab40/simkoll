import { getRole, sendJson, supabaseRequest } from '../server/supabase.js'
import { getSessionProfile } from '../server/profile-auth.js'

const mapArtifact = (item) => ({ id: item.id, key: item.artifact_key, name: item.name, emoji: item.emoji, description: item.description, awardedAt: item.created_at, source: item.source })

export default async function handler(request, response) {
  const role = getRole(String(request.headers['x-simkoll-code'] || ''))
  try {
    if (request.method === 'GET') {
      if (role === 'coach') {
        const [catalogResult, assignmentsResult] = await Promise.all([
          supabaseRequest('artifact_catalog?select=id,artifact_key,name,emoji,description&order=created_at.asc'),
          supabaseRequest('profile_artifacts?select=id,profile_id,artifact_id,source,created_at&order=created_at.desc&limit=10000'),
        ])
        if (!catalogResult.ok || !assignmentsResult.ok) throw new Error('Coach artifacts lookup failed')
        return sendJson(response, 200, { catalog: await catalogResult.json(), assignments: await assignmentsResult.json() })
      }
      const profile = await getSessionProfile(request)
      if (!profile) return sendJson(response, 403, { error: 'Logga in för att se dina artefakter.' })
      const result = await supabaseRequest(`profile_artifacts?profile_id=eq.${profile.id}&select=id,source,created_at,artifact_catalog(id,artifact_key,name,emoji,description)&order=created_at.desc`)
      if (!result.ok) throw new Error('Swimmer artifacts lookup failed')
      return sendJson(response, 200, { artifacts: (await result.json()).map((item) => mapArtifact({ ...item.artifact_catalog, ...item })) })
    }
    if (request.method !== 'POST' || role !== 'coach') return sendJson(response, 403, { error: 'Endast tränaren kan tilldela artefakter.' })
    const profileId = String(request.body?.profileId || ''), artifactKey = String(request.body?.artifactKey || '')
    if (!profileId || !artifactKey) return sendJson(response, 400, { error: 'Välj simmare och artefakt.' })
    const coach = await getSessionProfile(request)
    const [artifactResult, profileResult] = await Promise.all([
      supabaseRequest(`artifact_catalog?artifact_key=eq.${artifactKey}&select=id&limit=1`),
      supabaseRequest(`profiles?id=eq.${profileId}&active=eq.true&approval_status=eq.approved&select=id&limit=1`),
    ])
    const artifact = (await artifactResult.json())[0]
    if (!artifact || !(await profileResult.json()).length) return sendJson(response, 404, { error: 'Artefakten eller profilen kunde inte hittas.' })
    const result = await supabaseRequest('profile_artifacts?on_conflict=profile_id,artifact_id', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=representation' }, body: JSON.stringify({ profile_id: profileId, artifact_id: artifact.id, awarded_by: coach?.id || null, source: 'coach' }) })
    if (!result.ok) throw new Error(`Artifact grant failed: ${result.status} ${await result.text()}`)
    return sendJson(response, 201, { ok: true, alreadyAssigned: !(await result.json()).length })
  } catch (error) {
    console.error(error)
    return sendJson(response, 500, { error: 'Kunde inte hantera artefakten.' })
  }
}
