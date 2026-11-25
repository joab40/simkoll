import React, { useState } from 'react'
import { rewardLevelTheme } from './reward-level-theme.js'

function CollectedLevel({ level }) {
  const [failedEmblem, setFailedEmblem] = useState(null)
  const { emblemUrl, backgroundUrl } = level.artwork || {}
  return <article className="collected-level" style={rewardLevelTheme(level.emoji).style}>
    {backgroundUrl && <img className="collected-level-background" src={backgroundUrl} alt="" loading="lazy" />}
    <span className="collected-level-emblem" aria-hidden="true">
      {emblemUrl && failedEmblem !== emblemUrl
        ? <img src={emblemUrl} alt="" loading="lazy" onError={() => setFailedEmblem(emblemUrl)} />
        : level.emoji}
    </span>
    <div><strong>{level.name}</strong><small>{level.minPoints.toLocaleString('sv-SE')} poäng</small></div>
  </article>
}

export default function SwimmerCollection({ artifacts, points }) {
  const [open, setOpen] = useState(false)
  const levels = points?.unlockedLevels ?? (points?.current ? [points.current] : [])
  const counts = [
    points && `${levels.length} ${levels.length === 1 ? 'nivå' : 'nivåer'}`,
    artifacts && `${artifacts.length} ${artifacts.length === 1 ? 'artefakt' : 'artefakter'}`,
  ].filter(Boolean)

  return <details className="artifact-collection" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>
      <span><strong>Min samling</strong><small>{counts.join(' · ') || 'Nivåkort och artefakter'}</small></span>
      <span className="collection-chevron" aria-hidden="true">⌄</span>
    </summary>
    {open && <div className="collection-content">
      <h3>Upplåsta nivåkort</h3>
      {levels.length ? <div className="artifact-grid">
        {levels.map(level => <CollectedLevel key={level.id} level={level} />)}
      </div> : <p className="empty">{points ? 'Du har inga upplåsta nivåer ännu.' : 'Dina nivåer är inte tillgängliga just nu.'}</p>}
      <h3>Artefakter</h3>
      {artifacts?.length ? <div className="artifact-grid">
        {artifacts.map(artifact => <article key={artifact.id} title={artifact.description}>
          <span aria-hidden="true">{artifact.emoji}</span>
          <strong>{artifact.name}</strong>
          <small>{new Date(artifact.awardedAt).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })}</small>
        </article>)}
      </div> : <p className="empty">{artifacts === null ? 'Hämtar artefakter…' : artifacts === false ? 'Artefakterna kunde inte hämtas.' : 'Du har inga artefakter ännu.'}</p>}
    </div>}
  </details>
}
