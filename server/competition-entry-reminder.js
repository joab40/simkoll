import { competitionEntryRoster, isSubmittedCompetitionEntry } from '../shared/competition-entry-status.js'
import { competitionScope, competitionUuid } from './competition-participation.js'
import { supabaseRequest } from './supabase.js'
import { storeTrainerMessage } from './trainer-private-threads.js'

const failure = (status, error) => ({ status, error })

export async function sendCompetitionEntryReminder({ competitionId, profileId, requestId }, read = supabaseRequest) {
  if (![competitionId, profileId, requestId].every(value => typeof value === 'string' && competitionUuid.test(value))) {
    return failure(400, 'Välj en giltig tävling och simmare.')
  }
  const [calendarResult, profileResult] = await Promise.all([
    read(`competition_calendar?id=eq.${competitionId}&select=id,title,entries_open,${competitionScope}&limit=1`),
    read(`profiles?id=eq.${profileId}&active=eq.true&approval_status=eq.approved&is_test_profile=eq.false&select=id,training_group,active,approval_status,is_test_profile&limit=1`),
  ])
  if (!calendarResult.ok || !profileResult.ok) return failure(503, 'Tävlingen eller simmaren kunde inte kontrolleras. Försök igen.')
  const [[competition], profiles] = await Promise.all([calendarResult.json(), profileResult.json()])
  if (competition?.id !== competitionId) return failure(404, 'Tävlingen finns inte längre.')
  if (!competitionEntryRoster(profiles, competition.target_groups, competition.participant_overrides).some(profile => profile.id === profileId)) {
    return failure(409, 'Simmaren hör inte längre till tävlingens anmälningslista. Uppdatera översikten.')
  }

  const entries = await read(`competition_entries?competition_id=eq.${competitionId}&profile_id=eq.${profileId}&status=in.(submitted,approved)&select=status&limit=1`)
  if (!entries.ok) return failure(503, 'Simmarens grenval kunde inte kontrolleras. Försök igen.')
  if ((await entries.json()).some(isSubmittedCompetitionEntry)) return failure(409, 'Simmaren har redan skickat in sina grenval. Uppdatera översikten.')

  const nextStep = competition.entries_open
    ? 'Öppna Tävlingsanmälningar i Simkoll och skicka in dina grenval.'
    : 'Grenanmälan är stängd just nu. Svara här om du vill lämna dina grenval eller behöver hjälp.'
  const title = String(competition.title || 'tävlingen').slice(0, 250)
  const content = `Hej! Vi saknar dina grenval till ${title}. ${nextStep}`
  try {
    return await storeTrainerMessage({
      id: requestId, sender_role: 'coach', recipient_role: 'swimmer', recipient_profile_id: profileId, content,
    }, read)
  } catch (error) {
    return failure(error.status || 502, error.status ? error.message : 'Påminnelsen kunde inte skickas. Försök igen.')
  }
}
