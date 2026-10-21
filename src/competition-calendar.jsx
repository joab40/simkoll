import React, { useEffect, useRef, useState } from 'react'
import CompetitionPm, { readCompetitionPm, uploadCompetitionPm } from './competition-pm.jsx'
import './competition-calendar.css'

const groups = { ungdom_orange: 'Ungdom Orange', ungdom_svart: 'Ungdom Svart', junior: 'Junior' }
const newForm = (date) => ({ startDate: date, endDate: date, title: '', category: '', location: '', notes: '', targetGroups: Object.keys(groups) })

export default function CompetitionCalendarView({ code, request, today, renderProgram, onOpenSubmissions }) {
  const [competitions, setCompetitions] = useState([]), [loading, setLoading] = useState(true), [loadError, setLoadError] = useState('')
  const [form, setForm] = useState(() => newForm(today)), [file, setFile] = useState(null), [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false), [formError, setFormError] = useState(''), [message, setMessage] = useState('')
  const [cardBusy, setCardBusy] = useState({}), [cardErrors, setCardErrors] = useState({})
  const busy = useRef(new Set()), savingRef = useRef(false), formRef = useRef(null), fileRef = useRef(null)
  const baseline = useRef(JSON.stringify(newForm(today)))
  const dirty = Boolean(file) || JSON.stringify(form) !== baseline.current
  const replace = (competition) => setCompetitions((current) => [...current.filter((item) => item.id !== competition.id), competition].sort((a, b) => a.startDate.localeCompare(b.startDate)))
  const load = async () => {
    setLoading(true); setLoadError('')
    try { const data = await request('/api/workouts?calendar=true', code); setCompetitions(data.competitions || []) }
    catch (error) { setLoadError(error.message) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [code])
  const reset = () => { const next = newForm(today); baseline.current = JSON.stringify(next); setForm(next); setFile(null); if (fileRef.current) fileRef.current.value = ''; setFormError('') }
  const edit = (competition) => {
    if (savingRef.current) return
    if (dirty && !window.confirm('Lämna det öppna formuläret och redigera den här tävlingen? Osparade ändringar går förlorade.')) return
    baseline.current = JSON.stringify(competition)
    setForm({ ...competition }); setFile(null); if (fileRef.current) fileRef.current.value = ''; setFormError(''); setOpen(true)
    requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }
  const save = async (event) => {
    event.preventDefault()
    if (savingRef.current) return
    if (form.id && busy.current.has(form.id)) return setFormError('Vänta tills den pågående åtgärden för tävlingen är klar innan du sparar.')
    if (!form.targetGroups.length) return setFormError('Välj minst en grupp som tävlingen gäller för.')
    savingRef.current = true; setSaving(true); setFormError(''); setMessage('')
    let saved = null
    try {
      if (file) await readCompetitionPm(file)
      const result = await request('/api/workouts', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'save-competition', ...form }) })
      saved = result.competition; replace(saved)
      if (file) { const uploaded = await uploadCompetitionPm(file, saved.id, code, request); replace(uploaded.competition) }
      setMessage(`✓ ${saved.title} är ${form.id ? 'uppdaterad' : 'sparad'}${file ? ' med bifogat PM' : ''}.`)
      reset(); setOpen(false)
    } catch (error) {
      if (saved) { baseline.current = JSON.stringify(saved); setForm({ ...saved }); setFormError(`Tävlingen är sparad, men PM kunde inte bifogas: ${error.message} Du kan försöka spara igen utan att en ny tävling skapas.`) }
      else setFormError(error.message)
    } finally { savingRef.current = false; setSaving(false) }
  }
  const cardAction = async (competition, action) => {
    if (busy.current.has(competition.id)) return
    if (action === 'delete' && !window.confirm(`Ta bort ${competition.title}? Tävlingen, grenprogrammet, PM och anmälningarna tas bort permanent.`)) return
    busy.current.add(competition.id); setCardBusy((current) => ({ ...current, [competition.id]: action })); setCardErrors((current) => ({ ...current, [competition.id]: '' })); setMessage('')
    try {
      if (action === 'delete') {
        await request(`/api/workouts?calendar=true&id=${encodeURIComponent(competition.id)}`, code, { method: 'DELETE' })
        setCompetitions((current) => current.filter((item) => item.id !== competition.id)); setMessage(`${competition.title} är borttagen.`)
      } else {
        const result = await request('/api/workouts', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'set-competition-entries-open', competitionId: competition.id, open: !competition.entriesOpen }) })
        replace(result.competition)
        setMessage(competition.entriesOpen ? 'Grenanmälan är stängd. Sparade anmälningar finns kvar.' : '✓ Grenanmälan är öppen för simmarna.')
      }
    } catch (error) { setCardErrors((current) => ({ ...current, [competition.id]: error.message })) }
    finally { busy.current.delete(competition.id); setCardBusy((current) => ({ ...current, [competition.id]: '' })) }
  }
  return <section className="competition-calendar competition-calendar-v2">
    <div className="period-heading"><div><p className="eyebrow">Planera & följa upp</p><h1>Tävlingskalender</h1><small>Spara tävlingen, bifoga PM och lägg in grenprogram. Öppna sedan grenanmälan när allt är klart.</small></div><div className="big-count"><strong>{competitions.length}</strong><span>tävlingar</span></div></div>
    {message && <p className="competition-feedback" role="status">{message}</p>}
    <details className="competition-add-card" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}><summary>{form.id ? 'Redigera tävling' : '＋ Lägg till tävling'}</summary>
      <form className="competition-form" onSubmit={save} ref={formRef}><fieldset className="competition-form-fields" disabled={saving}>
        <div className="competition-form-grid"><label>Från<input required type="date" value={form.startDate} onChange={(event) => { const startDate = event.target.value; setForm({ ...form, startDate, endDate: form.endDate < startDate ? startDate : form.endDate }) }} /></label><label>Till<input required type="date" min={form.startDate} value={form.endDate} onChange={(event) => setForm({ ...form, endDate: event.target.value })} /></label><label>Tävlingsnamn<input required maxLength={120} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Ex. Sundsvall Swim" /></label><label>Plats<input maxLength={120} value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} /></label></div>
        <label>Typ av tävling<input maxLength={80} value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} placeholder="Ex. mästerskap eller klubbtävling" /></label>
        <fieldset><legend>Berörda grupper</legend><div className="competition-group-checkboxes">{Object.entries(groups).map(([value, label]) => <label key={value}><input type="checkbox" checked={form.targetGroups.includes(value)} onChange={(event) => setForm({ ...form, targetGroups: event.target.checked ? [...form.targetGroups, value] : form.targetGroups.filter((item) => item !== value) })} />{label}</label>)}</div></fieldset>
        <label>Kommentar<textarea maxLength={500} rows={2} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
        <label>PM (valfritt)<input ref={fileRef} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(event) => setFile(event.target.files?.[0] || null)} /></label><small>PDF eller bild, högst 3 MB. Visas för tränare och simmare i berörda grupper. Du kan också bifoga eller byta PM senare.</small>
        {formError && <p className="form-error" role="alert">{formError}</p>}
        <div className="settings-actions"><button className="primary-button" type="submit" aria-busy={saving}>{saving ? 'Sparar tävling…' : form.id ? 'Spara ändringar' : 'Spara tävling'}</button><button type="button" className="secondary-button" onClick={() => { if (dirty && !window.confirm('Kasta de osparade ändringarna?')) return; reset(); setOpen(false) }}>Avbryt</button></div>
      </fieldset></form>
    </details>
    {loading && <p role="status">Hämtar tävlingar…</p>}
    {loadError && <div role="alert"><p className="form-error">{loadError}</p><button type="button" className="secondary-button" onClick={load}>Försök hämta igen</button></div>}
    <div className="competition-calendar-list">{competitions.map((competition) => <article key={competition.id} className={competition.endDate < today ? 'competition-is-past' : ''}><div>
      <p className="eyebrow">{competition.startDate === competition.endDate ? competition.startDate : `${competition.startDate} – ${competition.endDate}`}</p><h2>{competition.title}</h2><p>{[competition.category, competition.location].filter(Boolean).join(' · ')}</p><small>{competition.targetGroups.map((group) => groups[group] || group).join(' · ')}</small>{competition.notes && <p>{competition.notes}</p>}
      <div className="competition-card-actions"><button type="button" className="secondary-button" disabled={saving || !!cardBusy[competition.id]} onClick={() => edit(competition)}>Redigera tävling</button><button type="button" className={`competition-publish-button${competition.entriesOpen ? ' active' : ''}`} disabled={saving || !!cardBusy[competition.id]} onClick={() => cardAction(competition, 'entries')}>{cardBusy[competition.id] === 'entries' ? 'Sparar anmälningsläge…' : competition.entriesOpen ? '✓ Anmälan öppen · stäng anmälan' : 'Öppna grenanmälan för simmare'}</button>{onOpenSubmissions && <button type="button" className="competition-submissions-button" onClick={() => onOpenSubmissions(competition.id)}>Visa tävlingsanmälningar →</button>}</div>
      {cardErrors[competition.id] && <p className="form-error" role="alert">{cardErrors[competition.id]}</p>}
      <CompetitionPm competition={competition} code={code} request={request} canManage onChanged={replace} disabled={saving || !!cardBusy[competition.id]} onBusyChange={(value) => { if (value) busy.current.add(competition.id); else busy.current.delete(competition.id); setCardBusy((current) => ({ ...current, [competition.id]: value ? 'pm' : '' })) }} />
      {renderProgram(competition)}
    </div><button type="button" className="text-button" disabled={saving || !!cardBusy[competition.id]} onClick={() => cardAction(competition, 'delete')}>{cardBusy[competition.id] === 'delete' ? 'Tar bort…' : 'Ta bort tävling'}</button></article>)}{!loading && !loadError && !competitions.length && <p className="empty">Inga tävlingar inlagda ännu.</p>}</div>
  </section>
}
