const weekdays = ['söndag', 'måndag', 'tisdag', 'onsdag', 'torsdag', 'fredag', 'lördag']
const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') && !Number.isNaN(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value
const dateWeekday = date => weekdays[new Date(`${date}T12:00:00Z`).getUTCDay()]
const weekdayOf = value => weekdays.find(day => String(value || '').toLocaleLowerCase('sv-SE').includes(day)) || ''
const clock = value => String(value || '').replace('.', ':')

export function bindCompetitionLayout(layout, events, { competition = null, sourcePage = null } = {}) {
  const warnings = [...(layout.warnings || [])], sessions = layout.sessions.map((session, index) => {
    const weekday = weekdayOf(session.weekday || session.sourceHeader || session.label)
    let date = session.date || ''
    if (!date && weekday && validDate(competition?.startDate) && validDate(competition?.endDate)) {
      const span = Math.round((Date.parse(competition.endDate) - Date.parse(competition.startDate)) / 86400000)
      if (span >= 0 && span <= 31) {
        const matches = Array.from({ length: span + 1 }, (_, day) => new Date(Date.parse(`${competition.startDate}T12:00:00Z`) + day * 86400000).toISOString().slice(0, 10)).filter(day => dateWeekday(day) === weekday)
        if (matches.length === 1) date = matches[0]
      }
    }
    if (weekday && !date) warnings.push(`${session.label}: ${weekday} kunde inte kopplas till ett entydigt datum. Kontrollera datumet.`)
    if (validDate(date) && weekday && dateWeekday(date) !== weekday) { warnings.push(`${session.label}: datumet stämmer inte med veckodagen i kolumnrubriken. Kontrollera datumet.`); date = '' }
    if (validDate(date) && validDate(competition?.startDate) && validDate(competition?.endDate) && (date < competition.startDate || date > competition.endDate)) throw new Error('Programmets datum ligger utanför vald tävling. Välj rätt bilaga eller PDF-sida innan du fortsätter.')
    const page = session.sourcePage ?? null
    if (page !== null && (!Number.isInteger(page) || page < 1)) throw new Error('Passets källsida är ogiltig. Välj rätt PDF-sida och försök igen.')
    if (sourcePage && page !== sourcePage) throw new Error('Analysen använde en annan sida än den valda PDF-sidan. Inget har sparats. Försök igen.')
    const duplicateLabel = layout.sessions.filter(other => other.label === session.label).length > 1
    return { ...session, id: session.id || `session-${index + 1}`, label: duplicateLabel && session.start ? `${session.label} ${clock(session.start)}` : session.label, date, weekday, sourcePage: page, sourceHeader: session.sourceHeader || '' }
  })
  if (new Set(sessions.map(session => session.id)).size !== sessions.length) throw new Error('Passens kolumnidentifierare blev inte unika. Välj en tydligare sida och försök igen.')
  const bound = events.map(event => {
    const number = String(event.eventNumber || '').trim()
    const numbered = event.itemType === 'race' || !event.itemType
    const owners = numbered && number ? sessions.filter(session => session.expectedNumbers?.includes(number)) : []
    const identified = event.sessionId ? sessions.find(session => session.id === event.sessionId) : sessions.find(session => session.label === event.sessionLabel)
    let chosen = identified, uncertain = event.uncertain === true
    // The independent inventory is authoritative only when one column owns
    // this visible number. Never assign contiguous number ranges or row order.
    if (owners.length === 1 && chosen !== owners[0]) {
      chosen = owners[0]; uncertain = true
      warnings.push(`Gren ${number}: passkopplingen rättades mot kolumnens nummerinventering. Kontrollera källraden.`)
    }
    if (!chosen || owners.length > 1 && !owners.includes(chosen)) { chosen = null; uncertain = true }
    if ((chosen && event.sourcePage != null && chosen.sourcePage != null && event.sourcePage !== chosen.sourcePage) || (sourcePage && event.sourcePage !== sourcePage)) {
      chosen = null; uncertain = true; warnings.push(`Gren ${number || event.label}: källsidan stämmer inte med passets kolumn. Välj rätt pass efter kontroll.`)
    }
    return { ...event, sessionLabel: chosen?.label || '', uncertain }
  })
  return { ...layout, sessions, events: bound, warnings: [...new Set(warnings)] }
}
