import { randomInt } from 'node:crypto'
import { awardPoints, getSessionProfile, stockholmDate } from './profile-auth.js'
import { isAiEnabled, sendJson } from './supabase.js'

const dailyPoints = 5
const bonusQuestion = new RegExp([
  '^(?:hej[,.!]? )?(?:(?<aside>jaha|jo tjena|åh vad generöst)[,.!]? )?(?:(?<please>snälla)[, ]+)?',
  '(?:(?:kan|kunde|skulle) jag (?:kunna )?få |(?:kan|kunde|skulle) du (?:kunna )?ge mig |får jag |(?<demand>ge mig|jag vill ha|jag kräver) )?',
  '(?:(?:[0-9]+|några|lite) )?(?:extra(?: ?poäng)?|bonuspoäng|fler poäng)',
  '(?:[, ]+(?<timing>i dag|idag|nu|genast|bums|på direkten))?(?: då)?(?: (?<tag>eller))?(?:[, ]+(?<thanks>tack))?[.!?]*$',
].join(''), 'iu')

function bonusTone(question) {
  if (typeof question !== 'string') return null
  const text = question.trim().replace(/\s+/g, ' ')
  const match = bonusQuestion.exec(text)
  if (!match) return null
  const { aside, demand, timing, tag, please, thanks } = match.groups
  if (aside || tag) return 'dry'
  if (demand || (timing && !/^i ?dag$/i.test(timing))) return 'bold'
  if (please || thanks) return 'polite'
  return 'neutral'
}

const bonusQuips = {
  neutral: {
    awarded: ['Du hittade ugglans gömma. 🦉', 'En femma ur ugglans badmössa. 🦉'],
    claimed: ['Badmössan är tom. Jag skakade den för säkerhets skull.', 'Ugglan har vänt på poängfickorna. Där låg bara lite klorludd.'],
  },
  polite: {
    awarded: ['Ugglan bugar. Badmössan satt kvar! 🦉'],
    claimed: ['Jag uppskattar ditt tack. Badmössan är fortfarande tom. 🦉'],
  },
  bold: {
    awarded: ['Oj, vilken tävlingsstart! Ugglan hann knappt blåsa i visselpipan.'],
    claimed: ['Visselpipan hördes. Poängtavlan står kvar. 🦉'],
  },
  dry: {
    awarded: ['Ugglans mycket formella bonuskommitté röstar ja. Den består av mig. 🦉'],
    claimed: ['Bonuskommittén tog en andra titt. Samma uggla, samma beslut. 🦉'],
  },
}

export function isAssistantBonusQuestion(question) {
  return bonusTone(question) !== null
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
  const quips = bonusQuips[bonusTone(request.body?.question) ?? 'neutral'][awarded ? 'awarded' : 'claimed']
  const result = awarded ? `Du fick +${dailyPoints} poäng!` : `Du har redan fått dagens ${dailyPoints} bonuspoäng.`
  return sendJson(response, 200, {
    assistantBonus: awarded ? dailyPoints : 0,
    text: `${result} ${quips[randomInt(quips.length)]}`,
  })
}
