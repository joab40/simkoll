import React, { useEffect, useMemo, useState } from 'react'
import { buildCoachControlPanel } from '../shared/coach-control-panel.js'
import './coach-control-panel.css'
import CoachWeek from './coach-week.jsx'
import CoachFollowUpReason from './coach-followup-reason.jsx'
import { coachWeekAddDays, coachWeekMonday } from '../shared/coach-week.js'
import { sleepDuration } from './daily-sleep.jsx'
import { FOLLOWUP_RULES } from '../shared/followup-signals.js'

const fmt = (value) => value == null ? '–' : Number(value).toLocaleString('sv-SE')
const dayLabel = (value) => new Date(`${value}T12:00:00Z`).toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm', day: 'numeric', month: 'short' })

function FollowupList({ items, report, onOpenSwimmer, onMessage }) {
  return <div className="coach-panel-followup-list">{items.map(item => <article key={item.profileId}><span className="coach-panel-avatar" aria-hidden="true">{item.emoji}</span><div><strong>{item.displayName}</strong><ul>{item.reasons.map(reason => <CoachFollowUpReason key={reason} reason={reason} warning={item.sleepWarning?.label === reason ? item.sleepWarning.level : undefined} periodLabel={`${dayLabel(report.signalStart)}–${dayLabel(report.end)}`} />)}</ul><small>{item.completed} rapporterade pass · RPE {fmt(item.rpe)}/10</small></div><div className="coach-panel-actions"><button type="button" className="secondary-button" onClick={() => onOpenSwimmer(item.profileId)}>Visa simmare</button><button type="button" className="text-button" onClick={() => onMessage(item.profileId)}>Skriv privat →</button></div></article>)}</div>
}

export default function CoachControlPanel({ profiles, asOf, code, request, onOpenSwimmer, onMessage, renderWeekOverview, includeAnonymous = false }) {
  const [weekStart, setWeekStart] = useState(() => coachWeekMonday(asOf)), [refresh, setRefresh] = useState(0)
  const weekEnd = coachWeekAddDays(weekStart, 6), future = weekStart > asOf
  const observedEnd = future ? weekEnd : [weekEnd, asOf].sort()[0]
  const loadKey = code + ':' + weekStart + ':' + observedEnd + ':' + refresh
  const [loaded, setLoaded] = useState(null)
  useEffect(() => {
    let active = true
    if (future) { setLoaded({ key: loadKey, responses: [], records: [], illness: [] }); return () => { active = false } }
    Promise.allSettled([
      request('/api/responses?coachWeek=' + weekStart, code),
      request('/api/responses?sleep=true&start=' + coachWeekAddDays(weekStart, -7) + '&end=' + observedEnd, code),
      request('/api/responses?illness=true&start=' + coachWeekAddDays(weekStart, -7) + '&end=' + observedEnd, code),
    ]).then(([answers, sleep, illness]) => {
      if (active) setLoaded({ key: loadKey,
        responses: answers.status === 'fulfilled' ? answers.value.responses || [] : [],
        error: answers.status === 'rejected' ? answers.reason.message : '',
        records: sleep.status === 'fulfilled' ? sleep.value.records || [] : [],
        sleepError: sleep.status === 'rejected' ? sleep.reason.message : '',
        illness: illness.status === 'fulfilled' ? illness.value.records || [] : [],
        illnessError: illness.status === 'rejected' ? illness.reason.message : illness.value.available === false ? illness.value.warning : '',
      })
    })
    return () => { active = false }
  }, [code, weekStart, observedEnd, loadKey, future, request])
  const loading = loaded?.key !== loadKey, error = !loading && loaded.error
  const sleepRecords = loading ? [] : loaded.records, sleepError = !loading && loaded.sleepError
  const sleepLoading = loading
  const responses = loading ? [] : loaded.responses
  const illnessRecords = loading ? [] : loaded.illness, illnessError = !loading && loaded.illnessError
  const report = useMemo(() => buildCoachControlPanel(profiles, responses, observedEnd, sleepRecords, { periodStart: weekStart, illnessRecords }), [profiles, responses, observedEnd, sleepRecords, weekStart, illnessRecords])
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
      <article><small>Rapporterad sjukdom</small><strong>{illnessError ? 'Minst ' : ''}{report.sickSwimmers} <em>simmare</em></strong><span>{report.sickDays} {report.sickDays === 1 ? 'dag' : 'dagar'} med Sjuk eller Jag känner mig sjuk under perioden. Varje simmare räknas en gång per dag, även om båda svaren finns.</span><span>Lite känningar rapporterade av {report.mildSwimmers} simmare, separat från sjukdagar.</span>{illnessError && <span>Sjukdomskollens underlag saknas; antalet är ofullständigt.</span>}{report.sickSwimmers > 0 && <details><summary>Visa vilka</summary><ul className="coach-panel-metric-list">{report.swimmers.filter((item) => item.sickDays > 0).map((item) => <li key={item.profileId}><button type="button" className="text-button" onClick={() => onOpenSwimmer(item.profileId)}>{item.emoji} {item.displayName}</button><span>{item.sickDays} {item.sickDays === 1 ? 'dag' : 'dagar'}</span></li>)}</ul></details>}</article>
      <article><small>Sömnkoll</small><strong className="coach-panel-sleep-value">{sleepLoading || sleepError || report.sleep.averageMinutes == null ? '–' : sleepDuration(report.sleep.averageMinutes)}</strong>{sleepLoading ? <span role="status">Hämtar sömnsvar…</span> : sleepError ? <p className="form-error" role="status">Sömnunderlaget kunde inte hämtas: {sleepError}</p> : <><span>{report.sleep.nights ? `Genomsnittlig sovtid · ${report.sleep.nights} nätter från ${report.sleep.swimmers} simmare.` : 'Inga sömnsvar under perioden.'}</span>{report.sleep.nights > 0 && <><span>{report.sleep.poorNights} nätter med rapporterad dålig sömn.</span><details><summary>Visa per simmare</summary><ul className="coach-panel-metric-list">{report.swimmers.filter((item) => item.sleep.nights > 0).map((item) => <li key={item.profileId}><button type="button" className="text-button" onClick={() => onOpenSwimmer(item.profileId)}>{item.emoji} {item.displayName}</button><span>{sleepDuration(item.sleep.averageMinutes)} i snitt · {item.sleep.nights} nätter · {item.sleep.poorNights} med dålig sömn</span></li>)}</ul></details></>}</>}</article>
    </div>
    {(sleepError || illnessError) && <p className="form-error" role="status">Uppföljningen är ofullständig. {sleepError} {illnessError} Saknat underlag betyder inte att inga signaler finns.</p>}
    <details className="coach-panel-followups"><summary><span><span className="eyebrow">Individuell uppföljning</span><span className="coach-panel-followup-title">Ta en dialog</span></span><span className="coach-panel-dialog-count"><strong>{sleepError || illnessError ? 'Minst ' : ''}{report.followUps.length}</strong><small>simmare</small></span><span className="coach-panel-chevron" aria-hidden="true">⌄</span></summary>
      <p className="coach-panel-intro">Signaler {dayLabel(report.signalStart)}–{dayLabel(report.end)}. Öppna simmarkortet för underlaget.</p>
      {sleepError && <p className="form-error" role="status">Sömnunderlaget saknas. Antalet kan därför vara ofullständigt.</p>}
      {report.followUps.length ? <FollowupList items={report.followUps} report={report} onOpenSwimmer={onOpenSwimmer} onMessage={onMessage} /> : <p className="empty">Inga röda signaler i tillgängliga svar för perioden. Det betyder inte att alla har svarat eller att ingen behöver stöd.</p>}
      <details className="coach-panel-method"><summary>Så sätts färgerna</summary><p>{FOLLOWUP_RULES}</p><p>Sömnreglerna är oförändrade: minst två Dålig-svar eller minst tre nätter med snitt under sju timmar ger rött; senaste tre rapporterade nätterna högst sju timmar ger gult, minst fem sådana nätter ger rött. Fråga simmaren innan du ändrar träningen.</p></details>
    </details>
    <details className="coach-panel-followups"><summary><span className="coach-panel-followup-title">🟡 Bevaka utvecklingen</span><span className="coach-panel-dialog-count"><strong>{report.watchList.length}</strong><small>simmare</small></span><span className="coach-panel-chevron" aria-hidden="true">⌄</span></summary><p>Tung kropp eller hög ansträngning kan höra till träningen och är inte i sig en sjukdomssignal. Här finns gula signaler, separat från Ta en dialog.</p><FollowupList items={report.watchList} report={report} onOpenSwimmer={onOpenSwimmer} onMessage={onMessage} /></details>
    <details className="coach-panel-roster"><summary>Visa hela gruppens översikt ({report.swimmers.length})</summary><div className="coach-panel-table-wrap"><table><thead><tr><th>Simmare</th><th>Pass</th><th>RPE</th><th>Återkoppling</th><th>Fartkänsla</th><th></th></tr></thead><tbody>{report.swimmers.map((item) => <tr key={item.profileId}><th>{item.emoji} {item.displayName}</th><td>{item.completed}</td><td>{fmt(item.rpe)}</td><td>{item.feedback}</td><td>{item.speedCurrent != null && item.speedPrevious != null ? `${fmt(item.speedPrevious)} → ${fmt(item.speedCurrent)}` : 'För lite data'}</td><td><button type="button" className="text-button" onClick={() => onOpenSwimmer(item.profileId)}>Öppna</button></td></tr>)}</tbody></table></div><small>Fartkänsla jämför den valda veckan med föregående kalendervecka och kräver minst två svar i vardera veckan. Det är självskattning, inte ett tävlingsresultat.</small></details>
    {renderWeekOverview && !future && <section className="coach-panel-week-overview">{renderWeekOverview({ responses: weekResponses, periodLabel, weekStart })}</section>}
    </div>}
  </section>
}
