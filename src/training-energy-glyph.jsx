import React, { useId } from 'react'
import './training-energy.css'

export default function TrainingEnergyGlyph({ level = 'unknown', effect = 'none', burst = false }) {
  const id = useId()
  return <svg className={`training-energy-glyph energy-${level} effect-${effect}${burst ? ' energy-burst' : ''}`} viewBox="0 0 80 80" aria-hidden="true" focusable="false">
    <defs><linearGradient id={`${id}-energy`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="var(--energy-light)" /><stop offset=".5" stopColor="var(--energy-mid)" /><stop offset="1" stopColor="var(--energy-dark)" /></linearGradient></defs>
    <g className="energy-core">
      <path className="energy-aura" d="M40 8 Q45 34 72 40 Q45 46 40 72 Q35 46 8 40 Q35 34 40 8Z" />
      <path className="energy-crystal" fill={`url(#${id}-energy)`} d="M40 12 Q45 34 68 40 Q45 46 40 68 Q35 46 12 40 Q35 34 40 12Z" />
      <path className="energy-facet" d="M40 12 L40 40 L12 40 Q35 34 40 12Z" />
      <path className="energy-highlight" d="M39 24 Q36 35 26 39" />
    </g>
    <g className="energy-sparks"><path d="M17 11l-3 8 8-3M65 15l3 7-8-2M69 58l-7 3 2 8M14 61l7-2-2 8" /><path d="M40 2v4M76 40h-4M40 78v-4M4 40h4" /></g>
  </svg>
}
