import React from 'react'
import WorkoutInnovationSlider from './workout-innovation-slider.jsx'

export default function WorkoutGenerator({ generator, setGenerator, generating, focuses, onSubmit, onClose }) {
  const update = (key, value) => setGenerator((current) => ({ ...current, [key]: value }))
  return <form className="workout-generator coach-card" onSubmit={onSubmit}>
    <div className="workout-picker-head">
      <div><p className="eyebrow">Bygg från passbiblioteket</p><h3>Skapa ett redigerbart passförslag</h3></div>
      <button type="button" className="text-button" onClick={onClose}>Stäng</button>
    </div>
    <p className="settings-help">Välj hur nära biblioteket förslaget ska ligga. Relevanta pass med höga betyg prioriteras; RPE hjälper till att matcha belastningen.</p>
    <WorkoutInnovationSlider value={generator.innovationLevel} disabled={generating} onChange={(value) => update('innovationLevel', value)} />
    <div className="workout-generator-grid">
      <label>Huvudinriktning<select disabled={generating} value={generator.focus} onChange={(event) => update('focus', event.target.value)}>{focuses.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
      <label>Distans<select disabled={generating} value={generator.distanceMeters} onChange={(event) => update('distanceMeters', Number(event.target.value))}>{[2000, 2500, 3000, 3500, 4000, 4500, 5000, 6000, 7000].map((value) => <option value={value} key={value}>{value.toLocaleString('sv-SE')} m</option>)}</select></label>
      <label>Tidsåtgång<select disabled={generating} value={generator.durationMinutes} onChange={(event) => update('durationMinutes', Number(event.target.value))}><option value="60">1 timme</option><option value="75">1 timme 15 min</option><option value="90">1,5 timmar</option><option value="120">2 timmar</option></select></label>
      <label>Mål-RPE<select disabled={generating} value={generator.rpe} onChange={(event) => update('rpe', event.target.value)}><option value="4–5">4–5 · lugnt</option><option value="5–6">5–6 · medel</option><option value="6–7">6–7 · standard</option><option value="7–8">7–8 · hårt</option></select></label>
    </div>
    <label className="workout-generator-request">Frivilligt önskemål<textarea disabled={generating} maxLength={300} rows={2} placeholder="Till exempel: lägg gärna in en huvudserie med 3 × 500 m" value={generator.request} onChange={(event) => update('request', event.target.value)} /><small>Önskemålet vägs in som en preferens. Passbetyg, RPE, distans och tidsåtgång styr fortfarande helheten.</small></label>
    <fieldset disabled={generating} className="workout-groups"><legend>Passet gäller för</legend><div>{[['ungdom_orange', 'Ungdom Orange'], ['ungdom_svart', 'Ungdom Svart'], ['junior', 'Junior']].map(([value, label]) => <label key={value}><input type="checkbox" checked={generator.groups.includes(value)} onChange={(event) => update('groups', event.target.checked ? [...generator.groups, value] : generator.groups.filter((item) => item !== value))} />{label}</label>)}</div></fieldset>
    <button className={`primary-button${generating ? ' ai-working' : ''}`} type="submit" aria-busy={generating} disabled={generating || !generator.groups.length}>{generating ? 'Skapar passförslag…' : 'Skapa passförslag →'}</button>
  </form>
}

export function WorkoutGenerationResult({ result }) {
  return <section className="workout-generator-result" aria-label="Underlag för passförslaget">
    <strong role="status">✓ Utkast klart · {result.mode}</strong>
    <p><b>Biblioteksreferenser:</b> {result.sources?.length ? result.sources.map((source) => source.title).join(' · ') : 'Inga använda'}</p>
    <p><b>Nytt/anpassat:</b> {result.changes}</p>
    <small>{result.model} · Inte publicerat. Granska serier, totalsumma och intervall innan du sparar.</small>
  </section>
}
