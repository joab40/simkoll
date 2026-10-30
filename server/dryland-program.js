import { supabaseRequest } from './supabase.js'
import { stockholmDate } from './profile-auth.js'
import { drylandLogInput, mapDrylandLog } from '../shared/dryland-program.js'
import { coachFromRequest } from './coach-auth.js'

export async function authorizeDrylandCoach(request, manage = false, db = supabaseRequest) {
  const account = coachFromRequest(request)
  const roles = manage ? ['head_coach', 'superadmin'] : ['coach', 'head_coach', 'superadmin']
  if (!account || !/^[0-9a-f-]{36}$/i.test(account.sub || '') || !roles.includes(account.role)) throw Object.assign(new Error(manage ? 'Endast huvudtränare och superadmin kan skapa och redigera landträningsprogram.' : 'Logga in med ditt personliga tränarkonto.'), { status: 403 })
  const result = await db(`coach_accounts?id=eq.${account.sub}&status=eq.active&select=id,role&limit=1`)
  if (!result.ok) throw Object.assign(new Error('Tränarbehörigheten kunde inte kontrolleras.'), { status: 503 })
  const current = (await result.json())[0]
  if (!current || current.role !== account.role) throw Object.assign(new Error('Tränarkontot saknar aktuell behörighet.'), { status: 403 })
}

export async function saveDrylandLog(profileId, body, db = supabaseRequest) {
  if (!/^[0-9a-f-]{36}$/i.test(body.assignmentId || '')) throw Object.assign(new Error('Välj ditt landträningsprogram.'), { status: 400 })
  const result = await db(`program_assignments?id=eq.${body.assignmentId}&profile_id=eq.${profileId}&removed_at=is.null&select=id,training_programs(*)&limit=1`)
  if (!result.ok) throw Object.assign(new Error('Programmet kunde inte hämtas.'), { status: 502 })
  const assignment = (await result.json())[0], program = assignment?.training_programs
  if (program?.program_type !== 'dryland') throw Object.assign(new Error('Landträningsprogrammet är inte tilldelat din profil.'), { status: 403 })
  const input = drylandLogInput(program, body, stockholmDate())
  const saved = await db('rpc/save_dryland_program_log', { method: 'POST', body: JSON.stringify({ p_profile_id: profileId, p_assignment_id: assignment.id, p_pass_number: input.pass.passNumber, p_session_date: input.date, p_results: input.results, p_notes: input.notes, p_pass_title: input.pass.title, p_pass_content: input.pass.content, p_program_version: program.updated_at }) })
  if (!saved.ok) {
    const detail = await saved.text()
    if (/PGRST202|does not exist/.test(detail)) throw Object.assign(new Error('Landträningsloggen behöver SQL 111_dryland_program_logs.'), { status: 503 })
    if (/DRYLAND_PROGRAM_CHANGED|DRYLAND_ASSIGNMENT_UNAVAILABLE/.test(detail)) throw Object.assign(new Error('Programmet eller tilldelningen ändrades. Öppna programmet igen; ditt nya resultat har inte sparats.'), { status: 409 })
    throw Object.assign(new Error('Passet kunde inte sparas. Ditt utkast finns kvar.'), { status: 502 })
  }
  return mapDrylandLog(await saved.json())
}
