import React, { useRef, useState } from 'react'
import { apiRequest } from './api-request.js'
import RewardLevelCard from './reward-level-card.jsx'
import './reward-art-studio.css'

export default function RewardArtStudio({ levels, code, onSaved, request = apiRequest }) {
  const [levelId, setLevelId] = useState(''), [kind, setKind] = useState('background'), [style, setStyle] = useState('aurora')
  const [asset, setAsset] = useState(null), [confirmed, setConfirmed] = useState(false), [busy, setBusy] = useState(''), [error, setError] = useState(''), [message, setMessage] = useState('')
  const pending = useRef(false), level = levels.find(row => String(row.id) === levelId) || levels[0]
  if (!level) return null
  const change = update => { update(); setAsset(null); setConfirmed(false); setError(''); setMessage('') }
  const call = body => request('/api/points', code, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) })
  const generate = async () => {
    if (pending.current || !confirmed) return
    pending.current = true; setBusy('generating'); setError(''); setMessage(''); setAsset(null)
    try { const result = await call({action:'generate-level-art', levelId:level.id, kind, style, confirmed:true}); setAsset(result.asset); setMessage('Förslaget är klart. Granska kortet nedan innan du aktiverar bilden.') }
    catch (failure) { setError(failure.message) }
    finally { pending.current = false; setBusy(''); setConfirmed(false) }
  }
  const publish = async assetId => {
    if (pending.current) return
    pending.current = true; setBusy('saving'); setError(''); setMessage('')
    try { await call({action:'publish-level-art', levelId:level.id, kind, assetId}); await onSaved(); setAsset(null); setMessage(assetId ? 'Bilden är aktiverad för nivån. Simmarna ser den när nivåkortet hämtas på nytt.' : 'Originalutseendet är återställt. Inga poäng har ändrats.') }
    catch (failure) { setError(failure.message) }
    finally { pending.current = false; setBusy('') }
  }
  const preview = {total:level.minPoints, current:{...level, artwork:{...level.artwork, ...(asset?.emoji === level.emoji ? {[`${asset.kind}Url`]:asset.url} : {})}}, next:levels.find(row => row.minPoints > level.minPoints) || null}
  return <section className="reward-art-studio"><div><p className="eyebrow">Nivåverkstaden · huvudtränare & superadmin</p><h3>Ge nivån ett eget universum</h3><p>Skapa en bakgrund eller en illustrerad version av emojin. Simkoll animerar bilden med mjuk rörelse, ljus och partiklar – ingen video behöver laddas.</p></div>
    <div className="reward-art-controls"><label>Nivå<select disabled={!!busy} value={level.id} onChange={event => change(() => setLevelId(event.target.value))}>{levels.map(row => <option key={row.id} value={row.id}>{row.emoji} {row.name}</option>)}</select></label><label>Skapa<select disabled={!!busy} value={kind} onChange={event => change(() => setKind(event.target.value))}><option value="background">Bakgrund</option><option value="emblem">Illustrerad emoji</option></select></label><label>Bildstil<select disabled={!!busy} value={style} onChange={event => change(() => setStyle(event.target.value))}><option value="aurora">Norrsken & kristaller</option><option value="pool">Pool & ljusvågor</option><option value="cosmic">Kosmisk energi</option></select></label></div>
    <label className="reward-art-consent"><input type="checkbox" disabled={!!busy} checked={confirmed} onChange={event => setConfirmed(event.target.checked)} /><span>Skicka nivåns emoji och vald stil till OpenAI för en bild. Det kostar enligt klubbens API-avtal och loggas med tokenanvändning. Inga simmaruppgifter skickas. Bilden delas av nivån och återanvänds utan nya AI-anrop.</span></label>
    <div className="reward-art-actions"><button type="button" className="primary-button" disabled={!!busy || !confirmed} onClick={generate}>{busy === 'generating' ? 'Skapar bild… kan ta upp till 3 minuter' : '✨ Skapa bildförslag med AI'}</button>{level.artwork?.[`${kind}Url`] && <button type="button" disabled={!!busy} onClick={() => publish(null)}>Använd originalutseende</button>}</div>
    {error && <p role="alert" className="form-error">{error}</p>}{message && <p role="status">{message}</p>}
    <details className="reward-art-preview" open={asset ? true : undefined}><summary>{asset ? 'Granska AI-förslaget · inte aktiverat ännu' : 'Förhandsgranska nivåkortet'}</summary><div className="swimmer-hero-slide"><RewardLevelCard key={`${level.id}:${asset?.id || 'saved'}`} points={preview} featured onCommunity={() => {}} /></div>{asset && <div className="reward-art-actions"><button type="button" className="primary-button" disabled={!!busy || asset.emoji !== level.emoji} onClick={() => publish(asset.id)}>Aktivera {kind === 'background' ? 'bakgrunden' : 'emblemet'} för nivån</button><button type="button" disabled={!!busy} onClick={() => setAsset(null)}>Behåll nuvarande utseende</button></div>}</details>
    <small>Max 12 bildförsök per administratör och dygn. En bild i taget per nivå. Genererade bilder är generisk, offentligt åtkomlig nivåkonst. Ändrad emoji kräver ett nytt bildförslag. Rörelser kan pausas på simmarens kort.</small>
  </section>
}
