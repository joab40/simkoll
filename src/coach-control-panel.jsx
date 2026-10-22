import React, { useEffect, useMemo, useState } from 'react'
import { buildCoachControlPanel } from '../shared/coach-control-panel.js'
import './coach-control-panel.css'
import CoachWeek from './coach-week.jsx'

const fmt = (value) => value == null ? '–' : Number(value).toLocaleString('sv-SE')
const dayLabel = (value) => new Date(`${value}T12:00:00Z`).toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm', day: 'numeric', month: 'short' })

export default function CoachControlPanel({ profiles, responses, asOf, code, request, onOpenSwimmer, onMessage }) {
  const [sleepRecords, setSleepRecords] = useState([]), [sleepError, setSleepError] = useState('')
  useEffect(() => {
    let active = true; setSleepRecords([]); setSleepError('')
    const start = new Date(Date.parse(`${asOf}T12:00:00Z`) - 6 * 86400000).toISOString().slice(0,10)
    request(`/api/responses?sleep=true&start=${start}&end=${asOf}`, code).then((data) => { if (active) setSleepRecords(data.records || []) }).catch((error) => { if (active) setSleepError(error.message) })
    return () => { active = false }
  }, [asOf, code])
  const report = useMemo(() => buildCoachControlPanel(profiles, responses, asOf, sleepRecords), [profiles, responses, asOf, sleepRecords])
  return <section className="coach-control-panel">
    <div className="period-heading"><div><p className="eyebrow">Tränarens kontrollpanel</p><h1>Gruppen i korthet</h1><small>{dayLabel(report.start)}–{dayLabel(report.end)} · {report.profileCount} simmare i valda grupper</small></div></div>
    <CoachWeek profiles={profiles} asOf={asOf} code={code} request={request} onOpenSwimmer={onOpenSwimmer} />
    <p className="coach-panel-intro">Här sammanfattas simmarnas egna incheckningar. Pass är rapporterade genomförda aktiviteter, inte automatiskt bekräftad närvaro. Använd signalerna som underlag för samtal, inte som medicinska bedömningar.</p>
    <div className="coach-panel-metrics">
      <article><small>Genomförda aktiviteter</small><strong>{report.completedPasses}</strong><span>Unika pass från efter-incheckningar</span></article>
      <article><small>Upplevd ansträngning</small><strong>{report.averageRpe == null ? '–' : `${fmt(report.averageRpe)}/10`}</strong><span>{report.rpeAnswers} svar med RPE</span></article>
      <article><small>Återkoppling</small><strong>{report.feedbackCount}</strong><span>Efter-svar med kommentar eller passbetyg</span></article>
      <article><small>Rapporterad belastning</small><strong>{fmt(report.load)}</strong><span>RPE × minuter · {report.loadAnswers} svar med båda uppgifterna</span></article>
    </div>
    <section className="coach-panel-followups"><header><div><p className="eyebrow">Individuell uppföljning</p><h2>Ta en dialog</h2></div><strong>{report.followUps.length}</strong></header>
      {sleepError && <p className="form-error" role="status">Sömnunderlag saknas: {sleepError}</p>}
      {report.followUps.length ? <div className="coach-panel-followup-list">{report.followUps.map((item) => <article key={item.profileId}><span className="coach-panel-avatar" aria-hidden="true">{item.emoji}</span><div><strong>{item.displayName}</strong><ul>{item.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul><small>{item.completed} rapporterade pass · RPE {fmt(item.rpe)}/10</small></div><div className="coach-panel-actions"><button type="button" className="secondary-button" onClick={() => onOpenSwimmer(item.profileId)}>Visa simmare</button><button type="button" className="text-button" onClick={() => onMessage(item.profileId)}>Skriv privat →</button></div></article>)}</div> : <p className="empty">Inga upprepade signaler i de senaste sju dagarnas profilsvar. Det betyder inte att alla har svarat eller att ingen behöver stöd.</p>}
      <small className="coach-panel-method">Listan bygger på minst två olika dagar med låg känsla, låg kroppskänsla, hög RPE, dålig sömn eller rapporterad sjukfrånvaro. Se sömnens datum och sovtid i simmarkortet. En ensam skattning och utebliven incheckning ger ingen automatisk markering. Läs underlaget och fråga simmaren innan du ändrar träningen.</small>
    </section>
    <details className="coach-panel-roster"><summary>Visa hela gruppens översikt ({report.swimmers.length})</summary><div className="coach-panel-table-wrap"><table><thead><tr><th>Simmare</th><th>Pass</th><th>RPE</th><th>Återkoppling</th><th>Fartkänsla</th><th></th></tr></thead><tbody>{report.swimmers.map((item) => <tr key={item.profileId}><th>{item.emoji} {item.displayName}</th><td>{item.completed}</td><td>{fmt(item.rpe)}</td><td>{item.feedback}</td><td>{item.speedCurrent != null && item.speedPrevious != null ? `${fmt(item.speedPrevious)} → ${fmt(item.speedCurrent)}` : 'För lite data'}</td><td><button type="button" className="text-button" onClick={() => onOpenSwimmer(item.profileId)}>Öppna</button></td></tr>)}</tbody></table></div><small>Fartkänsla jämförs bara om minst två svar finns i både denna och föregående sjudagarsperiod. Det är självskattning, inte ett tävlingsresultat.</small></details>
  </section>
}
