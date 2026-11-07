import React, { useEffect, useState } from 'react'
import { apiRequest } from './api-request.js'
import './game-beta.css'

export default function GameBetaSettings({ profile, code, request = apiRequest }) {
  const [open,setOpen] = useState(false), [reload,setReload] = useState(0)
  const [data,setData] = useState(null), [selected,setSelected] = useState([])
  const [loading,setLoading] = useState(false), [saving,setSaving] = useState(false), [error,setError] = useState(''), [message,setMessage] = useState('')
  useEffect(()=>{
    if(!open)return
    let active=true
    setLoading(true);setData(null);setError('');setMessage('')
    request(`/api/points?gameBetaProfileId=${encodeURIComponent(profile.id)}`,code)
      .then(result=>{if(!Array.isArray(result.catalog)||!Array.isArray(result.games)||!Object.hasOwn(result,'revision'))throw new Error('Betaspelen kunde inte läsas. Hämta aktuella val och försök igen.');if(active){setData(result);setSelected(result.games)}})
      .catch(err=>{if(active)setError(err.message||'Betaspelen kunde inte hämtas.')})
      .finally(()=>{if(active)setLoading(false)})
    return ()=>{active=false}
  },[open,reload,profile.id,code,request])
  const save=async()=>{
    if(!data||saving)return
    setSaving(true);setError('');setMessage('')
    try{
      const result=await request('/api/points',code,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'save-game-beta',profileId:profile.id,games:selected,revision:data.revision})})
      setData(current=>({...current,...result}));setSelected(result.games);setMessage('Sparat. Simmaren ser betaspelen vid nästa uppdatering av startsidan.')
    }catch(err){setError(err.message||'Betaspelen kunde inte sparas.')}
    finally{setSaving(false)}
  }
  return <details className="game-beta-settings" onToggle={event=>setOpen(event.currentTarget.open)}>
    <summary>🧪 Betatesta spel{data?.games?.length>0&&<span>{data.games.length} spel</span>}</summary>
    <div className="game-beta-settings-body"><p>Välj spel som {profile.displayName} får testa innan de publiceras för alla. Betatest sparar inga rekord eller spelpoäng och ändrar inte simmarens träningsstatistik.</p>
      {loading?<p role="status">Hämtar betaspel…</p>:data&&<fieldset disabled={saving}><legend>Spel för {profile.displayName}</legend><div className="game-beta-options">{data.catalog.map(game=><label key={game.key}><input type="checkbox" checked={selected.includes(game.key)} onChange={event=>{setMessage('');setSelected(current=>event.target.checked?[...current,game.key]:current.filter(key=>key!==game.key))}}/><span>{game.emoji} {game.title}</span></label>)}</div></fieldset>}
      {error&&<p className="form-error" role="alert">{error}</p>}
      <div className="game-beta-actions"><button type="button" className="secondary-button" disabled={!data||loading||saving} onClick={save}>{saving?'Sparar…':'Spara betaspel'}</button>{error&&<button type="button" className="text-button" disabled={loading||saving} onClick={()=>setReload(value=>value+1)}>Hämta aktuella val</button>}</div>
      {message&&<p role="status" className="settings-saved">{message}</p>}<small>Avmarkera och spara för att återkalla betatest. Vanligt publicerade spel påverkas inte. Betatest är inte samma sak som testprofil.</small>
    </div>
  </details>
}

export function GameBetaList({ games = [], onPlay }) {
  if(!games.length)return null
  return <section className="game-beta-list"><div><p className="eyebrow">Bara för dig · betatest</p><h2>Prova nya spel 🧪</h2><p>Tränaren har gett dig förhandstillgång. Här sparas inga rekord eller poäng.</p></div><div className="game-beta-play">{games.map(game=><button key={game.key} type="button" className="secondary-button" onClick={()=>onPlay(game.key)}>{game.emoji} {game.title} <span>Testa →</span></button>)}</div></section>
}
