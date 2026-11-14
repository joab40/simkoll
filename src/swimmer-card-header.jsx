import React from 'react'
import SwimmerSetupIndicator from './swimmer-setup.jsx'
import './swimmer-card-header.css'

export default function SwimmerCardHeader({ profile, expanded, onToggle, setup, setupOpen, onSetupToggle, setupControls, focus, speed, children }) {
  // The full-header hit area and setup control are siblings, never nested
  // buttons. This keeps both pointer and keyboard behavior independent.
  return <div className="swimmer-card-header swimmer-card-header-inline" onClick={event => { if (!event.target.closest('button') && event.target.closest('.swimmer-card-header-content')) onToggle() }}>
    <button type="button" className="swimmer-card-toggle swimmer-card-hitarea" aria-label={`${expanded ? 'Dölj' : 'Visa mer om'} ${profile.displayName}`} aria-expanded={expanded} onClick={onToggle} />
    <div className="swimmer-card-header-content">
      <div className="swimmer-card-top">
        <div className="swimmer-name"><span>{profile.emoji}</span><div><strong>{profile.displayName}</strong><span className="swimmer-username-line"><small>@{profile.username}</small>{!expanded && <SwimmerSetupIndicator setup={setup} open={setupOpen} onToggle={onSetupToggle} controls={setupControls} />}</span></div></div>
        {focus}{speed}
      </div>
      <div className="swimmer-card-meta">{children}</div>
    </div>
  </div>
}
