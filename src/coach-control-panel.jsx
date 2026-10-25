import React, { useEffect, useMemo, useState } from 'react'
import { buildCoachControlPanel } from '../shared/coach-control-panel.js'
import './coach-control-panel.css'
import CoachWeek from './coach-week.jsx'
import { sleepDuration } from './daily-sleep.jsx'

const fmt = (value) => value == null ? '–' : Number(value).toLocaleString('sv-SE')
const dayLabel = (value) => new Date(`${value}T12:00:00Z`).toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm', day: 'numeric', month: 'short' })

export default function CoachControlPanel({ profiles, responses, asOf, code, request, onOpenSwimmer, onMessage }) {
  const [sleepRecords, setSleepRecords] = useState([]), [sleepError, setSleepError] = useState('')
  const [sleepLoading, setSleepLoading] = useState(true)
  useEffect(() => {
    let active = true; setSleepRecords([]); setSleepError(''); setSleepLoading(true)
    const start = new Date(Date.parse(`${asOf}T12:00:00Z`) - 13 * 86400000).toISOString().slice(0,10)
    request(`/api/responses?sleep=true&start=${start}&end=${asOf}`, code).then((data) => { if (active) setSleepRecords(data.records || []) }).catch((error) => { if (active) setSleepError(error.message) }).finally(() => { if (active) setSleepLoading(false) })
    return () => { active = false }
  }, [asOf, code, request])
  const report = useMemo(() => buildCoachControlPanel(profiles, responses, asOf, sleepRecords), [profiles, responses, asOf, sleepRecords])
  return <section className="coach-control-panel">
    <div className="period-heading"><div><p className="eyebrow">Tränarens kontrollpanel</p><h1>Gruppen i korthet</h1><small>{dayLabel(report.start)}–{dayLabel(report.end)} · {report.profileCount} simmare i valda grupper</small></div></div>
    <CoachWeek profiles={profiles} asOf={asOf} code={code} request={request} onOpenSwimmer={onOpenSwimmer} />
    <p className="coach-panel-intro">Översikt för de senaste 14 dagarna. Träningspassen räknas från simmarnas efterrapporter; närvaro utan efterrapport ingår inte här. Under Individuell uppföljning lyfts återkommande signaler från de senaste sju dagarna som underlag för samtal.</p>
    <div className="coach-panel-metrics">
      <article><small>Rapporterade träningspass</small><strong>{report.completedPasses}</strong><span>{report.feedbackCount} av passen har kommentar eller betyg på passet eller upplägget.</span></article>
      <article><small>Upplevd ansträngning</small><strong>{report.averageRpe == null ? '–' : `${fmt(report.averageRpe)}/10`}</strong><span>Genomsnitt från {report.rpeAnswers} efterrapporter. RPE är simmarens upplevda ansträngning på skalan 0–10.</span></article>
      <article><small>Beräknad träningsbelastning</small><strong>{fmt(report.load)}</strong><span>{report.load == null ? 'Inga pass med både ansträngning och träningstid.' : `Belastningspoäng från ${report.loadAnswers} av ${report.completedPasses} rapporterade pass.`}</span><details><summary>Hur räknas det?</summary><p>För varje pass multipliceras upplevd ansträngning (RPE 0–10) med rapporterade minuter. Ett pass på 60 minuter med RPE 5 ger 300 belastningspoäng. Kortet visar summan för gruppen under perioden. Pass som saknar någon av uppgifterna ingår inte.</p></details></article>
    </div>
    <div className="coach-panel-metrics coach-panel-wellbeing">
      <article><small>Rapporterad sjukdom</small><strong>{report.sickSwimmers} <em>simmare</em></strong><span>{report.sickDays} rapporterade sjukdagar under perioden. Varje simmare räknas en gång per dag.</span>{report.sickSwimmers > 0 && <details><summary>Visa vilka</summary><ul className="coach-panel-metric-list">{report.swimmers.filter((item) => item.sickDays > 0).map((item) => <li key={item.profileId}><button type="button" className="text-button" onClick={() => onOpenSwimmer(item.profileId)}>{item.emoji} {item.displayName}</button><span>{item.sickDays} {item.sickDays === 1 ? 'dag' : 'dagar'}</span></li>)}</ul></details>}</article>
      <article><small>Sömnkoll</small><strong className="coach-panel-sleep-value">{sleepLoading || sleepError || report.sleep.averageMinutes == null ? '–' : sleepDuration(report.sleep.averageMinutes)}</strong>{sleepLoading ? <span role="status">Hämtar sömnsvar…</span> : sleepError ? <p className="form-error" role="status">Sömnunderlaget kunde inte hämtas: {sleepError}</p> : <><span>{report.sleep.nights ? `Genomsnittlig sovtid · ${report.sleep.nights} nätter från ${report.sleep.swimmers} simmare.` : 'Inga sömnsvar under perioden.'}</span>{report.sleep.nights > 0 && <><span>{report.sleep.poorNights} nätter med rapporterad dålig sömn.</span><details><summary>Visa per simmare</summary><ul className="coach-panel-metric-list">{report.swimmers.filter((item) => item.sleep.nights > 0).map((item) => <li key={item.profileId}><button type="button" className="text-button" onClick={() => onOpenSwimmer(item.profileId)}>{item.emoji} {item.displayName}</button><span>{sleepDuration(item.sleep.averageMinutes)} i snitt · {item.sleep.nights} nätter · {item.sleep.poorNights} med dålig sömn</span></li>)}</ul></details></>}</>}</article>
    </div>
    <section className="coach-panel-followups"><header><div><p className="eyebrow">Individuell uppföljning</p><h2>Ta en dialog</h2></div><strong>{report.followUps.length}</strong></header>
      {report.followUps.length ? <div className="coach-panel-followup-list">{report.followUps.map((item) => <article key={item.profileId}><span className="coach-panel-avatar" aria-hidden="true">{item.emoji}</span><div><strong>{item.displayName}</strong><ul>{item.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul><small>{item.completed} rapporterade pass · RPE {fmt(item.rpe)}/10</small></div><div className="coach-panel-actions"><button type="button" className="secondary-button" onClick={() => onOpenSwimmer(item.profileId)}>Visa simmare</button><button type="button" className="text-button" onClick={() => onMessage(item.profileId)}>Skriv privat →</button></div></article>)}</div> : <p className="empty">Inga upprepade signaler i de senaste sju dagarnas profilsvar. Det betyder inte att alla har svarat eller att ingen behöver stöd.</p>}
      <small className="coach-panel-method">Listan bygger på återkommande signaler under de senaste sju dagarna: minst två dagar med låg känsla, låg kroppskänsla, hög RPE eller sjukfrånvaro, minst två nätter med dålig sömn eller minst tre rapporterade nätter med i snitt under sju timmars sömn. I simmarkortet markeras även minst tre missade planerade pass. En ensam skattning och utebliven incheckning ger ingen automatisk markering. Läs underlaget och fråga simmaren innan du ändrar träningen.</small>
    </section>
    <details className="coach-panel-roster"><summary>Visa hela gruppens översikt ({report.swimmers.length})</summary><div className="coach-panel-table-wrap"><table><thead><tr><th>Simmare</th><th>Pass</th><th>RPE</th><th>Återkoppling</th><th>Fartkänsla</th><th></th></tr></thead><tbody>{report.swimmers.map((item) => <tr key={item.profileId}><th>{item.emoji} {item.displayName}</th><td>{item.completed}</td><td>{fmt(item.rpe)}</td><td>{item.feedback}</td><td>{item.speedCurrent != null && item.speedPrevious != null ? `${fmt(item.speedPrevious)} → ${fmt(item.speedCurrent)}` : 'För lite data'}</td><td><button type="button" className="text-button" onClick={() => onOpenSwimmer(item.profileId)}>Öppna</button></td></tr>)}</tbody></table></div><small>Fartkänsla jämförs bara om minst två svar finns i både denna och föregående sjudagarsperiod. Det är självskattning, inte ett tävlingsresultat.</small></details>
  </section>
}
