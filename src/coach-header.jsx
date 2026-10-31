import React, { useEffect, useRef } from 'react'
import { coachMessageBadge } from './coach-message-badge.js'
import { groupMenuOffset } from './coach-group-menu-position.js'
import './coach-header.css'

export function CoachMessageButton({ count = 0, active = false, onOpen }) {
  const badge = coachMessageBadge(count)
  return <button type="button" className={`coach-message-button${active ? ' active' : ''}`} onClick={onOpen} aria-label={badge.label} title={badge.label} aria-current={active ? 'page' : undefined}>
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 11.5a8 8 0 0 1-8 8H5l-3 3v-11a8 8 0 0 1 8-8h2a8 8 0 0 1 8 8Z" /><path d="M7 10h8M7 14h5" /></svg>
    <span className="coach-message-button-label">Meddelanden</span>
    {badge.count > 0 && <b className="coach-message-badge" aria-hidden="true">{badge.text}</b>}
  </button>
}

export default function CoachHeader({ brand, groups, selectedGroups, onGroupsChange, messagesVisible = true, messageCount = 0, messagesActive = false, onMessages, children }) {
  const groupMenu = useRef(null)
  const positionGroupMenu = () => {
    const menu = groupMenu.current, panel = menu?.querySelector(':scope > div')
    if (!menu?.open || !panel) return
    panel.style.left = `${groupMenuOffset(menu.getBoundingClientRect().left, panel.getBoundingClientRect().width, window.innerWidth)}px`
  }
  useEffect(() => {
    positionGroupMenu()
    window.addEventListener('resize', positionGroupMenu)
    return () => window.removeEventListener('resize', positionGroupMenu)
  }, [selectedGroups, messagesVisible])
  return <header className="coach-top-header">
    {brand}
    <div className="coach-header-actions">
      <details ref={groupMenu} onToggle={positionGroupMenu} className="coach-group-filter coach-group-filter-header"><summary>Grupper{selectedGroups.length === groups.length ? '' : ` · ${selectedGroups.length}`}</summary><div><strong>Visa grupper</strong>{groups.map(([value, label]) => <label key={value}><input type="checkbox" checked={selectedGroups.includes(value)} onChange={() => onGroupsChange(selectedGroups.includes(value) ? selectedGroups.filter((item) => item !== value) : [...selectedGroups, value])} />{label}</label>)}<button type="button" onClick={() => onGroupsChange(groups.map(([value]) => value))}>Alla grupper</button></div></details>
      {messagesVisible && <CoachMessageButton count={messageCount} active={messagesActive} onOpen={onMessages} />}
      {children}
    </div>
  </header>
}
