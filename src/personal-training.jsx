import React, { useEffect, useRef, useState } from 'react'
import { apiRequest } from './api-request.js'
import { PERSONAL_ACTIVITIES, OTHER_SPORTS, PERSONAL_FOCUSES, METER_PRESETS, MINUTE_PRESETS, personalEmoji, personalCheckinDetails, normalizePersonalDetails } from '../shared/personal-training.js'
import './personal-training.css'

const todayKey = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm' }).format(new Date())
const changed = () => window.dispatchEvent(new Event('simkoll-personal-training-changed'))
const choiceFields = details => ({ activityType: details.activityType, trainingOrigin: details.origin, activitySport: details.sport || null, activityFocus: details.focus || null, personalTimeOfDay: details.timeOfDay || null, activityDistanceMeters: details.distanceMeters ?? null, activityMinutes: details.durationMinutes ?? null, workoutReference: null, trainingSlot: null, plannedCompletion: null, registeredActivity: null })
export const selectPersonalPlan = plan => ({ ...choiceFields(plan), personalSessionId: plan.id })

export function usePersonalTraining(code, start, end, enabled = true, request = apiRequest) {
  const [state, setState] = useState({ sessions: [], registered: [], loading: enabled, error: '' }), [revision, setRevision] = useState(0)
  useEffect(() => {
    let active = true
    setState({ sessions: [], registered: [], loading: enabled, error: '' })
    if (!enabled) return
    request(`/api/training?personalSessions=true&start=${start}&end=${end}`, code, { retry: false })
      .then(data => { if (active) setState({ sessions: data.sessions, registered: data.registered || [], loading: false, error: '' }) })
      .catch(error => { if (active) setState({ sessions: [], registered: [], loading: false, error: error.message }) })
    return () => { active = false }
  }, [code, start, end, enabled, request, revision])
  useEffect(() => {
    const refresh = () => setRevision(value => value + 1)
    window.addEventListener('simkoll-personal-training-changed', refresh)
    return () => window.removeEventListener('simkoll-personal-training-changed', refresh)
  }, [])
  return { ...state, refresh: () => setRevision(value => value + 1) }
}

function AmountButtons({ label, value, presets, max, unit, onChange }) {
  const [custom, setCustom] = useState(value != null && !presets.includes(value))
  const id = React.useId()
  return <fieldset className="personal-amount"><legend>{label} <small>frivilligt</small></legend><div className="personal-pills">{presets.map(number => <button type="button" key={number} aria-pressed={value === number && !custom} onClick={() => { setCustom(false); onChange(number) }}>{number.toLocaleString('sv-SE')} {unit}</button>)}<button type="button" aria-pressed={custom} onClick={() => { setCustom(true); onChange(null) }}>Annat</button><button type="button" aria-pressed={value == null && !custom} onClick={() => { setCustom(false); onChange(null) }}>Vet inte</button></div>{custom && <label htmlFor={id}>Ange {unit === 'm' ? 'meter' : 'minuter'}<input id={id} type="number" inputMode="numeric" min="1" max={max} step="1" value={value ?? ''} onChange={event => onChange(event.target.value === '' ? null : Number(event.target.value))} /></label>}</fieldset>
}

export function PersonalTrainingFields({ form, onChange }) {
  return <div className="personal-fields">
    {form.activityType === 'swim' && <><AmountButtons key={`${form.personalSessionId}-meters`} label="Simmeter" unit="m" value={form.activityDistanceMeters} presets={METER_PRESETS} max={50000} onChange={value => onChange({ activityDistanceMeters: value })}/><fieldset><legend>Inriktning <small>frivilligt</small></legend><div className="personal-pills">{PERSONAL_FOCUSES.map(([key, label]) => <button type="button" key={key} aria-pressed={form.activityFocus === key} onClick={() => onChange({ activityFocus: form.activityFocus === key ? null : key })}>{label}</button>)}</div></fieldset></>}
    <AmountButtons key={`${form.personalSessionId}-minutes`} label="Träningstid" unit="min" value={form.activityMinutes} presets={MINUTE_PRESETS} max={1440} onChange={value => onChange({ activityMinutes: value })}/>
    <fieldset><legend>Tid på dagen <small>frivilligt</small></legend><div className="personal-pills">{[['morning','🌅 Morgon'],['afternoon','🌇 Eftermiddag / kväll']].map(([key,label]) => <button type="button" key={key} aria-pressed={form.personalTimeOfDay === key} onClick={() => onChange({ personalTimeOfDay: form.personalTimeOfDay === key ? null : key })}>{label}</button>)}</div></fieldset>
  </div>
}

export function PersonalPassPicker({ form, onChange, onContinue, onClub, clubs = [], personalPlans = [], registered = [], plansLoading = false, plansError = '', onReload, allowPersonal = true, planning = false, saving = false }) {
  const [other, setOther] = useState(Boolean(form.activitySport))
  const choose = (type, origin = 'self', sport = null) => onChange({ ...choiceFields({ activityType: type, origin, sport }), personalSessionId: crypto.randomUUID(), registerTraining: form.type === 'after' })
  const selectedPlan = personalPlans.some(plan => plan.id === form.personalSessionId)
  const invalidProgramMinutes = form.activityMinutes != null && (!Number.isInteger(form.activityMinutes) || form.activityMinutes < 1 || form.activityMinutes > 1440)
  let error = ''
  if (form.personalSessionId) { try { personalCheckinDetails(form) } catch (reason) { error = reason.message } }
  return <div className="personal-pass-picker">
    {!!clubs.length && <div className="choice-stack personal-club-choices">{clubs.map(club => <button type="button" className="choice-card choice-card-with-description" key={club.slot} onClick={() => onClub(club)}><span>{club.label}{club.description && <small>{club.description}</small>}</span><span aria-hidden="true">›</span></button>)}</div>}
    {allowPersonal && <>
      {form.type === 'after' && registered.length > 0 && <div className="personal-planned-choices"><p className="personal-label">Redan loggat via ditt program?</p>{registered.map(item => <button type="button" key={item.type} aria-pressed={form.registeredActivity === item.type} onClick={() => onChange({ ...choiceFields({activityType:item.type}), trainingOrigin:null, personalSessionId:null, registeredActivity:item.type, registerTraining:true })}>{item.type === 'strength' ? '🏋️ Styrkepasset från mitt program' : '🤸 Landträningen från mitt program'}<small>Ge återkoppling på samma pass – inget extra pass räknas.</small></button>)}</div>}
      {plansLoading && <small role="status">Hämtar dina egna planerade pass…</small>}
      {plansError && <p className="form-error" role="alert">{plansError} {onReload && <button type="button" className="text-button" onClick={onReload}>Hämta igen</button>}</p>}
      {!!personalPlans.length && <div className="personal-planned-choices"><p className="personal-label">Dina egna pass den här dagen</p>{personalPlans.map(plan => <button type="button" key={plan.id} disabled={plan.completed} aria-pressed={form.personalSessionId === plan.id} onClick={() => { setOther(Boolean(plan.sport)); onChange({ ...selectPersonalPlan(plan), registerTraining: form.type === 'after' }) }}><span>{personalEmoji(plan)} {plan.title}</span><small>{plan.completed ? '✓ Redan rapporterat' : [plan.distanceMeters && `${plan.distanceMeters.toLocaleString('sv-SE')} m`, plan.durationMinutes && `${plan.durationMinutes} min`, 'Planerat'].filter(Boolean).join(' · ')}</small></button>)}</div>}
      <p className="personal-label">{planning ? 'Vilken träning vill du planera?' : clubs.length ? 'Eller välj annan träning' : 'Välj annan träning'}</p>
      <div className="personal-kind-grid">{PERSONAL_ACTIVITIES.map(item => <button type="button" key={item.key} aria-pressed={Boolean(!selectedPlan && form.personalSessionId && form.activityType === item.type && form.trainingOrigin === item.origin)} onClick={() => { setOther(false); choose(item.type, item.origin) }}><span aria-hidden="true">{item.emoji}</span>{item.label}</button>)}<button type="button" aria-expanded={other} onClick={() => { setOther(value => !value) }}><span aria-hidden="true">🚴</span>Övrig träning</button></div>
      {other && <div className="personal-pills personal-sports" aria-label="Övrig träningsform">{OTHER_SPORTS.map(item => <button type="button" key={item.key} aria-pressed={form.activitySport === item.key} onClick={() => choose(item.type, 'self', item.key)}>{item.emoji} {item.label}</button>)}</div>}
      {form.registeredActivity && <section className="personal-selected"><p>Återkopplingen gäller passet du redan loggat i programmet.</p><AmountButtons label="Träningstid" unit="min" value={form.activityMinutes} presets={MINUTE_PRESETS} max={1440} onChange={value => onChange({activityMinutes:value})}/>{invalidProgramMinutes && <p className="form-error" role="alert">Ange hela minuter mellan 1 och 1440, eller välj ”Vet inte”.</p>}<button type="button" className="primary-button" disabled={invalidProgramMinutes} onClick={onContinue}>Fortsätt med samma pass →</button></section>}
      {form.personalSessionId && <section className="personal-selected"><h3>{personalEmoji({ origin: form.trainingOrigin, activityType: form.activityType, sport: form.activitySport })} {personalCheckinTitle(form)}</h3><p>{planning ? 'Ange det du planerar. Det räknas som genomfört först när du rapporterat efteråt.' : form.type === 'before' ? 'Din planering inför passet. Det räknas inte som genomfört ännu.' : personalPlans.some(plan => plan.id === form.personalSessionId) ? 'Bekräfta eller ändra uppgifterna till vad du faktiskt tränade. ”Vet inte” lämnar mängden okänd.' : 'Välj vad du faktiskt tränade. Lämna uppgifter du inte vet obesvarade.'}</p><PersonalTrainingFields form={form} onChange={onChange}/>{error && <p className="form-error" role="alert">{error}</p>}<button type="button" className="primary-button" disabled={saving || Boolean(error)} onClick={onContinue}>{saving ? 'Sparar…' : planning ? 'Spara i min planering' : 'Använd uppgifterna och fortsätt →'}</button></section>}
    </>}
  </div>
}
function personalCheckinTitle(form) {
  try { return personalCheckinDetails(form).title } catch { return 'Ditt pass' }
}

export default function PersonalTrainingPlanner({ code, start, end, request = apiRequest }) {
  const state = usePersonalTraining(code, start, end, true, request)
  const weekSessions = state.sessions.filter(session => session.date >= start && session.date <= end)
  const [editing, setEditing] = useState(false), [form, setForm] = useState({ type: 'before' }), [date, setDate] = useState(todayKey()), [saving, setSaving] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('')
  const busy = useRef(false), alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  const begin = plan => { setForm(plan ? { type: 'before', ...selectPersonalPlan(plan) } : { type: 'before' }); setDate(plan?.date || (start > todayKey() ? start : todayKey())); setEditing(true); setError(''); setMessage('') }
  const save = async () => {
    if (busy.current) return
    busy.current = true; setSaving(true); setError('')
    try {
      const details = normalizePersonalDetails(personalCheckinDetails(form))
      await request('/api/training', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'save-personal-session', id: form.personalSessionId, date, details }) })
      if (alive.current) { setEditing(false); setMessage('Passet finns i din planering. Rapportera samma pass efter träningen.'); changed() }
    } catch (reason) { if (alive.current) setError(reason.message) }
    finally { busy.current = false; if (alive.current) setSaving(false) }
  }
  const remove = async plan => {
    if (busy.current || !window.confirm(`Ta bort det planerade passet ”${plan.title}” den ${plan.date}?`)) return
    busy.current = true; setSaving(true); setError('')
    try {
      await request('/api/training', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete-personal-session', id: plan.id }) })
      if (alive.current) { changed(); setMessage('Det planerade passet är borttaget.') }
    } catch (reason) { if (alive.current) setError(reason.message) }
    finally { busy.current = false; if (alive.current) setSaving(false) }
  }
  return <section className="personal-training-planner" aria-label="NIU och egna träningspass"><header><div><p className="eyebrow">Min egen planering</p><h3>NIU och egna träningspass</h3></div><button type="button" className="secondary-button" disabled={saving} onClick={() => begin(null)}>＋ Planera ett pass</button></header><p>Simning, styrka, landträning och annan träning. Egna pass räknas i din träningsmängd, inte som närvaro på klubbens pass.</p>
    {state.loading && <p role="status">Hämtar egna pass…</p>}{state.error && <p className="form-error" role="alert">{state.error} <button type="button" onClick={state.refresh}>Försök igen</button></p>}
    {!!weekSessions.length && <ul className="personal-plan-list">{weekSessions.map(plan => <li key={plan.id}><div><strong>{personalEmoji(plan)} {plan.title}</strong><small>{plan.date}{plan.timeOfDay ? ` · ${plan.timeOfDay === 'morning' ? 'Morgon' : 'Eftermiddag / kväll'}` : ''} · {plan.completed ? '✓ Genomfört' : 'Planerat'}{plan.focus ? ` · ${PERSONAL_FOCUSES.find(([key]) => key === plan.focus)?.[1] || plan.focus}` : ''}</small><small>{[plan.distanceMeters && `${plan.distanceMeters.toLocaleString('sv-SE')} m`, plan.durationMinutes && `${plan.durationMinutes} min`].filter(Boolean).join(' · ')}{plan.completed ? ' · planerade uppgifter; rapporterad mängd finns i dagboken' : ''}</small></div>{!plan.completed && <div className="personal-plan-actions">{plan.date >= todayKey() && <button type="button" className="text-button" disabled={saving} onClick={() => begin(plan)}>Ändra</button>}<button type="button" className="text-button" disabled={saving} onClick={() => remove(plan)}>Ta bort</button></div>}</li>)}</ul>}
    {editing && <div className="personal-plan-editor"><div className="personal-editor-heading"><h4>Planera eget pass</h4><button type="button" className="text-button" disabled={saving} onClick={() => setEditing(false)}>Stäng ×</button></div><label>Datum<input type="date" min={todayKey()} required value={date} disabled={saving} onChange={event => setDate(event.target.value)}/></label><fieldset disabled={saving}><PersonalPassPicker planning form={form} onChange={patch => setForm(current => ({ ...current, ...patch }))} onContinue={save} saving={saving}/></fieldset></div>}
    {error && <p className="form-error" role="alert">{error}</p>}{message && <p className="personal-save-message" role="status">{message}</p>}
  </section>
}
