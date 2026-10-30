import React from 'react'
import { TALK_PERIODS } from '../shared/talk-history.js'

export function TalkHistoryPeriod({ value, onChange, disabled }) {
  return <label className="talk-history-period">Historikperiod<select value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>{TALK_PERIODS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><small>Månadsöversikt och de senaste åtta veckorna mer detaljerat. Tidigare sparad överenskommelse ingår om den finns.</small></label>
}

export function TalkContextPreview({ preview, stale }) {
  return <div className="talk-ai-context"><strong>Underlag att granska</strong><p>Historikperiod: {preview.context.period.start}–{preview.context.period.end}</p>{preview.context.warnings.length > 0 && <p role="status">Begränsningar: {preview.context.warnings.join(' · ')}</p>}{preview.context.sections.map((section) => <details key={section.key}><summary>{section.title}</summary><pre>{section.text}</pre></details>)}{stale && <p role="alert">Underlaget eller dina val har ändrats. Uppdatera underlaget först.</p>}</div>
}
