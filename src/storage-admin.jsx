import React, { useEffect, useRef, useState } from 'react'
import { apiRequest } from './api-request.js'
import { storageBytes, storageBudgetInput, parseStorageBudget, storageBudgetState, STORAGE_BUCKET_NAMES, STORAGE_KIND_NAMES } from '../shared/storage-usage.js'
import './storage-admin.css'

const endpoint = '/api/profiles?storage=true'
const timestamp = (value) => value ? new Date(value).toLocaleString('sv-SE') : 'Inte mätt'
const date = (value) => new Date(`${value}T12:00:00Z`).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })
function UsageCard({ title, used, budget, unknown = 0, note }) {
  const state = storageBudgetState(used, budget, unknown)
  return <article className={`storage-usage-card ${state.level}`}><h2>{title}</h2><strong className="storage-amount">{storageBytes(used)}</strong><p>{budget ? `av ${storageBytes(budget)} angiven budget` : 'Budgetgräns inte angiven'}</p>
    {state.percent != null && <><div className="storage-meter" role="progressbar" aria-label={`${title}: andel av angiven budget`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, Math.round(state.percent))} aria-valuetext={`${Math.round(state.percent)} procent av budgeten${unknown ? ', vissa filstorlekar saknas' : ''}`}><span style={{ width: `${Math.min(100, state.percent)}%` }} /></div><b>{state.over > 0 ? `${storageBytes(state.over)} över angiven budget` : state.remaining == null ? 'Kvarvarande utrymme kan inte beräknas säkert' : `${storageBytes(state.remaining)} kvar till angiven budget`}</b>{state.level === 'warning' && <small>Minst 80 % av budgeten används.</small>}{state.level === 'danger' && <small>Minst 90 % av budgeten används. Kontrollera kapaciteten.</small>}</>}
    {unknown > 0 && <p className="storage-warning">{unknown} filer saknar storleksuppgift. Visad användning är en lägstanivå.</p>}<small>{note}</small></article>
}

function History({ history }) {
  const [days, setDays] = useState('30')
  const latestDate = history.at(-1)?.measured_on
  const cutoff = latestDate ? Date.parse(`${latestDate}T00:00:00Z`) - (Number(days) - 1) * 86400000 : 0
  const rows = history.filter((r) => Date.parse(`${r.measured_on}T00:00:00Z`) >= cutoff)
  const incomplete = rows.some((r) => r.unknown_size_count > 0)
  const max = Math.max(1, ...rows.flatMap((r) => [r.database_bytes, r.file_bytes]))
  const first = rows[0], last = rows.at(-1), start = first ? Date.parse(first.measured_on) : 0, span = last ? Date.parse(last.measured_on) - start : 0
  const x = (r) => 60 + (span ? (Date.parse(r.measured_on) - start) / span * 620 : 310)
  const y = (n) => 165 - n / max * 135
  return <section className="storage-section"><div className="storage-section-heading"><h2>Utveckling över tid</h2><label>Period<select value={days} onChange={(e) => setDays(e.target.value)}><option value="30">30 dagar</option><option value="90">90 dagar</option><option value="366">Ett år</option></select></label></div>
    <p>En mätpunkt per svensk kalenderdag. Historiken börjar när funktionen aktiveras; saknade dagar är inte noll.</p>
    {incomplete && <p className="storage-warning">Vissa mätpunkter saknar filstorlekar. Fillinjen visar bara känd användning; förändringen kan inte beräknas säkert.</p>}
    {rows.length > 1 ? <><div className="storage-history-summary"><span>Databas: {last.database_bytes >= first.database_bytes ? '+' : '−'}{storageBytes(Math.abs(last.database_bytes - first.database_bytes))}</span>{!incomplete && <span>Filer: {last.file_bytes >= first.file_bytes ? '+' : '−'}{storageBytes(Math.abs(last.file_bytes - first.file_bytes))}</span>}<small>{date(first.measured_on)}–{date(last.measured_on)}</small></div><div className="storage-chart-scroll"><svg viewBox="0 0 720 205" role="img" aria-label={`Lagringens utveckling mellan ${first.measured_on} och ${last.measured_on}, databas och filer i separata linjer.`}>
      {[0, .5, 1].map((scale) => <g key={scale}><line x1="60" x2="680" y1={y(max * scale)} y2={y(max * scale)} stroke="#dce7e4" /><text x="53" y={y(max * scale) + 4} textAnchor="end">{storageBytes(max * scale)}</text></g>)}
      {['database_bytes', 'file_bytes'].map((key, i) => <g key={key} className={i ? 'storage-chart-files' : 'storage-chart-db'}><polyline points={rows.map((r) => `${x(r)},${y(r[key])}`).join(' ')} fill="none" strokeWidth="3" />{rows.map((r) => <circle key={r.measured_on} cx={x(r)} cy={y(r[key])} r="3"><title>{r.measured_on}: {storageBytes(r[key])}</title></circle>)}</g>)}
      <text x="60" y="195">{date(first.measured_on)}</text><text x="680" y="195" textAnchor="end">{date(last.measured_on)}</text>
    </svg></div><div className="storage-legend"><span>● Databas</span><span>● Filer</span></div></> : <p className="storage-empty">{rows.length ? 'Första mätpunkten är sparad. Grafen visas när det finns minst två dagar.' : 'Inga mätpunkter ännu. Tryck Uppdatera och spara mätpunkt.'}</p>}
    {rows.length > 0 && <details><summary>Visa mätpunkter ({rows.length})</summary><div className="storage-table-scroll"><table><thead><tr><th>Datum</th><th>Databas</th><th>Filer</th><th>Antal filer</th></tr></thead><tbody>{[...rows].reverse().map((r) => <tr key={r.measured_on}><td>{r.measured_on}</td><td>{storageBytes(r.database_bytes)}</td><td>{storageBytes(r.file_bytes)}{r.unknown_size_count > 0 && ' (minst)'}</td><td>{Number(r.file_count).toLocaleString('sv-SE')}</td></tr>)}</tbody></table></div></details>}
  </section>
}

export default function StorageAdmin({ code, request = apiRequest }) {
  const [data, setData] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('')
  const [budgetError, setBudgetError] = useState(''), [budgetMessage, setBudgetMessage] = useState('')
  const [draft, setDraft] = useState({ database: '', files: '' }), [dirty, setDirty] = useState(false)
  const active = useRef(false), running = useRef(false), controller = useRef(null)
  const applySettings = (settings) => { setDraft({ database: storageBudgetInput(settings.database_budget_bytes), files: storageBudgetInput(settings.file_budget_bytes) }); setDirty(false) }
  const load = async (capture = false) => {
    if (running.current) return
    running.current = true; setBusy(true); setError(''); setMessage(''); setBudgetError(''); setBudgetMessage(''); controller.current = new AbortController()
    try {
      const result = await request(endpoint, code, { signal: controller.current.signal, ...(capture ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'capture' }) } : {}) })
      if (active.current) { setData(result); if (!dirty) applySettings(result.settings); if (capture) setMessage('✓ Aktuell användning hämtad och dagens mätpunkt sparad.') }
    } catch (e) { if (active.current && e.name !== 'AbortError') setError(e.message) }
    finally { running.current = false; if (active.current) setBusy(false) }
  }
  useEffect(() => { active.current = true; load(); return () => { active.current = false; controller.current?.abort() } }, [code])
  const save = async (event) => {
    event.preventDefault(); if (running.current || !data) return
    let databaseBudgetBytes, fileBudgetBytes
    try { databaseBudgetBytes = parseStorageBudget(draft.database); fileBudgetBytes = parseStorageBudget(draft.files) } catch (e) { setBudgetError(e.message); setBudgetMessage(''); return }
    running.current = true; setBusy(true); setError(''); setMessage(''); setBudgetError(''); setBudgetMessage('Sparar budgetgränser…'); controller.current = new AbortController()
    try {
      const result = await request(endpoint, code, { method: 'POST', signal: controller.current.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'save-budgets', databaseBudgetBytes, fileBudgetBytes, expectedUpdatedAt: data.settings.updated_at }) })
      if (active.current) { setData((current) => ({ ...current, settings: result.settings })); applySettings(result.settings); setBudgetMessage('✓ Budgetgränserna är sparade. Ingen kapacitet eller abonnemangsinställning har ändrats hos Supabase.') }
    } catch (e) { if (active.current && e.name !== 'AbortError') { setBudgetError(e.message); setBudgetMessage('') } }
    finally { running.current = false; if (active.current) setBusy(false) }
  }
  const current = data?.current
  return <section className="storage-admin"><div className="period-heading"><div><p className="eyebrow">Superadmin · hela projektet</p><h1>Lagring och historik</h1><small>Databas och fillagring mäts separat. Inga filer eller simmardata raderas här.</small></div><button className="secondary-button" disabled={busy} onClick={() => load(true)}>{busy ? 'Arbetar…' : 'Uppdatera och spara mätpunkt'}</button></div>
    {error && <div className="storage-error" role="alert"><p>{error}</p><button className="secondary-button" disabled={busy} onClick={() => load()}>Hämta aktuella uppgifter igen</button></div>}{message && <p className="storage-status" role="status">{message}</p>}
    {!data && !error && <p role="status">Hämtar lagringsanvändning…</p>}
    {current && <><p className="storage-measured">Mätt {timestamp(current.measuredAt)} · {Number(current.fileCount).toLocaleString('sv-SE')} filer · {data.dailyScheduleEnabled ? 'Daglig mätning är schemalagd' : 'Daglig mätning saknar aktivt schema'}</p>
      <div className="storage-cards"><UsageCard title="Databas" used={current.databaseBytes} budget={data.settings.database_budget_bytes} note="Hela databasens storlek, inklusive index och interna tabeller. Inte total disk inklusive WAL/systemfiler." /><UsageCard title="Bilder, filmer och dokument" used={current.fileBytes} unknown={current.unknownSizeCount} budget={data.settings.file_budget_bytes} note="Summerade filstorlekar i projektets Storage, inklusive förhandsbilder och tillfälliga uppladdningar. Inte nedladdningstrafik." /></div>
      <section className="storage-section"><h2>Fördelning av fillagringen</h2><div className="storage-kinds">{['video', 'image', 'document', 'other'].map((kind) => { const row = current.kinds.find((r) => r.kind === kind); return <article key={kind}><span>{STORAGE_KIND_NAMES[kind]}</span><strong>{storageBytes(row?.bytes || 0)}</strong><small>{row?.object_count || 0} filer{row?.unknown_size_count > 0 ? ' · vissa storlekar saknas' : ''}</small></article> })}</div>
        <div className="storage-breakdown">{current.buckets.map((row) => <article key={row.id}><div><strong>{STORAGE_BUCKET_NAMES[row.id] || row.id}</strong><small>{row.object_count} filer · {row.public ? 'Publik bucket' : 'Privat bucket'}{row.unknown_size_count > 0 ? ' · vissa storlekar saknas' : ''}</small></div><b>{storageBytes(row.bytes)}</b></article>)}</div>{!current.fileCount && <p>Inga filer finns registrerade i projektets Storage.</p>}
      </section>
      <section className="storage-section"><h2>Simmardata och övrig appdata</h2><p>Tabeller och index grupperade efter användningsområde. Interna databasscheman och systemutrymme ingår inte i denna fördelning.</p><div className="storage-breakdown">{current.areas.map((row) => <article key={row.area}><strong>{row.area}</strong><b>{storageBytes(row.bytes)}</b></article>)}</div></section>
      <History history={data.history} />
      <section className="storage-section"><h2>Budget och varningar</h2><p>Budgetarna är egna riktvärden, inte avlästa abonnemangsgränser. De ändrar inte Supabases kapacitet eller stoppar uppladdningar. Gul varning vid 80 %, röd vid 90 %.</p>
        <form onSubmit={save}><fieldset disabled={busy}>
          <div className="storage-budget-fields"><label>Databasbudget (GB)<input inputMode="decimal" maxLength={20} placeholder="Gräns inte angiven" value={draft.database} onChange={(e) => { setDraft({ ...draft, database: e.target.value }); setDirty(true) }} /></label><label>Fillagringsbudget (GB)<input inputMode="decimal" maxLength={20} placeholder="Gräns inte angiven" value={draft.files} onChange={(e) => { setDraft({ ...draft, files: e.target.value }); setDirty(true) }} /></label></div>
          <small>1 GB = 1 000 MB. Lämna tomt om gränsen är okänd. {dirty && 'Du har osparade ändringar.'}</small>
          <div className="storage-budget-actions"><button type="submit" className="primary-button" disabled={!dirty}>{busy ? 'Sparar…' : 'Spara budgetgränser'}</button></div>
        </fieldset></form>
        {budgetError && <p className="storage-error" role="alert">{budgetError} Vid en samtidig ändring: använd Uppdatera och spara mätpunkt för att hämta aktuella värden. Ditt utkast behålls.</p>}
        {budgetMessage && <p className="storage-status" role="status">{budgetMessage}</p>}
        <p>Faktisk abonnemangskvot kan vara delad med andra projekt. Kontrollera kapacitet och faktureringsunderlag i Supabase Dashboard; detta är ingen faktureringsvy.</p>
      </section>
      <section className="storage-section"><h2>Lagringslogg</h2><p>Senaste 100 serverhanterade filoperationer och budgetändringar från aktivering. Inga filnamn, privata texter eller videoinnehåll loggas. Radering visar antal begärda filer; en lyckad filuppladdning behöver inte vara kopplad till ett mål ännu. Direktuppladdningens tillfälliga steg och ändringar utanför Simkoll täcks inte fullständigt.</p><div className="storage-events">{data.events.length ? data.events.map((event) => <article key={event.id}><div><strong>{{ upload: 'Filuppladdning', delete: 'Radering begärd', budget: 'Budgetgränser sparade', upload_link: 'Uppladdningslänk' }[event.action] || 'Filoperation'}</strong><small>{timestamp(event.created_at)}{event.bucket_id && ` · ${STORAGE_BUCKET_NAMES[event.bucket_id] || event.bucket_id}`}{event.stage === 'temporary' && ' · tillfällig fil'}{event.object_count != null && ` · ${event.object_count} filer`}{event.bytes != null && ` · ${storageBytes(event.bytes)}`}</small></div><span className={event.success ? 'storage-event-ok' : 'storage-event-fail'}>{event.success ? 'OK' : 'Misslyckades'}</span></article>) : <p>Inga filoperationer har loggats ännu. Tidigare händelser återskapas inte.</p>}</div></section>
      <section className="storage-section"><h2>Vad tar plats i databasen?</h2><p>Största 30 apptabellerna, inklusive deras index och reserverat utrymme. Antal rader är uppskattningar, inte exakta antal simmare eller svar.</p><details><summary>Visa tabellstorlekar</summary><div className="storage-table-scroll"><table><thead><tr><th>Tabell</th><th>Storlek</th><th>Uppskattade rader</th></tr></thead><tbody>{current.tables.map((row) => <tr key={row.table_name}><td>{row.table_name}</td><td>{storageBytes(row.bytes)}</td><td>{row.estimated_rows == null ? 'Uppgift saknas' : Number(row.estimated_rows).toLocaleString('sv-SE')}</td></tr>)}</tbody></table></div></details><details><summary>Visa databasscheman</summary><div className="storage-breakdown">{current.schemas.map((row) => <article key={row.schema_name}><strong>{row.schema_name}</strong><span>{storageBytes(row.bytes)}</span></article>)}</div></details><small>Tabell- och schemadelarna summerar inte nödvändigtvis till hela databasen. Filerna själva ligger separat; Storage-metadata ligger i databasen.</small></section>
    </>}
  </section>
}
