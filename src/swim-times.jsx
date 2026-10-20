import React, { useEffect, useMemo, useRef, useState } from 'react'
import { TIME_STROKES, TIME_STARTS, TIME_EXERCISES, TIME_EQUIPMENT, TIME_METHODS, comparableSwimTimes, formatTrainingTime, swimTimeDescription, validateSwimTime } from '../shared/swim-times.js'
import './swim-times.css'

const todayKey = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm' }).format(new Date())
const dateLabel = (date) => new Date(`${date}T12:00:00Z`).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' })
const defaults = (date) => ({ date, distance: '100', stroke: 'freestyle', poolLength: '25', time: '', kind: 'training', startType: 'push', exercise: 'full', equipment: [], timingMethod: 'hand', conditions: '', note: '', entryKey: '' })
const fromRow = (row) => ({ id: row.id, date: row.result_date, distance: String(row.distance_meters), stroke: row.stroke, poolLength: String(row.pool_length), time: formatTrainingTime(row.result_time), kind: row.kind, startType: row.start_type, exercise: row.exercise, equipment: row.equipment || [], timingMethod: row.timing_method, conditions: row.conditions || '', note: row.note || '', entryKey: row.entry_key || '' })

function TimeProgress({ group }) {
  if (!group || group.items.length < 2) return <p className="swim-times-help">Registrera minst två tider med samma förutsättningar för att se utvecklingen.</p>
  const items = group.items, values = items.map((item) => item.result_time), low = Math.min(...values), high = Math.max(...values), spread = Math.max(100, high - low)
  const width = Math.max(460, items.length * 65), height = 155
  const x = (index) => 30 + index / Math.max(1, items.length - 1) * (width - 60)
  const y = (value) => 25 + (value - low) / spread * 85
  return <div className="swim-time-progress"><p>Snabbare tider ligger högre. Punkterna är dina registreringar.</p><div className="swim-time-chart"><svg width={width} height={height} role="img" aria-label={`Jämförbara träningstider: ${group.description}`}><polyline points={items.map((item, index) => `${x(index)},${y(item.result_time)}`).join(' ')} fill="none" stroke="#147b7b" strokeWidth="2" />{items.map((item, index) => <g key={item.id}><circle cx={x(index)} cy={y(item.result_time)} r="4" fill="#147b7b"><title>{dateLabel(item.result_date)}: {formatTrainingTime(item.result_time)}</title></circle><text x={x(index)} y={y(item.result_time) - 9} textAnchor="middle">{formatTrainingTime(item.result_time)}</text><text x={x(index)} y={140} textAnchor="middle">{new Date(`${item.result_date}T12:00:00Z`).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })}</text></g>)}</svg></div><small>Varje punkt visas i datumordning. Samma förutsättningar innebär samma gren, bassäng, typ av tid, start, arm/ben/hel simning, hjälpmedel, tidtagning och extra förutsättningar.</small></div>
}

export default function SwimTimes({ code, request, range, entries = [], profileId, coachView = false, readOnly = false, onDirty, onData, createRequest, onCreateHandled }) {
  const today = todayKey()
  const [ownRange, setOwnRange] = useState(() => ({ start: new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10), end: today }))
  const period = range || ownRange
  const [times, setTimes] = useState([]), [loading, setLoading] = useState(true), [error, setError] = useState(''), [limited, setLimited] = useState(false), [reload, setReload] = useState(0)
  const [editor, setEditor] = useState(null), [original, setOriginal] = useState(''), [busy, setBusy] = useState(false), [status, setStatus] = useState(''), [formError, setFormError] = useState(''), [selected, setSelected] = useState('')
  const busyRef = useRef(false), dirtyCallback = useRef(onDirty), editorRef = useRef(null)
  dirtyCallback.current = onDirty
  const dirty = Boolean(editor && JSON.stringify(editor) !== original)
  const editing = Boolean(editor), editingId = editor?.id
  useEffect(() => {
    if (!editing) return
    editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    editorRef.current?.querySelector('input[name="time"]')?.focus({ preventScroll: true })
  }, [editing, editingId])
  useEffect(() => { dirtyCallback.current?.('swim-time-form', dirty); return () => dirtyCallback.current?.('swim-time-form', false) }, [dirty])
  useEffect(() => {
    let active = true
    setLoading(true); setError(''); setTimes([])
    request(`/api/training?swimTimes=true&start=${period.start}&end=${period.end}${coachView ? `&profileId=${encodeURIComponent(profileId)}` : ''}`, code).then((data) => { if (active) { setTimes(data.times || []); setLimited(data.limited === true) } }).catch((reason) => { if (active) setError(reason.message) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [code, profileId, coachView, period.start, period.end, reload])
  const visibleTimes = useMemo(() => times.filter((row) => row.result_date >= period.start && row.result_date <= period.end), [times, period.start, period.end])
  useEffect(() => { onData?.({ rows: visibleTimes, loading, error, limited, periodKey: `${period.start}:${period.end}` }) }, [visibleTimes, loading, error, limited, period.start, period.end, onData])
  const handledCreate = useRef(null)
  useEffect(() => {
    if (!createRequest || handledCreate.current === createRequest || loading || error || readOnly) return
    handledCreate.current = createRequest
    onCreateHandled?.(null)
    if (dirty && !window.confirm('Du har en osparad tid. Lämna ändringarna?')) return
    const draft = { ...defaults(period.end), kind: createRequest.kind === 'test' ? 'test' : 'training' }
    setOriginal(JSON.stringify(draft)); setEditor(draft); setFormError(''); setStatus('')
  }, [createRequest, loading, error, readOnly])
  const groups = useMemo(() => comparableSwimTimes(visibleTimes), [visibleTimes])
  const group = groups.find((item) => item.key === selected) || groups[0]
  const change = (key, value) => { setEditor((current) => ({ ...current, [key]: value, ...(key === 'date' ? { entryKey: '' } : {}) })); setFormError('') }
  const openEditor = (row) => { if (dirty && !window.confirm('Du har en osparad tid. Lämna ändringarna?')) return; const draft = row ? fromRow(row) : defaults(period.end); setOriginal(JSON.stringify(draft)); setEditor(draft); setFormError(''); setStatus('') }
  const closeEditor = () => { if (!dirty || window.confirm('Lämna den osparade tidsregistreringen?')) { setEditor(null); setFormError('') } }
  const save = async (event) => {
    event.preventDefault()
    if (busyRef.current || readOnly) return
    try { validateSwimTime(editor, today) } catch (reason) { setFormError(reason.message); return }
    busyRef.current = true; setBusy(true); setFormError('')
    try {
      const data = await request('/api/training', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...editor, ...(coachView ? { profileId } : {}), action: 'save-swim-time' }) })
      setTimes((current) => [data.time, ...current.filter((item) => item.id !== data.time.id)].sort((a, b) => b.result_date.localeCompare(a.result_date) || String(b.created_at).localeCompare(String(a.created_at))))
      setEditor(null); setStatus(`Tiden är sparad ✓${data.time.result_date < period.start || data.time.result_date > period.end ? ' Välj en period som omfattar datumet för att se den.' : ''}`)
    } catch (reason) { setFormError(reason.message) } finally { busyRef.current = false; setBusy(false) }
  }
  const remove = async (row) => {
    if (readOnly || coachView || busyRef.current || !window.confirm(`Ta bort ${formatTrainingTime(row.result_time)} på ${row.distance_meters} m från ${dateLabel(row.result_date)}?`)) return
    busyRef.current = true; setBusy(true); setStatus('')
    try { await request('/api/training', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete-swim-time', id: row.id }) }); setTimes((current) => current.filter((item) => item.id !== row.id)); setStatus('Tiden är borttagen.'); if (editor?.id === row.id) setEditor(null) } catch (reason) { setStatus(reason.message) } finally { busyRef.current = false; setBusy(false) }
  }
  const selectField = (key, label, values) => <label>{label}<select value={editor[key]} onChange={(event) => change(key, event.target.value)}>{Object.entries(values).map(([value, title]) => <option value={value} key={value}>{title}</option>)}</select></label>
  return <section className="swim-times-panel" aria-label={coachView ? 'Simmarens träningstider' : 'Mina egna träningstider'}>
    <div className="swim-times-heading"><div>{!coachView && <p className="eyebrow">Träning och testlopp</p>}<h2>{coachView ? 'Tider och utveckling' : 'Mina egna tider och testlopp'}</h2></div>{!readOnly && !loading && !error && <button type="button" className="secondary-button" disabled={busy} onClick={() => openEditor()}>Registrera en tid +</button>}</div>
    <p className="swim-times-help">{coachView ? 'Följ tider med samma förutsättningar och rätta vid behov tillsammans med simmaren.' : 'Följ exempelvis 75 m arm med dolme eller 100 m frisim över tid. Tränarna kan också läsa och rätta tiderna.'} Egna tider visas separat från tävlingsresultat och officiella personbästan. De ger inga PB-poäng och skapar inga extra pass eller simmeter.</p>
    {!range && <div className="swim-times-period"><label>Från<input type="date" value={ownRange.start} max={ownRange.end} onChange={(event) => setOwnRange({ ...ownRange, start: event.target.value })} /></label><label>Till<input type="date" value={ownRange.end} min={ownRange.start} max={today} onChange={(event) => setOwnRange({ ...ownRange, end: event.target.value })} /></label></div>}
    {loading && <p role="status">Hämtar tider…</p>}{error && <p role="alert">{error} <button type="button" className="text-button" onClick={() => setReload((value) => value + 1)}>Försök igen</button></p>}{status && <p role="status" className="swim-times-status">{status}</p>}{limited && <p>Historiken är begränsad. Välj en kortare period för ett fullständigare underlag.</p>}
    {editor && !readOnly && <form className="swim-time-editor" ref={editorRef} onSubmit={save}><h3>{editor.id ? 'Ändra träningstid' : 'Registrera en tid'}</h3><fieldset disabled={busy}><div className="swim-time-fields">
      <label>Datum<input type="date" required max={today} value={editor.date} onChange={(event) => change('date', event.target.value)} /></label>
      <label>Distans (meter)<input type="number" min="1" max="10000" step="1" required value={editor.distance} onChange={(event) => change('distance', event.target.value)} /></label>
      {selectField('stroke', 'Simsätt', TIME_STROKES)}{selectField('poolLength', 'Bassäng', { 25: '25 meter', 50: '50 meter' })}
      <label>Tid<input name="time" type="text" inputMode="text" required maxLength={12} value={editor.time} placeholder="t.ex. 1:08,42" onChange={(event) => change('time', event.target.value)} /></label>
      {selectField('kind', 'Typ av tid', { training: 'Träningstid', test: 'Testlopp' })}{selectField('startType', 'Start', TIME_STARTS)}{selectField('exercise', 'Utförande', TIME_EXERCISES)}{selectField('timingMethod', 'Tidtagning', TIME_METHODS)}</div>
      <div className="swim-time-equipment"><strong>Hjälpmedel</strong><span>Inget markerat betyder utan hjälpmedel.</span><div>{Object.entries(TIME_EQUIPMENT).map(([value, title]) => <label key={value}><input type="checkbox" checked={editor.equipment.includes(value)} onChange={(event) => change('equipment', event.target.checked ? [...editor.equipment, value].sort() : editor.equipment.filter((item) => item !== value))} />{title}</label>)}</div></div>
      {!coachView && <label>Koppla till ett genomfört simpass (valfritt)<select value={editor.entryKey} onChange={(event) => change('entryKey', event.target.value)}><option value="">Fristående tidsregistrering</option>{entries.filter((entry) => entry.date === editor.date && entry.type === 'swim' && entry.state === 'completed').map((entry) => <option key={entry.key} value={entry.key}>{entry.title || 'Simpass'} · {entry.slot === 'morning_swim' ? 'Morgon' : entry.slot === 'afternoon_swim' ? 'Eftermiddag / kväll' : 'Tid ej angiven'}</option>)}</select></label>}
      {coachView && editor.entryKey && <p className="swim-times-help">Kopplingen till simmarens genomförda pass behålls. <button type="button" className="text-button" onClick={() => change('entryKey', '')}>Koppla loss från passet</button></p>}
      <label>Extra förutsättningar (valfritt)<input type="text" maxLength={200} value={editor.conditions} onChange={(event) => change('conditions', event.target.value)} placeholder="t.ex. motstånd eller tid från en serie" /></label><label>Kommentar (valfritt)<textarea rows={2} maxLength={1000} value={editor.note} onChange={(event) => change('note', event.target.value)} placeholder="Det här vill jag komma ihåg om genomförandet…" /></label><p className="swim-times-help">Håll kommentaren till träningen och genomförandet.</p>
      {formError && <p role="alert" className="form-error">{formError}</p>}<div className="swim-time-actions"><button type="submit" className="primary-button" disabled={busy}>{busy ? 'Sparar…' : 'Spara tid'}</button><button type="button" className="secondary-button" onClick={closeEditor} disabled={busy}>Avbryt</button></div></fieldset></form>}
    {!loading && !error && <>{group ? <><label className="swim-time-series">Jämför samma förutsättningar<select value={group.key} onChange={(event) => setSelected(event.target.value)}>{groups.map((item) => <option key={item.key} value={item.key}>{item.description} · {item.items.length} tider</option>)}</select></label><p className="swim-time-best"><strong>Bästa egna tid i vald period: {formatTrainingTime(group.best)}</strong><span>{group.description}</span></p><TimeProgress group={group} /></> : <p>Inga egna tider i den valda perioden.</p>}
      <details className="swim-time-history" open={visibleTimes.length > 0 && visibleTimes.length < 6}><summary>Alla egna tider i perioden ({visibleTimes.length})</summary><ul>{visibleTimes.map((row) => <li key={row.id}><div><strong>{formatTrainingTime(row.result_time)} · {row.distance_meters} m {TIME_STROKES[row.stroke]}</strong><small>{dateLabel(row.result_date)} · {row.kind === 'test' ? 'Testlopp' : 'Träningstid'} · Manuellt registrerat</small><p>{swimTimeDescription(row)}</p>{row.entry_key && <small>Kopplad till ett simpass i dagboken</small>}{row.note && <p className="swim-time-note">{row.note}</p>}</div>{!readOnly && <div className="swim-time-actions"><button type="button" className="text-button" disabled={busy} onClick={() => openEditor(row)}>Ändra</button>{!coachView && <button type="button" className="text-button danger-text" disabled={busy} onClick={() => remove(row)}>Ta bort</button>}</div>}</li>)}</ul></details></>}
  </section>
}
