import React, { useEffect, useState } from 'react'
import { rewardLevelTheme } from './reward-level-theme.js'
import { useRewardEmblemTap } from './reward-emblem-tap.js'
import './reward-level-card.css'

const motionKey = 'simkoll:reward-motion'
function useRewardMotion() {
  const [enabled, setEnabled] = useState(() => { try { return localStorage.getItem(motionKey) !== 'off' } catch { return true } })
  const [visible, setVisible] = useState(() => typeof document === 'undefined' || !document.hidden)
  useEffect(() => { const sync = () => setVisible(!document.hidden); document.addEventListener('visibilitychange', sync); return () => document.removeEventListener('visibilitychange', sync) }, [])
  return { enabled, running: enabled && visible, toggle: () => setEnabled(current => { try { localStorage.setItem(motionKey, current ? 'off' : 'on') } catch {} return !current }) }
}

export default function RewardLevelCard({ points, onCommunity, featured = false, onEmblemTap }) {
  const motion = useRewardMotion()
  const reaction = useRewardEmblemTap(onEmblemTap, points?.emblemBonus)
  const [failedEmblem, setFailedEmblem] = useState(null)
  const [failedNextEmblem, setFailedNextEmblem] = useState(null)
  if (!points?.current) return null
  const theme = rewardLevelTheme(points.current.emoji)
  const remaining = points.next ? Math.max(0, points.next.minPoints - points.total) : 0
  const range = points.next ? Math.max(1, points.next.minPoints - points.current.minPoints) : 1
  const progress = points.next ? Math.max(0, Math.min(100, ((points.total - points.current.minPoints) / range) * 100)) : 100
  const art = points.current.artwork || {}
  const emblemUrl = art.emblemUrl && art.emblemUrl !== failedEmblem ? art.emblemUrl : null
  const nextArtwork = points.next?.artwork || {}
  const nextEmblemUrl = nextArtwork.emblemUrl && nextArtwork.emblemUrl !== failedNextEmblem ? nextArtwork.emblemUrl : null
  return <section className={`reward-card${featured ? ' hero-level-card' : ''}${progress >= 85 && points.next ? ' reward-near-unlock' : ''}`} data-motion={motion.running ? 'on' : 'off'} data-level-tone={theme.tone} style={theme.style}>
    {featured && <><div className="reward-scene" aria-hidden="true">{art.backgroundUrl && <img key={art.backgroundUrl} className="reward-art-background" src={art.backgroundUrl} alt="" onError={event => { event.currentTarget.style.display = 'none' }} />}<div className="reward-aurora" /><div className="reward-water" />{Array.from({length:12}, (_, index) => <i key={index} className="reward-particle" style={{'--particle-x':`${(index * 37 + 7) % 100}%`, '--particle-y':`${(index * 23 + 11) % 100}%`, '--particle-delay':`${-index * 1.7}s`}} />)}</div><div className="reward-card-topline"><span>DIN NIVÅ · DIN RESA</span><button type="button" aria-pressed={motion.enabled} onClick={motion.toggle} title="Pausa eller starta nivåkortets rörelser på den här enheten">{motion.enabled ? 'Ⅱ Pausa effekter' : '▷ Starta effekter'}</button></div></>}
    <span className="reward-emblem">{featured && <i className="reward-emblem-orbit" aria-hidden="true" />}{featured ? <button type="button" className="reward-emblem-touch" aria-label={`Klappa nivåemblemet ${points.current.name}`} onClick={reaction.tap} aria-describedby={onEmblemTap ? 'reward-emblem-bonus' : undefined}><span key={reaction.burst} className={reaction.burst ? 'reward-emblem-bounce' : ''} aria-hidden="true">{emblemUrl ? <img src={emblemUrl} alt="" draggable="false" onError={() => setFailedEmblem(emblemUrl)} /> : <b>{points.current.emoji}</b>}{reaction.burst > 0 && <span className="reward-tap-sparkles">{Array.from({length:8}, (_, index) => <i key={index} style={{'--spark-angle':`${index * 45}deg`}}>✦</i>)}</span>}</span></button> : <span aria-hidden="true">{emblemUrl ? <img src={emblemUrl} alt="" onError={() => setFailedEmblem(emblemUrl)} /> : <b>{points.current.emoji}</b>}</span>}</span>
    {featured && <div className="reward-emblem-feedback">{onEmblemTap ? <><small id="reward-emblem-bonus">{points.emblemBonus?.available ? `Dagens klappbonus: ${points.emblemBonus.used}/5${points.emblemBonus.used < 5 ? ' · tryck för +1 poäng' : ' · dagens bonus är klar'}` : 'Klappa emblemet · bonusen är inte tillgänglig just nu'}</small><span role="status" aria-live="polite" aria-atomic="true">{reaction.message || 'Upp till 5 bonuspoäng per svensk kalenderdag.'}</span></> : <small>Tryck på emblemet för en liten klappreaktion</small>}</div>}
    <div className="reward-card-content"><p className="eyebrow">{featured ? 'Du har låst upp' : 'Din nivå'}</p><h3>{points.current.name}</h3><p className="reward-total"><strong>{points.total.toLocaleString('sv-SE')}</strong> <span>poäng samlade</span></p>
      <div className="reward-progress" role="progressbar" aria-label={points.next ? `Framsteg till ${points.next.name}` : 'Högsta nivån uppnådd'} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}><i style={{ width:`${progress}%` }} /></div>
      <small>{points.next ? `${remaining} poäng till ${points.next.name}` : 'Du har nått högsta nivån!'}</small>{featured && points.next && <div className="reward-next-preview"><span aria-hidden="true">{nextEmblemUrl ? <img key={nextEmblemUrl} src={nextEmblemUrl} alt="" loading="lazy" onError={() => setFailedNextEmblem(nextEmblemUrl)} /> : points.next.emoji}</span><div><small>Nästa upplåsning</small><strong>{points.next.name}</strong></div><b>{Math.round(progress)} %</b></div>}
    </div>
    <button type="button" className="reward-pep" onClick={onCommunity}>Ge pepp →</button>{featured && <p className="reward-card-note">Små bidrag, nya nivåer. Aktivitet i Simkoll – inte ett betyg på din simning.</p>}
  </section>
}
