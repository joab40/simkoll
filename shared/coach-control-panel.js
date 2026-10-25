const dayBefore = (day, days) => new Date(Date.parse(`${day}T12:00:00Z`) - days * 86400000).toISOString().slice(0, 10)
const mean = (values) => values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length * 10) / 10 : null
const numeric = (value) => typeof value === 'number' && Number.isFinite(value) ? value : null
const activityDay = (row) => String(row.activityDate || row.createdAt || '').slice(0, 10)
const activityKey = (row) => `${activityDay(row)}:${row.activityType || 'unknown'}:${row.trainingSlot || 'day'}`
const uniqueDays = (rows, predicate) => new Set(rows.filter(predicate).map(activityDay)).size
export function sleepFollowUpReasons(rows) {
  const unique = [...new Map(rows.filter((row) => !row.skipped && numeric(row.minutes) !== null && row.minutes >= 0 && row.minutes <= 840 && [1, 3, 5].includes(row.quality)).map((row) => [row.activity_date, row])).values()]
  const reasons = []
  const poorNights = unique.filter((row) => row.quality === 1).length
  if (poorNights >= 2) reasons.push(`Dålig sömn rapporterad ${poorNights} nätter senaste veckan`)
  if (unique.length >= 3) {
    const averageMinutes = Math.round(unique.reduce((sum, row) => sum + row.minutes, 0) / unique.length)
    if (averageMinutes < 420) reasons.push(`Kort sovtid i snitt (${Math.floor(averageMinutes / 60)} h ${String(averageMinutes % 60).padStart(2, '0')} min) under ${unique.length} rapporterade nätter senaste veckan`)
  }
  return reasons
}
const sleepSummary = (rows) => ({
  nights: rows.length,
  swimmers: new Set(rows.map((row) => row.profile_id)).size,
  averageMinutes: rows.length ? Math.round(rows.reduce((sum, row) => sum + row.minutes, 0) / rows.length) : null,
  poorNights: rows.filter((row) => row.quality === 1).length,
})

export function buildCoachControlPanel(profiles, responses, asOf, sleepRecords = []) {
  const start = dayBefore(asOf, 13), recentStart = dayBefore(asOf, 6)
  const scopedIds = new Set(profiles.filter((profile) => !profile.isTestProfile).map((profile) => profile.id))
  const rows = responses.filter((row) => row.profileId && scopedIds.has(row.profileId) && activityDay(row) >= start && activityDay(row) <= asOf)
  const sleep = [...new Map(sleepRecords.filter((row) => scopedIds.has(row.profile_id) && row.activity_date >= start && row.activity_date <= asOf && !row.skipped && numeric(row.minutes) !== null && row.minutes >= 0 && row.minutes <= 840 && [1, 3, 5].includes(row.quality)).map((row) => [`${row.profile_id}:${row.activity_date}`, row])).values()]
  const after = rows.filter((row) => row.type === 'after' && row.competition !== true)
  const uniquePasses = new Map()
  after.slice().sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || ''))).forEach((row) => uniquePasses.set(`${row.profileId}:${activityKey(row)}`, row))
  const completed = [...uniquePasses.values()]
  const rpeValues = completed.map((row) => numeric(row.rpe)).filter((value) => value !== null)
  const knownLoads = completed.map((row) => {
    const rpe = numeric(row.rpe), minutes = numeric(row.activityMinutes)
    return rpe !== null && minutes !== null && minutes > 0 ? rpe * minutes : null
  }).filter((value) => value !== null)
  const swimmers = profiles.filter((profile) => scopedIds.has(profile.id)).map((profile) => {
    const own = rows.filter((row) => row.profileId === profile.id)
    const recent = own.filter((row) => activityDay(row) >= recentStart)
    const ownAfter = completed.filter((row) => row.profileId === profile.id)
    const currentAfter = ownAfter.filter((row) => activityDay(row) >= recentStart)
    const previousAfter = ownAfter.filter((row) => activityDay(row) < recentStart)
    const speedCurrent = currentAfter.map((row) => numeric(row.speedFeeling)).filter((value) => value !== null)
    const speedPrevious = previousAfter.map((row) => numeric(row.speedFeeling)).filter((value) => value !== null)
    const lowBodyDays = uniqueDays(recent, (row) => numeric(row.body) !== null && row.body <= 2)
    const lowFeelingDays = uniqueDays(recent, (row) => numeric(row.feeling) !== null && row.feeling <= 2)
    const highRpeDays = uniqueDays(recent, (row) => row.type === 'after' && numeric(row.rpe) !== null && row.rpe >= 8)
    const sickDays = uniqueDays(recent, (row) => row.type === 'sick')
    const reasons = []
    const ownSleep = sleep.filter((row) => row.profile_id === profile.id)
    const recentSleep = ownSleep.filter((row) => row.activity_date >= recentStart && row.activity_date <= asOf)
    reasons.push(...sleepFollowUpReasons(recentSleep))
    if (sickDays >= 2) reasons.push(`Sjukfrånvaro rapporterad ${sickDays} dagar senaste veckan`)
    if (lowBodyDays >= 2) reasons.push(`Låg kroppskänsla ${lowBodyDays} dagar senaste veckan`)
    if (lowFeelingDays >= 2) reasons.push(`Låg känsla ${lowFeelingDays} dagar senaste veckan`)
    if (highRpeDays >= 2) reasons.push(`Hög ansträngning (RPE 8–10) ${highRpeDays} dagar senaste veckan`)
    return {
      profileId: profile.id, displayName: profile.displayName, emoji: profile.emoji || '🏊',
      completed: completed.filter((row) => row.profileId === profile.id).length,
      rpe: mean(ownAfter.map((row) => numeric(row.rpe)).filter((value) => value !== null)),
      feedback: ownAfter.filter((row) => Boolean(row.comment?.trim()) || numeric(row.pass) !== null || numeric(row.setup) !== null).length,
      sickDays: uniqueDays(own, (row) => row.type === 'sick'),
      sleep: sleepSummary(ownSleep),
      speedCurrent: speedCurrent.length >= 2 ? mean(speedCurrent) : null,
      speedPrevious: speedPrevious.length >= 2 ? mean(speedPrevious) : null,
      reasons,
    }
  })
  return {
    start, end: asOf,
    profileCount: swimmers.length,
    completedPasses: completed.length,
    averageRpe: mean(rpeValues), rpeAnswers: rpeValues.length,
    feedbackCount: completed.filter((row) => Boolean(row.comment?.trim()) || numeric(row.pass) !== null || numeric(row.setup) !== null).length,
    load: knownLoads.length ? knownLoads.reduce((sum, value) => sum + value, 0) : null,
    loadAnswers: knownLoads.length,
    sickSwimmers: swimmers.filter((swimmer) => swimmer.sickDays > 0).length,
    sickDays: swimmers.reduce((sum, swimmer) => sum + swimmer.sickDays, 0),
    sleep: sleepSummary(sleep),
    followUps: swimmers.filter((swimmer) => swimmer.reasons.length).sort((a, b) => b.reasons.length - a.reasons.length || a.displayName.localeCompare(b.displayName, 'sv')),
    swimmers,
  }
}
