export const TALK_STEPS = [
  ['🏊', 'Min träning', [['simPass', 'Önskat antal simpass/vecka'], ['styrka', 'Styrketräning/vecka'], ['land', 'Landträning/vecka'], ['prehab', 'Vad vill du göra för prehab/rörlighet?']]],
  ['🎯', 'Det jag vill utveckla', [['fokus', 'Vilka simsätt eller distanser vill du fokusera på?'], ['teknik', 'Vad vill du förbättra tekniskt?']]],
  ['⭐', 'Mina mål', [['kort', 'Mål på 6–12 månader'], ['lang', 'Mål på längre sikt'], ['egen', 'Vad kan du själv göra i träningen?']]],
  ['😴', 'Återhämtning', [['sovn', 'Hur fungerar sömn och återhämtning?'], ['vardag', 'Hur känns balansen mellan träning, skola och fritid?']]],
  ['🌍', 'Helheten', [['simningBra', 'Vad fungerar bra med simningen?'], ['simningBattre', 'Vad fungerar mindre bra eller kan utvecklas i simningen?'], ['gruppBra', 'Vad fungerar bra i gruppen?'], ['gruppBattre', 'Vad fungerar mindre bra eller kan utvecklas i gruppen?'], ['skolaBra', 'Vad fungerar bra med skolan?'], ['skolaBattre', 'Vad fungerar mindre bra eller kan utvecklas i skolan?'], ['hemmaBra', 'Vad fungerar bra hemma eller på fritiden?'], ['hemmaBattre', 'Vad fungerar mindre bra eller kan utvecklas hemma eller på fritiden?']]],
  ['🤝', 'Stöd', [['stod', 'Vad skulle hjälpa dig från tränarna eller gruppen?']]],
]
export const TALK_FIELD_LABELS = Object.fromEntries(TALK_STEPS.flatMap(([, , fields]) => fields))

// Both views follow the form definition, regardless of JSON key order or how
// many questions were answered. Keep historical fields separate, never drop them.
export function developmentTalkQuestions(answers = {}) {
  const sections = TALK_STEPS.map(([icon, title, fields]) => ({ icon, title,
    questions: fields.map(([key, label]) => {
      const value = String(answers[key] ?? '')
      return { key, label, value, answered: Boolean(value.trim()) }
    }),
  }))
  const legacy = Object.entries(answers).filter(([key]) => key !== '__step' && !Object.hasOwn(TALK_FIELD_LABELS, key))
    .map(([key, value]) => ({ key, label: key, value: String(value ?? '') }))
  return { sections, legacy }
}
