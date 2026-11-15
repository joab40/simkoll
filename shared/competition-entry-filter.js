// A user-selected display filter, not an eligibility decision. Never infer
// gender from class letters, or age from a swimmer's name/profile.
const clean = value => String(value || '').replace(/^(?:kön|klass)\s*:\s*/i, '').trim()
const universalAge = value => /^(?:alla(?: åldrar)?|öppen(?: klass)?|open)$/i.test(value)
const missing = value => !value || /^(?:ej angiven|klass ej angiven|saknas|okänd)(?:\b|\s|[–-])/i.test(value)
const genderOf = value => {
  const text = clean(value)
  return /^(dam|damer)$/i.test(text) ? 'Dam' : /^(herr|herrar)$/i.test(text) ? 'Herr' : /^(mix|mixed)$/i.test(text) ? 'Mix' : /^alla$/i.test(text) ? 'Alla' : null
}
const ageOf = value => {
  const text = clean(value)
  return missing(text) ? null : text.replace(/\s*[–—-]\s*/g, '–').replace(/\s+/g, ' ')
}
const race = event => event.selectable !== false && event.entryAllowed !== false && (!event.itemType || event.itemType === 'race')

export function competitionEntryFilterOptions(events) {
  const rows = events.filter(race)
  return {
    genders: ['Dam', 'Herr', 'Mix'].filter(value => rows.some(event => genderOf(event.gender) === value)),
    ageClasses: [...new Set(rows.map(event => ageOf(event.ageClass)).filter(value => value && !universalAge(value)))].sort((a, b) => a.localeCompare(b, 'sv', { numeric: true, sensitivity: 'base' })),
  }
}

export function competitionEntryFilterMatch(event, filter) {
  if (!filter.enabled || !race(event)) return { dimmed: false, unknown: false }
  const gender = genderOf(event.gender), ageClass = ageOf(event.ageClass)
  // Mixed and open races remain available to both women's and men's filters.
  const wrongGender = Boolean(filter.gender && gender && gender !== 'Alla' && gender !== 'Mix' && gender !== filter.gender)
    || Boolean(filter.gender === 'Mix' && gender && !['Mix', 'Alla'].includes(gender))
  const wrongAge = Boolean(filter.ageClass && ageClass && !universalAge(ageClass) && ageClass.toLocaleLowerCase('sv') !== ageOf(filter.ageClass)?.toLocaleLowerCase('sv'))
  return { dimmed: wrongGender || wrongAge, unknown: Boolean(filter.gender && !gender || filter.ageClass && !ageClass) }
}
