import React, { useEffect, useRef, useState } from 'react'
import { apiRequest } from './api-request.js'
import { prepareGoalVideo, uploadGoalVideo } from './goal-video-upload.js'
import './goal-video.css'

export function GoalVideoPicker({ attachment, onChange, disabled = false, onBusyChange = () => {} }) {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [url, setUrl] = useState('')
  const active = useRef(true), running = useRef(false)
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  useEffect(() => { if (!attachment?.file) { setUrl(''); return }; const value = URL.createObjectURL(attachment.file); setUrl(value); return () => URL.revokeObjectURL(value) }, [attachment?.file])
  const choose = async (event) => {
    const file = event.target.files?.[0]; event.target.value = ''
    if (!file || disabled || running.current) return
    running.current = true; setBusy(true); onBusyChange(true); setMessage('Kontrollerar videon och skapar en förhandsbild…')
    try {
      const selected = await prepareGoalVideo(file)
      if (active.current) { onChange(selected); setMessage('Videon är vald. Den laddas upp först när du sparar.') }
    } catch (error) { if (active.current) setMessage(error.message) }
    finally { running.current = false; if (active.current) { setBusy(false); onBusyChange(false) } }
  }
  return <div className="goal-video-picker"><label className={`exercise-image-upload${disabled || busy ? ' is-disabled' : ''}`}>🎬 {attachment ? 'Byt vald video' : 'Bifoga video'}<input type="file" accept=".mp4,.mov,video/mp4,video/quicktime" disabled={disabled || busy} onChange={choose} /></label><small>Högst 30 sekunder och 25 MB. MP4 eller MOV. Originalets bildkvalitet och bildfrekvens behålls. MP4/H.264 ger bäst stöd på olika enheter.</small>
    {attachment && url && <figure className="goal-video-preview"><video controls playsInline preload="metadata" src={url} poster={attachment.posterData || undefined} /><figcaption>{Math.ceil(attachment.info.seconds)} sekunder · {(attachment.file.size / 1000000).toLocaleString('sv-SE', { maximumFractionDigits: 1 })} MB · {['hvc1', 'hev1'].includes(attachment.info.codec) ? 'HEVC · uppspelning beror på enheten' : 'H.264'}</figcaption><button type="button" className="text-button" disabled={disabled || busy} onClick={() => { onChange(null); setMessage('Vald video har tagits bort.') }}>Ta bort vald video</button></figure>}
    {message && <p role="status">{message}</p>}
  </div>
}

export function GoalVideoPlayer({ goal, code, request = apiRequest }) {
  const [url, setUrl] = useState(''), [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [rate, setRate] = useState('1')
  const video = useRef(null), active = useRef(true), running = useRef(false), controller = useRef(null)
  useEffect(() => { active.current = true; return () => { active.current = false; controller.current?.abort() } }, [])
  useEffect(() => { setUrl(''); setMessage(''); setRate('1') }, [goal.id, goal.videoVersion])
  if (!goal.hasVideo) return null
  const open = async () => {
    if (running.current) return
    running.current = true; setBusy(true); setMessage('')
    controller.current = new AbortController()
    try { const result = await request(`/api/goals?video=true&goalId=${encodeURIComponent(goal.id)}`, code, { signal: controller.current.signal }); if (typeof result.url !== 'string' || !result.url) throw new Error('Videolänken kunde inte hämtas. Försök igen.'); if (active.current) setUrl(result.url) }
    catch (error) { if (active.current && error.name !== 'AbortError') setMessage(error.message) }
    finally { running.current = false; if (active.current) setBusy(false) }
  }
  const fullscreen = async () => { try { if (video.current?.requestFullscreen) await video.current.requestFullscreen(); else if (video.current?.webkitEnterFullscreen) video.current.webkitEnterFullscreen(); else setMessage('Använd helskärmsknappen i videospelaren.') } catch { setMessage('Använd helskärmsknappen i videospelaren.') } }
  return <figure className="goal-video-player"><figcaption><strong>Teknikklipp från tränaren</strong><span>{Math.ceil(goal.videoDurationMs / 1000)} sekunder · privat på ditt utvecklingsmål</span></figcaption>
    {!url ? <button type="button" className="goal-video-open" onClick={open} disabled={busy} aria-label={`Spela upp video för ${goal.title}`}>{goal.videoPosterUrl && <img src={goal.videoPosterUrl} alt="Förhandsbild av teknikklippet" loading="lazy" onError={(event) => { event.currentTarget.hidden = true }} />}<span>{busy ? 'Öppnar videon…' : '▶ Spela upp video'}</span></button> : <><video ref={video} controls playsInline preload="metadata" src={url} poster={goal.videoPosterUrl || undefined} onLoadedMetadata={() => { video.current.playbackRate = Number(rate) }} onError={() => { setUrl(''); setMessage('Videon kunde inte spelas upp. Försök igen för en ny länk. Om problemet kvarstår kan klippets format sakna stöd på din enhet; be tränaren använda MP4/H.264.') }} />
      <div className="goal-video-controls"><label>Hastighet<select value={rate} onChange={(event) => { setRate(event.target.value); if (video.current) video.current.playbackRate = Number(event.target.value) }}><option value="1">Normal · 1×</option><option value="0.5">Långsamt · 0,5×</option><option value="0.25">Extra långsamt · 0,25×</option></select></label><button type="button" className="secondary-button" onClick={fullscreen}>Helskärm</button></div></>}
    {message && <p role="status">{message}</p>}
  </figure>
}

export function GoalMediaEditor({ goal, code, request = apiRequest, onSaved, initialAttachment = null, disabled = false, onBusyChange }) {
  const [attachment, setAttachment] = useState(initialAttachment), [busy, setBusy] = useState(false), [picking, setPicking] = useState(false), [message, setMessage] = useState('')
  const active = useRef(true), running = useRef(false), controller = useRef(null)
  useEffect(() => { active.current = true; return () => { active.current = false; controller.current?.abort() } }, [])
  useEffect(() => { if (initialAttachment) setAttachment(initialAttachment) }, [initialAttachment])
  useEffect(() => { onBusyChange?.(busy || picking); return () => onBusyChange?.(false) }, [busy, picking, onBusyChange])
  const run = async (action, imageData) => {
    if (disabled || picking || running.current || (action === 'video' && !attachment)) return
    if (action === 'clear-goal-media' && !window.confirm('Ta bort bilagan från utvecklingsmålet? Målet och återkopplingen behålls.')) return
    running.current = true; setBusy(true); setMessage('Sparar bilagan…'); controller.current = new AbortController()
    try {
      const result = action === 'video'
        ? await uploadGoalVideo(request, code, goal.id, attachment, { signal: controller.current.signal, onProgress: (text) => { if (active.current) setMessage(text) } })
        : await request('/api/goals', code, { method: 'POST', signal: controller.current.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, goalId: goal.id, imageData, expectedUpdatedAt: goal.updatedAt }) })
      if (active.current) { onSaved(result.goal); setAttachment(null); setMessage(action === 'clear-goal-media' ? '✓ Bilagan är borttagen.' : '✓ Bilagan är sparad och syns för simmaren.') }
    } catch (error) { if (active.current) setMessage(error.name === 'AbortError' ? 'Uppladdningen avbröts. Kontrollera den sparade bilagan innan du försöker igen.' : error.message) }
    finally { running.current = false; if (active.current) setBusy(false) }
  }
  const image = async (event) => {
    const file = event.target.files?.[0]; event.target.value = ''
    if (!file) return
    if (!/\.(png|jpe?g|webp)$/i.test(file.name) || file.size > 3000000) return setMessage('Välj JPG, PNG eller WebP under 3 MB.')
    try {
      const data = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file) })
      await run('replace-goal-image', data)
    } catch { if (active.current) setMessage('Bilden kunde inte läsas.') }
  }
  const blocked = disabled || busy || picking
  return <details className="goal-media-editor" open={initialAttachment ? true : undefined}><summary onClick={(event) => { if (busy || picking) event.preventDefault() }}>Bild eller video på målet</summary><p>Ett mål kan ha en bild eller ett kort videoklipp. En ny sparad bilaga ersätter den tidigare.</p>
    <GoalVideoPicker attachment={attachment} onChange={setAttachment} disabled={disabled || busy} onBusyChange={setPicking} />
    {attachment && <button type="button" className="primary-button" disabled={blocked} onClick={() => run('video')}>{busy ? 'Sparar video…' : 'Spara vald video'}</button>}
    <div className="goal-media-actions"><label className="exercise-image-upload">📷 {goal.hasImage || goal.hasVideo ? 'Ersätt med bild' : 'Bifoga bild'}<input type="file" accept=".png,.jpg,.jpeg,.webp" disabled={blocked || Boolean(attachment)} onChange={image} /></label>{(goal.hasVideo || goal.hasImage) && <button type="button" className="text-button" disabled={blocked} onClick={() => run('clear-goal-media')}>Ta bort sparad bilaga</button>}</div>
    {busy && <button type="button" className="text-button" onClick={() => controller.current?.abort()}>Avbryt uppladdningen</button>}
    {message && <p role="status" aria-live="polite">{message}</p>}
  </details>
}
