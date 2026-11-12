import React from 'react'
import { heartDuration, heartLoadSources } from '../shared/training-heart-display.js'
import { trainingHeartLoadSummary } from '../shared/training-heart-load.js'
import { trainingLoadCoverage, trainingLoadIssueText } from '../shared/training-load-diagnostics.js'

const number = value => value == null ? 'Saknas' : value.toLocaleString('sv-SE', { maximumFractionDigits: 1 })
const date = value => new Date(value).toLocaleString('sv-SE', { timeZone: 'Europe/Stockholm', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
export default function TrainingEnergyDetails({ heart, energy }) {
  const load = trainingHeartLoadSummary(heart.load)
  return <>
    <p>Stjärnan visar färsk rapporterad träningskänsla – inte uppmätt form, puls, diagnos eller klartecken för träning eller tävling.</p>
    <section><h4>{energy.label}</h4><p>Senaste giltiga svar per mått inom 24 timmar. Svarstid och aktivitetsdatum kontrolleras; äldre träning blir inte färsk genom efterregistrering. Veckosnitt används inte för effekten.</p>
      <dl className="training-energy-evidence">{[['body', 'Kropp'], ['feeling', 'Dagskänsla'], ['speed', 'Simfartkänsla']].map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{energy.metrics[key] ? <>{energy.metrics[key].value}/5<small className="training-heart-period">Rapporterat {date(energy.metrics[key].at)} · aktivitetsdag {energy.metrics[key].day}</small></> : 'Färskt svar saknas'}</dd></div>)}</dl>
      {energy.signals.length > 0 && <><strong>Effekten är pausad eller begränsad</strong><ul>{energy.signals.map(signal => <li key={signal}>{signal}</li>)}</ul></>}
      {!energy.sleepKnown && <p>Aktuellt sömnunderlag saknas. Stjärnan är inte en bedömning av återhämtning.</p>}
    </section>
    <section><h4>Separat uppföljning</h4>{heart.warnings.length ? <ul>{heart.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul> : <p>Inga sömn-/sjukdomssignaler i detta underlag. Saknade svar betyder inte frisk.</p>}<p>Tränarens Följ upp / Var uppmärksam är en separat signal. Hög träningskänsla tar inte bort den.</p></section>
    <details className="training-heart-rules"><summary>Belastning och äldre sammanställningar</summary>
      <p>Belastningen ändrar inte stjärnans storlek, färg eller puls. Högt är inte automatiskt bra och lågt betyder inte återhämtad.</p>
      <strong>{load.label}</strong><p>{load.description}</p><p>{heart.periods.start}–{heart.asOf} mot {heart.periods.previousStart}–{heart.periods.previousEnd}</p>
      <p>Nu: {heartLoadSources(heart.load)}.</p><p>Föregående: {heartLoadSources(heart.load.previous)}.</p>
      <p>Nu: {heart.load.known} av {heart.load.total} efterrapportgrupper med RPE och användbar tid. Föregående: {heart.load.previous.known} av {heart.load.previous.total}.</p>
      {[['Nu', heart.load], ['Föregående', heart.load.previous]].map(([label, value]) => <div key={label}><strong>{label}: beräkningsunderlag</strong><p>{value.missingRpe} saknar RPE · {value.missingTime} saknar användbar tid · {value.days} olika dagar med kompletta rapporter.</p>{trainingLoadCoverage(value)?.reasons.map(reason => <p key={reason}>{reason}</p>)}{value.gaps?.length > 0 && <details><summary>Visa rapporter som saknar beräkningsunderlag</summary><ul>{value.gaps.map((gap, index) => <li key={index}>{gap.date} · {gap.activity} · {gap.slot || 'utan passval'}: {gap.issues.map(trainingLoadIssueText).join(' · ')}</li>)}</ul></details>}</div>)}
      <p>Efterrapportgrupper är inte samma mått som genomförda aktiviteter i veckomatrisen. Rapporterad tid prioriteras; planerad tid är en uppskattning, inte bekräftad faktisk tid.</p>
      <p>Äldre tredagarsmedel {heart.periods.feelingStart}–{heart.asOf}: kropp {number(heart.body.value)}/5 ({heart.body.days} svarsdagar), dagskänsla {number(heart.feeling.value)}/5 ({heart.feeling.days} svarsdagar).</p>
      <p>Sju dagar {heart.periods.start}–{heart.asOf}: simfartkänsla {number(heart.speed.value)}/5 ({heart.speed.days} svarsdagar), sömn {heartDuration(heart.sleep.averageMinutes)} i snitt ({heart.sleep.nights} nätter). Dessa värden tänder inte dygnseffekten.</p>
    </details>
    <details className="training-heart-rules"><summary>Så fungerar energistjärnan</summary>
      <p>Alla tre färska känslosvar behövs. Något under 3 ger Tyngre träningskänsla; annars visas Okej / blandad känsla. Alla minst 4 ger Stark träningskänsla. Tre femmor ger Maxad rapporterad känsla. Detta är produktregler, inte validerade formgränser.</p>
      <p>Glöd och puls kräver dessutom ett uttryckligt Nej i sjukdomskollen inom 24 timmar och inga aktuella sömn-/sjukdomsspärrar. Saknat eller överhoppat svar ger aldrig klartecken. Sömn kan stoppa effekten men ger inga bonuspoäng. Vid spärr visas känslosvaren utan celebrerande effekt.</p>
      <p>Maxläget får en kort gnistsekvens, sedan en lugn dubbelpuls. Ingen ring eller belastningsstorlek används. Avstängda animationer eller enhetens Minskad rörelse stoppar rörelserna; text och symbol fungerar ändå.</p>
    </details>
  </>
}
