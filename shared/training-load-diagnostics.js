// Fixed explanations only: no comments, workout contents or other swimmers' data.
export const TRAINING_TIME_ISSUES = {
  'invalid-reported-time': 'Angiven tid är ogiltig. Kontrollera att den är mellan 1 och 1 440 minuter.',
  'activity-missing': 'Träningstyp saknas eller är okänd. Ingen simtid kopplas automatiskt.',
  'partial-time-missing': 'Delvis genomfört – egen tid saknas. Hela planerade tiden används inte.',
  'reported-time-missing': 'Egen tid saknas. För denna aktivitet hämtas ingen tid från ett simpass.',
  'slot-missing': 'Morgon-/eftermiddagspass saknas eller är okänt. Ingen säker passkoppling kan göras.',
  'choice-required': 'Passval saknas eller är oklart. Flera möjliga upplägg kan inte räknas som ett valt pass.',
  'selection-unavailable': 'Det sparade passvalet kan inte hittas bland tillgängliga upplägg. Kontrollera kopplingen i dagboken.',
  'group-mismatch': 'Passet matchar inte simmarens nuvarande grupp. Kontrollera grupptillhörighet och passets grupper.',
  'date-mismatch': 'Det sparade passvalet ligger på en annan dag än rapporten.',
  'slot-mismatch': 'Passets morgon-/eftermiddagstid matchar inte rapporten.',
  'detached-plan': 'Planeringen är markerad som bortkopplad. Den ger ingen uppskattad tid.',
  'no-plan': 'Inget kopplingsbart simpass hittas för rapportens dag, grupp och passval.',
  'planned-time-missing': 'Passet är kopplat, men planerad tid saknas. Lägg till tid i passet eller rapportera faktisk tid.',
  'invalid-planned-time': 'Passet är kopplat, men planerad tid är ogiltig. Kontrollera passets tidsåtgång.',
  'time-missing': 'Användbar tid saknas. Kontrollera egen tid och passkoppling i dagboken.',
}

export function trainingLoadGaps(row, amount) {
  const issues = []
  if (!amount.rpeKnown) issues.push('rpe-missing')
  if (amount.minutes == null) issues.push(Object.hasOwn(TRAINING_TIME_ISSUES, row.timeIssue) ? row.timeIssue : row.activityMinutes != null ? 'invalid-reported-time' : 'time-missing')
  if (!['swim', 'strength', 'dryland', 'cycling', 'other'].includes(row.activityType) && !issues.includes('activity-missing')) issues.push('activity-missing')
  return issues
}

export const trainingLoadIssueText = issue => issue === 'rpe-missing' ? 'RPE saknas eller är ogiltig. Den kan inte återskapas från planeringen.' : TRAINING_TIME_ISSUES[issue] || TRAINING_TIME_ISSUES['time-missing']

export function trainingLoadCoverage(load) {
  if (!load || !Number.isFinite(load.total)) return null
  // Round down so coverage below 80% is never displayed as meeting 80%.
  const percent = load.total ? Math.floor(load.known * 100 / load.total) : null
  const reasons = []
  if (load.known < 3) reasons.push('minst 3 rapporter med både RPE och tid behövs')
  if (load.days < 2) reasons.push('underlag från minst 2 olika dagar behövs')
  if (!load.total || load.known / load.total < .8) reasons.push('minst 80 % av rapporterna behöver både RPE och tid')
  return { percent, reasons }
}
