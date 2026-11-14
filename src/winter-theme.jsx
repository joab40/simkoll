import React, { useEffect, useRef, useState } from 'react'
import { WINTER_SNOWFLAKES } from './winter-scene.js'
import './winter-theme.css'

export function WinterSnowman({ className = '' }) {
  return <svg className={`winter-snowman ${className}`} viewBox="0 0 120 145" aria-hidden="true" focusable="false">
    <ellipse cx="60" cy="135" rx="38" ry="6" fill="#bfdde5" opacity=".7" />
    <path d="M34 92 14 76m5 5-1-10m1 10-10-1" fill="none" stroke="#886f59" strokeWidth="3" strokeLinecap="round" />
    <g className="winter-wave-arm"><path d="m85 92 17-22m-5 6 1-11m-1 11 11-3" fill="none" stroke="#886f59" strokeWidth="3" strokeLinecap="round" /></g>
    <ellipse cx="60" cy="107" rx="32" ry="29" fill="#effaff" stroke="#c8e7ef" strokeWidth="2" />
    <circle cx="59" cy="64" r="25" fill="#fffefa" stroke="#d4eaf0" strokeWidth="2" />
    <path d="M34 54c0-33 48-35 50 0Z" fill="#267e94" /><path d="M35 51h47" stroke="#91d9df" strokeWidth="7" strokeLinecap="round" />
    <circle cx="59" cy="27" r="7" fill="#b4e6e7" />
    <path d="m35 62 47-1" stroke="#1b536b" strokeWidth="3" />
    <rect x="39" y="56" width="17" height="12" rx="5" fill="#a9e6ed" stroke="#245f76" strokeWidth="2.5" />
    <rect x="62" y="56" width="17" height="12" rx="5" fill="#a9e6ed" stroke="#245f76" strokeWidth="2.5" />
    <path d="M56 61h6m-18-1 5-1m18 1 5-1" fill="none" stroke="#efffff" strokeWidth="2" strokeLinecap="round" />
    <path d="m59 67 16 5-16 3Z" fill="#e99c61" />
    <path d="M49 77q10 9 20-1" fill="none" stroke="#315d6b" strokeWidth="2" strokeLinecap="round" />
    <path d="M35 84q24 10 48-2l2 10q-27 11-51-1Z" fill="#db8675" />
    <path d="m72 91 10-2 4 26-13-1Z" fill="#dc8a76" /><path d="m74 110 11 1" stroke="#f7c6a4" strokeWidth="3" />
    <circle cx="58" cy="103" r="2.5" fill="#315d6b" /><circle cx="58" cy="116" r="2.5" fill="#315d6b" />
    <path d="m36 126 7 3m-10-6 4 2" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
  </svg>
}

export default function WinterHeroDecor({ animate = true }) {
  const root = useRef(null), [moving, setMoving] = useState(false)
  useEffect(() => {
    setMoving(false)
    if (!animate || typeof IntersectionObserver === 'undefined') return undefined
    let visible = false
    const update = () => setMoving(visible && !document.hidden)
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; update() })
    observer.observe(root.current); document.addEventListener('visibilitychange', update)
    return () => { observer.disconnect(); document.removeEventListener('visibilitychange', update) }
  }, [animate])
  return <div ref={root} className={`winter-decor${moving ? ' winter-moving' : ''}`} aria-hidden="true">
    <div className="winter-snowfall">{WINTER_SNOWFLAKES.map((flake, index) => <span key={index} style={{ '--snow-left': `${flake.left}%`, '--snow-top': `${flake.top}%`, '--snow-size': `${flake.size}px`, '--snow-duration': `${flake.duration}s`, '--snow-delay': `${flake.delay}s`, '--snow-drift': `${flake.drift}px` }}>❄</span>)}</div>
    <div className="winter-landscape">
      <svg className="winter-snowbanks" viewBox="0 0 1000 110" preserveAspectRatio="none" focusable="false"><path d="M0 53q140-43 300 3t330-12 370 8v58H0Z" fill="#b7dbe8" /><path d="M0 80q120-49 310-8t360-8 330 5v41H0Z" fill="#e9f6fb" /><path d="M0 94q230-34 490-4t510-3v23H0Z" fill="#f9fdff" /></svg>
      <svg className="winter-pines" viewBox="0 0 140 95" focusable="false"><path d="m26 5-20 33h10L0 63h20v24h12V63h20L37 38h10Zm60 12L67 46h10L61 70h19v17h12V70h19L96 46h9Z" fill="#39758a" /><path d="m26 5-12 20h24Zm60 12-11 18h22Z" fill="#eef9fc" /><path d="m123 49-12 20h6l-10 16h12v8h8v-8h12l-10-16h6Z" fill="#72a8b8" /></svg>
      <WinterSnowman /><span className="winter-landscape-flake">✧</span>
    </div>
  </div>
}

export function WinterTrainingBuddy() {
  return <div className="winter-training-buddy" aria-hidden="true"><WinterSnowman /><span>Ett dopp i taget <i>❄</i></span></div>
}
