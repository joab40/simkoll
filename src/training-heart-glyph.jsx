import React, { useId } from 'react'
import './training-heart.css'

// Shared by live swimmer cards and the FAQ's explicitly fictional examples.
export default function TrainingHeartGlyph({ motion = 'none' }) {
  const id = useId()
  return <svg className="training-heart-glyph" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
    <defs><linearGradient id={`${id}-fill`} x1="0" y1="0" x2=".8" y2="1"><stop offset="0" className="training-heart-light" /><stop offset=".48" className="training-heart-middle" /><stop offset="1" className="training-heart-dark" /></linearGradient></defs>
    <circle className="training-heart-ring" cx="32" cy="32" r="28" />
    <g className="training-heart-size"><g className={`training-heart-shape motion-${motion}`}>
      <path className="training-heart-body" fill={`url(#${id}-fill)`} d="M32 51C28 47 12 37 12 25C12 13 25 11 32 21C39 11 52 13 52 25C52 37 36 47 32 51Z" />
      <path className="training-heart-shine" d="M18 25C18 20 23 18 27 22" />
    </g></g>
  </svg>
}
