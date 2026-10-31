import React, { useEffect, useId, useRef, useState } from 'react'
import { swimmerNavigation } from '../shared/swimmer-navigation.js'
import './swimmer-header.css'

function SwimmerMenuIcon({ kind }) {
  const paths = {
    calendar: 'M8 3v4m8-4v4M4 10h16M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Z',
    heart: 'M12 20 4 12a5 5 0 0 1 8-6 5 5 0 0 1 8 6Z',
    goal: 'M20 12a8 8 0 1 1-8-8m0 4a4 4 0 1 0 4 4m-4 0 8-8m-5 0h5v5',
    help: 'M9 9a3 3 0 1 1 5 2c-2 1-2 2-2 3m0 3h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z',
    info: 'M12 11v6m0-10h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z',
  }
  return <svg className="swimmer-menu-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={paths[kind]} /></svg>
}

export default function SwimmerHeader({ brand, profile, planningEnabled = true, actions = {}, onProfile, onLogout }) {
  const [menuOpen, setMenuOpen] = useState(false), [moreOpen, setMoreOpen] = useState(false)
  const root = useRef(null), more = useRef(null), moreButton = useRef(null), mobileButton = useRef(null)
  const navId = useId(), moreId = useId()
  const close = () => { setMenuOpen(false); setMoreOpen(false) }
  useEffect(() => {
    if (!menuOpen && !moreOpen) return
    const outside = event => { if (!root.current?.contains(event.target)) close(); else if (!more.current?.contains(event.target)) setMoreOpen(false) }
    const escape = event => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      if (moreOpen) { setMoreOpen(false); moreButton.current?.focus() }
      else { setMenuOpen(false); mobileButton.current?.focus() }
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape) }
  }, [menuOpen, moreOpen])
  useEffect(() => {
    const query = window.matchMedia('(max-width: 1100px)')
    query.addEventListener('change', close)
    return () => query.removeEventListener('change', close)
  }, [])
  const go = handler => () => { close(); handler?.() }
  const items = swimmerNavigation({ hasProfile: Boolean(profile), planningEnabled })
  const link = item => <button type="button" key={item.key} className={`menu-link swimmer-nav-link${item.key === 'legal' ? ' swimmer-menu-legal' : ''}`} onClick={go(actions[item.key])}><SwimmerMenuIcon kind={item.icon} /><span>{item.label}</span></button>
  return <header className="swimmer-top-header" ref={root}>
    {brand}
    <button ref={mobileButton} className="mobile-menu-toggle" type="button" aria-expanded={menuOpen} aria-controls={navId} onClick={() => setMenuOpen(value => !value)}>{menuOpen ? 'Stäng' : 'Meny'} <span aria-hidden="true">{menuOpen ? '×' : '☰'}</span></button>
    <nav id={navId} aria-label="Simmarmeny" className={`header-actions swimmer-header-navigation${menuOpen ? ' open' : ''}`}>
      <div className="swimmer-nav-primary">{items.filter(item => item.primary).map(link)}</div>
      <div ref={more} className="swimmer-more" onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setMoreOpen(false) }}>
        <button ref={moreButton} type="button" className="swimmer-more-toggle" aria-expanded={moreOpen} aria-controls={moreId} onClick={() => setMoreOpen(value => !value)}>Mer <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg></button>
        <div id={moreId} className={`swimmer-more-panel${moreOpen ? ' open' : ''}`}>{items.filter(item => !item.primary).map(link)}</div>
      </div>
      {profile ? <button type="button" className="profile-chip" aria-label={`Öppna min profil: ${profile.displayName}`} title={profile.displayName} onClick={go(onProfile)}><span className="swimmer-profile-emoji" aria-hidden="true">{profile.emoji}</span><span className="swimmer-profile-label"><strong>{profile.displayName}</strong><small>Min profil</small></span><span className="swimmer-profile-arrow" aria-hidden="true">→</span></button> : <button type="button" className="text-button swimmer-header-logout" onClick={go(onLogout)}>Logga ut</button>}
    </nav>
  </header>
}
