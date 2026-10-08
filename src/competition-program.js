export const PROGRAM_GENDERS = ['Dam', 'Herr', 'Mix', 'Alla']
export const PROGRAM_STROKES = ['Frisim', 'Ryggsim', 'Bröstsim', 'Fjärilsim', 'Medley', 'Annat']

// Shared by the review screen and the publish endpoint. Never infer gender
// from a class letter (notably D), or invent missing event numbers.
export function normalizeProgram(draft = {}) {
  const trim = (value, max = 120) => String(value ?? '').trim().slice(0, max)
  return {
    sessions: Array.isArray(draft.sessions) ? draft.sessions.map((s) => ({ label: trim(s.label, 60), date: trim(s.date, 40), warmup: trim(s.warmup, 10), start: trim(s.start, 10), expectedNumbers: Array.isArray(s.expectedNumbers) ? s.expectedNumbers.map((n) => trim(n, 20)) : [] })) : [],
    warnings: Array.isArray(draft.warnings) ? draft.warnings.map((w) => trim(w, 400)) : [],
    events: Array.isArray(draft.events) ? draft.events.map((e, i) => ({
      eventOrder: i + 1, eventNumber: trim(e.eventNumber, 20), sessionLabel: trim(e.sessionLabel, 60),
      itemType: ['race', 'pause', 'award', 'info'].includes(e.itemType) ? e.itemType : 'race',
      entryAllowed: (e.itemType || 'race') === 'race', gender: ({ Damer: 'Dam', Herrar: 'Herr', Mixed: 'Mix', H: 'Herr' })[e.gender] || trim(e.gender, 20),
      ageClass: trim(e.ageClass, 60), distanceMeters: e.distanceMeters === null || e.distanceMeters === '' ? null : Number(e.distanceMeters),
      stroke: trim(e.stroke, 30), label: trim(e.label), source: trim(e.source, 300), uncertain: e.uncertain === true,
    })) : [],
  }
}

export function validateProgram(draft) {
  const issues = []
  const add = (message, row = null, severity = 'error') => issues.push({ message, row, severity })
  if (!draft.events.length || draft.events.length > 300) add('Programmet måste innehålla 1–300 rader. Dela större dokument i mindre delar.')
  const sessions = new Set(draft.sessions.map((s) => s.label))
  const identities = new Set()
  for (const [i, e] of draft.events.entries()) {
    const name = `Rad ${i + 1}${e.eventNumber ? ` (gren ${e.eventNumber})` : ''}`
    if (!e.label) add(`${name}: rubrik saknas.`, i)
    if (!sessions.has(e.sessionLabel)) add(`${name}: välj ett pass.`, i)
    if (!PROGRAM_GENDERS.includes(e.gender)) add(`${name}: kontrollera kön; klass D betyder inte Damer.`, i)
    if (!e.ageClass) add(`${name}: åldersklass saknas.`, i)
    if (e.itemType === 'race') {
      if (!Number.isInteger(e.distanceMeters) || e.distanceMeters <= 0 || e.distanceMeters > 100000) add(`${name}: kontrollera distansen.`, i)
      if (!PROGRAM_STROKES.includes(e.stroke) || e.stroke === 'Annat') add(`${name}: kontrollera simsättet.`, i)
      if (/\b(paus|insim|samling|prisutdelning)\b/i.test(e.label)) add(`${name}: en informationsrad har tolkats som gren.`, i)
      const key = JSON.stringify([e.sessionLabel, e.eventNumber || e.label, e.gender, e.ageClass])
      if (identities.has(key)) add(`${name}: samma gren/kön/klass förekommer flera gånger i passet.`, i)
      identities.add(key)
    } else if (e.eventNumber || e.distanceMeters !== null || e.stroke !== 'Annat') add(`${name}: information får inte ha grennummer, distans eller simsätt.`, i)
    if (e.uncertain) add(`${name}: AI är osäker. Jämför med originalet och markera raden som kontrollerad.`, i)
  }
  for (const session of draft.sessions) {
    if (!session.label) add('Ett pass saknar namn.')
    for (const field of ['warmup', 'start']) if (session[field] && !/^([01]\d|2[0-3]):[0-5]\d$/.test(session[field])) add(`${session.label}: tiden ska anges som HH:MM.`)
    const actual = draft.events.filter((e) => e.sessionLabel === session.label && e.itemType === 'race').map((e) => e.eventNumber)
    const missing = [...new Set(session.expectedNumbers.filter((n) => !actual.includes(n)))]
    const extra = [...new Set(actual.filter((n) => n && session.expectedNumbers.length && !session.expectedNumbers.includes(n)))]
    if (missing.length) add(`${session.label}: saknade grennummer jämfört med källans inventering: ${missing.join(', ')}.`)
    if (extra.length) add(`${session.label}: grennummer som inte fanns i inventeringen: ${extra.join(', ')}.`)
  }
  if (sessions.size !== draft.sessions.length) add('Passnamnen måste vara unika.')
  return issues
}
