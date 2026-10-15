const commonSentenceStarts = new Set([
  'AI', 'Att', 'Arbeta', 'Bättre', 'Det', 'Du', 'Efter', 'Fokus', 'Fortsätt', 'Förbättra',
  'Första', 'Genom', 'Hon', 'Han', 'Inför', 'Jag', 'Jobba', 'Målet', 'Med', 'Nästa',
  'När', 'På', 'Simmaren', 'Skapa', 'Träna', 'Under', 'Utveckla', 'Vi', 'Vill', 'Öka', 'Öva',
])

const normalize = (value) => String(value || '').normalize('NFC').replace(/\s+/g, ' ').trim()

export function detectGoalPersonalData(value, knownName = '') {
  const text = normalize(value)
  if (!text) return null

  if (/\b[A-ZÅÄÖ0-9._%+-]+@[A-ZÅÄÖ0-9.-]+\.[A-ZÅÄÖ]{2,}\b/iu.test(text)) {
    return { type: 'email', message: 'Ta bort e-postadressen innan texten skickas till AI.' }
  }
  if (/\b(?:19|20)?\d{6}[-+]\d{4}\b/u.test(text)) {
    return { type: 'personal_identity_number', message: 'Ta bort personnumret innan texten skickas till AI.' }
  }

  const nameParts = normalize(knownName).split(' ').filter((part) => part.length > 1)
  if (nameParts.length >= 2) {
    const lowerText = text.toLocaleLowerCase('sv-SE')
    const fullName = nameParts.join(' ').toLocaleLowerCase('sv-SE')
    if (lowerText.includes(fullName)) return { type: 'full_name', match: nameParts.join(' '), message: 'Ersätt simmarens för- och efternamn med ”simmaren” innan texten skickas till AI.' }
  }

  const fullNamePattern = /\b(\p{Lu}[\p{Ll}\p{M}'’\-]{1,30})\s+(\p{Lu}[\p{Ll}\p{M}'’\-]{1,30})\b/gu
  for (const match of text.matchAll(fullNamePattern)) {
    if (!commonSentenceStarts.has(match[1])) return { type: 'full_name', match: match[0], message: `Texten ser ut att innehålla ett fullständigt namn (${match[0]}). Ersätt namnet med ”simmaren” innan texten skickas till AI.` }
  }
  return null
}
