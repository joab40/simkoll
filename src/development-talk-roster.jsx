import React from 'react'
import './development-talk-roster.css'

export default function DevelopmentTalkRoster({ profiles, latestTalkBySwimmer, statusFor, canSchedule, selectedProfileIds, onToggleProfile, onOpen }) {
  return <div className="talk-roster">{profiles.map((profile) => {
    const talk = latestTalkBySwimmer.get(profile.id), state = statusFor(talk)
    return <div className="talk-roster-row talk-roster-row-v3" key={profile.id}>
      <div className="talk-roster-person">
        {canSchedule(profile) && <label className="talk-roster-check"><input type="checkbox" aria-label={`Boka nytt samtal för ${profile.displayName}`} checked={selectedProfileIds.includes(profile.id)} onChange={(event) => onToggleProfile(profile.id, event.target.checked)} /></label>}
        <span className="talk-roster-avatar" aria-hidden="true">{profile.emoji || '🏊'}</span>
        <div><strong>{profile.displayName}</strong>{talk && <small className="talk-roster-date">{talk.meetingDate}</small>}</div>
      </div>
      <span className={`talk-status-pill ${state.tone}`}>{state.label}</span>
      {talk && <button type="button" className="secondary-button talk-roster-open" aria-label={`Öppna utvecklingssamtal för ${profile.displayName}`} onClick={() => onOpen(talk)}>Öppna <span aria-hidden="true">→</span></button>}
    </div>
  })}{!profiles.length && <p className="empty">Inga simmare i den valda gruppen.</p>}</div>
}
