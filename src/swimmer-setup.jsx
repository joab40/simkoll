import React from 'react'
export default function SwimmerSetupIndicator({ setup, open, onToggle, controls }) {
  if (!setup.show) return null
  return <button type="button" className={`swimmer-setup-indicator ${setup.color}`} title={setup.title} aria-label={setup.title} aria-expanded={open} aria-controls={controls} onClick={onToggle}>{setup.symbol}</button>
}
