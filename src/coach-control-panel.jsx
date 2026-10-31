import React, { useEffect, useMemo, useState } from 'react'
import { buildCoachControlPanel } from '../shared/coach-control-panel.js'
import './coach-control-panel.css'
import CoachWeek from './coach-week.jsx'
import CoachFollowUpReason from './coach-followup-reason.jsx'
import { coachWeekAddDays, coachWeekMonday } from '../shared/coach-week.js'
import { sleepDuration } from './daily-sleep.jsx'

const fmt = (value) => value == null ? '–' : Number(value).toLocaleString('sv-SE')
const dayLabel = (value) => new Date(`${value}T12:00:00Z`).toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm', day: 'numeric', month: 'short' })

export default function CoachControlPanel({ profiles, asOf, code, request, onOpenSwimmer, onMessage, renderWeekOverview, includeAnonymous = false }) {
  const [weekStart, setWeekStart] = useState(() => coachWeekMonday(asOf)), [refresh, setRefresh] = useState(0)
  const weekEnd = coachWeekAddDays(weekStart, 6), future = weekStart > asOf
  const observedEnd = future ? weekEnd : [weekEnd, asOf].sort()[0]
  const loadKey = code + ':' + weekStart + ':' + observedEnd + ':' + refresh
  const [loaded, setLoaded] = useState(null)
  useEffect(() => {
    let active = true
    if (future) { setLoaded({ key: loadKey, responses: [], records: [] }); return () => { active = false } }
    Promise.allSettled([
      request('/api/responses?coachWeek=' + weekStart, code),
      request('/api/responses?sleep=true&start=' + coachWeekAddDays(weekStart, -7) + '&end=' + observedEnd, code),
    ]).then(([answers, sleep]) => {
      if (active) setLoaded({ key: loadKey,
        responses: answers.status === 'fulfilled' ? answers.value.responses || [] : [],
        error: answers.status === 'rejected' ? answers.reason.message : '',
        records: sleep.status === 'fulfilled' ? sleep.value.records || [] : [],
        sleepError: sleep.status === 'rejected' ? sleep.reason.message : '',
      })
    })
    return () => { active = false }
  }, [code, weekStart, observedEnd, loadKey, future, request])
  const loading = loaded?.key !== loadKey, error = !loading && loaded.error
  const sleepRecords = loading ? [] : loaded.records, sleepError = !loading && loaded.sleepError
  const sleepLoading = loading
  const responses = loading ? [] : loaded.responses
  const report = useMemo(() => buildCoachControlPanel(profiles, responses, observedEnd, sleepRecords, { periodStart: weekStart }), [profiles, responses, observedEnd, sleepRecords, weekStart])
  const ids = new Set(profiles.filter((profile) => !profile.isTestProfile).map((profile) => profile.id))
  const weekResponses = responses.filter((row) => {
    const date = String(row.activityDate || row.createdAt || '').slice(0, 10)
    return date >= weekStart && date <= observedEnd && (row.profileId ? ids.has(row.profileId) : includeAnonymous)
  })
  const periodLabel = dayLabel(weekStart) + '–' + dayLabel(weekEnd)
  return <section className="coach-control-panel">
    <div className="period-heading"><div><p className="eyebrow">Tränarens kontrollpanel</p><h1>Gruppen i korthet</h1><small>{periodLabel} · {report.profileCount} simmare i valda grupper</small></div></div>
    <nav className="coach-panel-week-navigation" aria-label="Vecka för hela kontrollpanelen">
      <button type="button" className="secondary-button" aria-label="Föregående vecka" onClick={() => setWeekStart(coachWeekAddDays(weekStart, -7))}>←</button>
      <strong aria-live="polite">{periodLabel}</strong>
      <button type="button" className="secondary-button" aria-label="Nästa vecka" onClick={() => setWeekStart(coachWeekAddDays(weekStart, 7))}>→</button>
      <button type="button" className="secondary-button" aria-pressed={weekStart === coachWeekMonday(asOf)} onClick={() => setWeekStart(coachWeekMonday(asOf))}>Denna vecka</button>
      <button type="button" className="secondary-button" aria-pressed={weekStart === coachWeekAddDays(coachWeekMonday(asOf), -7)} onClick={() => setWeekStart(coachWeekAddDays(coachWeekMonday(asOf), -7))}>Förra veckan</button>
      <button type="button" className="text-button" disabled={loading} onClick={() => setRefresh((value) => value + 1)}>Uppdatera</button>
    </nav>
    <CoachWeek profiles={profiles} asOf={asOf} code={code} request={request} onOpenSwimmer={onOpenSwimmer} weekStart={weekStart} refreshKey={refresh} />
    <p className="coach-panel-intro">Översikten följer den valda veckan; pågående vecka visar svar till och med idag. Träningspassen räknas från simmarnas efterrapporter; närvaro utan efterrapport syns i veckomatrisen men ingår inte i dessa rapportkort. Individuell uppföljning tittar sju dagar bakåt från periodens sista registrerbara dag, så signaler inte försvinner vid ett veckoskifte.</p>
    {future && <p role="status">Kommande vecka: planeringen visas ovan. Det finns ännu inga genomförda pass att sammanställa.</p>}
    {loading ? <p role="status">Hämtar veckans incheckningar och uppföljning…</p> : error ? <p className="form-error" role="alert">Veckounderlaget kunde inte hämtas: {error}. Försök med Uppdatera.</p> : <div key={weekStart} className="coach-panel-week-results">
    <div className="coach-panel-metrics">
      <article><small>Rapporterade träningspass</small><strong>{report.completedPasses}</strong><span>{report.feedbackCount} av passen har kommentar eller betyg på passet eller upplägget.</span></article>
      <article><small>Upplevd ansträngning</small><strong>{report.averageRpe == null ? '–' : `${fmt(report.averageRpe)}/10`}</strong><span>Genomsnitt från {report.rpeAnswers} efterrapporter. RPE är simmarens upplevda ansträngning på skalan 0–10.</span></article>
      <article><small>Beräknad träningsbelastning</small><strong>{fmt(report.load)}</strong><span>{report.load == null ? 'Inga pass med både ansträngning och träningstid.' : `Belastningspoäng från ${report.loadAnswers} av ${report.completedPasses} rapporterade pass.`}</span><details><summary>Hur räknas det?</summary><p>För varje pass multipliceras upplevd ansträngning (RPE 0–10) med rapporterade minuter. Ett pass på 60 minuter med RPE 5 ger 300 belastningspoäng. Kortet visar summan för gruppen under perioden. Pass som saknar någon av uppgifterna ingår inte.</p></details></article>
    </div>
    <div className="coach-panel-metrics coach-panel-wellbeing">
      <article><small>Rapporterad sjukdom</small><strong>{report.sickSwimmers} <em>simmare</em></strong><span>{report.sickDays} rapporterade sjukdagar under perioden. Varje simmare räknas en gång per dag.</span>{report.sickSwimmers > 0 && <details><summary>Visa vilka</summary><ul className="coach-panel-metric-list">{report.swimmers.filter((item) => item.sickDays > 0).map((item) => <li key={item.profileId}><button type="button" className="text-button" onClick={() => onOpenSwimmer(item.profileId)}>{item.emoji} {item.displayName}</button><span>{item.sickDays} {item.sickDays === 1 ? 'dag' : 'dagar'}</span></li>)}</ul></details>}</article>
      <article><small>Sömnkoll</small><strong className="coach-panel-sleep-value">{sleepLoading || sleepError || report.sleep.averageMinutes == null ? '–' : sleepDuration(report.sleep.averageMinutes)}</strong>{sleepLoading ? <span role="status">Hämtar sömnsvar…</span> : sleepError ? <p className="form-error" role="status">Sömnunderlaget kunde inte hämtas: {sleepError}</p> : <><span>{report.sleep.nights ? `Genomsnittlig sovtid · ${report.sleep.nights} nätter från ${report.sleep.swimmers} simmare.` : 'Inga sömnsvar under perioden.'}</span>{report.sleep.nights > 0 && <><span>{report.sleep.poorNights} nätter med rapporterad dålig sömn.</span><details><summary>Visa per simmare</summary><ul className="coach-panel-metric-list">{report.swimmers.filter((item) => item.sleep.nights > 0).map((item) => <li key={item.profileId}><button type="button" className="text-button" onClick={() => onOpenSwimmer(item.profileId)}>{item.emoji} {item.displayName}</button><span>{sleepDuration(item.sleep.averageMinutes)} i snitt · {item.sleep.nights} nätter · {item.sleep.poorNights} med dålig sömn</span></li>)}</ul></details></>}</>}</article>
    </div>
    <details className="coach-panel-followups"><summary><span><span className="eyebrow">Individuell uppföljning</span><span className="coach-panel-followup-title">Ta en dialog</span></span><span className="coach-panel-dialog-count"><strong>{sleepError ? 'Minst ' : ''}{report.followUps.length}</strong><small>simmare</small></span><span className="coach-panel-chevron" aria-hidden="true">⌄</span></summary>
      <p className="coach-panel-intro">Signaler {dayLabel(report.signalStart)}–{dayLabel(report.end)}. Öppna simmarkortet för underlaget.</p>
      {sleepError && <p className="form-error" role="status">Sömnunderlaget saknas. Antalet kan därför vara ofullständigt.</p>}
      {report.followUps.length ? <div className="coach-panel-followup-list">{report.followUps.map((item) => <article key={item.profileId}><span className="coach-panel-avatar" aria-hidden="true">{item.emoji}</span><div><strong>{item.displayName}</strong><ul>{item.reasons.map((reason) => <CoachFollowUpReason key={reason} reason={reason} warning={item.sleepWarning?.label === reason ? item.sleepWarning.level : undefined} periodLabel={`${dayLabel(report.signalStart)}–${dayLabel(report.end)}`} />)}</ul><small>{item.completed} rapporterade pass · RPE {fmt(item.rpe)}/10</small></div><div className="coach-panel-actions"><button type="button" className="secondary-button" onClick={() => onOpenSwimmer(item.profileId)}>Visa simmare</button><button type="button" className="text-button" onClick={() => onMessage(item.profileId)}>Skriv privat →</button></div></article>)}</div> : <p className="empty">Inga upprepade signaler i den angivna sjudagarsperiodens profilsvar. Det betyder inte att alla har svarat eller att ingen behöver stöd.</p>}
      <small className="coach-panel-method">Listan bygger på återkommande signaler under den angivna sjudagarsperioden: minst två dagar med låg känsla, låg kroppskänsla, hög RPE eller sjukfrånvaro, minst två nätter med dålig sömn eller minst tre rapporterade nätter med i snitt under sju timmars sömn. Även de senaste tre rapporterade nätterna med högst sju timmar (gul/orange signal) eller minst fem sådana nätter under veckan (röd signal) lyfts, även om veckosnittet är högre. Färgerna är uppföljningsregler, inte rekommenderade sömnmål eller medicinska gränsvärden. I simmarkortet markeras även minst tre missade planerade pass. En ensam skattning och utebliven incheckning ger ingen automatisk markering. Läs underlaget och fråga simmaren innan du ändrar träningen.</small>
    </details>
    <details className="coach-panel-roster"><summary>Visa hela gruppens översikt ({report.swimmers.length})</summary><div className="coach-panel-table-wrap"><table><thead><tr><th>Simmare</th><th>Pass</th><th>RPE</th><th>Återkoppling</th><th>Fartkänsla</th><th></th></tr></thead><tbody>{report.swimmers.map((item) => <tr key={item.profileId}><th>{item.emoji} {item.displayName}</th><td>{item.completed}</td><td>{fmt(item.rpe)}</td><td>{item.feedback}</td><td>{item.speedCurrent != null && item.speedPrevious != null ? `${fmt(item.speedPrevious)} → ${fmt(item.speedCurrent)}` : 'För lite data'}</td><td><button type="button" className="text-button" onClick={() => onOpenSwimmer(item.profileId)}>Öppna</button></td></tr>)}</tbody></table></div><small>Fartkänsla jämför den valda veckan med föregående kalendervecka och kräver minst två svar i vardera veckan. Det är självskattning, inte ett tävlingsresultat.</small></details>
    {renderWeekOverview && !future && <section className="coach-panel-week-overview">{renderWeekOverview({ responses: weekResponses, periodLabel, weekStart })}</section>}
    </div>}
  </section>
}
