import React, { useCallback, useState } from 'react'
import { createRoot } from 'react-dom/client'
import FormKollenExamples from './form-kollen-examples.jsx'
import FormKollenCard, { FormKollenView } from './form-kollen.jsx'
import SwimmerSpeed from './swimmer-speed.jsx'
import SwimmerSetupIndicator from './swimmer-setup.jsx'
import { swimmerProfileSetup, profileTrainingGoals } from '../shared/swimmer-profile-setup.js'
import SwimmerTrainingGoals from './swimmer-training-goals.jsx'
import SwimmerCardFocus, { SwimmerTodayComment } from './swimmer-card-focus.jsx'
import { latestSwimmerComment } from './swimmer-card-focus.js'
import { FORM_EXAMPLES } from '../shared/form-kollen-examples.js'
import { buildFormKollen, evaluateFormSignals } from '../shared/form-kollen.js'
import { coachWeekAddDays as add } from '../shared/coach-week.js'
import { currentFormContext, normalizeFormContext } from '../shared/form-context.js'
import './styles.css'

function GoalDemo() {
  const [scenario, setScenario] = useState('scheduled'), [draft, setDraft] = useState({}), [help, setHelp] = useState(true)
  const profile = { id: 'demo', tempusId: '123', primaryStroke: 'free', trainingGroup: 'junior' }, asOf = '2026-11-14'
  const cross = { profileId: 'demo', startDate: '2026-01-01', drylandTarget: 3, strengthTarget: 3 }
  const training = { seasonGoals: [{ profileId: 'demo', startDate: '2026-01-01', target: 6 }], crossGoals: scenario === 'missing' ? [] : scenario === 'scheduled' ? [{ ...cross, startDate: '2026-11-16' }] : scenario === 'change' ? [{ ...cross, endDate: '2026-11-15' }, { ...cross, startDate: '2026-11-16', drylandTarget: 2, strengthTarget: 0 }] : [{ ...cross, ...(scenario === 'zero' ? { drylandTarget: 0, strengthTarget: 0 } : {}) }] }
  const state = scenario === 'error' ? 'error' : 'ready', setup = swimmerProfileSetup(profile, training, asOf, state)
  const sessions = ['swim', 'dryland'].flatMap(type => Array.from({ length: 4 }, () => ({ type })))
  return <><p>Fiktivt måltest. Ingen databas läses eller ändras.</p><div className="form-periods">{[['missing', 'Saknas'], ['scheduled', 'Framtida'], ['change', 'Kommande ändring'], ['zero', 'Nollmål'], ['active', 'Aktiva'], ['error', 'Hämtningsfel']].map(([key, label]) => <button key={key} onClick={() => { setScenario(key); setDraft({}); setHelp(true) }}>{label}</button>)}</div>
    <article className="swimmer-card expanded"><div className="swimmer-card-header"><h2>Fiktiv simmare</h2><SwimmerSetupIndicator setup={setup} open={help} onToggle={() => setHelp(value => !value)} controls="goal-demo-setup" /></div>
      {setup.show && help && <div id="goal-demo-setup" className="swimmer-setup-help"><strong>{setup.heading}</strong>{setup.informational && <p>Ingen komplettering behövs.</p>}{setup.missing.length > 0 && <p>Saknas: {setup.missing.join(', ')}.</p>}{setup.scheduled.map(note => <p key={note}>Planerat: {note}.</p>)}{setup.unknown && <p>{setup.title}</p>}</div>}
      <SwimmerTrainingGoals goals={profileTrainingGoals(training, profile.id, asOf, state)} sessions={sessions} draft={draft} onChange={(key, value) => setDraft(current => ({ ...current, [key]: value }))} onSave={() => window.alert('Fiktivt demo – inga mål sparas.')} />
    </article></>
}

function HeaderDemo() {
  const [expanded, setExpanded] = useState(false), [help, setHelp] = useState(false), [complete, setComplete] = useState(false), [failed, setFailed] = useState(false), [value, setValue] = useState(5), [reads, setReads] = useState(0)
  const [illness, setIllness] = useState('mild'), [showComment, setShowComment] = useState(true)
  const asOf = '2026-11-14', now = '2026-11-14T20:00:00Z'
  const profile = { id: 'demo-profile', emoji: '🏊', displayName: 'Demo · ingen verklig simmare', username: 'fiktivt', tempusId: '123', primaryStroke: complete ? 'free' : null, trainingGroup: 'junior' }
  const training = { seasonGoals: [{ profileId: profile.id, active: true, startDate: '2026-01-01', endDate: null, target: 4 }], crossGoals: [{ profileId: profile.id, startDate: '2026-01-01', endDate: null, strengthTarget: 0, drylandTarget: 0 }] }
  const setup = swimmerProfileSetup(profile, failed ? null : training, asOf, failed ? 'error' : 'ready')
  const responses = [19, 12, 10, 8].map((hour, index) => ({ id: `header-demo-${index}`, date: asOf, createdAt: `${asOf}T${String(hour).padStart(2, '0')}:00:00Z`, type: 'after', activityType: 'swim', trainingSlot: index % 2 ? 'morning_swim' : 'afternoon_swim', body: index === 0 ? 5 : 4, feeling: 4, speedFeeling: index === 0 ? value : 4, rpe: 5, activityMinutes: 60 }))
  const todayComment = latestSwimmerComment([{ ...responses[0], comment: showComment ? 'Lite trött idag, men träningen kändes bra.\nJag vill prata om upplägget inför nästa vecka och hur vi gör med morgonträningen.' : '' }], asOf)
  const request = useCallback(async () => {
    setReads(count => count + 1)
    return { profileId: 'demo-profile', ...buildFormKollen({ responses }, asOf, { now }) }
  }, [value])
  return <><p>Endast fiktivt demo. Inga riktiga API-anrop eller ändringar i databasen. Lokala underlagshämtningar: {reads}.</p><div className="form-periods">{[5, 4, 3, 2, 1].map(speed => <button type="button" key={speed} onClick={() => setValue(speed)}>Fart {speed}</button>)}<button type="button" onClick={() => setComplete(value => !value)}>{complete ? 'Visa saknad inriktning' : 'Fyll i saknad inriktning'}</button><button type="button" onClick={() => setFailed(value => !value)}>Växla hämtningsfel</button><button type="button" onClick={() => setIllness(current => current === 'mild' ? 'sick' : current === 'sick' ? 'none' : 'mild')}>Växla sjukdomssignal</button><button type="button" onClick={() => setShowComment(current => !current)}>Växla dagens kommentar</button></div>
    <article className={`swimmer-card ${expanded ? 'expanded' : 'compact'}`}><div className="swimmer-card-header"><button type="button" className="swimmer-card-toggle" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}><div className="swimmer-card-top"><div className="swimmer-name"><span>{profile.emoji}</span><div><strong>{profile.displayName}</strong><small>@{profile.username}</small></div></div><SwimmerCardFocus illness={{ status: illness, activity_date: asOf }} comment={todayComment} /><SwimmerSpeed responses={responses} now={now} /></div><div className="swimmer-card-meta"><span>★ 3/4</span><span>Rapporterad fartkänsla</span><span>{expanded ? '▲ Dölj' : '▼ Visa mer'}</span></div></button>{!expanded && <SwimmerSetupIndicator setup={setup} open={help} controls="demo-setup" onToggle={() => setHelp(value => !value)} />}</div>
      {!expanded && help && setup.show && <div id="demo-setup" className="swimmer-setup-help" role="status"><p>{setup.title}</p></div>}
      {expanded && <div className="swimmer-card-details"><SwimmerTodayComment comment={todayComment} /><SwimmerTrainingGoals goals={profileTrainingGoals(training, profile.id, asOf, 'ready')} sessions={[]} onChange={() => {}} onSave={() => {}} /><p>Simmarens riktning · fiktivt exempel</p><FormKollenCard profile={profile} code="demo" request={request} asOf={asOf} /></div>}
    </article>
  </>
}

function InteractiveDemo() {
  const scenario = new URLSearchParams(window.location.search).get('scenario')
  const asOf = '2026-11-14'
  const base = scenario?.startsWith('periods') ? buildFormKollen({
    responses: Array.from({ length: 180 }, (_, i) => {
      const offset = i - 179, date = add(asOf, offset), value = offset >= -1 ? 5 : offset >= -89 ? 2.5 : 4
      return { id: `period-demo-${i}`, date, createdAt: `${date}T18:00:00Z`, type: 'after', activityType: 'swim', trainingSlot: 'afternoon_swim', body: value, feeling: 4, speedFeeling: value, rpe: offset >= -1 ? 4 : 5, activityMinutes: 60 }
    }),
    sleep: Array.from({ length: 180 }, (_, i) => ({ activity_date: add(asOf, i - 179), minutes: 490, quality: 5 })),
    illness: [{ activity_date: asOf, status: scenario === 'periods-warning' ? 'mild' : 'none' }],
  }, asOf) : FORM_EXAMPLES.find(item => item.key === 'partial').data
  const [records, setRecords] = useState({ available: true, current: base.context, revisions: [] })
  const data = { ...evaluateFormSignals({ ...base, context: currentFormContext(records.current, base.asOf) }), coachContext: records }
  const save = async input => {
    const context = normalizeFormContext(input, base.asOf)
    setRecords(previous => { const revision = { ...context, id: `demo-${previous.revisions.length + 1}`, createdAt: `${base.asOf}T12:00:00Z` }; return { available: true, current: revision, revisions: [revision, ...previous.revisions] } })
  }
  return <><p>Endast fiktivt, lokalt demo. Formuläret nedan sparar i sidans minne, inte i Simkolls databas. Inga mejl, AI-anrop eller verkliga resultat skapas.</p><FormKollenView data={data} name="Demo · ingen verklig simmare" demo onSaveContext={save} /><details><summary>Övriga fiktiva exempel</summary><FormKollenExamples /></details></>
}

createRoot(document.getElementById('root')).render(new URLSearchParams(window.location.search).get('viewport') === 'mobile'
  ? <main style={{ padding: 16 }}><h1>Mobilförhandsvisning · 390 px</h1><iframe title="Formkollen i mobilbredd, fiktivt demo" src={`/form-kollen-qa.html?scenario=${encodeURIComponent(new URLSearchParams(window.location.search).get('scenario') || 'partial')}`} style={{ width: 390, height: 720, maxWidth: '100%', border: '1px solid #bed5d0', borderRadius: 20 }} /></main>
  : <main style={{ maxWidth: 760, margin: '30px auto', padding: 16 }}><h1>Formkollen · utvecklingsdemo</h1>{new URLSearchParams(window.location.search).get('scenario') === 'goals' ? <GoalDemo /> : new URLSearchParams(window.location.search).get('scenario') === 'header' ? <HeaderDemo /> : <InteractiveDemo />}</main>)
