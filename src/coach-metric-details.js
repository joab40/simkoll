import { checkinDay, compareCheckinsNewest } from './checkin-status.js'

export const COACH_RESPONSE_METRICS = {
  feeling: { title: 'Gruppens känsla', max: 5, afterOnly: false, labels: { 1: 'Tungt', 2: 'Segt', 3: 'Okej', 4: 'Bra', 5: 'Toppen' } },
  rpe: { title: 'Upplevd ansträngning', max: 10, afterOnly: true },
  pass: { title: 'Passet', max: 5, afterOnly: true, labels: { 1: 'Inte bra', 3: 'Helt okej', 5: 'Bra' } },
  setup: { title: 'Upplägget', max: 5, afterOnly: true, labels: { 1: 'Fungerade inte bra', 3: 'Fungerade okej', 5: 'Fungerade bra' } },
}

export function coachMetricDetails(metricKey, responses, profiles = []) {
  const activityType = metricKey.startsWith('activity:') ? metricKey.slice(9) : null
  const activityTitles = { before: 'Jag ska träna', race: 'Ska tävla idag', after: 'Jag har tränat', rest: 'Ingen träning idag', sick: 'Jag känner mig sjuk' }
  const metric = activityTitles[activityType] ? { title: activityTitles[activityType], activityType } : COACH_RESPONSE_METRICS[metricKey]
  if (!metric) return null
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]))
  const entries = responses.filter((item) => metric.activityType === 'race'
    ? item.type === 'before' && item.competition === true
    : metric.activityType === 'before'
      ? item.type === 'before' && item.competition !== true
      : metric.activityType
        ? item.type === metric.activityType
        : (!metric.afterOnly || item.type === 'after') && typeof item[metricKey] === 'number' && Number.isFinite(item[metricKey]) && item[metricKey] >= 1 && item[metricKey] <= metric.max)
    .slice().sort(compareCheckinsNewest).map((item) => ({
      response: item,
      value: item[metricKey],
      label: metric.labels?.[item[metricKey]] || '',
      day: checkinDay(item),
      profile: item.profileId ? profileById.get(item.profileId) || null : null,
      anonymous: !item.profileId,
    }))
  return {
    metric, entries,
    average: !metric.activityType && entries.length ? (entries.reduce((sum, item) => sum + item.value, 0) / entries.length).toFixed(1) : '–',
    profileCount: new Set(entries.filter((item) => item.profile).map((item) => item.profile.id)).size,
    anonymousCount: entries.filter((item) => item.anonymous).length,
  }
}
