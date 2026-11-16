import React, { useEffect, useRef, useState } from 'react'
import { apiRequest } from './api-request.js'
import RewardLevelCard from './reward-level-card.jsx'
import './reward-art-studio.css'
import { emptyRewardSelection, sameRewardSelection, savedRewardCombination, usableRewardSelection, rewardSelectionArtwork } from '../shared/reward-card-library.js'
import { REWARD_ART_STYLES } from '../shared/reward-art-styles.js'
import { rewardEmojiColours } from '../shared/reward-emoji-colours.js'

const styles = Object.fromEntries(Object.entries(REWARD_ART_STYLES).map(([id, value]) => [id, value.label]))
const dateLabel = value => new Date(value).toLocaleDateString('sv-SE', { day:'numeric', month:'short', year:'numeric', timeZone:'Europe/Stockholm' })

function LevelWorkbench({ level, levels, code, request, onSaved, onBusy, canGenerate }) {
  const [library, setLibrary] = useState(null), [selection, setSelection] = useState(emptyRewardSelection)
  const [kind, setKind] = useState('background'), [style, setStyle] = useState('aurora'), [confirmed, setConfirmed] = useState(false)
  const [preserveEmojiColours, setPreserveEmojiColours] = useState(true)
  const [name, setName] = useState(''), [busy, setBusy] = useState('loading'), [error, setError] = useState(''), [message, setMessage] = useState(''), [needsRefresh, setNeedsRefresh] = useState(false)
  const pending = useRef(false), alive = useRef(true), abort = useRef(null), saveRequest = useRef(null)
  const call = body => request('/api/points', code, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body), signal:abort.current?.signal })
  const fetchLibrary = async (preserve = false) => {
    const next = await request(`/api/points?artLibrary=true&levelId=${level.id}`, code, { signal:abort.current?.signal })
    if (!alive.current) return next
    setLibrary(next); setNeedsRefresh(false)
    if (!preserve) { setSelection(usableRewardSelection(next.assets, next.active)); setName(''); saveRequest.current = null }
    return next
  }
  useEffect(() => {
    alive.current = true; const controller = new AbortController(); abort.current = controller; onBusy(true)
    fetchLibrary().catch(failure => { if (alive.current && !controller.signal.aborted) { setError(failure.message); setNeedsRefresh(true) } }).finally(() => { if (alive.current && !controller.signal.aborted) { setBusy(''); onBusy(false) } })
    return () => { alive.current = false; controller.abort(); abort.current?.abort(); onBusy(false) }
  }, [])
  const run = async (mode, task) => {
    if (pending.current) return
    pending.current = true; abort.current = new AbortController(); setBusy(mode); onBusy(true); setError(''); setMessage('')
    try { await task() }
    catch (failure) { if (alive.current) { setError(failure.message); setNeedsRefresh(true); setConfirmed(false) } }
    finally { pending.current = false; if (alive.current) { setBusy(''); onBusy(false) } }
  }
  const select = value => { setSelection(value); setMessage(''); saveRequest.current = null }
  const refresh = () => run('loading', async () => { await fetchLibrary(); if (alive.current) setMessage('Biblioteket är uppdaterat. Den aktiva kombinationen visas.') })
  const generate = () => {
    if (!canGenerate || !confirmed || !library || needsRefresh) return
    void run('generating', async () => {
      const result = await call({action:'generate-level-art', levelId:level.id, kind, style, confirmed:true, ...(kind === 'emblem' ? {preserveEmojiColours} : {})})
      if (!alive.current) return
      const next = await fetchLibrary(true)
      if (!alive.current) return
      const generated = next.assets.find(asset => asset.id === result.asset.id && asset.compatible)
      if (!generated) throw new Error('Bilden skapades men matchar inte nivåns aktuella emoji. Hämta biblioteket igen.')
      setSelection(current => ({...current, [`${kind}Id`]:generated.id})); saveRequest.current = null; setConfirmed(false)
      setMessage('Bilden är sparad i biblioteket och vald i förhandsgranskningen. Ditt andra bildval är kvar. Ingenting har aktiverats.')
    })
  }
  const saveCard = event => {
    event.preventDefault()
    if (!library || needsRefresh || !name.trim() || name.trim().length > 60 || savedRewardCombination(library.cards, name, selection)) return
    const fingerprint = JSON.stringify([level.id, library.level.emoji, selection, name.trim()])
    if (saveRequest.current?.fingerprint !== fingerprint) saveRequest.current = {fingerprint, id:crypto.randomUUID()}
    void run('saving', async () => {
      const result = await call({action:'save-level-card', levelId:level.id, sourceEmoji:library.level.emoji, ...selection, name:name.trim(), cardId:saveRequest.current.id})
      if (!alive.current) return
      await fetchLibrary(true)
      if (alive.current) { setMessage(result.message); setName(''); saveRequest.current = null }
    })
  }
  const activate = () => {
    if (!library || needsRefresh) return
    void run('activating', async () => {
      const result = await call({action:'publish-level-card', levelId:level.id, sourceEmoji:library.level.emoji, ...selection, expectedBackgroundId:library.active.backgroundId, expectedEmblemId:library.active.emblemId, confirmed:true})
      if (!alive.current) return
      await fetchLibrary(true); await onSaved()
      if (alive.current) setMessage(result.message)
    })
  }
  const locked = !!busy || needsRefresh, assets = library?.assets || [], dirty = library && !sameRewardSelection(selection, library.active)
  const alreadySaved = library && savedRewardCombination(library.cards, name, selection)
  const selectedArtwork = rewardSelectionArtwork(assets, selection)
  const keepColours = kind === 'emblem' && preserveEmojiColours
  const emojiColours = rewardEmojiColours(library?.level.emoji || level.emoji)
  const palette = keepColours ? emojiColours.colours : REWARD_ART_STYLES[style].colours
  const preview = { total:level.minPoints, current:{...level, ...library?.level, artwork:selectedArtwork}, next:levels.find(row => row.minPoints > level.minPoints) || null }
  return <div className="reward-workbench">
    <div className="reward-library-toolbar"><p>Bakgrunder delas mellan alla nivåer. Emblem och sparade kort hör till vald nivå. Blanda utan nya AI-anrop.</p><button type="button" disabled={!!busy} onClick={refresh}>Hämta biblioteket igen</button></div>
    {error && <p role="alert" className="form-error">{error}</p>}{message && <p role="status" className="reward-library-message">{message}</p>}
    {!library && <p role="status">{busy ? 'Hämtar bilder och sparade kort…' : 'Biblioteket kunde inte hämtas. Försök igen med knappen ovan.'}</p>}
    {library && <>
      <div className="reward-library-columns">{['background','emblem'].map(type => <section key={type} aria-label={type === 'background' ? 'Gemensamma bakgrunder' : 'Nivåns emblem'}><h4>{type === 'background' ? 'Gemensamma bakgrunder' : 'Nivåns emblem'} <small>{assets.filter(asset => asset.kind === type).length}</small></h4>
        <div className="reward-asset-grid"><button type="button" disabled={locked} aria-pressed={selection[`${type}Id`] === null} onClick={() => select({...selection,[`${type}Id`]:null})} className="reward-asset-tile"><span className="reward-asset-original" aria-hidden="true">{type === 'background' ? '≈' : library.level.emoji}</span><strong>{type === 'background' ? 'Standardbakgrund' : 'Originalemoji'}</strong></button>
          {assets.filter(asset => asset.kind === type).map(asset => <button type="button" key={asset.id} disabled={locked || !asset.compatible} aria-pressed={selection[`${type}Id`] === asset.id} aria-label={`${type === 'background' ? 'Välj bakgrund' : 'Välj emblem'} · ${styles[asset.style] || 'Bild'} · ${dateLabel(asset.createdAt)} · ${asset.id.slice(0,8)}`} onClick={() => select({...selection,[`${type}Id`]:asset.id})} className={`reward-asset-tile ${asset.compatible ? '' : 'incompatible'}`}>
            {asset.url ? <img src={asset.url} alt="" loading="lazy" /> : <span className="reward-asset-original">?</span>}<strong>{styles[asset.style] || 'Bild'}</strong><small>{asset.compatible ? dateLabel(asset.createdAt) : 'Äldre emoji / otillgänglig'}</small>{library.active[`${type}Id`] === asset.id && <em>Aktiv</em>}
          </button>)}</div>
      </section>)}</div>
      <div className="reward-composition-layout"><section className="reward-composition-preview" aria-label="Förhandsgranskning av kombination"><div className="reward-preview-heading"><h4>Din kombination</h4><span>{dirty ? 'Endast förhandsgranskning' : 'Aktiv för nivån'}</span></div><div className="swimmer-hero-slide"><RewardLevelCard points={preview} featured onCommunity={() => {}} /></div><p className="reward-preview-help">Exempelpoäng för nivån. Simmarens egna poäng och framsteg visas när kortet används.</p></section>
        <section className="reward-composition-save"><h4>Spara eller aktivera</h4><p>Spara en favorit och fortsätt testa. Först när du aktiverar ändras nivån för simmarna.</p><form onSubmit={saveCard}><label>Kortets namn<input value={name} maxLength={60} required disabled={locked} placeholder="Exempel: Kosmisk kristall" onChange={event => { setName(event.target.value); saveRequest.current = null }} /></label><button type="submit" disabled={locked || !name.trim() || alreadySaved}>{busy === 'saving' ? 'Sparar…' : 'Spara kortkombination'}</button>{alreadySaved && <small>Den här kombinationen är redan sparad med detta namn. Byt namn eller välj andra bilder för att spara en ny variant.</small>}</form><button type="button" className="primary-button reward-activate-combination" disabled={locked || !dirty} onClick={activate}>{busy === 'activating' ? 'Aktiverar…' : 'Aktivera kombinationen för nivån'}</button><button type="button" className="reward-current-combination" disabled={locked} onClick={() => select(usableRewardSelection(assets, library.active))}>Visa aktiv kombination</button><small>Bakgrund och emblem aktiveras tillsammans. Ingen bildgenerering sker här.</small></section>
      </div>
      <section className="reward-saved-cards" aria-label="Sparade kort"><h4>Sparade kort <small>{library.cards.length}</small></h4>{library.cards.length === 0 ? <p>Inga sparade kombinationer ännu. Ge ditt första kort ett namn ovan.</p> : <div className="reward-saved-card-grid">{library.cards.map(card => {
        const art = rewardSelectionArtwork(assets, card), active = sameRewardSelection(card, library.active), selected = sameRewardSelection(card, selection)
        return <button type="button" className="reward-saved-card" key={card.id} disabled={locked || !card.compatible} aria-pressed={selected && card.compatible} onClick={() => { select({backgroundId:card.backgroundId,emblemId:card.emblemId}); setName(`${card.name}`) }} aria-label={`Förhandsgranska ${card.name}`}><span className="reward-card-mini" aria-hidden="true">{art.backgroundUrl && <img className="reward-card-mini-bg" src={art.backgroundUrl} alt="" loading="lazy" />}<span>{art.emblemUrl ? <img src={art.emblemUrl} alt="" loading="lazy" /> : card.emoji}</span></span><strong>{card.name}</strong><small>{!card.compatible ? 'Annan emoji / otillgänglig bild' : active ? 'Aktiv kombination' : 'Visa kombination'}</small></button>
      })}</div>}</section>
      {canGenerate ? <details className="reward-generate-panel"><summary>✨ Skapa fler bilder med AI · superadmin</summary><p>Du behöver inte generera om för att blanda bibliotekets bilder. Nya bildförslag sparas automatiskt, utan att den aktiva kombinationen ändras.</p><div className="reward-art-controls"><label>Skapa<select disabled={locked} value={kind} onChange={event => { setKind(event.target.value); setConfirmed(false) }}><option value="background">Bakgrund</option><option value="emblem">Illustrerad emoji</option></select></label><label>Bildstil<select disabled={locked} value={style} onChange={event => { setStyle(event.target.value); setConfirmed(false) }}>{Object.entries(styles).map(([id,label]) => <option key={id} value={id}>{label}</option>)}</select></label></div>
        {kind === 'emblem' && <label className="reward-colour-lock"><input type="checkbox" disabled={locked} checked={preserveEmojiColours} onChange={event => { setPreserveEmojiColours(event.target.checked); setConfirmed(false) }} /><span><strong>Behåll emojins originalfärger</strong><small>Stilen ändrar material och uttryck, inte grundfärgen. En röd diamant ska fortsatt vara röd. Avmarkera om du vill använda stilens färgpalett.</small></span></label>}
        <div className="reward-style-description" aria-live="polite"><span className="reward-style-palette" aria-hidden="true">{palette.length ? palette.map(colour => <i key={colour} style={{backgroundColor:colour}} />) : <b>{library.level.emoji}</b>}</span><div><strong>{styles[style]}{keepColours ? ` · färglås: ${emojiColours.label}` : ''}</strong><p>{keepColours ? REWARD_ART_STYLES[style].emblemDescription : REWARD_ART_STYLES[style].description}</p><small>{keepColours ? 'Originalfärger prioriteras före stilens färgpalett. Färgprovet är vägledande, inte en genererad bild.' : 'Stilens färgpalett – inte en genererad bild.'} Anpassas till {kind === 'background' ? 'en lugn bakgrund med plats för kortets text' : 'ett fristående emblem med transparent bakgrund'}.</small></div></div>
        <label className="reward-art-consent"><input type="checkbox" disabled={locked} checked={confirmed} onChange={event => setConfirmed(event.target.checked)} /><span>Skicka nivåns emoji och vald stil till OpenAI för en ny bild. Det kostar enligt klubbens API-avtal och loggas. Inga simmaruppgifter eller kortnamn skickas. Befintliga bilder återanvänds utan nya AI-anrop.</span></label><div className="reward-art-actions"><button type="button" className="primary-button" disabled={locked || !confirmed} onClick={generate}>{busy === 'generating' ? 'Skapar bild… håll sidan öppen' : '✨ Skapa nytt bildförslag med AI'}</button></div><small>Max 50 bildförsök per superadmin under rullande 24 timmar, en bild i taget per nivå. Även misslyckade försök räknas. Klubbens AI-budget gäller fortfarande. Sparande och bildval använder inte kvoten.</small>
      </details> : <p className="reward-preview-help">Endast superadmin kan generera nya bilder med AI. Du kan fortfarande blanda, spara och aktivera befintliga bilder.</p>}
    </>}
  </div>
}

export default function RewardArtStudio({ levels, code, onSaved, request = apiRequest, accountRole }) {
  const [levelId, setLevelId] = useState(''), [busy, setBusy] = useState(false)
  const level = levels.find(row => String(row.id) === levelId) || levels[0]
  if (!level) return null
  return <section className="reward-art-studio"><p className="eyebrow">Nivåverkstaden · huvudtränare & superadmin</p><h3>Bygg, blanda och spara dina nivåkort</h3><p>Välj en bakgrund och ett emblem från biblioteket. Prova kombinationer, spara favoriter och aktivera hela kortet när du är nöjd.</p><label className="reward-studio-level">Nivå<select value={level.id} disabled={busy} onChange={event => setLevelId(event.target.value)}>{levels.map(row => <option value={row.id} key={row.id}>{row.emoji} {row.name}</option>)}</select></label><LevelWorkbench key={`${code}:${level.id}:${level.emoji}`} level={level} levels={levels} code={code} request={request} onSaved={onSaved} onBusy={setBusy} canGenerate={accountRole === 'superadmin'} /></section>
}
