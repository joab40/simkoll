import { randomInt } from 'node:crypto'
import { awardPoints, getSessionProfile, stockholmDate } from './profile-auth.js'
import { isAiEnabled, sendJson } from './supabase.js'

const dailyPoints = 5
const pointWords = String.raw`(?:poang(?:en)?|bonus(?:en)?|(?:bonus|extra) ?(?:poang(?:en)?|p)|\d+ ?p|(?:fem|nagra|lite|mer|fler) p)`
const pointMention = new RegExp(`\\b${pointWords}\\b`)
const requestEnding = '(?: (?:tack|snalla|pls|i dag|idag|nu|genast|bums|pa direkten|da|eller))*$'
const shortRequest = new RegExp(String.raw`^(?:(?:hej|ugglan|simkoll|snalla|jaha|jo tjena|ah vad generost|dagens|min|mina|en|nagra|lite|mer|fler|fem|\d+) )*(?:${pointWords}|extra)${requestEnding}`)
const extraAtEnd = new RegExp(String.raw`\bextra${requestEnding}`)
const givingVerb = '(?:ge|fixa|ordna|skicka|bjuda pa|bjussa pa|dela ut|lagga till|slanga in|kasta hit)'
const giveCommand = new RegExp(String.raw`^(?:(?:hej|ugglan|simkoll|snalla|jaha) )*${givingVerb}\b`)
const requestPhrases = [
  /\bfar (?:jag|man|vi)\b/,
  /\b(?:kan|kunde|skulle) (?:jag|man|vi)(?: (?:kunna|kanske|garna|mojligen|ocksa))* fa\b/,
  /\b(?:jag|vi) (?:vill|behover|onskar|skulle vilja)(?: garna)? (?:fa|ha)\b/,
  /\b(?:jag (?:ber om|kraver)|gar det att fa|finns det|har du|vad sags om|det vore (?:kul|fint|snallt) med)\b/,
  giveCommand,
  new RegExp(String.raw`\b(?:kan|kunde|skulle|vill) du(?: (?:kunna|vilja|kanske|mojligen|vara snall och))* ${givingVerb}\b`),
  new RegExp(String.raw`\b${givingVerb} (?:mig|mej|oss)\b`),
]
const aboutPoints = /\b(?:hur (?:manga|mycket|far|fick|kan|funkar|fungerar|tjanar|samlar)|varfor|vad (?:ar|betyder|ger)|nar (?:far|delas)|vilka (?:satt|regler)|fa veta|beratta om|for att (?:simma|trana|checka|logga)|genom att)\b/
const decliningPoints = /\b(?:(?:vill|ska) inte ha|ge (?:mig|mej|oss) (?:inte|inga))\b/
const normalize = text => text.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

function asksForBonus(text) {
  if (aboutPoints.test(text) || decliningPoints.test(text)) return false
  if (shortRequest.test(text)) return true
  const target = pointMention.test(text) || extraAtEnd.test(text)
  return target && requestPhrases.some(phrase => phrase.test(text))
}

function bonusTone(question) {
  if (typeof question !== 'string' || !question.split(/[.!?]+/).some(part => asksForBonus(normalize(part)))) return null
  const text = normalize(question)
  if (/\b(?:jaha|jo tjena|ah vad generost)\b|\beller(?: tack)?$/.test(text)) return 'dry'
  if (giveCommand.test(text) || /\b(?:jag vill ha|jag kraver|nu|genast|bums|pa direkten)\b/.test(text)) return 'bold'
  if (/\b(?:snalla|tack|pls)\b/.test(text)) return 'polite'
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
