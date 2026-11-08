import React from 'react'
import { rewardLevelTheme } from './reward-level-theme.js'

export default function RewardLevelCard({ points, onCommunity, featured = false }) {
  if (!points?.current) return null
  const theme = rewardLevelTheme(points.current.emoji)
  const remaining = points.next ? Math.max(0, points.next.minPoints - points.total) : 0
  const range = points.next ? Math.max(1, points.next.minPoints - points.current.minPoints) : 1
  const progress = points.next ? Math.max(0, Math.min(100, ((points.total - points.current.minPoints) / range) * 100)) : 100
  return <section className={`reward-card${featured ? ' hero-level-card' : ''}`} data-level-tone={theme.tone} style={theme.style}>
    <span aria-hidden="true">{points.current.emoji}</span>
    <div><p className="eyebrow">Din nivå</p><h3>{points.current.name} · {points.total} poäng</h3>
      <div className="reward-progress" role="progressbar" aria-label={points.next ? `Framsteg till ${points.next.name}` : 'Högsta nivån uppnådd'} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}><i style={{ width:`${progress}%` }} /></div>
      <small>{points.next ? `${remaining} poäng till ${points.next.name}` : 'Du har nått högsta nivån!'}</small>
    </div>
    <button type="button" onClick={onCommunity}>Ge pepp →</button>
  </section>
}
