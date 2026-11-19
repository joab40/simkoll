import React, { useEffect, useRef, useState } from 'react'

const amount = (value,unit) => value == null ? null : `${Number(value).toLocaleString('sv-SE')} ${unit}`
export default function DiaryWorkoutChoice({entry,code,request,onSaved,onDirty}) {
  const [open,setOpen]=useState(false),[options,setOptions]=useState([]),[selected,setSelected]=useState(''),[confirmed,setConfirmed]=useState(false)
  const [loading,setLoading]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState(''),[retry,setRetry]=useState(0),[saved,setSaved]=useState(false)
  const busy=useRef(false),alive=useRef(true)
  useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[])
  useEffect(()=>{onDirty?.(`${entry.key}:choice`,Boolean(selected&&!saved));return()=>onDirty?.(`${entry.key}:choice`,false)},[entry.key,selected,saved])
  useEffect(()=>{
    if(!open)return
    let active=true
    setLoading(true);setError('')
    request(`/api/training?diaryChoices=true&date=${entry.date}&slot=${entry.slot}`,code,{retry:false})
      .then(data=>{if(active)setOptions(data.options)})
      .catch(reason=>{if(active)setError(reason.message)})
      .finally(()=>{if(active)setLoading(false)})
    return()=>{active=false}
  },[open,entry.date,entry.slot,code,request,retry])
  const save=async()=>{
    if(busy.current||!selected||!confirmed)return
    busy.current=true;setSaving(true);setError('')
    let persisted=false
    try{
      await request('/api/training',code,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'diary-workout-choice',date:entry.date,slot:entry.slot,workoutReference:selected})})
      persisted=true
      if(alive.current)setSaved(true)
      window.dispatchEvent(new Event('simkoll-personal-training-changed'))
      await onSaved?.()
    }catch(reason){if(alive.current)setError(persisted?'Passvalet är sparat, men dagboken kunde inte uppdateras. Öppna dagboken igen.':reason.message)}
    finally{busy.current=false;if(alive.current)setSaving(false)}
  }
  if(!open)return <button type="button" className="secondary-button diary-choice-open" onClick={()=>setOpen(true)}>Välj pass i efterhand →</button>
  const times=[...new Set(options.map(option=>option.time||''))].sort()
  return <section className="diary-workout-choice" aria-label="Välj pass i efterhand"><header><h3>Vilket upplägg tränade du?</h3><button type="button" className="text-button" disabled={saving} onClick={()=>{setOpen(false);setSelected('');setConfirmed(false)}}>Stäng ×</button></header><p>{entry.date} · {entry.slot==='morning_swim'?'Morgon':'Eftermiddag / kväll'}. Välj ett upplägg. Alternativen läggs inte ihop.</p>
    {loading?<p role="status">Hämtar dagens passalternativ…</p>:<>{times.map(time=><fieldset key={time||'unknown'} disabled={saving||saved}><legend>{time?`Kl. ${time}`:'Starttid saknas'}</legend><div className="diary-choice-options">{options.filter(option=>(option.time||'')===time).map(option=><button type="button" key={option.workoutReference} aria-pressed={selected===option.workoutReference} onClick={()=>{setSelected(option.workoutReference);setConfirmed(false);setError('')}}><strong>{option.title}</strong><small>{[amount(option.distanceMeters,'m'),amount(option.durationMinutes,'min'),option.location].filter(Boolean).join(' · ')}</small></button>)}</div></fieldset>)}{!options.length&&!error&&<p>Inga tillgängliga pass hittades för din grupp och den här tiden på dagen.</p>}
    {!!options.length&&<><p>Planerade meter och minuter visas som en uppskattning. Egna rapporterade mängder, RPE och övriga svar ändras inte. Själva passvalet ger ingen bonus och räknas inte som ett extra pass.</p><label className="diary-choice-confirm"><input type="checkbox" checked={confirmed} disabled={!selected||saving||saved} onChange={event=>setConfirmed(event.target.checked)}/><span>Jag tränade det valda upplägget.</span></label><button type="button" className="primary-button" disabled={!selected||!confirmed||saving||saved} onClick={save}>{saving?'Sparar…':saved?'Passval sparat ✓':'Spara passval'}</button></>}</>}
    {error&&<div role="alert"><p className="form-error">{error}</p>{!saving&&!saved&&<button type="button" className="text-button" onClick={()=>{setSelected('');setConfirmed(false);setRetry(value=>value+1)}}>Hämta alternativen igen</button>}</div>}
  </section>
}
