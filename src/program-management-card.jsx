import React from 'react'
import SwimmerCardSummary from './swimmer-card-summary.jsx'
import './program-management-card.css'

// Native disclosure: folding only hides content; forms, selected files and drafts
// stay mounted. Opening a card never saves, assigns or invokes AI.
export default function ProgramManagementCard({ icon, eyebrow, title, status, className = '', open, onOpenChange, children }) {
  return <details className={`coach-card program-management-card swimmer-disclosure ${className}`} open={open} onToggle={onOpenChange ? event => onOpenChange(event.currentTarget.open) : undefined}>
    <SwimmerCardSummary icon={icon} eyebrow={eyebrow} title={title} status={status} />
    <div className="program-management-body">{children}</div>
  </details>
}
