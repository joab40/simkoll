import React, { useCallback, useState } from 'react'
import { createRoot } from 'react-dom/client'
import FormKollenExamples from './form-kollen-examples.jsx'
import FormKollenCard, { FormKollenView } from './form-kollen.jsx'
import SwimmerSpeed from './swimmer-speed.jsx'
import SwimmerSetupIndicator from './swimmer-setup.jsx'
import SwimmerCardHeader from './swimmer-card-header.jsx'
import { swimmerProfileSetup, profileTrainingGoals } from '../shared/swimmer-profile-setup.js'
import SwimmerTrainingGoals from './swimmer-training-goals.jsx'
import SwimmerCardFocus, { SwimmerTodayComment } from './swimmer-card-focus.jsx'
import { latestSwimmerComment } from './swimmer-card-focus.js'
import { buildCoachCheckinComparison } from './coach-checkin-comparison.js'
import { coachMetricDetails, COACH_RESPONSE_METRICS } from './coach-metric-details.js'
import CoachCheckinTrend from './coach-checkin-trend.jsx'
import CoachMetricDetails from './coach-metric-details.jsx'
import SwimmerTrafficOverview from './swimmer-traffic-overview.jsx'
import './coach-control-panel.css'
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
  const profile = { id: 'demo-profile', emoji: '🏊', displayName: 'Demo', username: 'fiktivt', tempusId: '123', primaryStroke: complete ? 'free' : null, trainingGroup: 'junior' }
  const training = { seasonGoals: [{ profileId: profile.id, active: true, startDate: '2026-01-01', endDate: null, target: 4 }], crossGoals: [{ profileId: profile.id, startDate: '2026-01-01', endDate: null, strengthTarget: 0, drylandTarget: 0 }] }
  const setup = swimmerProfileSetup(profile, failed ? null : training, asOf, failed ? 'error' : 'ready')
  const responses = [19, 12, 10, 8].map((hour, index) => ({ id: `header-demo-${index}`, date: asOf, createdAt: `${asOf}T${String(hour).padStart(2, '0')}:00:00Z`, type: 'after', activityType: 'swim', trainingSlot: index % 2 ? 'morning_swim' : 'afternoon_swim', body: index === 0 ? 5 : 4, feeling: 4, speedFeeling: index === 0 ? value : 4, rpe: 5, activityMinutes: 60 }))
  const todayComment = latestSwimmerComment([{ ...responses[0], comment: showComment ? 'Lite trött idag, men träningen kändes bra.\nJag vill prata om upplägget inför nästa vecka och hur vi gör med morgonträningen.' : '' }], asOf)
  const request = useCallback(async () => {
    setReads(count => count + 1)
    return { profileId: 'demo-profile', ...buildFormKollen({ responses }, asOf, { now }) }
  }, [value])
  return <><p>Endast fiktivt demo. Inga riktiga API-anrop eller ändringar i databasen. Lokala underlagshämtningar: {reads}.</p><div className="form-periods">{[5, 4, 3, 2, 1].map(speed => <button type="button" key={speed} onClick={() => setValue(speed)}>Fart {speed}</button>)}<button type="button" onClick={() => setComplete(value => !value)}>{complete ? 'Visa saknad inriktning' : 'Fyll i saknad inriktning'}</button><button type="button" onClick={() => setFailed(value => !value)}>Växla hämtningsfel</button><button type="button" onClick={() => setIllness(current => current === 'mild' ? 'sick' : current === 'sick' ? 'none' : 'mild')}>Växla sjukdomssignal</button><button type="button" onClick={() => setShowComment(current => !current)}>Växla dagens kommentar</button></div>
    <article className={`swimmer-card ${expanded ? 'expanded' : 'compact'}`}><SwimmerCardHeader profile={profile} expanded={expanded} onToggle={() => setExpanded(value => !value)} setup={setup} setupOpen={help} setupControls="demo-setup" onSetupToggle={() => setHelp(value => !value)} focus={<SwimmerCardFocus illness={{ status: illness, activity_date: asOf }} comment={todayComment} />} speed={<SwimmerSpeed responses={responses} now={now} />}><span className="swimmer-stars" title="3 av 4 träningsstjärnor">★ 3/4</span><span className="swimmer-card-health"><span className="swimmer-traffic red">🔴 <small>Följ upp</small></span><span className="swimmer-mood">🙂</span></span><span className="swimmer-attention" title="⏸️ Tränar inte idag">⏸️ Tränar inte idag</span><span className="swimmer-card-actions"><span className="swimmer-feature-icon" title="Fiktiv assistentindikator">🦉</span><span className="swimmer-expand-hint">{expanded ? '▲ Dölj' : '▼ Visa mer'}</span></span></SwimmerCardHeader>
      {!expanded && help && setup.show && <div id="demo-setup" className="swimmer-setup-help" role="status"><p>{setup.title}</p></div>}
      {expanded && <div className="swimmer-card-details"><SwimmerTodayComment comment={todayComment} /><SwimmerTrainingGoals goals={profileTrainingGoals(training, profile.id, asOf, 'ready')} sessions={[]} onChange={() => {}} onSave={() => {}} /><p>Simmarens riktning · fiktivt exempel</p><FormKollenCard profile={profile} code="demo" request={request} asOf={asOf} /></div>}
    </article>
  </>
}

function CheckinDemo() {
  const [small, setSmall] = useState(false), [selected, setSelected] = useState(null)
  const rows = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-09', '2026-11-10', '2026-11-11'].map((activityDate, index) => ({ id: `checkin-demo-${index}`, profileId: 'demo', activityDate, createdAt: `${activityDate}T18:00:00Z`, type: 'after', activityType: 'swim', feeling: index < 3 ? 3 : 4, rpe: index < 3 ? 6 : 5, pass: index < 3 ? 4 : 5, setup: 4 }))
  const comparison = buildCoachCheckinComparison(small ? rows.slice(-1) : rows, '2026-11-09', '2026-11-11')
  const current = (small ? rows.slice(-1) : rows).filter(row => row.activityDate >= '2026-11-09')
  return <><p>Fiktiva incheckningar. Inga API-anrop eller databasändringar.</p><button type="button" className="secondary-button" onClick={() => setSmall(value => !value)}>Växla litet underlag</button><section className="stats-grid" style={{ marginTop: 18 }}>{Object.entries(COACH_RESPONSE_METRICS).map(([key, metric]) => {
    const summary = coachMetricDetails(key, current)
    return <article className="stat stat-drilldown" key={key}><button type="button" className="stat-drilldown-trigger" aria-label={`Se alla svar för ${metric.title}`} onClick={() => setSelected(key)} /><span className="stat-title">{metric.title}</span><strong>{summary.average} / {metric.max}</strong><small>{summary.entries.length} svar</small><CoachCheckinTrend comparison={comparison} metric={key} /><span className="stat-drilldown-hint" aria-hidden="true">Visa svar →</span></article>
  })}</section>{selected && <CoachMetricDetails metricKey={selected} responses={current} profiles={[{ id: 'demo', displayName: 'Fiktiv simmare', emoji: '🏊' }]} periodLabel="9–11 nov." onClose={() => setSelected(null)} />}</>
}

function TrafficDemo() {
  const [filter, setFilter] = useState('all'), [mode, setMode] = useState('ready'), [refreshes, setRefreshes] = useState(0)
  const profiles = Array.from({ length: 32 }, (_, index) => ({ id: `traffic-demo-${index}`, active: true, approvalStatus: 'approved' }))
  const color = (index, old) => index < (old ? 6 : 5) ? 'red' : index < (old ? 25 : 16) ? 'yellow' : index < 30 ? 'green' : 'unknown'
  const report = { range: { start: '2026-11-01', end: '2026-11-14', previousStart: '2026-10-25', previousEnd: '2026-11-07' }, profiles: profiles.map((profile, index) => ({ profileId: profile.id, current: { color: color(index, false) }, previous: { color: color(index, true) } })) }
  return <><p>Fiktiv trafikljusöversikt. Inga API-anrop eller databasändringar.</p><div className="form-periods">{[['ready', 'Underlag finns'], ['loading', 'Laddning'], ['error', 'Hämtningsfel']].map(([key, label]) => <button key={key} type="button" onClick={() => setMode(key)}>{label}</button>)}</div><SwimmerTrafficOverview profiles={profiles} report={mode === 'ready' ? report : null} loading={mode === 'loading'} error={mode === 'error' ? 'Fiktivt hämtningsfel.' : ''} filter={filter} onFilter={setFilter} onRefresh={() => setRefreshes(value => value + 1)} /><p role="status">Aktivt filter: {filter}. Lokala uppdateringsklick: {refreshes}.</p></>
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
  : <main style={{ maxWidth: ['checkins', 'traffic'].includes(new URLSearchParams(window.location.search).get('scenario')) ? 1200 : 760, margin: '30px auto', padding: 16 }}><h1>Simkoll · fiktivt utvecklingsdemo</h1>{new URLSearchParams(window.location.search).get('scenario') === 'traffic' ? <TrafficDemo /> : new URLSearchParams(window.location.search).get('scenario') === 'checkins' ? <CheckinDemo /> : new URLSearchParams(window.location.search).get('scenario') === 'goals' ? <GoalDemo /> : new URLSearchParams(window.location.search).get('scenario') === 'header' ? <HeaderDemo /> : <InteractiveDemo />}</main>)
