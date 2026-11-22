import { awardPoints, getSessionProfile, stockholmDate } from './profile-auth.js'
import { isAiEnabled, sendJson } from './supabase.js'

const dailyPoints = 5
const bonusQuestion = /^(?:hej[,.!]? )?(?:(?:kan|kunde|skulle) jag (?:kunna )?få |(?:kan|kunde|skulle) du (?:kunna )?ge mig |får jag |ge mig |jag vill ha )?(?:(?:\d+|några|lite) )?(?:extra(?: ?poäng)?|bonuspoäng)(?: (?:i dag|idag))?(?:[, ]+tack)?[.!?]*$/iu

export function isAssistantBonusQuestion(question) {
  return typeof question === 'string' && bonusQuestion.test(question.trim().replace(/\s+/g, ' '))
}

export async function handleAssistantBonus(request, response) {
  response.setHeader('Cache-Control', 'private, no-store')
  const profile = await getSessionProfile(request)
  if (!profile) return sendJson(response, 403, { error: 'Logga in med din simmarprofil först.' })
  if (profile.assistant_enabled === false || !await isAiEnabled()) {
    return sendJson(response, 403, { error: 'Simkoll-assistenten är avstängd.' })
  }
  if (profile.is_test_profile) return sendJson(response, 200, { text: 'Dagens bonus delas ut på vanliga simmarprofiler.' })
  // One unique ledger entry per profile and Stockholm date, including parallel requests.
  let awarded
  try {
    awarded = await awardPoints(profile.id, 'assistant_daily_bonus', dailyPoints, stockholmDate(), { reportAward: true })
  } catch {
    return sendJson(response, 503, { error: 'Bonuspoängen kunde inte hämtas just nu. Försök igen.' })
  }
  return sendJson(response, 200, {
    assistantBonus: awarded ? dailyPoints : 0,
    text: awarded ? `Du fick +${dailyPoints} bonuspoäng! Nästa bonus finns imorgon.`
      : `Du har redan fått dagens ${dailyPoints} bonuspoäng. Nästa bonus finns imorgon.`,
  })
}
