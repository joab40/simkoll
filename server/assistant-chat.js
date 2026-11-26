import { featureFaqFor, featureFaqGuide } from '../shared/feature-faq.js'

export const normalizeAssistantText = text => text.toLocaleLowerCase('sv-SE').normalize('NFD').replace(/\p{M}/gu, '')
const words = text => normalizeAssistantText(text).match(/[a-z0-9]{3,}/g) || []
const commonWords = new Set('vad var vart vilka vilken vilket vem det den som kan jag man hur att med till och for finns fungerar hittar betyder mina ditt min mitt ska fran'.split(' '))

export function assistantQuestionTopic(question, history) {
  const recentQuestion = history.findLast(item => item.role === 'user')?.content || ''
  const followUp = /^(?:och |men |aven |hur ar det med |vad sags om |nar da|var da|hur da|vilken tid|vilka da|(?:imorgon|igar|idag) da|(?:forra|senaste|sista|den har) (?:veck|manad|ar)\w*|pa \d{2,4}\s*(?:m\b|frisim|fri|rygg))/.test(normalizeAssistantText(question))
  return followUp && recentQuestion ? `${recentQuestion}\n${question}` : question
}

export function assistantChatSources(role, topic) {
  const text = normalizeAssistantText(topic)
  const helpQuestion = /(?:^|[.!?]\s*|\boch\s+)(?:varfor (?:saknas|star)|hur (?:gor|kan|ska|skapar|funkar|fungerar|satter|staller|andrar|byter|ser|lagger|valjer|registrerar|checkar|oppnar|doljer|visar)|var(?:t)? (?:ser|hittar|andrar|kan|klickar|finns|ligger)|vad (?:betyder|skillnaden))\b/.test(text)
  const live = !helpQuestion || /\b(?:idag|igar|imorgon|senaste|just nu|den(?:na)? (?:har )?veckan)\b/.test(text)
  const swimmer = role === 'swimmer'
  const entries = swimmer && (live || /\b(?:jag (?:valt|anmalde|skickade)|jag har skickat)\b/.test(text)) && /\b(?:gren\w*|anmal\w*|inskick\w*|utkast)\b/.test(text)
  const competitionCalendar = live && /\b(?:tavling\w*|tavlar|masterskap\w*|usm)\b/.test(text)
    && (!entries || /\b(?:oppen|oppna|kommande|nasta)\b/.test(text))
  const goals = swimmer && live && /\b(?:simmal\w*|traningsmal\w*|utvecklingsmal\w*|veckomal\w*|malen|(?:min[ae]?|mitt|eget|egna) mal)\b/.test(text)

  const personal = /\b(?:mina?|mitt|egna?|jag|mig)\b/.test(text)
  const notes = swimmer && live && /\b(?:reflektion\w*|dagboksanteckning\w*|(?:mina|senaste|egna) (?:kommentar\w*|anteckning\w*)|vad (?:jag skrev|skrev jag))\b/.test(text)
  const historicalCount = /\b(?:forra|(?:senaste|sista) (?:\d+|en|ett|tva|tre|fyra|sex|tolv)|i ar|i fjol|januari|februari|mars|april|maj|juni|juli|augusti|september|oktober|november|december|(?:19|20)\d{2})\b/.test(text)
    && /\b(?:pass\w*|simmat|tranat)\b/.test(text)
  const diary = swimmer && live && (notes || historicalCount || /\b(?:traningsdagbok\w*|dagbok\w*|traningsstatistik\w*|traningsmangd\w*|simmeter\w*|simvolym\w*|rpe|passets kansla|kroppskansla\w*|dagskansla\w*|fartkansla\w*|passbetyg\w*|upplaggsbetyg\w*|srpe|traningshistorik\w*|traningsminuter\w*)\b/i.test(text)
    || (personal && /\b(?:statistik|traningsutveckling\w*|formutveckling\w*|energi|motivation|hur (?:langt|mycket)|hur manga (?:meter|minuter)|hur .*utvecklats|hur kandes|meter simmade|minuter tranade)\b/.test(text)))
  const practiceTimes = swimmer && live && /\b(?:testlopp\w*|traningstid\w*|mina tider|egna tider|egna simtider|sparade simtider|mina simtider|min senaste simtid)\b/.test(text)
  const training = goals || (swimmer && live && !diary && !practiceTimes && /\b(?:veckosammanfattning|hur manga|antal|genomfort\w*|deltagit|tranat|simmat|gjort)\b/.test(text))
  const schedule = live && /\b(?:kalender\w*|planer\w*|sportadmin|kommande|nasta|(?:sim|klubb|morgon|eftermiddags|kvalls|tranings|styrke|landtranings)?pass(?:et|en)?|traning\w*|samling)\b/.test(text)
    && (!(training || diary || practiceTimes) || /\b(?:kalender\w*|planer\w*|sportadmin|kommande|nasta|imorgon|samling)\b/.test(text))
  const results = swimmer && live && /\b(?:resultat\w*|tempus|personbast\w*|pb|pers|rekord\w*|basta tid\w*|simmat snabbast|tavlingstid\w*|mina (?:sim)?tider|nar tavlade jag|simmade jag pa|snabbaste tid\w*|aqua(?:poang)?)\b/.test(text)
  const talks = swimmer && live && /\b(?:utvecklingssamtal\w*|overenskommelse\w*|samtals\w*)\b/.test(text)
  const messages = live && /\b(?:meddelande\w*|tranarinfo\w*|info(?:rmation)? fran tranar\w*|besked|(?:skrivit|sagt|skickat) tranar\w*|tranar\w* (?:skriv\w*|sa|sagt|skick\w*))\b/.test(text)
  const competition = competitionCalendar && (!results || /\b(?:oppen|oppna|kommande|nasta)\b/.test(text))
  return { schedule, competition, entries, goals, training, results: results && (!practiceTimes || /\b(?:tempus|pb|pers|personbast\w*|tavling\w*|resultat\w*|mina (?:sim)?tider)\b/.test(text)), practiceTimes, diary, notes, talks, messages }
}

export function swimmerAssistantView(profile, settings) {
  return {
    trainingGroup: profile.training_group || null,
    flightRecord: profile.flight_record_offer_id ? profile.flight_record_choice ?? null : 'not_offered',
    features: settings ? {
      veckoplanering: settings.swimmer?.planning === true,
      traningsstjarnor: settings.swimmer?.stars !== false,
      appfeedback: settings.swimmer?.appFeedback !== false,
      infoFranTranarna: settings.openChat?.enabled === true,
    } : null,
  }
}

const faqByRole = Object.fromEntries(['swimmer', 'coach'].map(role => [
  role,
  featureFaqFor(role).map(entry => ({
    entry,
    titleWords: words(entry.question),
    answerWords: words(entry.answer.join(' ')),
  })),
]))

export function assistantChatFaq(role, topic) {
  const terms = [...new Set(words(topic).filter(word => !commonWords.has(word)))]
  const ranked = faqByRole[role].map(({ entry, titleWords, answerWords }) => {
    const score = terms.reduce((total, word) => {
      const matches = vocabulary => vocabulary.includes(word) || (word.length >= 5 && vocabulary.some(candidate => candidate.startsWith(word) || (candidate.length >= 5 && word.startsWith(candidate))))
      return total + (matches(titleWords) ? 4 : matches(answerWords) ? 1 : 0)
    }, 0)
    return { entry, score: score * (role === 'coach' && entry.roles?.includes('coach') ? 1.25 : 1) }
  })
  const entries = ranked.filter(item => item.score > 0).sort((a, b) => b.score - a.score).slice(0, 5).map(item => item.entry)
  return featureFaqGuide(role, entries)
}

export const assistantChatDefaultModel = 'gpt-6-luna'

export function assistantChatRequest(model, messages) {
  const effort = /^gpt-6(?:[.-]|$)|^gpt-5\.[1-9]\d*(?:-(?!pro(?:-|$))|$)/.test(model) ? 'none' : undefined
  return {
    model,
    store: false,
    max_completion_tokens: 500,
    ...(effort ? { reasoning_effort: effort } : {}),
    messages,
    response_format: { type: 'json_object' },
  }
}
