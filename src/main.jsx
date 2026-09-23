import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'

const APP_VERSION = __APP_VERSION__
const BUILD_TIME = __BUILD_TIME__
const COMMIT_SHA = __COMMIT_SHA__

const FEELINGS = [
  { value: 1, emoji: '😣', label: 'Tungt' },
  { value: 2, emoji: '😕', label: 'Segt' },
  { value: 3, emoji: '😌', label: 'Okej' },
  { value: 4, emoji: '🙂', label: 'Bra' },
  { value: 5, emoji: '🤩', label: 'Toppen' },
]

const DAY_TYPES = [
  { value: 'before', title: 'Jag ska träna', icon: '→' },
  { value: 'after', title: 'Jag har tränat', icon: '✓' },
  { value: 'rest', title: 'Ingen träning idag', icon: '–' },
  { value: 'sick', title: 'Jag känner mig sjuk', icon: '🤒' },
]

const WORKOUT_FOCUSES = [
  ['kondition_frisim', 'Kondition frisim'], ['kondition_special', 'Kondition special'], ['fart', 'Fart'], ['troskel', 'Tröskel'], ['syra', 'Syra'], ['f2_frisim', 'F2 Frisim'], ['f2_spec', 'F2 Spec'], ['distans', 'Distans'], ['teknik', 'Teknik'], ['aterhamtning', 'Återhämtning'],
]

const dateKey = (date) => {
  const value = new Date(date)
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
}

const responseDate = (response) => new Date(response.createdAt)
const todayKey = () => dateKey(new Date())
const competitionIsToday = (item, today = todayKey()) => Boolean(item?.startDate && item.startDate <= today && (item.endDate || item.startDate) >= today)
const average = (key, items) => {
  const values = items.map((item) => item[key]).filter((value) => typeof value === 'number')
  return values.length ? (values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1) : '–'
}

const confirmDestructive = (description, phrase = 'RADERA') => window.prompt(`${description}\n\nSkriv ${phrase} för att bekräfta.`) === phrase

function previousWeekRange() {
  const today = new Date()
  const mondayOffset = (today.getDay() + 6) % 7
  const thisMonday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - mondayOffset)
  const start = new Date(thisMonday)
  start.setDate(start.getDate() - 7)
  const end = new Date(thisMonday)
  end.setMilliseconds(-1)
  return { start, end }
}

function App() {
  const [auth, setAuth] = useState(null)
  const [profile, setProfile] = useState(null)
  const [responses, setResponses] = useState([])
  const [profiles, setProfiles] = useState([])
  const [pendingProfiles, setPendingProfiles] = useState([])
  const [workout, setWorkout] = useState(null)
  const [tomorrowWorkout, setTomorrowWorkout] = useState(null)
  const [workoutLocked, setWorkoutLocked] = useState(false)
  const [activeProfilesToday, setActiveProfilesToday] = useState(0)
  const [activityDates, setActivityDates] = useState([])
  const [points, setPoints] = useState(null)
  const [notifications, setNotifications] = useState([])
  const [training, setTraining] = useState(null)
  const [identified, setIdentified] = useState(false)
  const [loading, setLoading] = useState(false)
  const [screen, setScreen] = useState('home')
  const [talksEnabled, setTalksEnabled] = useState(false)
  const [planningEnabled, setPlanningEnabled] = useState(false)
  const [starsEnabled, setStarsEnabled] = useState(true)
  const [appFeedbackEnabled, setAppFeedbackEnabled] = useState(true)
  const [swimmerEffects, setSwimmerEffects] = useState(true)
  const [competitions, setCompetitions] = useState([])

  useEffect(() => {
    if (!auth) return
    setLoading(true)
    // Visa dagens känslor så fort svaren är hämtade. Övrig coachdata får
    // fortsätta laddas parallellt utan att blockera färgen i toppkortet.
    fetchResponses(auth.code).then((nextResponses) => setResponses(nextResponses)).catch((error) => window.alert(error.message))
    Promise.all([
      auth.role === 'coach' ? apiRequest('/api/profiles', auth.code) : Promise.resolve({ profiles: [], pendingProfiles: [] }),
      auth.role === 'coach' ? apiRequest('/api/activity', auth.code).then((data) => data.activeProfilesToday) : Promise.resolve(0),
    ])
      .then(([profileData, activeCount]) => { setProfiles(profileData.profiles); setPendingProfiles(profileData.pendingProfiles || []); setActiveProfilesToday(activeCount) })
      .catch((error) => window.alert(error.message))
      .finally(() => setLoading(false))
  }, [auth])

  useEffect(() => {
    if (!auth || !profile) { setWorkout(null); setTomorrowWorkout(null); setWorkoutLocked(false); return }
    const loadProfileData = async () => {
      const tomorrow = dateKey(new Date(Date.now() + 86400000))
      // Starta alla oberoende hämtningar samtidigt. Tidigare blockerade
      // /api/training resten av simmarvyn eftersom det hämtades först.
      const [trainingData, workoutData, tomorrowData, activityData] = await Promise.all([apiRequest('/api/training', auth.code), apiRequest('/api/workouts', auth.code), apiRequest(`/api/workouts?date=${tomorrow}`, auth.code), apiRequest('/api/activity?streak=true', auth.code)])
      setWorkout(workoutData.workout); setWorkoutLocked(workoutData.locked); setTomorrowWorkout(tomorrowData.workout); setActiveProfilesToday(activityData.activeProfilesToday); setActivityDates(activityData.activityDates || []); setTraining(trainingData)
      // Sekundärdata laddas efter att startsidans viktigaste kort redan kan visas.
      const [pointsData, notificationData, competitionData] = await Promise.all([apiRequest('/api/points', auth.code).catch(() => null), apiRequest('/api/notifications', auth.code).catch(() => ({ notifications: [] })), apiRequest('/api/workouts?calendar=true', auth.code).catch(() => ({ competitions: [] }))])
      if (pointsData) setPoints(pointsData)
      setNotifications(notificationData.notifications || [])
      setCompetitions(competitionData.competitions || [])
    }
    loadProfileData().catch(() => { setWorkout(null); setWorkoutLocked(false) })
    const refreshOnFocus = () => { if (document.visibilityState === 'visible') loadProfileData().catch(() => {}) }
    window.addEventListener('focus', refreshOnFocus)
    document.addEventListener('visibilitychange', refreshOnFocus)
    return () => { window.removeEventListener('focus', refreshOnFocus); document.removeEventListener('visibilitychange', refreshOnFocus) }
  }, [auth, profile])

  // The first swimmer response fetch is intentionally anonymized for the
  // group view. Once a profile is restored, merge the profile's detailed
  // responses so the status card can show the selected day type as well.
  useEffect(() => {
    if (!auth || !profile) return
    apiRequest('/api/responses?mine=true', auth.code).then((data) => {
      setResponses((current) => {
        const own = new Map((data.responses || []).map((item) => [item.id, item]))
        const merged = current.map((item) => own.get(item.id) || item)
        const existing = new Set(merged.map((item) => item.id))
        return [...merged, ...(data.responses || []).filter((item) => !existing.has(item.id))]
      })
    }).catch(() => {})
  }, [auth, profile?.id])

  useEffect(() => {
    if (!auth || !profile) return undefined
    const refresh = () => apiRequest('/api/notifications', auth.code).then((data) => setNotifications(data.notifications || [])).catch(() => {})
    const timer = window.setInterval(refresh, 30000)
    return () => window.clearInterval(timer)
  }, [auth, profile])

  useEffect(() => {
    if (!auth || !profile) return
    apiRequest('/api/goals?talks=true', auth.code).then((data) => setTalksEnabled(data.globalEnabled !== false)).catch(() => {})
  }, [auth, profile])
  useEffect(() => { if (!auth || !profile) return; apiRequest('/api/goals?settings=true', auth.code).then((data) => { setPlanningEnabled(data.settings?.swimmer?.planning === true); setAppFeedbackEnabled(data.settings?.swimmer?.appFeedback !== false); setStarsEnabled(data.settings?.swimmer?.stars !== false); setSwimmerEffects(data.settings?.swimmerEffects !== false) }).catch(() => { setPlanningEnabled(false); setAppFeedbackEnabled(true); setStarsEnabled(true); setSwimmerEffects(true) }) }, [auth, profile])

  if (!auth) return <Login onLogin={async (nextAuth) => {
    setAuth(nextAuth)
    if (nextAuth.role !== 'swimmer') { setScreen('home'); return }
    setScreen('restoring-profile')
    try {
      const data = await apiRequest('/api/profiles', nextAuth.code)
      setProfile(data.profile)
      setScreen('home')
    } catch {
      setProfile(null)
      setScreen('account')
    }
  }} />

  const logout = () => {
    setAuth(null)
    setProfile(null)
    setResponses([])
    setProfiles([])
    setPendingProfiles([])
    setWorkout(null)
    setTomorrowWorkout(null)
    setWorkoutLocked(false)
    setActiveProfilesToday(0)
    setPoints(null)
    setNotifications([])
    setTraining(null)
    setTalksEnabled(true)
    setPlanningEnabled(false)
    setScreen('home')
  }

  if (auth.role === 'coach') {
    return <Coach responses={responses} profiles={profiles} pendingProfiles={pendingProfiles} onProfilesChange={async () => { const data = await apiRequest('/api/profiles', auth.code); setProfiles(data.profiles); setPendingProfiles(data.pendingProfiles || []) }} activeProfilesToday={activeProfilesToday} code={auth.code} loading={loading} onLogout={logout} onClear={async () => {
      await apiRequest('/api/responses', auth.code, { method: 'DELETE' })
      setResponses([])
    }} />
  }

  return (
    <Shell profile={profile} talksEnabled={talksEnabled} planningEnabled={planningEnabled} onPlanning={() => setScreen('planning')} onCompetitions={() => setScreen('competition-entries')} onCommunity={() => setScreen('community')} onGoals={() => setScreen('goals')} onTalk={() => setScreen('talks')} onHelp={() => setScreen('faq')} onLegal={() => setScreen('legal')} onProfile={() => setScreen('profile')} onGame={() => setScreen('game')} onLogout={logout}>
      {screen === 'game' && <Simpaus code={auth.code} onBack={() => setScreen('home')} />}
      {screen === 'vanda' && <Vandningsmastaren code={auth.code} onBack={() => setScreen('home')} />}
      {screen === 'swimgames' && <Swimgames code={auth.code} onBack={() => setScreen('home')} />}
      {screen === 'alltime-games' && <AllTimeGames code={auth.code} onBack={() => setScreen('home')} />}
      {screen === 'talks' && <DevelopmentTalkSwimmer code={auth.code} onBack={() => setScreen('home')} />}
      {screen === 'planning' && <SwimmerPlanning code={auth.code} onBack={() => setScreen('home')} />}
      {screen === 'competition-entries' && <SwimmerCompetitionEntries code={auth.code} onBack={() => setScreen('home')} />}
      {screen === 'restoring-profile' && <section className="empty-period profile-restore"><span>👋</span><h2>Hämtar din profil…</h2></section>}
      {screen === 'account' && <AccountChoice
        onAnonymous={() => { setProfile(null); setScreen('home') }}
        onLogin={() => setScreen('profile-login')}
        onCreate={() => setScreen('profile-create')}
      />}
      {(screen === 'profile-login' || screen === 'profile-create' || screen === 'profile-reset') && (
        <ProfileAccess
          mode={screen.replace('profile-', '')}
          code={auth.code}
          onBack={() => setScreen('account')}
          onMode={(mode) => setScreen(`profile-${mode}`)}
          onSuccess={async (nextProfile) => {
            if (nextProfile) setProfile(nextProfile)
            setScreen(nextProfile ? 'home' : 'profile-login')
          }}
        />
      )}
      {screen === 'home' && (
        <Home code={auth.code} responses={responses} profile={profile} points={points} onNotificationsChange={setNotifications} notifications={notifications} training={training} workout={workout} tomorrowWorkout={tomorrowWorkout} competitions={competitions} appFeedbackEnabled={appFeedbackEnabled} starsEnabled={starsEnabled} swimmerEffects={swimmerEffects || profile?.isTestProfile} workoutLocked={workoutLocked} activeProfilesToday={activeProfilesToday} activityDates={activityDates} onCommunity={() => setScreen('community')} onGoals={() => setScreen('goals')} onGame={() => setScreen('game')} onVanda={() => setScreen('vanda')} onSwimgames={() => setScreen('swimgames')} onAllTime={() => setScreen('alltime-games')} onToggleSession={async (date, slot, completed) => apiRequest('/api/training', auth.code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'toggle-session', date, slot, completed, skipCheer: true }) })} onTogglePlan={async (date, slot, planned) => apiRequest('/api/training', auth.code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'toggle-plan', date, slot, planned }) })} onStart={() => {
          if (profile) setScreen('privacy-choice')
          else { setIdentified(false); setScreen('checkin') }
        }} />
      )}
      {screen === 'privacy-choice' && <PrivacyChoice profile={profile} onBack={() => setScreen('home')} onChoose={(value) => { setIdentified(value); setScreen('checkin') }} />}
      {screen === 'checkin' && (
        <CheckIn
          hasProfile={Boolean(profile)}
          competitionToday={Boolean(profile && competitions.some((item) => competitionIsToday(item)))}
          onBack={() => setScreen('home')}
          onSubmit={async (response) => {
            const result = await apiRequest('/api/responses', auth.code, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ...response, identified }),
            })
            // Anonymous responses intentionally come back without details
            // from the API. Keep the selected type in this session so the
            // swimmer still gets useful confirmation in the status card.
            setResponses((current) => [...current, { ...result.response, ...response }])
            // Show confirmation as soon as the response is persisted. The
            // surrounding dashboard data can refresh without blocking the UI.
            setScreen('thanks')
            if (profile) {
              void (async () => {
                const trainingData = await apiRequest('/api/training', auth.code)
                const tomorrow = dateKey(new Date(Date.now() + 86400000))
                const [workoutData, tomorrowData, activityData, pointsData] = await Promise.all([apiRequest('/api/workouts', auth.code), apiRequest(`/api/workouts?date=${tomorrow}`, auth.code), apiRequest('/api/activity', auth.code), apiRequest('/api/points', auth.code)])
                setWorkout(workoutData.workout)
                setWorkoutLocked(workoutData.locked)
                setTomorrowWorkout(tomorrowData.workout)
                setActiveProfilesToday(activityData.activeProfilesToday)
                setPoints(pointsData)
                setTraining(trainingData)
              })().catch(() => {})
            }
          }}
        />
      )}
      {screen === 'thanks' && <Thanks responses={responses} profile={profile} identified={identified} workout={workout} tomorrowWorkout={tomorrowWorkout} onDone={() => setScreen('home')} />}
      {screen === 'community' && <Community profile={profile} code={auth.code} points={points} onBack={() => setScreen('home')} onPointsChange={setPoints} />}
      {screen === 'goals' && <MyGoals code={auth.code} onTrainingChange={setTraining} onBack={() => setScreen('home')} />}
      {screen === 'profile' && <MyProfile profile={profile} points={points} code={auth.code} onProfileChange={setProfile} onBack={() => setScreen('home')} onProfileLogout={async () => {
        await apiRequest('/api/profiles', auth.code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'logout' }) })
        setProfile(null)
        setPoints(null)
        setTraining(null)
        setScreen('account')
      }} />}
      {screen === 'faq' && <Faq role="swimmer" onBack={() => setScreen('home')} />}
      {screen === 'legal' && <><LegalPurpose /><LegalPage onBack={() => setScreen('home')} /></>}
      <footer className="app-meta swimmer-app-meta"><span>Simkoll v{APP_VERSION}</span><span>Build {COMMIT_SHA}</span><span>Uppdaterad {new Date(BUILD_TIME).toLocaleString('sv-SE', { dateStyle: 'medium', timeStyle: 'short' })}</span></footer>
    </Shell>
  )
}

async function apiRequest(url, code, options = {}) {
  const canRetry = !options.method || options.method.toUpperCase() === 'GET'
  let lastError
  for (let attempt = 0; attempt < (canRetry ? 3 : 1); attempt += 1) {
    try {
      const result = await fetch(url, { ...options, headers: { ...options.headers, 'x-simkoll-code': code } })
      const data = await result.json().catch(() => ({}))
      if (result.ok) return data
      lastError = new Error(data.error || 'Något gick fel. Försök igen.')
      if (!canRetry || result.status < 500) throw lastError
    } catch (error) {
      lastError = error
      if (!canRetry || attempt === 2) throw error
    }
    await new Promise((resolve) => window.setTimeout(resolve, 600 * (attempt + 1)))
  }
  throw lastError || new Error('Något gick fel. Försök igen.')
}

async function fetchResponses(code) {
  const data = await apiRequest('/api/responses', code)
  return data.responses
}

function Login({ onLogin }) {
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (event) => {
    event.preventDefault()
    setLoading(true)
    setError('')
    try {
      const result = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      const data = await result.json()
      if (!result.ok) throw new Error(data.error)
      await onLogin({ role: data.role, code })
    } catch (loginError) {
      setError(loginError.message || 'Kunde inte logga in.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="login-page">
      <div className="watermark">SIMKOLL</div>
      <section className="login-card">
        <Logo />
        <div className="login-copy">
          <p className="eyebrow">Välkommen</p>
          <h1>Hur känns<br />träningen idag?</h1>
          <p>Snabb och anonym feedback som gör nästa pass ännu bättre.</p>
        </div>
        <form onSubmit={submit} className="code-form">
          <label htmlFor="code">Gruppkod</label>
          <div className={`code-field ${error ? 'has-error' : ''}`}>
            <input
              id="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength="4"
              placeholder="••••"
              value={code}
              onChange={(event) => {
                setCode(event.target.value.replace(/\D/g, ''))
                setError('')
              }}
              autoFocus
            />
            <button aria-label="Logga in" type="submit" disabled={loading}>{loading ? '…' : '→'}</button>
          </div>
          {error && <span className="error-text">{error}</span>}
        </form>
        <p className="privacy-note"><span>●</span> Dina svar är anonyma</p>
      </section>
    </main>
  )
}

function SwimmerPlanning({ code, onBack }) {
  const [plans, setPlans] = useState([])
  useEffect(() => { apiRequest('/api/workouts?planning=true', code).then((data) => setPlans(data.plans || [])).catch(() => {}) }, [code])
  return <section className="swimmer-planning"><button className="back-button inline" onClick={onBack}>← Tillbaka</button><div className="period-heading"><div><p className="eyebrow">Planering</p><h1>Veckans plan</h1><small>Planerade aktiviteter för din grupp.</small></div></div>{plans.length ? <div className="swimmer-planning-list">{plans.slice(0, 30).map((plan) => <article key={plan.id}><p className="eyebrow">{plan.date}</p><h2>{plan.title}</h2><p>{plan.activityType === 'swim' ? '🏊 Simning' : plan.activityType === 'strength' ? '🏋️ Styrka' : plan.activityType === 'dryland' ? '🤸 Landträning' : '🏆 Tävling'}{plan.focus ? ` · ${plan.focus}` : ''}</p><small>{[plan.distanceMeters && `${plan.distanceMeters} m`, plan.durationMinutes && `${plan.durationMinutes} min`, plan.location].filter(Boolean).join(' · ')}</small></article>)}</div> : <p className="empty">Ingen planering publicerad ännu.</p>}</section>
}

function SwimmerCompetitionEntries({ code, onBack }) {
  const [competitions, setCompetitions] = useState([])
  const [selectedCompetition, setSelectedCompetition] = useState(null)
  const [events, setEvents] = useState([])
  const [selected, setSelected] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  useEffect(() => { apiRequest('/api/workouts?calendar=true', code).then((data) => { const current = (data.competitions || []).filter((item) => (item.endDate || item.startDate) >= todayKey()); setCompetitions(current); if (current[0]) setSelectedCompetition(current[0].id) }).catch(() => {}).finally(() => setLoading(false)) }, [code])
  useEffect(() => { if (!selectedCompetition) return; setLoading(true); apiRequest(`/api/workouts?program=true&id=${selectedCompetition}`, code).then((data) => { setEvents((data.events || []).filter((event) => event.entryAllowed !== false)); setSelected((data.entries || []).map((entry) => entry.eventId || entry.event_id)) }).catch(() => { setEvents([]); setSelected([]) }).finally(() => setLoading(false)) }, [code, selectedCompetition])
  const save = async (submit) => { setSaving(true); try { await apiRequest('/api/workouts', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: submit ? 'submit-competition-entries' : 'save-competition-entry', competitionId: selectedCompetition, eventIds: selected }) }); window.alert(submit ? 'Dina grenar är skickade till tränarna.' : 'Utkast sparat.') } catch (error) { window.alert(error.message) } finally { setSaving(false) } }
  const competition = competitions.find((item) => item.id === selectedCompetition)
  return <section className="competition-entries"><button className="back-button inline" onClick={onBack}>← Tillbaka</button><div className="period-heading"><div><p className="eyebrow">Tävlingskalender</p><h1>Mina grenar</h1><small>Välj vilka grenar du vill simma. Tränarna ser när du skickar in.</small></div></div>{loading && <p className="empty">Hämtar tävlingsprogram…</p>}{!loading && !competitions.length && <p className="empty">Ingen kommande tävling är publicerad ännu.</p>}{competition && <><label className="settings-field"><strong>Tävling</strong><select value={selectedCompetition} onChange={(event) => setSelectedCompetition(event.target.value)}>{competitions.map((item) => <option key={item.id} value={item.id}>{item.title} · {item.startDate}</option>)}</select></label>{events.length ? <div className="competition-entry-list">{events.map((event) => <label key={event.id}><input type="checkbox" checked={selected.includes(event.id)} onChange={() => setSelected((current) => current.includes(event.id) ? current.filter((id) => id !== event.id) : [...current, event.id])} /><span><strong>{event.eventNumber ? `${event.eventNumber} · ` : ''}{event.label}</strong><small>{event.gender || 'Alla'} · {event.ageClass || 'Alla åldrar'}</small></span></label>)}</div> : <p className="empty">Tränaren har inte läst in något grenprogram ännu.</p>}<div className="settings-actions"><button className="secondary-button" disabled={saving} onClick={() => save(false)}>Spara utkast</button><button className="primary-button" disabled={saving || !selected.length} onClick={() => save(true)}>Skicka till tränarna</button></div></>}</section>
}

function Shell({ children, profile, talksEnabled, planningEnabled, onPlanning, onCompetitions, onCommunity, onGoals, onTalk, onHelp, onLegal, onProfile, onGame, onLogout }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const go = (handler) => () => { setMenuOpen(false); handler() }
  return (
    <main className="app-shell">
      {profile && onCompetitions && <button className="menu-link swimmer-competition-link" onClick={go(onCompetitions)}>Tävlingsgrenar</button>}
      <header><ClubBrand /><button className="mobile-menu-toggle" type="button" aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>{menuOpen ? 'Stäng' : 'Meny'} <span>{menuOpen ? '×' : '☰'}</span></button><div className={`header-actions ${menuOpen ? 'open' : ''}`}>{profile && planningEnabled && <button className="menu-link" onClick={go(onPlanning)}>Veckoplanering</button>}{profile && <button className="menu-link" onClick={go(onCommunity)}>Peppflödet</button>}{profile && <button className="menu-link" onClick={go(onGoals)}>Mina mål</button>}<button className="menu-link" onClick={go(onHelp)}>FAQ</button><button className="menu-link" onClick={go(onLegal)}>Info & villkor</button>{profile && <button className="profile-chip" onClick={go(onProfile)}><span>{profile.emoji}</span>{profile.displayName}</button>}{!profile && <button className="text-button" onClick={go(onLogout)}>Logga ut</button>}</div></header>
      {profile && talksEnabled && <button className="talk-shortcut" onClick={go(onTalk)}>🤝 Utvecklingssamtal</button>}
      {children}
    </main>
  )
}

function ClubBrand() {
  return (
    <div className="club-brand">
      <Logo compact />
      <span>Sundsvalls Simsällskap</span>
    </div>
  )
}

function Logo({ compact = false }) {
  return (
    <div className={`logo ${compact ? 'compact' : ''}`}>
      <span className="logo-mark">≈</span>
      <span>SIMKOLL</span>
    </div>
  )
}

const HELP_TEXT = {
  'Känsla': 'Hur dagen känns överlag just nu. Det finns inget rätt eller fel svar.',
  'Energi': 'Hur pigg eller trött simmaren känner sig.',
  'Kroppen': 'Hur fräsch, tung eller öm kroppen upplevs.',
  'Motivation': 'Hur sugen eller redo simmaren känner sig inför träningen.',
  'Sömn': 'Den egna upplevelsen av nattens sömn, inte antalet timmar.',
  'RPE': 'Upplevd ansträngning för hela passet: 1 är mycket lätt och 10 är maximalt.',
  'sRPE': 'Total upplevd belastning för ett pass: RPE × passets längd i minuter. Exempel: RPE 6 × 75 minuter = 450 belastningsenheter. Används för att följa trender, inte som en exakt medicinsk mätning.',
  'Passet': 'Upplevelsen av passet, inte ett betyg på den egna prestationen.',
  'Upplägget': 'Om passets innehåll och struktur fungerade för simmaren.',
  'Aktiva dagar': 'Dagar då profilen har använt en profilfunktion i Simkoll.',
  'Registrerade pass': 'Pass som simmaren aktivt valt att lägga till i sin veckoräknare.',
  'Poäng och nivå': 'Visar aktivitet och positiva bidrag i Simkoll, inte simförmåga.',
  'Trend': 'Ett mönster över flera svar. En enstaka skattning ska inte övertolkas.',
  'Personlig AI-analys': 'En sparad, tränarskapad sammanfattning av dina egna träningsdata. Den är ett samtalsstöd – inte en diagnos eller ett automatiskt betyg.',
  'Träningsstjärnor': 'Fyra stjärnor visar olika träningsvanor. 1) Veckan planerad: minst tre träningsdagar är planerade i Min träning den här veckan. 2) Styrka och landträning: båda målen är överenskomna och aktiva. 3) Simmål satt: ett aktivt mål för antal simpass per vecka finns. 4) Följer min simplan: under de fyra senaste avslutade veckorna har alla simpass enligt överenskommelsen genomförts, till exempel 18 av 20 = 90 %. En stjärna tänds först vid 100 %. Grå stjärna betyder att villkoret inte är uppfyllt ännu. Varje stjärna ger 1 poäng när den låses upp; poäng tas inte bort om en stjärna senare blir grå.',
  'Aktiva profiler': 'Antal simmarprofiler som använde en profilfunktion under perioden. Testprofiler räknas inte.',
  'Incheckningar': 'Antal svar som skickats in under perioden. En incheckning är inte automatiskt samma sak som ett genomfört pass.',
  'Registrerad träning': 'Pass som lagts till i träningsloggen, inklusive simpass som skapats från en genomförd check-in eller tränarens närvaroregistrering.',
  'Erbjudna simmeter': 'Summan av meter i planerade eller publicerade simpass under perioden. Det beskriver erbjuden träningsmängd, inte vad varje simmare genomförde.',
  'Närvaro mot mål': 'Genomförda simpass jämförs med summan av simmarnas överenskomna simmål för samma period. Simmare utan simmål ingår inte i procenten. Extra pass räknas inte över 100 %.',
  'Pepp i gruppen': 'Antal peppmeddelanden som skickats i gruppen under perioden.',
  'Personbästa': 'Antal nya personbästa från Tempus som registrerats under perioden.',
}

const FAQ_SCALES = {
  'Känsla': [['1', 'Mycket tung dag'], ['2', 'Ganska tungt'], ['3', 'Okej / neutralt'], ['4', 'Bra'], ['5', 'Toppen']],
  'Energi': [['1', 'Ingen energi'], ['2', 'Ganska trött'], ['3', 'Normal energi'], ['4', 'Pigg'], ['5', 'Full fart']],
  'Kroppen': [['1', 'Mycket tung, öm eller något känns inte bra'], ['2', 'Ganska tung eller sliten'], ['3', 'Som vanligt'], ['4', 'Pigg och fräsch'], ['5', 'Väldigt fräsch och redo']],
  'Motivation': [['1', 'Inte alls taggad'], ['2', 'Lite omotiverad'], ['3', 'Neutral'], ['4', 'Taggad'], ['5', 'Väldigt taggad']],
  'Sömn': [['1', 'Mycket dålig'], ['2', 'Ganska dålig'], ['3', 'Okej'], ['4', 'Bra'], ['5', 'Jättebra']],
  'RPE': [['1–2', 'Mycket lätt'], ['3–4', 'Lätt'], ['5–6', 'Medel'], ['7–8', 'Jobbigt'], ['9–10', 'Mycket jobbigt / max']],
  'Passet': [['1', 'Inte bra'], ['3', 'Helt okej'], ['5', 'Bra']],
  'Upplägget': [['1', 'Fungerade inte bra'], ['3', 'Fungerade okej'], ['5', 'Fungerade bra']],
}

const TEMPERATURE_LABELS = ['Väldigt kallt', 'Kallt', 'Perfekt', 'Varmt', 'För varmt']

function HelpTip({ term }) {
  return HELP_TEXT[term] ? <button type="button" className="help-tip" title={HELP_TEXT[term]} aria-label={`${term}: ${HELP_TEXT[term]}`}>i</button> : null
}

function Faq({ role, onBack }) {
  return <div className="faq-page">{onBack && <button className="back-button" onClick={onBack}>← Tillbaka</button>}<section className="faq-content"><p className="eyebrow">Simkolls mätningar</p><h1>Vad betyder det?</h1><p className="faq-intro">Svaren beskriver simmarens egen upplevelse. De är ett stöd för samtal och träningsplanering, inte ett prov eller en medicinsk bedömning.</p><section className="faq-install"><p className="eyebrow">Gör Simkoll lätt att hitta</p><h2>Lägg till på hemskärmen</h2><p>En genväg gör det enklare att öppna rätt sida och använda din sparade profil.</p><details><summary>iPhone eller iPad<span>+</span></summary><ol><li>Öppna Simkoll i Safari.</li><li>Tryck på dela-symbolen.</li><li>Välj <strong>Lägg till på hemskärmen</strong>.</li><li>Tryck <strong>Lägg till</strong>.</li></ol></details><details><summary>Android<span>+</span></summary><ol><li>Öppna Simkoll i Chrome.</li><li>Tryck på de tre prickarna.</li><li>Välj <strong>Lägg till på startskärmen</strong> eller <strong>Installera app</strong>.</li><li>Bekräfta.</li></ol></details><small>Webbläsaren måste alltid fråga dig först — Simkoll kan inte skapa genvägen automatiskt.</small></section><div className="faq-list">{Object.entries(HELP_TEXT).map(([term, description]) => <details key={term}><summary>{term}<span>+</span></summary><p>{description}</p>{FAQ_SCALES[term] && <div className={`rpe-guide scale-${FAQ_SCALES[term].length}`}>{FAQ_SCALES[term].map(([value, label]) => <span key={value}><b>{value}</b>{label}</span>)}</div>}</details>)}</div>{role === 'coach' && <section className="coach-interpretation"><p className="eyebrow">För tränare</p><h2>Tolka med nyfikenhet</h2><ul><li>Titta efter återkommande mönster, inte enstaka svar.</li><li>RPE är individuell och ska inte användas för att jämföra simmare.</li><li>Hög RPE är inte automatiskt negativt när passet var planerat att vara hårt.</li><li>Låg energi eller tung kropp är en signal att fråga – inte en diagnos.</li><li>Kombinera alltid appens data med samtal och egna observationer.</li><li>Gruppvärden visas först när minst tre svar finns.</li></ul></section>}</section></div>
}

function LegalPurpose() {
  return <section className="legal-purpose"><p className="eyebrow">Kort om Simkoll</p><h2>En app med simmaren i fokus</h2><p>Simkoll gör det enkelt för simmare att checka in, berätta hur träningen känns och följa sin egen utveckling över tid. För tränaren samlar appen återkoppling, träningsdata och planering på ett ställe, så att passen kan följas upp och utvecklas tillsammans med gruppen.</p><p>Simkoll är ett tränarstöd och ett verktyg för reflektion och dialog. Det är inte en medicinsk bedömning, ett automatiskt uttagningssystem eller ett beslutssystem. Appen ersätter inte tränarens omdöme, samtal med simmaren eller kontakt med vårdnadshavare och vårdpersonal.</p></section>
}

function LegalPage({ onBack }) {
  return <div className="faq-page legal-page">{onBack && <button className="back-button" onClick={onBack}>← Tillbaka</button>}<section className="faq-content"><p className="eyebrow">Simkoll</p><h1>Info & villkor</h1><p className="faq-intro">Här beskriver vi hur Simkoll används och hur information hanteras. Klubbens juridiska uppgifter och kontaktväg kompletteras innan skarp lansering.</p><div className="faq-list"><details open><summary>Integritet och data<span>−</span></summary><p>Simkoll samlar in svar om exempelvis energi, kroppskänsla, motivation, RPE, fartkänsla, temperatur och träningsupplevelse. Du väljer själv om ett svar ska vara anonymt eller kopplas till din profil.</p><p>Anonyma svar visas som gruppsammanställningar. Profilkopplade svar kan ses av behöriga tränare och av dig själv. Du kan be om information, rättelse eller radering av uppgifter via klubben.</p></details><details><summary>Personlig AI-analys<span>+</span></summary><p>En personlig analys aktiveras av tränare först efter att vårdnadshavare har godkänt det enligt klubbens rutin. Simmaren får sedan läsa den sparade analysen i sin profil. Funktionen är frivillig och kan stängas av.</p><p>Sammanställda träningsvärden skickas till en språkmodell. Namn, användarnamn och privata kommentarer skickas inte. Analysen är ett tränings- och samtalsstöd, inte en medicinsk bedömning eller ett automatiskt beslut. För information om OpenAI API:s datahantering, se <a href="https://platform.openai.com/docs/models/default-usage-policies-by-endpoint" target="_blank" rel="noreferrer">OpenAI:s officiella dokumentation</a>.</p></details><details><summary>AI för minderåriga<span>+</span></summary><p>För simmare under 18 år ska klubben inhämta vårdnadshavares godkännande och även informera simmaren på ett begripligt sätt. Godkännandet dokumenteras utanför eller i klubbens beslutade samtyckesflöde. Det ska gå att återkalla utan nackdelar.</p></details><details><summary>Användarvillkor<span>+</span></summary><p>Simkoll är ett frivilligt stöd för träningsfeedback och ersätter inte kontakt med tränare, vårdnadshavare eller vårdpersonal. Skriv inte diagnoser, personnummer eller andra känsliga uppgifter i fritextfält.</p><p>Pepp och meddelanden ska vara respektfulla. Olämpligt innehåll kan tas bort av tränare.</p></details><details><summary>Klubbens uppgifter<span>+</span></summary><p>Personuppgiftsansvarig, kontaktadress, lagringstid och information för minderåriga fylls i här innan appen används skarpt.</p></details></div><small className="legal-disclaimer">Detta är ett informationsutkast och bör granskas innan skarp användning.</small></section></div>
}

function currentStarState(training, profileId) {
  const today = todayKey(), start = weekStart(), week = dateKey(start)
  const plans = (training?.plannedSessions || []).filter((item) => !profileId || item.profileId === profileId), sessions = (training?.sessions || []).filter((item) => !profileId || item.profileId === profileId)
  const plannedWeek = plans.filter((item) => item.weekStart === week)
  const goal = (training?.seasonGoals || []).find((item) => (!profileId || item.profileId === profileId) && item.active && item.startDate <= today && item.endDate >= today) || (training?.seasonGoals || []).find((item) => (!profileId || item.profileId === profileId) && item.active)
  const cross = (training?.crossGoals || []).find((item) => (!profileId || item.profileId === profileId) && item.startDate <= today && (!item.endDate || item.endDate >= today))
  const fourWeeksStart = new Date(start); fourWeeksStart.setDate(fourWeeksStart.getDate() - 28)
  const fourWeeksStartKey = dateKey(fourWeeksStart)
  const completedFourWeeks = sessions.filter((item) => item.type === 'swim' && item.date >= fourWeeksStartKey && item.date < week).length
  const expectedFourWeeks = goal?.target ? goal.target * 4 : 0
  const monthlySwim = expectedFourWeeks > 0 && completedFourWeeks >= expectedFourWeeks
  return { weeklyPlan: new Set(plannedWeek.map((item) => item.date)).size >= 3, crossGoals: Boolean(cross?.strengthTarget > 0 && cross?.drylandTarget > 0), swimGoal: Boolean(goal?.target), monthlySwim, fourWeeksCompleted: completedFourWeeks, fourWeeksExpected: expectedFourWeeks, fourWeeksPercentage: expectedFourWeeks ? Math.round((completedFourWeeks / expectedFourWeeks) * 100) : null, weekStart: week, goalKey: goal?.startDate || cross?.startDate || 'current', month: week }
}

function StarProgress({ stars }) {
  const items = [['weeklyPlan', 'Veckan planerad'], ['crossGoals', 'Styrka och landträning'], ['swimGoal', 'Simmål satt'], ['monthlySwim', 'Månadens simmål']]
  return <div className="star-progress" aria-label="Dina stjärnor">{items.map(([key, label]) => <span key={key} className={stars[key] ? 'earned' : ''} title={`${label}: ${stars[key] ? 'klar' : 'inte klar ännu'}`}>{stars[key] ? '★' : '☆'}</span>)}</div>
}

function Home({ code, responses, profile, points, notifications, onNotificationsChange, training, workout, tomorrowWorkout, competitions, appFeedbackEnabled, starsEnabled, swimmerEffects, workoutLocked, activeProfilesToday, activityDates, onCommunity, onGoals, onGame, onVanda, onSwimgames, onAllTime, onToggleSession, onTogglePlan, onStart }) {
  const todayResponses = responses.filter((response) => dateKey(responseDate(response)) === todayKey())
  // Daily activity is stored as a Stockholm calendar date on the server.
  // Use it as the source of truth for streaks, while merging in responses
  // already present in the UI so a just-submitted check-in is shown instantly.
  const activeDates = new Set([...(activityDates || []), ...responses.map((item) => dateKey(responseDate(item)))])
  let streak = 0; const streakCursor = new Date()
  while (activeDates.has(dateKey(streakCursor))) { streak += 1; streakCursor.setDate(streakCursor.getDate() - 1) }
  const groupFeeling = todayResponses.length ? todayResponses.reduce((sum, response) => sum + response.feeling, 0) / todayResponses.length : 0
  const energized = todayResponses.length >= 3 && groupFeeling >= 4
  const nextCompetition = (competitions || []).filter((item) => (item.endDate || item.startDate) >= todayKey()).sort((a, b) => a.startDate.localeCompare(b.startDate))[0]
  const daysToCompetition = nextCompetition ? Math.max(0, Math.ceil((new Date(`${nextCompetition.startDate}T12:00:00`) - new Date(`${todayKey()}T12:00:00`)) / 86400000)) : null
  const contextClass = swimmerEffects && daysToCompetition != null ? (daysToCompetition === 0 ? 'race-day' : daysToCompetition <= 3 ? 'race-near' : 'race-coming') : swimmerEffects && workout?.focus === 'fart' ? 'speed-focus' : ''
  const raceDayActive = swimmerEffects && daysToCompetition === 0
  const stars = currentStarState(training)
  useEffect(() => { if (profile) apiRequest('/api/points', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'sync-stars', stars, streak, weekStart: stars.weekStart, goalKey: stars.goalKey, month: stars.month }) }).catch(() => {}) }, [code, profile?.id, streak, stars.weeklyPlan, stars.crossGoals, stars.swimGoal, stars.monthlySwim, stars.weekStart, stars.goalKey, stars.month])
  return (
    <div className={`page-content home${raceDayActive ? ' race-day-page' : ''}`}>
      <section className={`mood-hero ${energized ? 'energized' : ''} ${contextClass}`}>
        <p className="eyebrow light">Idag i gruppen</p>
        <h1>Så här känns det</h1>
        {profile && swimmerEffects && daysToCompetition === 0 && <div className="race-day-badge"><span className="race-flag race-flag-left" aria-hidden="true">🏁</span> RACE DAY <span className="race-flag race-flag-right" aria-hidden="true">🏁</span></div>}
        {profile && swimmerEffects && nextCompetition && <p className="mood-context">Nästa tävling: {nextCompetition.title} · {daysToCompetition === 0 ? 'idag' : `${daysToCompetition} ${daysToCompetition === 1 ? 'dag' : 'dagar'} kvar`}</p>}
        <div className="emoji-cloud" aria-label={`${todayResponses.length} svar idag`}>
          {todayResponses.length ? todayResponses.map((response, index) => (
            <span className={response.feeling === 5 ? 'top-mood' : response.feeling === 4 ? 'good-mood' : ''} key={response.id} style={{ '--delay': `${index * 40}ms` }}>
              {FEELINGS.find((item) => item.value === response.feeling)?.emoji}
            </span>
          )) : <p>Inga svar ännu – bli först!</p>}
        </div>
        <div className="response-count"><span><strong>{todayResponses.length}</strong> svar idag</span>{profile && <span className="active-count"><strong>{activeProfilesToday}</strong> profiler inne idag</span>}</div>
        {profile && streak > 0 && <div className={`streak-chip streak-cycle-${Math.floor((streak - 1) / 10) % 3} ${streak % 10 === 1 ? 'streak-static' : ''}`} style={{ '--streak-size': `${Math.min(1.8, 1 + ((streak - 1) % 10) * 0.07)}rem` }} title="Dagar i rad med en registrerad check-in"><span className="streak-flame" aria-hidden="true">🔥</span><strong>{streak}</strong> {streak === 1 ? 'dag' : 'dagar'} i rad</div>}
        {profile && starsEnabled && <StarProgress stars={stars} />}
      </section>

      {profile && responses.some((item) => dateKey(responseDate(item)) === todayKey()) && <DailyProgressCard responses={responses} />}

      {profile && <StartCard profile={profile} onStart={onStart} />}
      {profile && <WorkoutCard workout={workout} locked={workoutLocked} />}
      {profile && tomorrowWorkout && <TomorrowWorkoutCard workout={tomorrowWorkout} />}
      {profile && <NotificationCard profile={profile} notifications={notifications} onChange={onNotificationsChange} onCommunity={onCommunity} onGoals={onGoals} />}
      {profile && <RewardCard points={points} onCommunity={onCommunity} />}
      {profile && <WeeklySwimCard training={training} showStars={starsEnabled} onOpen={onGoals} onToggle={onToggleSession} onPlan={onTogglePlan} />}
      {profile && <GameCard onOpen={onGame} onVanda={onVanda} onSwimgames={onSwimgames} onAllTime={onAllTime} />}
      {profile && appFeedbackEnabled && <AppFeedbackCard code={code} />}
      {!profile && <StartCard profile={profile} onStart={onStart} />}
    </div>
  )
}

function DailyProgressCard({ responses }) {
  const todayResponse = responses.filter((item) => dateKey(responseDate(item)) === todayKey()).sort((a, b) => responseDate(b) - responseDate(a))[0]
  const todayDone = Boolean(todayResponse)
  const status = todayResponse?.type === 'before' && todayResponse.speedFeeling != null
    ? 'ska tävla'
    : todayResponse?.type === 'after' && todayResponse.speedFeeling != null
      ? 'har tävlat'
    : todayResponse?.type === 'before' ? 'ska träna'
      : todayResponse?.type === 'after' ? 'har simmat'
        : todayResponse?.type === 'sick' ? 'känner sig sjuk'
          : todayResponse?.type === 'rest' ? 'vilar idag' : null
  return <section className="daily-progress-card"><div><p className="eyebrow">Din status idag</p><h2>{todayDone ? 'Du är incheckad ✓' : 'Hur är läget?'}</h2><small>{todayDone ? `Senaste status: ${status || 'svar registrerat'}` : 'En snabb check-in hjälper dig och tränaren.'}</small></div></section>
}

function NotificationCard({ profile, notifications, onChange, onCommunity, onGoals }) {
  const storageKey = `simkoll-notifications-seen-${profile.id}`
  const [seen, setSeen] = useState(() => {
    try { return new Set(JSON.parse(window.localStorage.getItem(storageKey) || '[]')) } catch { return new Set() }
  })
  const unread = notifications.filter((item) => !seen.has(item.id))
  if (!unread.length) return null
  const dismiss = (item) => {
    const next = new Set(seen).add(item.id)
    setSeen(next)
    window.localStorage.setItem(storageKey, JSON.stringify([...next].slice(-100)))
    onChange(notifications.filter((entry) => entry.id !== item.id))
  }
  const open = (item) => { dismiss(item); if (item.type === 'goal') onGoals(); else if (item.type !== 'artifact') onCommunity() }
  return <section className="notification-card"><div className="notification-heading"><div><p className="eyebrow">Nytt för dig</p><h2>Du har fått något</h2></div><span>{unread.length}</span></div><div className="notification-list">{unread.slice(0, 4).map((item) => <article key={item.id}><span className="notification-icon">{item.icon}</span><button className="notification-content" onClick={() => open(item)}><strong>{item.title}</strong><p>{item.text}</p><small>{formatFeedDate(item.createdAt)} · Visa →</small></button><button className="notification-dismiss" aria-label="Markera som läst" onClick={() => dismiss(item)}>×</button></article>)}</div>{unread.length > 4 && <button className="notification-more" onClick={() => unread.forEach(dismiss)}>Markera alla som lästa</button>}</section>
}

function StartCard({ profile, onStart }) {
  return <section className="start-card"><div><p className="eyebrow">{profile ? `${profile.emoji} ${profile.displayName}` : 'Din tur'}</p><h2>Hur är läget?</h2><p>Det tar mindre än 20 sekunder.</p></div><button className="primary-button" onClick={onStart}>Checka in <span>→</span></button></section>
}

function GameCard({ onOpen, onVanda, onSwimgames, onAllTime }) {
  return <section className="game-card"><div><p className="eyebrow">Veckans spel</p><h2>Swimgames 🏊</h2><p>25 meter frisim, en längd och ett snabbt rytm-race mot klockan.</p><div className="game-choice"><button className="primary-button" onClick={onSwimgames}>Spela Swimgames →</button><button className="secondary-button" onClick={onVanda}>Startmästaren ↻</button><button className="secondary-button" onClick={onOpen}>Vågjakten 🐬</button><button className="secondary-button" onClick={onAllTime}>All time-topplista 🏆</button></div></div></section>
}

function AppFeedbackCard({ code, coach = false }) {
  const [open, setOpen] = useState(false); const [sent, setSent] = useState(false); const [form, setForm] = useState({ rating: 0, bestArea: '', improveArea: '', featureRequest: '', comment: '' }); const set = (key, value) => setForm((current) => ({ ...current, [key]: value }))
  const submit = async (event) => { event.preventDefault(); if (!form.rating) return; try { await apiRequest('/api/community', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'app-feedback', ...form }) }); setSent(true); setOpen(false) } catch (error) { window.alert(error.message) } }
  if (sent) return <section className="app-feedback-card compact"><span>✓</span><div><strong>Tack för feedbacken!</strong><small>Den hjälper oss att göra Simkoll bättre.</small></div></section>
  return <section className={`app-feedback-card${open ? ' open' : ''}`}><button type="button" className="app-feedback-trigger" onClick={() => setOpen((value) => !value)}><span>💬</span><div><strong>Hur kan vi göra Simkoll bättre?</strong><small>{coach ? 'Tränarfeedback · tar mindre än en minut.' : 'En snabb fråga – tar mindre än en minut.'}</small></div><b>{open ? '×' : '→'}</b></button>{open && <form onSubmit={submit} className="app-feedback-form"><fieldset><legend>Hur känns appen hittills?</legend><div className="app-rating">{['😕', '😐', '🙂', '😄', '🤩'].map((emoji, index) => <button type="button" className={form.rating === index + 1 ? 'selected' : ''} key={emoji} onClick={() => set('rating', index + 1)}>{emoji}<small>{index + 1}</small></button>)}</div></fieldset><label>Vad gillar du mest?<select value={form.bestArea} onChange={(event) => set('bestArea', event.target.value)}><option value="">Välj ett alternativ…</option><option value="checkin">Check-in</option><option value="goals">Mina mål</option><option value="games">Veckans spel</option><option value="planning">Träningsplanering</option><option value="messages">Pepp och meddelanden</option><option value="other">Annat</option></select></label><label>Vad kan bli bättre?<select value={form.improveArea} onChange={(event) => set('improveArea', event.target.value)}><option value="">Välj ett alternativ…</option><option value="speed">Snabbhet och enkelhet</option><option value="design">Design och utseende</option><option value="content">Innehåll</option><option value="features">Funktioner</option><option value="other">Annat</option></select></label><label>Vilken funktion vill du helst se?<select value={form.featureRequest} onChange={(event) => set('featureRequest', event.target.value)}><option value="">Välj ett alternativ…</option><option value="statistics">Mer statistik</option><option value="games">Fler spel</option><option value="messages">Chatt och pepp</option><option value="planning">Planering</option><option value="other">Annat</option></select></label><textarea maxLength={500} placeholder="Något du vill skriva? (frivilligt)" value={form.comment} onChange={(event) => set('comment', event.target.value)} /><button className="primary-button" disabled={!form.rating}>Skicka feedback →</button></form>}</section>
}

function AllTimeGames({ code, onBack }) {
  const [data, setData] = useState(null)
  useEffect(() => { apiRequest('/api/points?game=alltime', code).then(setData).catch(() => setData({ leaderboard: [] })) }, [code])
  return <section className="game-page"><button className="back-button inline" onClick={onBack}>← Tillbaka</button><div className="game-layout"><div><p className="eyebrow">Veckans spel</p><h1>All time-topplistan 🏆</h1><p className="game-intro">En permanent ranking från alla spel över tid. Vinnaren i varje spel får 10 poäng, sedan 9–1.</p></div><section className="game-scoreboard"><p className="eyebrow">Alla spel tillsammans</p><h2>Top 10</h2>{data?.leaderboard?.length ? <div>{data.leaderboard.map((item) => <article key={item.displayName}><b>{item.rank}</b><span>{item.emoji}</span><strong>{item.displayName}</strong><em>{item.score}</em></article>)}</div> : <p className="empty">Ingen har spelat ännu.</p>}</section></div></section>
}

const formatRaceTime = (milliseconds) => { const total = Math.max(0, Math.round(milliseconds)); const minutes = Math.floor(total / 60000); const seconds = Math.floor((total % 60000) / 1000); const hundredths = Math.floor((total % 1000) / 10); return `${minutes}:${String(seconds).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}` }
const formatRaceTimeMs = (milliseconds) => { const total = Math.max(0, Math.round(milliseconds)); const minutes = Math.floor(total / 60000); const seconds = Math.floor((total % 60000) / 1000); const millis = total % 1000; return `${minutes}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}` }
const SWIMGAMES_LENGTHS = 1
const SWIMGAMES_DISTANCE_METERS = 25

function Swimgames({ code, onBack }) {
  const [status, setStatus] = useState('ready')
  const [length, setLength] = useState(0)
  const [direction, setDirection] = useState('left')
  const [phase, setPhase] = useState('idle')
  const [turnMessage, setTurnMessage] = useState('')
  const [signal, setSignal] = useState('')
  const [speed, setSpeed] = useState(52)
  const [reactionMs, setReactionMs] = useState(null)
  const [strokeSide, setStrokeSide] = useState('')
  const [strokePulse, setStrokePulse] = useState(0)
  const [liveTime, setLiveTime] = useState(0)
  const [resultMs, setResultMs] = useState(null)
  const [gameData, setGameData] = useState({ leaderboard: [], ownBest: 0 })
  const swimmerRef = useRef(null)
  const waterFillRef = useRef(null)
  const raceRef = useRef({ start: 0, goAt: 0, distance: 0, pace: 2.1, lastArm: '', lastStroke: 0, frame: null, timers: [], lastTick: 0 })

  useEffect(() => {
    apiRequest('/api/points?game=swimgames&lifetime=true', code).then(setGameData).catch(() => {})
    return () => { cancelAnimationFrame(raceRef.current.frame); raceRef.current.timers.forEach((timer) => window.clearTimeout(timer)) }
  }, [code])

  const finish = (race, disqualified = false) => {
    if (disqualified) { cancelAnimationFrame(race.frame); race.frame = null; setStatus('disqualified'); setPhase('foul'); return }
    const simulated = Math.max(0, Math.round(performance.now() - race.start))
    setLiveTime(simulated); setResultMs(simulated); setStatus('over'); setPhase('finish')
    if (swimmerRef.current) swimmerRef.current.style.left = '94%'
    if (waterFillRef.current) { waterFillRef.current.style.width = '100%'; waterFillRef.current.style.marginLeft = '0' }
    const score = Math.max(0, 100000 - simulated)
    apiRequest('/api/points', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'submit-game-score', gameKey: 'swimgames', score }) }).then(setGameData).catch(() => {})
  }

  const loop = (now) => {
    const race = raceRef.current; const delta = Math.min(80, now - (race.lastTick || now)); race.lastTick = now
    race.pace = Math.max(1.15, race.pace - delta / 1000 * 0.42)
    race.distance = Math.min(SWIMGAMES_DISTANCE_METERS, race.distance + race.pace * delta / 1000)
    const currentProgress = race.distance / SWIMGAMES_DISTANCE_METERS
    if (race.distance >= SWIMGAMES_DISTANCE_METERS) { finish(race); return }
    setLiveTime(Math.round(now - race.start))
    setLength(currentProgress >= 1 ? SWIMGAMES_LENGTHS : 0)
    setSpeed(Math.round(Math.min(100, race.pace / 3.8 * 100)))
    if (swimmerRef.current) swimmerRef.current.style.left = `${Math.max(0, Math.min(94, currentProgress * 94))}%`
    if (waterFillRef.current) { waterFillRef.current.style.width = `${currentProgress * 100}%`; waterFillRef.current.style.marginLeft = '0' }
    race.frame = requestAnimationFrame(loop)
  }

  const start = () => {
    const race = { start: 0, goAt: 0, distance: 0, pace: 2.1, startReaction: 0, lastArm: '', lastStroke: 0, phase: 'idle', frame: null, timers: [], lastTick: 0 }
    raceRef.current = race; setLength(0); setDirection('left'); setPhase('idle'); setSpeed(0); setReactionMs(null); setStrokeSide(''); setStrokePulse(0); setLiveTime(0); setTurnMessage(''); setResultMs(null); setSignal('Vissling!'); setStatus('starting')
    if (swimmerRef.current) swimmerRef.current.style.left = '0%'
    if (waterFillRef.current) { waterFillRef.current.style.width = '0%'; waterFillRef.current.style.marginLeft = '0' }
    race.timers.push(window.setTimeout(() => setSignal('På era platser'), 700))
    race.timers.push(window.setTimeout(() => { race.goAt = performance.now(); setSignal('GO!'); setStatus('start-go'); setPhase('start') }, 1500))
  }

  const beginRace = () => { const race = raceRef.current; race.start = performance.now(); race.lastTick = race.start; race.startReaction = race.start - race.goAt; race.phase = 'swim'; setLiveTime(0); setReactionMs(Math.round(race.startReaction)); setSignal(''); setStatus('running'); setPhase('swim'); race.frame = requestAnimationFrame(loop) }

  const centerAction = () => {
    if (status === 'ready') { start(); return }
    if (status === 'starting') { setSignal('Tjuvstart!'); setTurnMessage('För tidig start – diskvalificerad'); setStatus('disqualified'); setPhase('foul'); return }
    if (status === 'start-go') beginRace()
  }

  const armStroke = (side) => {
    if (status === 'start-go') { beginRace(); return }
    if (status !== 'running') return
    const race = raceRef.current; const now = performance.now()
    if (phase === 'swim') {
      const interval = race.lastStroke ? now - race.lastStroke : 240
      const rhythmScore = Math.max(0, Math.min(100, Math.round(100 - Math.abs(interval - 220) * .42)))
      const alternationBonus = race.lastArm && race.lastArm !== side ? 0.25 : 0
      race.lastArm = side; race.lastStroke = now; race.pace = Math.min(3.8, 2.1 + rhythmScore / 100 * 1.35 + alternationBonus)
      setStrokeSide(side); setStrokePulse((value) => value + 1); setSpeed(Math.round(Math.min(100, race.pace / 3.8 * 100)))
      setTurnMessage(`${side === 'left' ? 'Vänster' : 'Höger'} ✓`)
    }
  }

  return <section className="game-page swimgames-page"><button className="back-button inline" onClick={onBack}>← Tillbaka</button><div className="game-layout"><div><p className="eyebrow">Veckans spel · Swimgames</p><h1>Swimgames 25 🏊</h1><p className="game-intro"><strong>25 m bassäng × 1 längd = 25 m.</strong> Tryck Start och växla vänster och höger så snabbt du kan.</p><div className={`swimgames-board ${status} stroke-${strokeSide} pulse-${strokePulse % 2}`}><div className="swimgames-player-track"><div><strong>{status === 'running' ? `Längd ${Math.min(length + 1, SWIMGAMES_LENGTHS)} av ${SWIMGAMES_LENGTHS}` : '25 m frisim'}</strong><small>{turnMessage || (status === 'running' ? 'Växla vänster och höger så snabbt du kan' : 'Starta när du är redo')}</small></div><div className="player-water"><span ref={swimmerRef}>🏊</span><i ref={waterFillRef} /></div><div className="player-distance"><span>{direction === 'left' ? '← Start' : 'Start →'}</span><span className="wall-label">25 m · MÅL</span></div></div><div className="swimgames-live-clock" aria-live="polite"><span>TID</span><strong>{formatRaceTimeMs(status === 'running' ? liveTime : status === 'over' ? resultMs : 0)}</strong></div>{(status === 'starting' || status === 'start-go') && <div className="swimgames-signal">🔔 <strong>{signal}</strong></div>}<div className="swim-meters"><span>⚡ Reaktion <b>{reactionMs == null ? "—" : reactionMs + " ms"}</b></span><i><em className="reaction-meter" style={{ width: (reactionMs == null ? 0 : Math.max(0, Math.min(100, 100 - reactionMs / 6))) + "%" }} /></i><span>🚀 Hastighet <b>{speed}</b></span><i><em className="speed-meter" style={{ width: speed + "%" }} /></i></div>{(status === 'over' || status === 'disqualified') && <div className="swimgames-overlay"><span>{status === 'over' ? '🏁' : status === 'disqualified' ? '🚩' : '🏊'}</span><strong>{status === 'over' ? `Din tid ${formatRaceTimeMs(resultMs)}` : status === 'disqualified' ? 'Diskvalificerad' : 'Redo för start?'}</strong><small>{status === 'over' ? 'Startreaktion och växling påverkar tiden.' : status === 'disqualified' ? 'Tjuvstart – du tryckte innan GO.' : 'Tryck Start och växla sedan vänster och höger så snabbt du kan.'}</small><button className="primary-button" onClick={start}>{status === 'over' || status === 'disqualified' ? 'Simma igen' : 'Starta race'}</button></div>}</div><div className="swimgames-controls"><button className={strokeSide === "left" ? "stroke-active" : ""} disabled={status !== "running"} onPointerDown={(event) => { event.preventDefault(); armStroke("left") }}>← Vänster</button><button className="turn" disabled={status !== "ready" && status !== "starting" && status !== "start-go"} onClick={centerAction}>Start</button><button className={strokeSide === "right" ? "stroke-active" : ""} disabled={status !== "running"} onPointerDown={(event) => { event.preventDefault(); armStroke("right") }}>Höger →</button></div></div><section className="game-scoreboard"><p className="eyebrow">Swimgames · all time</p><h2>25 frisim</h2><p className="game-best">Ditt bästa lopp: <strong>{gameData.ownBest ? formatRaceTime(100000 - gameData.ownBest) : '—'}</strong></p>{gameData.leaderboard?.length ? <div>{gameData.leaderboard.map((item) => <article key={item.profileId}><b>{item.rank}</b><span>{item.emoji}</span><strong>{item.displayName}</strong><em>{item.displayTime}</em></article>)}</div> : <p className="empty">Ingen har simmat ännu.</p>}<small>Spelets perfekta riktmärke är 9 sekunder. Topplistan sparas över tid.</small></section></div></section>
}

const TALK_STEPS = [
  ['🏊', 'Min träning', [['simPass', 'Önskat antal simpass/vecka'], ['styrka', 'Styrketräning/vecka'], ['land', 'Landträning/vecka'], ['prehab', 'Vad vill du göra för prehab/rörlighet?']]],
  ['🎯', 'Det jag vill utveckla', [['fokus', 'Vilka simsätt eller distanser vill du fokusera på?'], ['teknik', 'Vad vill du förbättra tekniskt?']]],
  ['⭐', 'Mina mål', [['kort', 'Mål på 6–12 månader'], ['lang', 'Mål på längre sikt'], ['egen', 'Vad kan du själv göra i träningen?']]],
  ['😴', 'Återhämtning', [['sovn', 'Hur fungerar sömn och återhämtning?'], ['vardag', 'Hur känns balansen mellan träning, skola och fritid?']]],
  ['🌍', 'Helheten', [['simningBra', 'Vad fungerar bra med simningen?'], ['simningBattre', 'Vad fungerar mindre bra eller kan utvecklas i simningen?'], ['gruppBra', 'Vad fungerar bra i gruppen?'], ['gruppBattre', 'Vad fungerar mindre bra eller kan utvecklas i gruppen?'], ['skolaBra', 'Vad fungerar bra med skolan?'], ['skolaBattre', 'Vad fungerar mindre bra eller kan utvecklas i skolan?'], ['hemmaBra', 'Vad fungerar bra hemma eller på fritiden?'], ['hemmaBattre', 'Vad fungerar mindre bra eller kan utvecklas hemma eller på fritiden?']]],
  ['🤝', 'Stöd', [['stod', 'Vad skulle hjälpa dig från tränarna eller gruppen?']]],
]
const TALK_FIELD_LABELS = Object.fromEntries(TALK_STEPS.flatMap(([, , fields]) => fields))

function DevelopmentTalkSwimmer({ code, onBack }) {
  const [talks, setTalks] = useState([]); const [talk, setTalk] = useState(null); const [step, setStep] = useState(0); const [saving, setSaving] = useState(false); const [status, setStatus] = useState('')
  useEffect(() => { apiRequest('/api/goals?talks=true', code).then((data) => { setTalks(data.talks || []); if (data.talks?.[0]) setTalk(data.talks[0]) }).catch(() => {}) }, [code])
  const answers = talk?.swimmerAnswers || {}
  const update = (key, value) => setTalk((current) => ({ ...(current || { swimmerAnswers: {} }), swimmerAnswers: { ...(current?.swimmerAnswers || {}), [key]: value } }))
  const save = async (nextStatus = 'draft') => { setSaving(true); try { const data = await apiRequest('/api/goals', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'save-talk', id: talk?.id, swimmerAnswers: answers, status: nextStatus }) }); setTalk(data.talk); setTalks((current) => [data.talk, ...current.filter((item) => item.id !== data.talk.id)]); setStatus(nextStatus === 'prepared' ? 'Redo för samtalet! 🙌' : 'Sparat – du kan fortsätta senare.') } catch (error) { setStatus(error.message) } finally { setSaving(false) } }
  const current = TALK_STEPS[step]
  return <div className="talk-page"><button className="back-button" onClick={onBack}>← Tillbaka</button><section className="talk-content"><p className="eyebrow">Din utveckling</p><h1>Utvecklingssamtal</h1><p className="talk-intro">En kort förberedelse inför vårt samtal. Det finns inget rätt eller fel svar.</p><div className="talk-progress"><span>{step + 1} av {TALK_STEPS.length} delar</span><i><b style={{ width: `${((step + 1) / TALK_STEPS.length) * 100}%` }} /></i></div><section className="talk-card"><h2>{current[0]} {current[1]}</h2>{current[2].map(([key, label]) => <label key={key}>{label}<textarea value={answers[key] || ''} maxLength={1000} placeholder="Skriv några rader…" onChange={(event) => update(key, event.target.value)} /></label>)}<div className="talk-actions"><button className="secondary-button" disabled={!step} onClick={() => setStep((value) => value - 1)}>← Föregående</button>{step < TALK_STEPS.length - 1 ? <button className="primary-button" onClick={() => { setStep((value) => value + 1); save() }} disabled={saving}>Nästa →</button> : <button className="primary-button" onClick={() => save('prepared')} disabled={saving}>Redo för samtalet 🙌</button>}</div>{status && <small className="talk-status">{status}</small>}</section><details className="talk-history"><summary>Tidigare samtal ({talks.length})</summary>{talks.map((item) => <p key={item.id}>{item.meetingDate} · {item.status === 'completed' ? 'Genomfört' : 'Förbereds'}</p>)}</details></section></div>
}

function Vandningsmastaren({ code, onBack }) {
  const timerRef = useRef(null)
  const goAtRef = useRef(0)
  const [status, setStatus] = useState('ready')
  const [round, setRound] = useState(0)
  const [score, setScore] = useState(0)
  const [lastReaction, setLastReaction] = useState(null)
  const [teamBonus, setTeamBonus] = useState(null)
  const [gameData, setGameData] = useState({ leaderboard: [], ownBest: 0 })

  useEffect(() => {
    apiRequest('/api/points?game=vanda&lifetime=true', code).then(setGameData).catch(() => {})
    return () => { if (timerRef.current) window.clearTimeout(timerRef.current) }
  }, [code])

  const finish = (finalScore, failed = false) => {
    setStatus(failed ? 'false' : 'over')
    apiRequest('/api/points', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'submit-game-score', gameKey: 'vanda', score: finalScore }) }).then((data) => { setGameData(data); if (data.teamBonus?.unlocked) setTeamBonus(data.teamBonus) }).catch(() => {})
  }

  const nextTurn = (nextRound, currentScore) => {
    if (nextRound >= 5) { finish(currentScore); return }
    setRound(nextRound)
    setStatus('waiting')
    timerRef.current = window.setTimeout(() => { goAtRef.current = performance.now(); setStatus('go') }, 900 + Math.random() * 1700)
  }

  const start = () => { setScore(0); setLastReaction(null); setRound(0); setStatus('waiting'); timerRef.current = window.setTimeout(() => { goAtRef.current = performance.now(); setStatus('go') }, 1000 + Math.random() * 1500) }
  const turn = () => {
    if (status === 'waiting') { if (timerRef.current) window.clearTimeout(timerRef.current); finish(0, true); return }
    if (status !== 'go') return
    const reaction = Math.round(performance.now() - goAtRef.current)
    const gained = Math.max(50, 1100 - reaction)
    const nextScore = score + gained
    setLastReaction(reaction); setScore(nextScore); nextTurn(round + 1, nextScore)
  }

  return <section className="game-page reaction-page"><button className="back-button inline" onClick={onBack}>← Tillbaka</button><div className="game-layout"><div><p className="eyebrow">Månadens spel · reaktion</p><h1>Vändningsmästaren ↻</h1><p className="game-intro">Vänta på <strong>VÄND!</strong> och tryck så snabbt du kan. Tjuvtrycker du blir rundan nollad.</p>{teamBonus && <div className="team-game-bonus">🎉 Gruppen klarade målet! Alla som deltagit får <strong>+20 poäng</strong>.</div>}<div className={`reaction-board ${status}`}><div className="pool-lanes" aria-hidden="true"><i /><i /><i /></div><span>{status === 'go' ? 'VÄND!' : status === 'waiting' ? 'Vänta…' : status === 'false' ? 'För tidigt!' : status === 'over' ? 'Bra jobbat!' : 'Redo?'}</span><small>{status === 'go' ? 'Tryck nu!' : status === 'waiting' ? `Runda ${round + 1} av 5` : status === 'false' ? 'Starta om och vänta på signalen.' : lastReaction ? `${lastReaction} ms · ${score} poäng` : 'Fem snabba vändningar.'}</small><button className="reaction-button" onClick={status === 'ready' || status === 'over' || status === 'false' ? start : turn}>{status === 'ready' ? 'Starta' : status === 'over' || status === 'false' ? 'Spela igen' : 'Tryck här!'}</button></div></div><section className="game-scoreboard"><p className="eyebrow">Månadens highscore</p><h2>Vändningslistan</h2><p className="game-best">Ditt rekord: <strong>{gameData.ownBest || 0}</strong></p>{gameData.leaderboard.length ? <div>{gameData.leaderboard.map((item) => <article key={item.profileId}><b>{item.rank}</b><span>{item.emoji}</span><strong>{item.displayName}</strong><em>{item.score}</em></article>)}</div> : <p className="empty">Ingen har spelat ännu.</p>}<small>Poängen visar snabb och schysst reaktion – inte simförmåga. När 10 olika simmare har spelat får deltagarna +20 grupppoäng.</small></section></div></section>
}

function Simpaus({ code, onBack }) {
  const canvasRef = useRef(null)
  const gameRef = useRef({ running: false })
  const [status, setStatus] = useState('ready')
  const [score, setScore] = useState(0)
  const [gameData, setGameData] = useState({ leaderboard: [], ownBest: 0 })

  useEffect(() => { apiRequest('/api/points?game=simpaus&lifetime=true', code).then(setGameData).catch(() => {}) }, [code])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined
    const ctx = canvas.getContext('2d')
    const width = canvas.width, height = canvas.height
    const draw = () => {
      const game = gameRef.current
      const gradient = ctx.createLinearGradient(0, 0, 0, height); gradient.addColorStop(0, '#123e52'); gradient.addColorStop(1, '#0b293d'); ctx.fillStyle = gradient; ctx.fillRect(0, 0, width, height)
      ctx.fillStyle = 'rgba(82,209,196,.12)'; for (let i = 0; i < 8; i += 1) { const x = (i * 53 + (game.time || 0) * 12) % width; const y = 50 + ((i * 71) % 320); ctx.beginPath(); ctx.arc(x, y, 3 + (i % 3), 0, Math.PI * 2); ctx.fill() }
      game.obstacles?.forEach((obstacle) => { ctx.fillStyle = '#c9f05a'; ctx.fillRect(obstacle.x, 0, obstacle.width, obstacle.gap - obstacle.size); ctx.fillRect(obstacle.x, obstacle.gap + obstacle.size, obstacle.width, height); ctx.fillStyle = '#a9d33e'; ctx.fillRect(obstacle.x - 4, obstacle.gap - obstacle.size - 9, obstacle.width + 8, 9); ctx.fillRect(obstacle.x - 4, obstacle.gap + obstacle.size, obstacle.width + 8, 9) })
      const y = game.y ?? height / 2; ctx.font = '30px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('🏊', 56, y + 11)
      ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.font = '800 24px Manrope, sans-serif'; ctx.fillText(String(game.score || 0), width / 2, 38)
    }
    let frame
    const loop = (time) => {
      const game = gameRef.current
      if (!game.running) { draw(); return }
      const delta = Math.min(.035, (time - (game.last || time)) / 1000); game.last = time; game.time = time / 1000; game.velocity += 920 * delta; game.y += game.velocity * delta; game.spawn = (game.spawn || 0) - delta
      if (game.spawn <= 0) { game.obstacles.push({ x: width + 10, width: 42, gap: 110 + Math.random() * 190, size: 66 }); game.spawn = 1.45 }
      ;(game.obstacles || []).forEach((obstacle) => { obstacle.x -= 145 * delta; if (!obstacle.passed && obstacle.x + obstacle.width < 56) { obstacle.passed = true; game.score += 1; setScore(game.score) } })
      game.obstacles = game.obstacles.filter((obstacle) => obstacle.x + obstacle.width > -10)
      const hit = game.y < 14 || game.y > height - 8 || game.obstacles.some((obstacle) => obstacle.x < 68 && obstacle.x + obstacle.width > 40 && (game.y < obstacle.gap - obstacle.size || game.y > obstacle.gap + obstacle.size))
      draw()
      if (hit) { game.running = false; setStatus('over'); apiRequest('/api/points', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'submit-game-score', score: game.score }) }).then(setGameData).catch(() => {}) ; return }
      frame = requestAnimationFrame(loop)
    }
    gameRef.current.loop = loop
    const flap = () => { if (gameRef.current.running) gameRef.current.velocity = -330 }
    const keydown = (event) => { if (event.code === 'Space') { event.preventDefault(); flap() } }
    window.addEventListener('keydown', keydown); canvas.addEventListener('pointerdown', flap); draw()
    return () => { window.removeEventListener('keydown', keydown); canvas.removeEventListener('pointerdown', flap); if (frame) cancelAnimationFrame(frame) }
  }, [code])

  const start = () => { gameRef.current = { ...gameRef.current, running: true, y: 210, velocity: 0, obstacles: [], score: 0, spawn: .5, time: 0, last: performance.now() }; setScore(0); setStatus('running'); gameRef.current.loop?.(gameRef.current.last) }
  return <section className="game-page"><button className="back-button inline" onClick={onBack}>← Tillbaka</button><div className="game-layout"><div><p className="eyebrow">Simpaus</p><h1>Håll dig mellan vågorna</h1><p className="game-intro">Tryck på skärmen eller mellanslag för att simma uppåt. Hur långt kommer du?</p><div className="game-board"><canvas ref={canvasRef} width="320" height="420" aria-label="Simpaus-spelet" />{status !== 'running' && <div className="game-overlay"><span>{status === 'over' ? '🌊' : '🏊'}</span><strong>{status === 'over' ? `Du fick ${score} poäng` : 'Redo?'}</strong><small>{status === 'over' ? 'Försök slå ditt rekord!' : 'Tryck på start och klicka sedan för att simma.'}</small><button className="primary-button" onClick={start}>{status === 'over' ? 'Spela igen' : 'Starta spelet'}</button></div>}</div></div><section className="game-scoreboard"><p className="eyebrow">Veckans highscore</p><h2>Topplistan</h2><p className="game-best">Ditt rekord: <strong>{gameData.ownBest || 0}</strong></p>{gameData.leaderboard.length ? <div>{gameData.leaderboard.map((item) => <article key={item.profileId}><b>{item.rank}</b><span>{item.emoji}</span><strong>{item.displayName}</strong><em>{item.score}</em></article>)}</div> : <p className="empty">Ingen har spelat ännu.</p>}<small>Spelpoäng påverkar inte din träningspoäng eller nivå.</small></section></div></section>
}

function weekStart(date = new Date()) {
  const value = new Date(date)
  value.setHours(0, 0, 0, 0)
  value.setDate(value.getDate() - ((value.getDay() + 6) % 7))
  return value
}

function currentSeasonGoal(training) {
  const today = todayKey()
  return training?.seasonGoals?.find((goal) => goal.active && goal.startDate <= today && goal.endDate >= today) || training?.seasonGoals?.find((goal) => goal.active)
}

function currentWeekSwims(training) {
  const start = weekStart()
  const end = new Date(start); end.setDate(end.getDate() + 7)
  const startKey = dateKey(start), endKey = dateKey(end)
  return training?.sessions?.filter((item) => item.type === 'swim' && (item.date ? item.date >= startKey && item.date < endKey : new Date(item.completedAt) >= start && new Date(item.completedAt) < end)).length || 0
}

const WEEK_SLOTS = [
  { key: 'morning_swim', short: 'Morgon', icon: '🌅' }, { key: 'strength', short: 'Styrka', icon: '🏋️' },
  { key: 'dryland', short: 'Land', icon: '🤸' }, { key: 'afternoon_swim', short: 'Eftermiddag', icon: '🌇' },
]

function WeeklySwimCard({ training, showStars, onOpen, onToggle, onPlan }) {
  const [saving, setSaving] = useState('')
  const [cheer, setCheer] = useState('')
  const [localSessions, setLocalSessions] = useState(null)
  const [localPlans, setLocalPlans] = useState(null)
  useEffect(() => { setLocalSessions(training?.sessions || []); setLocalPlans(training?.plannedSessions || []) }, [training])
  const goal = currentSeasonGoal(training)
  const completed = currentWeekSwims({ sessions: localSessions || training?.sessions || [] })
  const start = weekStart(), today = todayKey()
  const days = Array.from({ length: 7 }, (_, index) => { const date = new Date(start); date.setDate(date.getDate() + index); return { date: dateKey(date), label: date.toLocaleDateString('sv-SE', { weekday: 'short' }).replace('.', ''), future: dateKey(date) > today } })
  const weeklySessions = (localSessions || []).filter((item) => item.date >= dateKey(start) && item.date <= today)
  const plannedSessions = (localPlans || []).filter((item) => item.weekStart === dateKey(start))
  const plannedDays = new Set(plannedSessions.map((item) => item.date)).size
  const crossGoal = training?.crossGoals?.find((item) => item.startDate <= today && (!item.endDate || item.endDate >= today))
  const typeProgress = {
    strength: { completed: weeklySessions.filter((item) => item.type === 'strength').length, target: crossGoal?.strengthTarget || 0 },
    dryland: { completed: weeklySessions.filter((item) => item.type === 'dryland').length, target: crossGoal?.drylandTarget || 0 },
  }
  const stars = currentStarState(training)
  const toggle = async (date, slot, checked) => { const key = `${date}-${slot}`; const previous = localSessions || []; const type = slot.includes('swim') ? 'swim' : slot; const next = checked ? [...previous.filter((item) => !(item.date === date && item.slot === slot)), { date, slot, type }] : previous.filter((item) => !(item.date === date && item.slot === slot)); setLocalSessions(next); setSaving(key); try { const result = await onToggle(date, slot, checked); setCheer(result?.message || (checked ? 'Passet är registrerat! ✓' : 'Passet är avmarkerat.')) } catch (error) { setLocalSessions(previous); window.alert(error.message) } finally { setSaving('') } }
  const togglePlan = async (date, slot, checked) => { const key = `plan-${date}-${slot}`; const previous = localPlans || []; const next = checked ? [...previous.filter((item) => !(item.date === date && item.slot === slot)), { date, slot, weekStart: dateKey(start) }] : previous.filter((item) => !(item.date === date && item.slot === slot)); setLocalPlans(next); setSaving(key); try { const result = await onPlan(date, slot, checked); setCheer(result?.message || (checked ? 'Passet är planerat! 🗓️' : 'Planeringen är uppdaterad.')) } catch (error) { setLocalPlans(previous); window.alert(error.message) } finally { setSaving('') } }
  const percentage = goal ? Math.round((completed / goal.target) * 100) : null
  return <section className="weekly-training-card">
    <div className="weekly-summary"><div><p className="eyebrow">Min träning den här veckan</p><h3>{goal ? `${completed} av ${goal.target} simpass · ${percentage} %` : `${completed} simpass`}</h3>{goal ? <><div className="session-dots">{Array.from({ length: goal.target }, (_, index) => <i className={index < completed ? 'done' : ''} key={index} />)}</div><small>{completed >= goal.target ? 'Veckomålet är uppnått!' : `${goal.target - completed} simpass kvar enligt din överenskommelse`} · {weeklySessions.length} pass totalt</small></> : <small>{weeklySessions.length} pass totalt · <button onClick={onOpen}>sätt ett simmål</button></small>}<small>{plannedDays} planerade dagar · planera minst 3 dagar för +2 poäng</small>{showStars && <><StarProgress stars={stars} /><small className="star-status">{stars.fourWeeksExpected ? `Simmål senaste 4 veckorna: ${stars.fourWeeksCompleted} av ${stars.fourWeeksExpected} · ${stars.fourWeeksPercentage} %` : 'Sätt ett simmål för att följa simstjärnan.'}</small></>}</div><button onClick={onOpen}>Mina mål →</button></div>
    {crossGoal && <div className="cross-progress"><MiniGoal icon="🏋️" label="Styrka" {...typeProgress.strength} /><MiniGoal icon="🤸" label="Landträning" {...typeProgress.dryland} /></div>}
    {showStars && <details className="star-guide"><summary>Vad ger stjärnorna?</summary><small>Planera minst tre dagar · ha mål för simning, styrka och landträning · genomför simmålet under de fyra senaste avslutade veckorna.</small></details>}
    {cheer && <div className="cheer-message"><span>✨</span><strong>{cheer}</strong><button onClick={() => setCheer('')}>×</button></div>}
    <p className="plan-hint">◆ Planerat · ✓ Genomfört</p><div className="week-log"><div className="week-log-head"><span>Pass</span>{days.map((day) => <b key={day.date}>{day.label}<small>{Number(day.date.slice(-2))}</small></b>)}</div>{WEEK_SLOTS.map((slot) => <div className="week-log-row" key={slot.key}><span title={slot.short}>{slot.icon}<small>{slot.short}</small></span>{days.map((day) => { const marked = weeklySessions.some((item) => item.date === day.date && item.slot === slot.key); const planned = plannedSessions.some((item) => item.date === day.date && item.slot === slot.key); const key = `${day.date}-${slot.key}`; const planKey = `plan-${key}`; return <div className="week-cell" key={day.date}><button type="button" className={`plan-toggle ${planned ? 'planned' : ''}`} disabled={day.date < today || saving === planKey} onClick={() => togglePlan(day.date, slot.key, !planned)} aria-label={`${planned ? 'Ta bort' : 'Planera'} ${slot.short} ${day.date}`}>{planned ? '◆' : saving === planKey ? '…' : '◆'}</button><label className={`${marked ? 'marked' : ''} ${day.future ? 'future' : ''}`}><input type="checkbox" disabled={day.future || saving === key} checked={marked} onChange={(event) => toggle(day.date, slot.key, event.target.checked)} /><i>{marked ? '✓' : saving === key ? '…' : ''}</i></label></div> })}</div>)}</div>
  </section>
}

function MiniGoal({ icon, label, completed, target }) {
  const percentage = target ? Math.round((completed / target) * 100) : 0
  return <div><span>{icon}</span><p><strong>{label}: {completed} av {target}</strong><i><b style={{ width: `${Math.min(100, percentage)}%` }} /></i><small>{completed >= target ? 'Målet är klart!' : `${target - completed} pass kvar`}</small></p></div>
}

function RewardCard({ points, onCommunity }) {
  if (!points?.current) return null
  const remaining = points.next ? points.next.minPoints - points.total : 0
  const range = points.next ? points.next.minPoints - points.current.minPoints : 1
  const progress = points.next ? ((points.total - points.current.minPoints) / range) * 100 : 100
  return <>{points.recentRewards?.length > 0 && <RewardCelebration rewards={points.recentRewards} />}<section className="reward-card"><span>{points.current.emoji}</span><div><p className="eyebrow">Din nivå</p><h3>{points.current.name} · {points.total} poäng</h3><div className="reward-progress"><i style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} /></div><small>{points.next ? `${remaining} poäng till ${points.next.name}` : 'Du har nått högsta nivån!'}</small></div><button onClick={onCommunity}>Ge pepp →</button></section></>
}

function RewardCelebration({ rewards }) {
  const key = `simkoll-reward-${rewards.map((item) => item.createdAt).join('-')}`
  const [hidden, setHidden] = useState(() => window.localStorage.getItem(key) === 'hidden')
  if (hidden) return null
  return <section className="reward-celebration"><span>🎉</span><div><strong>{rewards[0].message}</strong><small>+{rewards.reduce((sum, item) => sum + item.points, 0)} poäng från dina senaste veckomål</small></div><button onClick={() => { window.localStorage.setItem(key, 'hidden'); setHidden(true) }}>×</button></section>
}

function WorkoutCard({ workout, locked }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <section className={`workout-card ${workout ? '' : 'workout-empty'}`}>
      <div className="workout-label"><span>🏊</span><div><p className="eyebrow">Endast för profiler</p><h2>Dagens pass</h2></div>{workout && !locked && <button type="button" className="workout-expand-button" onClick={() => setExpanded((value) => !value)}>{expanded ? 'Dölj ↑' : 'Visa ↓'}</button>}</div>
      {locked ? <div className="locked-workout"><span>🔒</span><div><strong>Checka in för att se passet</strong><small>Du kan fortfarande välja att svara anonymt.</small></div></div> : workout ? <div className="workout-body"><h3>{workout.title}</h3><WorkoutMeta workout={workout} />{expanded && <><WorkoutContent content={workout.content} />{workout.note && <aside><strong>Kommentar från tränaren</strong>{workout.note}</aside>}</>}</div> : <p className="empty">Tränaren har inte lagt upp något pass idag.</p>}
    </section>
  )
}

function WorkoutContent({ content }) {
  const lines = String(content || '').split(/\r?\n/).filter((line) => line.trim())
  if (!lines.length) return null
  const isSection = (line) => { const clean = line.replace(/^#+\s*/, ''); return /^(insim|uppvärmning|huvudserie|serie|ben|arm|spec|teknik|fart|avsim|nedvarvning|styrka)\b/i.test(clean) || (/^[^·]{1,42}:$/.test(clean) && !/\d/.test(clean)) }
  return <div className="workout-content">{lines.map((line, index) => { const indented = /^\s+/.test(line); const clean = line.trim().replace(/^#+\s*/, '').replace(/^[-•]\s*/, ''); if (isSection(clean)) return <h4 key={`${index}-${clean}`}>{clean.replace(/:$/, '')}</h4>; const parts = clean.split(/\s*·\s*/).map((part) => part.trim()).filter(Boolean); const timeIndex = parts.findIndex((part) => /^(?:st\.?|start|starttid)\s*[:.]?\s*[\d:.,-]+/i.test(part)); let start = timeIndex >= 0 ? parts.splice(timeIndex, 1)[0] : ''; if (!start) { const match = clean.match(/\s+(st\.?\s*[\d:.,-]+)\s*$/i); if (match) { start = match[1]; parts.splice(0, parts.length, clean.slice(0, match.index).trim()) } } return <div className={`workout-set${indented ? ' indented' : ''}`} key={`${index}-${clean}`}><span className="workout-set-main">{parts.join(' · ')}</span>{start && <span className="workout-set-time">{start.replace(/^st\.?\s*/i, 'Start ')}</span>}</div> })}</div>
}

function TomorrowWorkoutCard({ workout }) {
  return <section className="tomorrow-card"><div><p className="eyebrow">Imorgon</p><h2>{workout.title}</h2><WorkoutMeta workout={workout} /><WorkoutContent content={workout.content} /></div><span>🔓</span></section>
}

function WorkoutMeta({ workout }) {
  const focus = WORKOUT_FOCUSES.find(([value]) => value === workout.focus)?.[1]
  const groupLabels = { ungdom_orange: 'Orange', ungdom_svart: 'Svart', junior: 'Junior' }
  if (!focus && !workout.distanceMeters && !workout.durationMinutes && !workout.targetGroups?.length) return null
  return <div className="workout-meta"><span>{focus || 'Pass'}</span>{workout.distanceMeters && <span>{Number(workout.distanceMeters).toLocaleString('sv-SE')} m</span>}{workout.durationMinutes && <span>{workout.durationMinutes} min</span>}{workout.targetGroups?.length && <span>{workout.targetGroups.map((group) => groupLabels[group] || group).join(' · ')}</span>}</div>
}

function AccountChoice({ onAnonymous, onLogin, onCreate }) {
  return (
    <div className="account-page">
      <section className="account-intro">
        <p className="eyebrow">Välj hur du vill fortsätta</p>
        <h1>Vem checkar in?</h1>
        <p>Du kan alltid svara anonymt – även om du har en profil.</p>
        <div className="account-options">
          <button className="account-option anonymous" onClick={onAnonymous}><span>🥷</span><div><strong>Svara anonymt</strong><small>Snabbt, utan profil</small></div><b>→</b></button>
          <button className="account-option" onClick={onLogin}><span>👋</span><div><strong>Logga in</strong><small>Fortsätt med din profil</small></div><b>→</b></button>
          <button className="account-option" onClick={onCreate}><span>✨</span><div><strong>Skapa profil</strong><small>Välj namn och gubbe</small></div><b>→</b></button>
        </div>
      </section>
    </div>
  )
}

const PROFILE_EMOJIS = ['🏊', '🐬', '🦈', '🐙', '🐢', '🦦', '🐳', '⚡', '🌊', '🔥']

function ProfileAccess({ mode, code, onBack, onMode, onSuccess }) {
  const [form, setForm] = useState({ emoji: '🏊' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [pending, setPending] = useState(false)
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }))

  const submit = async (event) => {
    event.preventDefault()
    setLoading(true)
    setError('')
    try {
      const action = mode === 'create' ? 'create' : mode === 'reset' ? 'reset-pin' : 'login'
      const data = await apiRequest('/api/profiles', code, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...form }),
      })
      if (data.pending) setPending(true)
      else onSuccess(data.profile || null)
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setLoading(false)
    }
  }

  const title = mode === 'create' ? 'Skapa din profil' : mode === 'reset' ? 'Välj en ny PIN' : 'Välkommen tillbaka'
  if (pending) return <div className="profile-access-page"><button className="back-button" onClick={onBack}>← Tillbaka</button><section className="profile-form pending-profile-message"><span>⏳</span><p className="eyebrow">Profilen är skapad</p><h1>Väntar på tränaren</h1><p>En tränare behöver godkänna profilen innan du kan logga in. Din PIN är redan säkert sparad.</p><button className="primary-button" onClick={onBack}>Klart</button></section></div>
  return (
    <div className="profile-access-page">
      <button className="back-button" onClick={onBack}>← Tillbaka</button>
      <form className="profile-form" onSubmit={submit}>
        <p className="eyebrow">Din profil</p><h1>{title}</h1>
        {mode === 'create' && <>
          <label>Vad vill du kallas?<input required maxLength="40" placeholder="Ditt namn eller smeknamn" value={form.displayName || ''} onChange={(event) => update('displayName', event.target.value)} /></label>
          <fieldset><legend>Välj din gubbe</legend><div className="avatar-picker">{PROFILE_EMOJIS.map((emoji) => <button className={form.emoji === emoji ? 'selected' : ''} type="button" key={emoji} onClick={() => update('emoji', emoji)}>{emoji}</button>)}</div></fieldset>
        </>}
        <label>Användarnamn<input required minLength="3" maxLength="24" autoCapitalize="none" autoComplete="username" placeholder="t.ex. delfinen7" value={form.username || ''} onChange={(event) => update('username', event.target.value)} /></label>
        {mode === 'reset' && <label>Återställningskod<input required inputMode="numeric" maxLength="8" placeholder="8 siffror" value={form.resetCode || ''} onChange={(event) => update('resetCode', event.target.value.replace(/\D/g, ''))} /></label>}
        <label>{mode === 'reset' ? 'Ny fyrsiffrig PIN' : 'Fyrsiffrig PIN'}<input required inputMode="numeric" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} maxLength="4" placeholder="••••" value={(mode === 'reset' ? form.newPin : form.pin) || ''} onChange={(event) => update(mode === 'reset' ? 'newPin' : 'pin', event.target.value.replace(/\D/g, ''))} /></label>
        {error && <span className="form-error">{error}</span>}
        <button className="primary-button" disabled={loading}>{loading ? 'Vänta…' : mode === 'create' ? 'Skapa profil →' : mode === 'reset' ? 'Spara ny PIN →' : 'Logga in →'}</button>
        {mode === 'login' && <button type="button" className="form-link" onClick={() => onMode('reset')}>Glömt din PIN?</button>}
      </form>
    </div>
  )
}

function PrivacyChoice({ profile, onBack, onChoose }) {
  return (
    <div className="privacy-choice-page">
      <button className="back-button" onClick={onBack}>← Tillbaka</button>
      <section>
        <p className="eyebrow">Din check-in</p><h1>Hur vill du svara?</h1>
        <p>Du bestämmer för varje gång.</p>
        <div className="account-options">
          <button className="account-option" onClick={() => onChoose(true)}><span>{profile.emoji}</span><div><strong>Som {profile.displayName}</strong><small>Syns i din historik och för tränaren</small></div><b>→</b></button>
          <button className="account-option anonymous" onClick={() => onChoose(false)}><span>🥷</span><div><strong>Anonymt</strong><small>Kan inte kopplas till din profil</small></div><b>→</b></button>
        </div>
      </section>
    </div>
  )
}

const KUDOS_OPTIONS = [
  ['great_job', 'Grymt jobbat idag! 💪'], ['great_energy', 'Bra energi! ⚡'],
  ['nice_technique', 'Snygg teknik! 🌊'], ['thanks', 'Tack för peppen! 🙌'],
  ['fun_together', 'Kul att träna med dig! 😊'], ['strong_effort', 'Stark insats! 🔥'],
]
const GROUP_PEP_OPTIONS = [
  ['group_start', 'Nu kör vi! 🔥'], ['group_energy', 'Bra energi i gruppen idag ⚡'],
  ['group_great_job', 'Det blir ett grymt pass idag 💪'], ['group_build', 'Idag bygger vi vidare 🌊'],
  ['group_focus', 'Håll ihop hela vägen 🎯'], ['group_next', 'Ser fram emot nästa pass 🙌'],
  ['group_fun', 'Kul att simma med er! 😊'],
]

function Community({ profile, code, points, onBack, onPointsChange }) {
  const [items, setItems] = useState([])
  const [privateKudos, setPrivateKudos] = useState([])
  const [messages, setMessages] = useState([])
  const [profiles, setProfiles] = useState([])
  const [feedView, setFeedView] = useState('group')
  const [sendMode, setSendMode] = useState('private')
  const [recipientId, setRecipientId] = useState('')
  const [content, setContent] = useState('')
  const [templateKey, setTemplateKey] = useState('great_job')
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(true)
  const [polishing, setPolishing] = useState(false)

  const load = async () => {
    const cacheBust = `?feed=${Date.now()}`
    const [feed, directory] = await Promise.all([apiRequest(`/api/community${cacheBust}`, code), apiRequest('/api/profiles?directory=true', code)])
    setItems(feed.items); setPrivateKudos(feed.privateKudos || []); setMessages(feed.messages || []); setProfiles(directory.profiles); setLoading(false)
  }
  useEffect(() => {
    const refresh = () => load().catch((error) => { setStatus(error.message); setLoading(false) })
    refresh()
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [])

  const sendKudos = async (event) => {
    event.preventDefault(); setStatus('Skickar…')
    try {
      const body = sendMode === 'coach' ? { mode: 'coach', content } : { mode: sendMode, recipientId, templateKey }
      await apiRequest('/api/community', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const nextPoints = await apiRequest('/api/points', code)
      onPointsChange(nextPoints); setStatus(sendMode === 'coach' ? 'Meddelandet är skickat till tränarna!' : 'Peppen är skickad! +1 poäng'); setRecipientId(''); setContent(''); await load()
    } catch (error) { setStatus(error.message) }
  }

  return <div className="community-page"><button className="back-button" onClick={onBack}>← Tillbaka</button><div className="community-layout">
    <section className="feed-column"><div className="community-heading"><div><p className="eyebrow">Sundsvalls Simsällskap</p><h1>Peppflödet</h1></div>{points?.current && <span>{points.current.emoji} {points.total} p</span>}</div>
      <nav className="feed-tabs"><button className={feedView === 'group' ? 'active' : ''} onClick={() => setFeedView('group')}>Öppna kanalen</button><button className={feedView === 'private' ? 'active' : ''} onClick={() => setFeedView('private')}>Min privata pepp</button></nav>
      {loading ? <p className="empty">Hämtar flödet…</p> : feedView === 'group' ? (items.length ? <div className="feed-list">{items.map((item) => item.type === 'coach' ? <article className="feed-item coach-post" key={`post-${item.id}`}><span>📣</span><div><strong>Tränarna</strong><p>{item.content}</p><small>{formatFeedDate(item.createdAt)}</small></div></article> : <article className="feed-item kudos-post" key={`group-${item.id}`}><span>{item.sender.emoji}</span><div><strong>{item.sender.displayName} <b>→</b> hela gruppen</strong><p>{item.content}</p><small>{formatFeedDate(item.createdAt)}</small></div></article>)}</div> : <p className="empty">Den öppna kanalen är tom än så länge.</p>) : (privateKudos.length ? <div className="feed-list">{privateKudos.map((item) => <article className="feed-item private-post" key={`private-${item.id}`}><span>{item.sender.emoji}</span><div><strong>{item.sender.id === profile.id ? `Du → ${item.recipient.emoji} ${item.recipient.displayName}` : `${item.sender.displayName} → dig`}</strong><p>{item.content}</p><small>🔒 Privat · {formatFeedDate(item.createdAt)}</small></div></article>)}</div> : <p className="empty">Du har ingen privat pepp ännu.</p>)}
      {feedView === 'private' && messages.length > 0 && <section className="private-messages"><p className="eyebrow">Privata meddelanden</p>{messages.map((item) => <article key={item.id}><span>✉️</span><div><strong>{item.fromCoach ? 'Tränarna → dig' : 'Du → tränarna'}</strong><p>{item.content}</p><small>{formatFeedDate(item.createdAt)}</small></div></article>)}</section>}
    </section>
    <aside className="kudos-panel"><p className="eyebrow">Sprid bra energi</p><h2>Skicka pepp</h2><p>Privat till en kompis, tränarna eller öppet till hela gruppen.</p><small className="kudos-limit">4 peppmeddelanden per dag · +1 poäng per pepp</small>
      <div className="send-mode"><button className={sendMode === 'private' ? 'active' : ''} onClick={() => { setSendMode('private'); setTemplateKey('great_job') }}>Simmare</button><button className={sendMode === 'group' ? 'active' : ''} onClick={() => { setSendMode('group'); setTemplateKey('group_energy') }}>Hela gruppen</button><button className={sendMode === 'coach' ? 'active' : ''} onClick={() => setSendMode('coach')}>Tränarna</button></div>
      <form onSubmit={sendKudos}>{sendMode === 'private' && <label>Till<select required value={recipientId} onChange={(event) => setRecipientId(event.target.value)}><option value="">Välj simmare…</option>{profiles.map((item) => <option key={item.id} value={item.id}>{item.emoji} {item.displayName}</option>)}</select></label>}{sendMode === 'coach' ? <label>Meddelande<textarea required maxLength="1000" placeholder="Skriv till tränarna…" value={content} onChange={(event) => setContent(event.target.value)} /></label> : <label>Hälsning<select value={templateKey} onChange={(event) => setTemplateKey(event.target.value)}>{(sendMode === 'private' ? KUDOS_OPTIONS : GROUP_PEP_OPTIONS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>}<button className="primary-button">{sendMode === 'coach' ? 'Skicka till tränarna →' : 'Skicka pepp →'}</button>{status && <small className="kudos-status">{status}</small>}</form>
    </aside>
  </div></div>
}

function formatFeedDate(value) {
  const date = new Date(value)
  const isToday = dateKey(date) === todayKey()
  return isToday ? `Idag ${date.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}` : date.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })
}

const GOAL_STATUS = { planned: 'Planerat', active: 'Pågår', paused: 'Pausat', complete: 'Klart' }

function MyGoals({ code, onTrainingChange, onBack }) {
  const [goals, setGoals] = useState([])
  const [training, setTraining] = useState(null)
  const [loading, setLoading] = useState(true)
  const [reflection, setReflection] = useState({})
  const [talks, setTalks] = useState([])
  const [seasonForm, setSeasonForm] = useState({ title: 'Mitt höstmål', target: 4, startDate: localDateValue(), endDate: `${new Date().getFullYear()}-12-20`, reflection: '' })
  const load = () => Promise.all([apiRequest('/api/goals', code), apiRequest('/api/training', code), apiRequest('/api/goals?talks=true', code)]).then(([goalData, trainingData, talkData]) => { setGoals(goalData.goals); setTraining(trainingData); setTalks(talkData.talks || []); onTrainingChange(trainingData) }).finally(() => setLoading(false))
  useEffect(() => { load().catch((error) => window.alert(error.message)) }, [])
  const addReflection = async (goalId) => {
    const content = String(reflection[goalId] || '').trim()
    if (!content) return
    try {
      await apiRequest('/api/goals', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ goalId, content }) })
      setReflection({ ...reflection, [goalId]: '' }); await load()
    } catch (error) { window.alert(error.message) }
  }
  const saveSeasonGoal = async (event) => {
    event.preventDefault()
    try { await apiRequest('/api/training', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'season-goal', ...seasonForm, target: Number(seasonForm.target) }) }); await load() } catch (error) { window.alert(error.message) }
  }
  const completeProgram = async (assignment) => {
    try { await apiRequest('/api/training', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'complete-program', assignmentId: assignment.id, programType: assignment.program.type }) }); await load() } catch (error) { window.alert(error.message) }
  }
  const submitProgramGoal = async (goalId) => {
    try { await apiRequest('/api/training', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'submit-program-goal', goalId }) }); await load() } catch (error) { window.alert(error.message) }
  }
  const activeSeason = currentSeasonGoal(training)
  const weekCount = currentWeekSwims(training)
  return <div className="goals-page"><button className="back-button" onClick={onBack}>← Tillbaka</button><div className="goals-content"><p className="eyebrow">Ditt ansvar · din utveckling</p><h1>Min träning och mina mål</h1>{loading ? <p className="empty">Hämtar mål…</p> : <>
    <section className="season-goal-section"><div className="section-title"><div><p className="eyebrow">Simmål per vecka</p><h2>Mitt terminsmål</h2></div>{activeSeason && <span>{weekCount} / {activeSeason.target} den här veckan</span>}</div>{activeSeason ? <div className="season-active"><div className="big-session-count"><strong>{weekCount}</strong><span>av {activeSeason.target} simpass</span></div><div><h3>{activeSeason.title}</h3><p>Du har själv valt {activeSeason.target} pass per vecka.</p><div className="session-dots">{Array.from({ length: activeSeason.target }, (_, index) => <i className={index < weekCount ? 'done' : ''} key={index} />)}</div><small>{activeSeason.startDate} – {activeSeason.endDate}</small></div></div> : <form className="season-form" onSubmit={saveSeasonGoal}><label>Vad kallar du målet?<input required value={seasonForm.title} onChange={(event) => setSeasonForm({ ...seasonForm, title: event.target.value })} /></label><label>Antal simpass per vecka<input type="number" min="1" max="14" required value={seasonForm.target} onChange={(event) => setSeasonForm({ ...seasonForm, target: event.target.value })} /></label><label>Från<input type="date" required value={seasonForm.startDate} onChange={(event) => setSeasonForm({ ...seasonForm, startDate: event.target.value })} /></label><label>Till<input type="date" required value={seasonForm.endDate} onChange={(event) => setSeasonForm({ ...seasonForm, endDate: event.target.value })} /></label><label className="wide">Min tanke efter utvecklingssamtalet<textarea maxLength="1000" value={seasonForm.reflection} onChange={(event) => setSeasonForm({ ...seasonForm, reflection: event.target.value })} /></label><button className="primary-button">Spara mitt mål →</button></form>}</section>
    <section className="assigned-programs"><p className="eyebrow">Från tränarna</p><h2>Mina program</h2>{training?.assignments?.length ? training.assignments.map((assignment) => { const programGoals = training.programGoals.filter((goal) => goal.assignmentId === assignment.id); return <article key={assignment.id}><header><span>{assignment.program.type === 'strength' ? '🏋️' : '🤸'}</span><div><strong>{assignment.program.title}</strong><small>{assignment.program.type === 'strength' ? 'Styrketräning' : 'Landträning'}</small></div></header><p>{assignment.program.description}</p><pre>{assignment.program.content}</pre><button onClick={() => completeProgram(assignment)}>✓ Markera ett pass genomfört</button>{programGoals.map((goal) => <div className="program-goal" key={goal.id}><strong>🎯 {goal.title} · {goal.rewardPoints} poäng</strong><p>{goal.description}</p><span>{goal.status === 'approved' ? `Godkänt! ${goal.coachFeedback}` : goal.status === 'submitted' ? 'Väntar på tränaren' : goal.status === 'continue' ? `Fortsätt jobba · ${goal.coachFeedback}` : ''}</span>{['active', 'continue'].includes(goal.status) && <button onClick={() => submitProgramGoal(goal.id)}>Redo för godkännande →</button>}</div>)}</article> }) : <p className="empty">Inga styrke- eller landträningsprogram ännu.</p>}</section>
    <section className="development-section"><p className="eyebrow">Privat mellan dig och tränarna</p><h2>Mina utvecklingsmål</h2>{goals.length ? <div className="goal-list">{goals.map((goal) => <article className="goal-card" key={goal.id}><header><span className={`goal-status ${goal.status}`}>{GOAL_STATUS[goal.status]}</span><small>{goal.targetDate ? `Mål: ${new Date(`${goal.targetDate}T12:00:00`).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })}` : 'Inget slutdatum'}</small></header><h2>{goal.title}</h2><p>{goal.description}</p>{goal.nextStep && <div className="next-step"><strong>Nästa steg</strong><span>{goal.nextStep}</span></div>}<div className="goal-timeline">{goal.updates.map((update) => <div key={update.id}><span>{update.authorRole === 'coach' ? '🎯' : '💭'}</span><p><strong>{update.authorRole === 'coach' ? 'Tränarna' : 'Min reflektion'} {update.points > 0 && <b>+{update.points} poäng</b>}</strong><small>{update.content}</small></p></div>)}</div>{goal.status !== 'complete' && <div className="reflection-box"><input maxLength="1000" placeholder="Skriv en kort reflektion…" value={reflection[goal.id] || ''} onChange={(event) => setReflection({ ...reflection, [goal.id]: event.target.value })} /><button onClick={() => addReflection(goal.id)}>Skicka</button></div>}</article>)}</div> : <p className="empty">Inga utvecklingsmål ännu.</p>}</section>
  </>}</div></div>
}

function MyProfile({ profile, points, code, onProfileChange, onBack, onProfileLogout }) {
  const [responses, setResponses] = useState([])
  const [artifacts, setArtifacts] = useState([])
  const [competitionResults, setCompetitionResults] = useState([])
  const [developmentTalks, setDevelopmentTalks] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAnalytics, setShowAnalytics] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState({ displayName: profile.displayName, emoji: profile.emoji })
  const [editError, setEditError] = useState('')
  useEffect(() => {
    apiRequest('/api/responses?mine=true', code).then((data) => setResponses(data.responses)).finally(() => setLoading(false))
    apiRequest('/api/points?artifacts=true', code).then((data) => setArtifacts(data.artifacts || [])).catch(() => {})
    apiRequest('/api/profiles?competitionResults=true', code).then((data) => setCompetitionResults(data.results || [])).catch(() => {})
    apiRequest('/api/goals?talks=true', code).then((data) => setDevelopmentTalks(data.talks || [])).catch(() => {})
  }, [code])
  return (
    <div className="my-profile-page">
      <button className="back-button" onClick={onBack}>← Tillbaka</button>
      <section className="profile-summary"><span>{profile.emoji}</span><div><p className="eyebrow">Min profil</p><h1>{profile.displayName}</h1><small>@{profile.username}</small></div>{points?.current && <div className="profile-level"><b>{points.current.emoji} {points.current.name}</b><span>{points.total} poäng</span></div>}</section>
      {!editing ? <button className="profile-edit-button" onClick={() => { setEditForm({ displayName: profile.displayName, emoji: profile.emoji }); setEditError(''); setEditing(true) }}>✏️ Ändra namn eller emoji</button> : <form className="profile-edit-form" onSubmit={async (event) => { event.preventDefault(); setEditError(''); try { const data = await apiRequest('/api/profiles', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'update-profile', ...editForm }) }); onProfileChange(data.profile); setEditing(false) } catch (error) { setEditError(error.message) } }}><label>Visningsnamn<input maxLength="40" required value={editForm.displayName} onChange={(event) => setEditForm({ ...editForm, displayName: event.target.value })} /></label><fieldset><legend>Välj emoji</legend><div className="avatar-picker">{PROFILE_EMOJIS.map((emoji) => <button type="button" className={editForm.emoji === emoji ? 'selected' : ''} key={emoji} onClick={() => setEditForm({ ...editForm, emoji })}>{emoji}</button>)}</div><input className="custom-emoji-input" maxLength="16" aria-label="Egen emoji" placeholder="Eller skriv en egen emoji" value={editForm.emoji} onChange={(event) => setEditForm({ ...editForm, emoji: event.target.value })} /></fieldset>{editError && <p className="form-error">{editError}</p>}<div><button type="button" className="secondary-button" onClick={() => setEditing(false)}>Avbryt</button><button className="primary-button">Spara ändringar</button></div></form>}
      <section className="artifact-collection"><div><p className="eyebrow">Min samling</p><h2>Artefakter</h2><small>Små bevis på vanor, utveckling och lagkänsla.</small></div>{artifacts.length ? <div className="artifact-grid">{artifacts.map((artifact) => <article key={artifact.id} title={artifact.description}><span>{artifact.emoji}</span><strong>{artifact.name}</strong><small>{new Date(artifact.awardedAt).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })}</small></article>)}</div> : <p className="empty">Din samling är tom än så länge.</p>}</section>
      {competitionResults.length > 0 && <details className="my-competition-results"><summary><span><p className="eyebrow">Tempus Open</p><h2>Mina tävlingsresultat</h2><small>{competitionResults.length} sparade resultat · tryck för att visa</small></span><b>＋</b></summary><div className="competition-event-list">{[...new Set(competitionResults.map((item) => item.event))].sort((a, b) => a.localeCompare(b, 'sv')).map((event) => { const items = competitionResults.filter((item) => item.event === event); const best = items.slice().sort((a, b) => (a.result_time || 999999) - (b.result_time || 999999))[0]; return <details key={event}><summary><span>{event}</span><b>{best.swim_time}</b></summary><div className="competition-history">{items.slice(0, 20).map((item) => <span key={item.id}>{item.pool || 'Bassäng saknas'} · {new Date(item.result_date).toLocaleDateString('sv-SE')} · {item.swim_time}</span>)}</div></details> })}</div></details>}
      <section className="talk-history swimmer-talk-history"><p className="eyebrow">Sparat över tid</p><h2>Mina utvecklingssamtal</h2>{developmentTalks.length ? developmentTalks.map((talk) => <details key={talk.id}><summary>{talk.meetingDate} · {talk.status === 'completed' ? 'Genomfört' : 'Förbereds'} {!talk.enabled && '· Skrivskyddat'}</summary><div className="talk-history-answer">{Object.entries(talk.swimmerAnswers || {}).filter(([, value]) => value).map(([key, value]) => <p key={key}><strong>{TALK_FIELD_LABELS[key] || key}</strong><span>{value}</span></p>)}{Object.values(talk.agreement || {}).filter(Boolean).map((value) => <p key={value}><strong>Gemensam överenskommelse</strong><span>{value}</span></p>)}</div></details>) : <p className="empty">Inga utvecklingssamtal ännu.</p>}</section>
      <details className="my-history"><summary><span><h2>Min historik</h2><small>Endast svar du valde att koppla till profilen</small></span><b>＋</b></summary>{loading ? <p className="empty">Hämtar…</p> : responses.length ? responses.map((item) => <article key={item.id}><span>{FEELINGS[item.feeling - 1]?.emoji}</span><div><strong>{new Date(item.createdAt).toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'short' })}</strong><small>{DAY_TYPES.find((type) => type.value === item.type)?.title}</small></div>{item.rpe && <b>RPE {item.rpe}</b>}</article>) : <p className="empty">Inga profilsvar ännu.</p>}</details>
      {!showAnalytics ? <button className="primary-button profile-stats-button" onClick={() => setShowAnalytics(true)}>📊 Visa min statistik →</button> : <AnalysisDashboard code={code} profile={profile} selfView onBack={() => setShowAnalytics(false)} />}
      <button className="profile-logout" onClick={onProfileLogout}>Logga ut från profilen</button>
    </div>
  )
}

function CheckIn({ hasProfile, competitionToday, onBack, onSubmit }) {
  const [step, setStep] = useState(0)
  const [form, setForm] = useState({})
  const [competitionDecision, setCompetitionDecision] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const typeQuestions = form.type ? getQuestions(form.type) : []
  const raceQuestions = competitionToday && hasProfile && form.competition === true ? [{ key: 'body', title: form.type === 'after' ? 'Hur kändes kroppen under tävlingen?' : 'Hur känns kroppen inför tävlingen?', hint: '1 = väldigt tung · 5 = väldigt bra', kind: 'scale', count: 5, left: 'Tung', right: 'Bra' }, { key: 'energy', title: 'Hur känns energin?', hint: '1 = låg · 5 = hög', kind: 'scale', count: 5, left: 'Låg', right: 'Hög' }, { key: 'motivation', title: form.type === 'after' ? 'Hur kändes huvudet?' : 'Hur känns huvudet?', hint: '1 = stressat eller oroligt · 5 = lugnt och fokuserat', kind: 'scale', count: 5, left: 'Oroligt', right: 'Fokuserat' }, { key: 'speedFeeling', title: form.type === 'after' ? 'Hur var fartkänslan i tävlingen?' : 'Hur redo känns du för att tävla?', hint: '1 = låg/trög · 5 = riktigt bra', kind: 'scale', count: 5, left: 'Låg', right: 'Bra' }, { key: 'raceConcern', title: 'Behöver tränaren veta något?', hint: 'Välj bara om något behöver fångas upp idag.', kind: 'concern' }, { key: 'comment', title: 'Något du vill säga?', hint: 'Helt frivilligt – skriv en kort rad till tränaren.', kind: 'comment' }] : []
  const questions = form.competition === true ? raceQuestions : typeQuestions
  const total = 2 + questions.length

  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }))
  const next = () => setStep((current) => current + 1)
  const submit = async () => {
    setSubmitting(true)
    setSubmitted(true)
    setSubmitError('')
    try {
      await onSubmit(form)
    } catch (error) {
      setSubmitError(error.message || 'Kunde inte skicka svaret. Försök igen.')
      setSubmitted(false)
      setSubmitting(false)
    }
  }

  let content
  if (step === 0) {
    const showCompetitionChoice = competitionToday && hasProfile && competitionDecision === null
    content = (
      <Question title={showCompetitionChoice ? 'Ska du tävla idag?' : 'Hur ser din dag ut?'} hint={showCompetitionChoice ? 'Tävlingscheck-in ersätter träningsfrågan idag.' : 'Välj det som stämmer bäst just nu.'}>
        <div className="choice-stack">
          {showCompetitionChoice ? <><button className="choice-card" onClick={() => { setCompetitionDecision('before'); setForm((current) => ({ ...current, competition: true, type: 'before', registerTraining: hasProfile, trainingSlot: 'afternoon_swim' })); next() }}><span className="choice-icon">🏁</span>Ja, jag ska tävla<span>›</span></button><button className="choice-card" onClick={() => { setCompetitionDecision('after'); setForm((current) => ({ ...current, competition: true, type: 'after', registerTraining: hasProfile, trainingSlot: 'afternoon_swim' })); next() }}><span className="choice-icon">🏅</span>Jag har tävlat<span>›</span></button><button className="choice-card" onClick={() => { setCompetitionDecision('none') }}><span className="choice-icon">→</span>Nej<span>›</span></button></> : DAY_TYPES.map((type) => (
              <button key={type.value} className="choice-card" onClick={() => { const countsAsAttendance = hasProfile && (type.value === 'after' || (competitionToday && competitionDecision === 'before' && type.value === 'before')); setForm((current) => ({ ...current, type: type.value, registerTraining: countsAsAttendance, trainingSlot: type.value === 'after' || (competitionToday && competitionDecision === 'before' && type.value === 'before') ? 'afternoon_swim' : undefined })); next() }}>
              <span className="choice-icon">{type.icon}</span>{type.title}<span>›</span>
            </button>
          ))}
        </div>
      </Question>
    )
  } else if (step === 1) {
    content = (
      <Question title="Hur känns det idag?" hint="Gå på magkänslan.">
        <div className="feeling-grid">
          {FEELINGS.map((feeling) => (
            <button key={feeling.value} onClick={() => { update('feeling', feeling.value); next() }}>
              <span>{feeling.emoji}</span><small>{feeling.label}</small>
            </button>
          ))}
        </div>
      </Question>
    )
  } else {
    const question = questions[step - 2]
    content = (
      <Question title={question.title} hint={question.hint}>
        {question.kind === 'scale' && (
          <Scale
            count={question.count}
            left={question.left}
            right={question.right}
            onChange={(value) => { update(question.key, value); next() }}
          />
        )}
        {question.kind === 'rating' && (
          <div className="thumb-grid">
            {[{ value: 1, icon: '👎', label: 'Inte bra' }, { value: 3, icon: '😐', label: 'Helt okej' }, { value: 5, icon: '👍', label: 'Bra' }].map((option) => (
              <button key={option.value} onClick={() => { update(question.key, option.value); next() }}>
                <span>{option.icon}</span><small>{option.label}</small>
              </button>
            ))}
          </div>
        )}
        {question.kind === 'concern' && <div className="concern-choice"><button type="button" onClick={() => { update('raceConcern', 'sick_or_pain'); next() }}>⚠️ Jag känner mig sjuk eller har ont</button><button type="button" onClick={() => { update('raceConcern', 'none'); next() }}>Nej, inget särskilt</button></div>}
        {question.kind === 'comment' && (
          <div className="comment-box">
            <textarea autoFocus maxLength="300" placeholder="Skriv här…" value={form.comment || ''} onChange={(event) => update('comment', event.target.value)} />
            {hasProfile && (form.type === 'after' || (competitionToday && ['before', 'after'].includes(form.type) && form.competition === true)) && <div className="training-register"><label className="training-toggle"><input type="checkbox" checked={form.registerTraining === true} disabled={competitionToday && form.competition === true} onChange={(event) => update('registerTraining', event.target.checked)} /><span><strong>{competitionToday && form.competition === true ? 'Tävlingscheck-in räknas som närvaro' : 'Registrera som simpass'}</strong><small>{competitionToday && form.competition === true ? 'Ditt tävlingsdeltagande läggs i veckans simnärvaro.' : 'Läggs i din personliga veckoräknare. Feedbacken kan fortfarande vara anonym.'}</small></span></label>{form.registerTraining && !(competitionToday && form.competition === true) && <div className="swim-slot"><button type="button" className={form.trainingSlot === 'morning_swim' ? 'active' : ''} onClick={() => update('trainingSlot', 'morning_swim')}>🌅 Morgon</button><button type="button" className={form.trainingSlot === 'afternoon_swim' ? 'active' : ''} onClick={() => update('trainingSlot', 'afternoon_swim')}>🌇 Eftermiddag</button></div>}</div>}
            {submitError && <span className="error-text">{submitError}</span>}
            {submitted ? <div className="submit-confirmation" role="status"><span>✓</span><strong>Svaret sparas…</strong><small>Du kommer vidare strax.</small></div> : <div><button className="skip-button" disabled={submitting} onClick={submit}>Skicka utan kommentar</button><button className="primary-button small" disabled={submitting} onClick={submit}>Skicka svar →</button></div>}
          </div>
        )}
      </Question>
    )
  }

  return (
    <div className="checkin-page">
      <div className="progress"><span style={{ width: `${((step + 1) / total) * 100}%` }} /></div>
      <button className="back-button" onClick={step === 0 ? onBack : () => setStep((current) => current - 1)}>← Tillbaka</button>
      <div className="question-wrap">{content}</div>
      <div className="step-count">{Math.min(step + 1, total)} / {total}</div>
    </div>
  )
}

function Question({ title, hint, children }) {
  return <section className="question"><p className="eyebrow">Snabbkoll</p><h1>{title}</h1><p>{hint}</p>{children}</section>
}

function Scale({ count, left, right, onChange }) {
  return (
    <div className="scale-wrap">
      <div className={`scale-grid scale-${count}`}>
        {Array.from({ length: count }, (_, index) => <button key={index} onClick={() => onChange(index + 1)}>{index + 1}</button>)}
      </div>
      <div className="scale-labels"><span>{left}</span><span>{right}</span></div>
    </div>
  )
}

function getQuestions(type) {
  const comment = { key: 'comment', title: 'Något du vill säga?', hint: 'Helt frivilligt. Tränaren ser inte vem som har skrivit.', kind: 'comment' }
  if (type === 'after') return [
    { key: 'rpe', title: 'Hur jobbigt var passet?', hint: '1 är väldigt lätt. 10 är maxjobbigt.', kind: 'scale', count: 10, left: 'Väldigt lätt', right: 'Maxjobbigt' },
    { key: 'speedFeeling', title: 'Hur var fartkänslan?', hint: 'Din egen känsla av fart i passet.', kind: 'scale', count: 5, left: 'Trög', right: 'Riktigt bra fart' },
    { key: 'temperature', title: 'Hur kändes temperaturen?', hint: 'Tänk på helheten i träningsmiljön, inne eller ute.', kind: 'scale', count: 5, left: 'Väldigt kallt', right: 'För varmt' },
    { key: 'pass', title: 'Hur var passet?', hint: 'Din upplevelse – det finns inget rätt svar.', kind: 'rating' },
    { key: 'setup', title: 'Funkade upplägget för dig?', hint: 'Tänk på passet som helhet.', kind: 'rating' },
    { key: 'body', title: 'Hur känns kroppen nu?', hint: '1 är tung eller öm. 5 är pigg och fräsch.', kind: 'scale', count: 5, left: 'Tung', right: 'Pigg' },
    comment,
  ]
  if (type === 'before') return [
    { key: 'energy', title: 'Hur mycket energi har du?', hint: 'Gå på känslan just nu.', kind: 'scale', count: 5, left: 'Ingen energi', right: 'Full fart' },
    { key: 'body', title: 'Hur känns kroppen?', hint: '1 är tung eller öm. 5 är pigg och fräsch.', kind: 'scale', count: 5, left: 'Tung', right: 'Pigg' },
    { key: 'motivation', title: 'Hur taggad är du?', hint: 'På dagens träning.', kind: 'scale', count: 5, left: 'Inte alls', right: 'Mycket' },
    comment,
  ]
  if (type === 'sick') return [
    { key: 'body', title: 'Hur känns kroppen?', hint: '1 är riktigt hängig. 5 känns ändå okej.', kind: 'scale', count: 5, left: 'Hängig', right: 'Okej' },
    { key: 'comment', title: 'Vill du lämna en kort rad?', hint: 'Helt frivilligt – skriv inga diagnoser eller känsliga detaljer.', kind: 'comment' },
  ]
  return [
    { key: 'energy', title: 'Hur mycket energi har du?', hint: 'Gå på känslan just nu.', kind: 'scale', count: 5, left: 'Ingen energi', right: 'Full fart' },
    { key: 'body', title: 'Hur känns kroppen?', hint: '1 är tung eller öm. 5 är pigg och fräsch.', kind: 'scale', count: 5, left: 'Tung', right: 'Pigg' },
    { key: 'sleep', title: 'Hur sov du?', hint: 'Tänk på natten som helhet.', kind: 'scale', count: 5, left: 'Dåligt', right: 'Jättebra' },
    comment,
  ]
}

function Thanks({ responses, profile, identified, workout, tomorrowWorkout, onDone }) {
  const todayResponses = responses.filter((response) => dateKey(responseDate(response)) === todayKey())
  return (
    <div className="thanks-page">
      <div className="success-mark">✓</div>
      <p className="eyebrow">Klart</p>
      <h1>Tack för din check-in!</h1>
      <p>{identified ? 'Svaret har sparats i din profil.' : 'Svaret är anonymt och hjälper tränaren att göra passen bättre.'}</p>
      {profile && workout && <p className="unlock-message">🔓 Dagens pass är upplåst!</p>}
      {profile && tomorrowWorkout && <div className="tomorrow-thanks"><strong>🔓 Morgondagens pass är också upplåst!</strong><h3>{tomorrowWorkout.title}</h3><p>{tomorrowWorkout.content}</p></div>}
      <div className="mini-moods">{todayResponses.slice(-7).map((response) => <span key={response.id}>{FEELINGS[response.feeling - 1]?.emoji}</span>)}</div>
      <button className="primary-button" onClick={onDone}>{profile && workout ? 'Se dagens pass →' : 'Till dagens läge →'}</button>
    </div>
  )
}

function CoachActivitySummary({ code, selectedDate, onDateChange, aiEnabled = true }) {
  const date = selectedDate
  const [notes, setNotes] = useState([])
  const [activities, setActivities] = useState([{ type: 'day', id: date, label: 'Dagens sammanfattning' }])
  const [scope, setScope] = useState(`day:${date}`)
  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [polishing, setPolishing] = useState(false)
  const [recording, setRecording] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const recorderRef = useRef(null)
  const [message, setMessage] = useState('')

  const load = async () => {
    try {
      const noteData = await apiRequest(`/api/workouts?notes=true&date=${date}`, code)
      const loadedNotes = noteData.notes || []
      setNotes(loadedNotes)
      const dayScope = `day:${date}`
      setScope(dayScope)
      setContent(loadedNotes.find((item) => item.scopeKey === dayScope)?.content || '')
      setMessage('')
      const [planResult, calendarResult, workoutResult] = await Promise.allSettled([
        apiRequest('/api/workouts?planning=true', code),
        apiRequest('/api/workouts?calendar=true', code),
        apiRequest(`/api/workouts?date=${date}`, code),
      ])
      const planData = planResult.status === 'fulfilled' ? planResult.value : { plans: [] }
      const calendarData = calendarResult.status === 'fulfilled' ? calendarResult.value : { competitions: [] }
      const workoutData = workoutResult.status === 'fulfilled' ? workoutResult.value : {}
      const planActivities = (planData.plans || []).filter((item) => item.date === date).map((item) => ({ type: item.activityType === 'competition' ? 'competition' : 'workout', id: item.id, label: `${item.activityType === 'competition' ? 'Tävling' : 'Pass'} · ${item.title}` }))
      const competitionActivities = (calendarData.competitions || []).filter((item) => item.startDate <= date && (item.endDate || item.startDate) >= date).map((item) => ({ type: 'competition', id: item.id, label: `Tävling · ${item.title}` }))
      const workoutActivity = workoutData.workout ? [{ type: 'workout', id: workoutData.workout.id, label: `Pass · ${workoutData.workout.title}` }] : []
      const activityOptions = [{ type: 'day', id: date, label: 'Dagens sammanfattning' }, ...workoutActivity, ...planActivities, ...competitionActivities]
      setActivities(activityOptions.filter((item, index, all) => all.findIndex((candidate) => candidate.type === item.type && candidate.label === item.label) === index))
    } catch (error) {
      setMessage('Kunde inte hämta sammanfattningen.')
    }
  }

  useEffect(() => { load(); setScope(`day:${date}`) }, [code, date])
  useEffect(() => {
    const note = notes.find((item) => item.scopeKey === scope)
    setContent(note?.content || '')
    setMessage('')
  }, [scope, notes])
  const selectedActivity = activities.find((item) => `${item.type}:${item.id}` === scope) || activities[0]
  const save = async () => {
    if (!content.trim()) return setMessage('Skriv något innan du sparar.')
    setSaving(true); setMessage('')
    try {
      const data = await apiRequest('/api/workouts', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'save-coach-note', noteDate: date, activityType: selectedActivity.type, activityId: selectedActivity.type === 'day' ? null : selectedActivity.id, content }) })
      setNotes((current) => [data.note, ...current.filter((item) => item.scopeKey !== data.note.scopeKey)])
      setScope(data.note.scopeKey); setMessage('Sammanfattningen är sparad.')
    } catch (error) { setMessage(error.message) } finally { setSaving(false) }
  }
  const polish = async () => {
    if (!aiEnabled) return setMessage('AI-stöd är avstängt i webapp-inställningarna.')
    if (!content.trim()) return setMessage('Skriv några stödord först.')
    setPolishing(true); setMessage('Förbättrar texten…')
    try {
      const data = await apiRequest('/api/workouts', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'polish-coach-note', noteDate: date, activityLabel: selectedActivity.label, content }) })
      setContent(data.text || content); setMessage(data.usedAi ? 'Texten är förbättrad – kontrollera den och spara.' : 'AI-stöd är inte tillgängligt just nu. Du kan redigera texten själv.')
    } catch (error) { setMessage(error.message) } finally { setPolishing(false) }
  }
  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return setMessage('Den här webbläsaren stöder inte ljudinspelning.')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((type) => MediaRecorder.isTypeSupported(type)) || ''
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      const chunks = []
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data) }
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop())
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' })
        const reader = new FileReader()
        reader.onload = async () => {
          setTranscribing(true); setMessage('Transkriberar inspelningen…')
          try {
            const data = await apiRequest('/api/workouts', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'transcribe-audio', dataUrl: reader.result, mimeType: blob.type }) })
            if (data.error) throw new Error(data.error)
            setContent((current) => current.trim() ? `${current.trim()}\n\n${data.text || ''}`.trim() : (data.text || ''))
            setMessage(data.text ? 'Transkriberingen är klar – kontrollera texten före sparning.' : 'Inget tal kunde urskiljas.')
          } catch (error) { setMessage(error.message) } finally { setTranscribing(false) }
        }
        reader.readAsDataURL(blob)
      }
      recorderRef.current = recorder; recorder.start(); setRecording(true); setMessage('Spelar in… tryck på stoppa när du är klar.')
    } catch (error) { setMessage(error.name === 'NotAllowedError' ? 'Mikrofontillstånd nekades. Tillåt mikrofonen i webbläsaren.' : 'Kunde inte starta inspelningen.') }
  }
  const stopRecording = () => { recorderRef.current?.stop(); recorderRef.current = null; setRecording(false) }
  return <section className="coach-card coach-activity-summary"><div className="coach-activity-summary-head"><div><p className="eyebrow">Gruppens dokumentation</p><h2>{date === todayKey() ? 'Sammanfatta idag' : 'Sammanfatta vald dag'}</h2><p className="muted">Koppla texten till dagen, ett pass eller en tävling. Tidigare sammanfattningar kan öppnas och ändras.</p></div><span className="coach-note-icon">📝</span></div><label>Vad gäller sammanfattningen?<select value={scope} onChange={(event) => setScope(event.target.value)}>{activities.map((item) => <option key={`${item.type}:${item.id}`} value={`${item.type}:${item.id}`}>{item.label}</option>)}</select></label><textarea value={content} onChange={(event) => setContent(event.target.value)} placeholder="Skriv stödord eller en kort sammanfattning…" maxLength={5000} /><div className="coach-recording-actions"><button type="button" className={recording ? 'recording-button' : 'secondary-button'} onClick={recording ? stopRecording : startRecording} disabled={transcribing || polishing || saving}>{recording ? '⏹ Stoppa inspelning' : '🎙️ Spela in sammanfattning'}</button>{transcribing && <small>Bearbetar ljudet…</small>}</div><div className="coach-activity-summary-actions">{aiEnabled ? <button type="button" className="secondary-button" onClick={polish} disabled={polishing || saving || recording || transcribing}>{polishing ? 'Förbättrar…' : '✨ Förbättra med språkmodell'}</button> : <small className="settings-note">AI-stöd är avstängt</small>}<button type="button" className="primary-button small" onClick={save} disabled={saving || polishing || recording || transcribing}>{saving ? 'Sparar…' : 'Spara sammanfattning'}</button></div>{message && <small className="coach-note-status">{message}</small>}{aiEnabled && <p className="coach-note-disclaimer">Ljudet används bara för transkribering och sparas inte i Simkoll. Kontrollera alltid texten före sparning.</p>}</section>
}

function Coach({ responses, profiles, pendingProfiles, onProfilesChange, activeProfilesToday, code, loading, onLogout, onClear }) {
  const [view, setView] = useState('today')
  const [summaryDate, setSummaryDate] = useState(todayKey())
  const [selectedGroups, setSelectedGroups] = useState(['ungdom_orange', 'ungdom_svart', 'junior'])
  const [competitionResults, setCompetitionResults] = useState([])
  const [competitionLoading, setCompetitionLoading] = useState(false)
  const [talksGlobalEnabled, setTalksGlobalEnabled] = useState(true)
  const [navigationSettings, setNavigationSettings] = useState({ overview: {}, coach: {} })
  useEffect(() => { apiRequest('/api/goals?talks=true', code).then((data) => setTalksGlobalEnabled(data.globalEnabled !== false)).catch(() => {}) }, [code])
  useEffect(() => { apiRequest('/api/goals?settings=true', code).then((data) => setNavigationSettings(data.settings || { overview: {}, coach: {} })).catch(() => {}) }, [code])
  useEffect(() => { const onSettings = (event) => setNavigationSettings(event.detail || { overview: {}, coach: {} }); window.addEventListener('simkoll-settings-updated', onSettings); return () => window.removeEventListener('simkoll-settings-updated', onSettings) }, [])
  useEffect(() => { const labels = { Simmare: 'swimmers', Pass: 'workout', Meddelanden: 'community', Grupper: 'groups', Appfeedback: 'app-feedback', Loggar: 'logs', 'Veckomöte': 'meeting', Grupptrend: 'trends', Historik: 'history', 'Tävlingsresultat': 'competition', Utvecklingssamtal: 'talks', Utvecklingsmål: 'goals', 'Träningsprogram': 'programs', 'Poäng & nivåer': 'rewards', FAQ: 'faq', 'Info & villkor': 'legal' }; const menu = document.querySelector('.coach-header-menu > div'); if (!menu) return; menu.querySelectorAll('button').forEach((button) => { const key = labels[button.textContent.trim()]; if (key) button.style.display = navigationSettings.coach?.[key] === false ? 'none' : ''; }); }, [navigationSettings])
  useEffect(() => {
    const menu = document.querySelector('.coach-header-menu > div')
    if (!menu) return undefined
    const added = []
    if (!menu.querySelector('[data-settings-link]')) {
      const button = document.createElement('button')
      button.type = 'button'; button.dataset.settingsLink = 'true'; button.textContent = 'Inställningar'
      button.onclick = () => { setView('settings'); const details = menu.parentElement; if (details) details.open = false }
      menu.insertBefore(button, menu.lastElementChild); added.push(button)
    }
    return () => (added || []).forEach((button) => button.remove())
  }, [])
  useEffect(() => {
    const closeMenus = (event) => {
      if (event.target.closest('.coach-header-menu, .coach-group-filter')) return
      document.querySelectorAll('.coach-header-menu[open], .coach-group-filter[open]').forEach((menu) => { menu.open = false })
    }
    document.addEventListener('click', closeMenus)
    return () => document.removeEventListener('click', closeMenus)
  }, [])
  const aiEnabled = navigationSettings.aiEnabled !== false
  const overviewVisible = (key) => key === 'today' || navigationSettings.overview?.[key] !== false
  const overviewItems = [{ key: 'today', label: 'Idag', mobile: 'Idag' }, { key: 'swimmers', label: 'Simmare', mobile: 'Simmare' }, { key: 'workout', label: 'Pass', mobile: 'Pass' }, { key: 'planning', label: 'Planering', mobile: 'Plan' }, { key: 'competition-calendar', label: 'Tävlingar', mobile: 'Tävling' }, { key: 'community', label: 'Meddelanden', mobile: 'Meddelanden' }, { key: 'meeting', label: 'Veckomöte', mobile: 'Möte' }, { key: 'trends', label: 'Grupptrend', mobile: 'Trend' }, { key: 'history', label: 'Historik', mobile: 'Historik' }, { key: 'week', label: 'Förra veckan', mobile: 'Förra veckan' }, { key: 'talks', label: 'Utvecklingssamtal', mobile: 'Samtal' }, { key: 'competition', label: 'Tävlingsresultat', mobile: 'Resultat' }, { key: 'workout-library', label: 'Passbibliotek', mobile: 'Bibliotek' }, { key: 'goals', label: 'Utvecklingsmål', mobile: 'Mål' }, { key: 'programs', label: 'Träningsprogram', mobile: 'Program' }, { key: 'rewards', label: 'Poäng & nivåer', mobile: 'Poäng' }, { key: 'groups', label: 'Grupper', mobile: 'Grupper' }, { key: 'app-feedback', label: 'Appfeedback', mobile: 'Feedback' }, { key: 'faq', label: 'FAQ', mobile: 'FAQ' }, { key: 'legal', label: 'Info & villkor', mobile: 'Info' }, { key: 'settings', label: 'Inställningar', mobile: 'Inställn.' }]
  const orderedOverviewKeys = [...(navigationSettings.overviewOrder || []), ...overviewItems.map((item) => item.key)].filter((key, index, keys) => keys.indexOf(key) === index)
  const orderedOverviewItems = orderedOverviewKeys.map((key) => overviewItems.find((item) => item.key === key)).filter(Boolean)
  const toggleAllTalks = async () => { try { const next = !talksGlobalEnabled; await apiRequest('/api/goals', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'toggle-talk-global', enabled: next }) }); setTalksGlobalEnabled(next) } catch (error) { window.alert(error.message) } }
  const loadCompetitionResults = () => { setCompetitionLoading(true); apiRequest('/api/profiles?tempusResults=true', code).then((data) => setCompetitionResults(data.results || [])).catch(() => {}).finally(() => setCompetitionLoading(false)) }
  const groupOptions = [['ungdom_orange', 'Ungdom Orange'], ['ungdom_svart', 'Ungdom Svart'], ['junior', 'Junior']]
  const allGroupsSelected = selectedGroups.length === groupOptions.length
  const groupFilteredProfiles = allGroupsSelected ? profiles : profiles.filter((profile) => selectedGroups.includes(profile.trainingGroup))
  const groupFilteredIds = new Set(groupFilteredProfiles.map((profile) => profile.id))
  const groupFilteredResponses = responses.filter((response) => !response.profileId ? allGroupsSelected : groupFilteredIds.has(response.profileId))
  const previousWeek = previousWeekRange()
  const todayResponses = groupFilteredResponses.filter((response) => dateKey(responseDate(response)) === todayKey())
  const selectedDateResponses = groupFilteredResponses.filter((response) => dateKey(responseDate(response)) === summaryDate)
  const selectedActiveProfiles = new Set(selectedDateResponses.map((item) => item.profileId).filter(Boolean)).size
  const previousWeekResponses = groupFilteredResponses.filter((response) => {
    const date = responseDate(response)
    return date >= previousWeek.start && date <= previousWeek.end
  })
  const scopedResponses = view === 'today' ? todayResponses : previousWeekResponses

  const previousWeekLabel = `${previousWeek.start.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })}–${previousWeek.end.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })}`
  const openViewFromMenu = (nextView) => { setView(nextView); if (nextView === 'competition') loadCompetitionResults(); const menu = document.querySelector('.coach-header-menu'); if (menu) menu.open = false }
  const shiftSummaryDate = (days) => { const next = new Date(`${summaryDate}T12:00:00`); next.setDate(next.getDate() + days); setSummaryDate(dateKey(next)) }
  const summaryDateLabel = new Date(`${summaryDate}T12:00:00`).toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <main className="coach-shell">
      <header><ClubBrand /><details className="coach-group-filter coach-group-filter-header"><summary>Grupper{selectedGroups.length === groupOptions.length ? '' : ` · ${selectedGroups.length}`}</summary><div><strong>Visa grupper</strong>{groupOptions.map(([value, label]) => <label key={value}><input type="checkbox" checked={selectedGroups.includes(value)} onChange={() => setSelectedGroups((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value])} />{label}</label>)}<button type="button" onClick={() => setSelectedGroups(groupOptions.map(([value]) => value))}>Alla grupper</button></div></details><details className="coach-header-menu"><summary><span className="coach-badge">Tränarvy⌄</span></summary><div><strong>Arbeta</strong><button type="button" onClick={() => openViewFromMenu('workout')}>Pass</button><button type="button" onClick={() => openViewFromMenu('swimmers')}>Simmare</button><button type="button" onClick={() => openViewFromMenu('groups')}>Grupper</button><button type="button" onClick={() => openViewFromMenu('community')}>Meddelanden</button><strong>Följa upp</strong><button type="button" onClick={() => openViewFromMenu('meeting')}>Veckomöte</button><button type="button" onClick={() => openViewFromMenu('trends')}>Grupptrend</button><button type="button" onClick={() => openViewFromMenu('history')}>Historik</button><button type="button" onClick={() => openViewFromMenu('competition')}>Tävlingsresultat</button><strong>Planera & stötta</strong><button type="button" onClick={() => openViewFromMenu('talks')}>Utvecklingssamtal</button><button type="button" onClick={() => openViewFromMenu('goals')}>Utvecklingsmål</button><button type="button" onClick={() => openViewFromMenu('programs')}>Träningsprogram</button><button type="button" onClick={() => openViewFromMenu('rewards')}>Poäng & nivåer</button><button type="button" onClick={() => openViewFromMenu('faq')}>FAQ</button><button type="button" onClick={() => openViewFromMenu('app-feedback')}>Appfeedback</button><button type="button" onClick={() => openViewFromMenu('logs')}>Loggar</button><button type="button" onClick={() => openViewFromMenu('legal')}>Info & villkor</button><button type="button" onClick={onLogout}>Logga ut</button></div></details></header>
      <div className="coach-content">
        <button className="competition-submissions-link" type="button" onClick={() => openViewFromMenu('competition-entries')}>🏁 Tävlingsanmälningar</button>
        <nav className="coach-tabs" aria-label="Tränarens meny">
          <div className="coach-tab-group"><span className="coach-tab-label">Översikt</span><div className="coach-tab-buttons">
            {orderedOverviewItems.filter((item) => overviewVisible(item.key)).map((item) => <button key={item.key} className={view === item.key ? 'active' : ''} onClick={() => { setView(item.key); if (item.key === 'competition') loadCompetitionResults() }}><span className="desktop-tab-label">{item.label}</span><span className="mobile-tab-label">{item.mobile}</span>{item.key === 'swimmers' && pendingProfiles.length > 0 && <b className="tab-count">{pendingProfiles.length}</b>}</button>)}
          </div></div>
          <details className="coach-tools-menu legacy-tools"><summary>Verktyg <span>⌄</span></summary><div className="coach-tab-buttons">
            <button className={view === 'trends' ? 'active' : ''} onClick={() => setView('trends')}><span className="desktop-tab-label">Grupptrend</span><span className="mobile-tab-label">Trend</span></button>
            <button className={view === 'history' ? 'active' : ''} onClick={() => setView('history')}><span className="desktop-tab-label">Historik</span><span className="mobile-tab-label">Historik</span></button>
            <button className={view === 'week' ? 'active' : ''} onClick={() => setView('week')}><span className="desktop-tab-label">Förra veckan</span><span className="mobile-tab-label">Förra veckan</span></button>
            <button className={view === 'talks' ? 'active' : ''} onClick={() => setView('talks')}><span className="desktop-tab-label">Utvecklingssamtal</span><span className="mobile-tab-label">Samtal</span></button>
            <button className={view === 'competition' ? 'active' : ''} onClick={() => { setView('competition'); loadCompetitionResults() }}><span className="desktop-tab-label">Tävlingsresultat</span><span className="mobile-tab-label">Resultat</span></button>
            <button className={view === 'workout-library' ? 'active' : ''} onClick={() => setView('workout-library')}><span className="desktop-tab-label">Passbibliotek</span><span className="mobile-tab-label">Bibliotek</span></button>
            <button className={view === 'community' ? 'active' : ''} onClick={() => setView('community')}><span className="desktop-tab-label">Meddelanden</span><span className="mobile-tab-label">Meddelanden</span></button>
            <button className={view === 'goals' ? 'active' : ''} onClick={() => setView('goals')}><span className="desktop-tab-label">Utvecklingsmål</span><span className="mobile-tab-label">Mål</span></button>
            <button className={view === 'programs' ? 'active' : ''} onClick={() => setView('programs')}><span className="desktop-tab-label">Träningsprogram</span><span className="mobile-tab-label">Program</span></button>
            <button className={view === 'rewards' ? 'active' : ''} onClick={() => setView('rewards')}><span className="desktop-tab-label">Poäng & nivåer</span><span className="mobile-tab-label">Poäng</span></button>
            <button className={view === 'faq' ? 'active' : ''} onClick={() => setView('faq')}><span className="desktop-tab-label">FAQ</span><span className="mobile-tab-label">FAQ</span></button>
            <button className={view === 'legal' ? 'active' : ''} onClick={() => setView('legal')}><span className="desktop-tab-label">Info & villkor</span><span className="mobile-tab-label">Info</span></button>
          </div></details>
        </nav>
        {view === 'today' && <section className="coach-heading coach-overview-card"><div><p className="eyebrow">Gruppens läge</p><h1>{summaryDate === todayKey() ? 'Idag' : 'Överblick'}</h1><div className="coach-top-date-controls"><button type="button" className="secondary-button" onClick={() => shiftSummaryDate(-1)} aria-label="Föregående dag">←</button><span>{summaryDateLabel}</span><input type="date" value={summaryDate} onChange={(event) => event.target.value && setSummaryDate(event.target.value)} aria-label="Välj datum" /><button type="button" className="secondary-button" onClick={() => shiftSummaryDate(1)} aria-label="Nästa dag">→</button><button type="button" className="secondary-button" onClick={() => setSummaryDate(todayKey())}>Idag</button></div></div><div className="usage-summary"><div className="usage-stat"><strong>{summaryDate === todayKey() ? activeProfilesToday : selectedActiveProfiles}</strong><span>{summaryDate === todayKey() ? 'aktiva profiler idag' : 'profiler med svar'}</span></div><b className="usage-divider">·</b><div className="usage-stat"><strong>{selectedDateResponses.length}</strong><span>svar</span></div>{selectedDateResponses.some((item) => item.type === 'sick') && <><b className="usage-divider">·</b><div className="usage-stat"><strong className="sick-count">{selectedDateResponses.filter((item) => item.type === 'sick').length}</strong><span>sjuka</span></div></>}</div></section>}
        {view === 'talks' && <section className="global-talk-setting"><span><strong>Utvecklingssamtal för gruppen</strong><small>{talksGlobalEnabled ? 'Simmarna kan förbereda och redigera sina samtal.' : 'Samtalen är skrivskyddade och dolda som genväg.'}</small></span><button className={`talk-switch ${talksGlobalEnabled ? 'on' : ''}`} onClick={toggleAllTalks}>{talksGlobalEnabled ? 'På' : 'Av'}</button></section>}

        {loading ? <section className="empty-period"><span>≈</span><h2>Hämtar svar…</h2></section> : view === 'logs' ? (
          <AuditLogs code={code} />
        ) : view === 'faq' ? (
          <Faq role="coach" />
        ) : view === 'legal' ? (
          <><LegalPurpose /><LegalPage /></>
        ) : view === 'trends' ? (
          <AnalysisDashboard code={code} aiEnabled={aiEnabled} />
        ) : view === 'rewards' ? (
          <CoachRewards code={code} />
        ) : view === 'meeting' ? (
          <WeeklyMeeting code={code} profiles={groupFilteredProfiles} />
        ) : view === 'programs' ? (
          <CoachPrograms code={code} profiles={groupFilteredProfiles} />
        ) : view === 'goals' ? (
          <CoachGoals code={code} profiles={groupFilteredProfiles} />
        ) : view === 'talks' ? (
          <DevelopmentTalkCoach code={code} profiles={groupFilteredProfiles} />
        ) : view === 'community' ? (
          <CoachCommunity code={code} profiles={groupFilteredProfiles} />
        ) : view === 'workout' ? (
          <WorkoutEditor code={code} responses={groupFilteredResponses} aiEnabled={aiEnabled} />
        ) : view === 'planning' ? (
          <><SportAdminImport code={code} /><CoachPlanning code={code} /></>
        ) : view === 'competition-calendar' ? (
          <CompetitionSubmissionBoundary><CompetitionCalendar code={code} /></CompetitionSubmissionBoundary>
        ) : view === 'competition-entries' ? (
          <CompetitionSubmissionBoundary><CompetitionSubmissionManager code={code} /></CompetitionSubmissionBoundary>
        ) : view === 'settings' ? (
          <WebappSettings code={code} />
        ) : view === 'groups' ? (
          <CoachGroups code={code} profiles={groupFilteredProfiles} onProfilesChange={onProfilesChange} />
        ) : view === 'app-feedback' ? (
          <CoachAppFeedback code={code} />
        ) : view === 'workout-library' ? (
          <WorkoutLibrary code={code} responses={responses} />
        ) : view === 'swimmers' ? (
          <Swimmers profiles={groupFilteredProfiles} pendingProfiles={pendingProfiles} onProfilesChange={onProfilesChange} responses={groupFilteredResponses} code={code} />
        ) : view === 'competition' ? (
          <CompetitionResults profiles={profiles} results={competitionResults} loading={competitionLoading} code={code} onSync={() => { setCompetitionLoading(true); apiRequest('/api/profiles', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'sync-tempus-results' }) }).then((data) => { if (data.failures?.length) window.alert(`Tempus synk: ${data.synced} sparade, ${data.failures.length} misslyckades.`); return loadCompetitionResults() }).finally(() => setCompetitionLoading(false)) }} onSyncProfile={(profileId) => { setCompetitionLoading(true); apiRequest('/api/profiles', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'sync-tempus-results', profileId }) }).then((data) => { if (data.failures?.length) window.alert(`Tempus synk misslyckades: ${data.failures[0]}`); return loadCompetitionResults() }).finally(() => setCompetitionLoading(false)) }} />
        ) : view === 'history' ? (
          <History responses={groupFilteredResponses} />
        ) : (
          <>{view === 'today' && <AttendancePanel code={code} profiles={groupFilteredProfiles} responses={selectedDateResponses} date={summaryDate} />}<PeriodOverview
            responses={view === 'today' ? selectedDateResponses : scopedResponses}
            title={view === 'today' ? (summaryDate === todayKey() ? 'Idag' : 'Vald dag') : 'Förra veckan'}
            profiles={groupFilteredProfiles}
            periodLabel={view === 'today'
              ? summaryDateLabel
              : previousWeekLabel}
            showDays={view === 'week'}
          />{view === 'today' && <CoachActivitySummary code={code} selectedDate={summaryDate} onDateChange={setSummaryDate} aiEnabled={aiEnabled} />}</>
        )}
        {view === 'today' && <button className="clear-button" onClick={async () => {
          if (!confirmDestructive('Alla incheckningar och all historik kommer att raderas permanent.')) return
          try { await onClear() } catch (error) { window.alert(error.message) }
        }}>Radera alla svar</button>}
        <footer className="app-meta"><span>Simkoll v{APP_VERSION}</span><span>Uppdaterad {new Date(BUILD_TIME).toLocaleString('sv-SE', { dateStyle: 'medium', timeStyle: 'short' })}</span><span>Build {COMMIT_SHA}</span></footer>
      </div>
    </main>
  )
}

function AttendancePanel({ code, profiles, responses, date: selectedDate }) {
  const [open, setOpen] = useState(false)
  const [group, setGroup] = useState('all')
  const [attendance, setAttendance] = useState({})
  const [loading, setLoading] = useState(false)
  const [sortPresent, setSortPresent] = useState(false)
  const date = selectedDate || todayKey()
  const [slot, setSlot] = useState(new Date().getHours() < 13 ? 'morning_swim' : 'afternoon_swim')
  useEffect(() => { apiRequest(`/api/profiles?attendance=true&date=${date}&slot=${slot}`, code).then((data) => setAttendance(Object.fromEntries((data.attendance || []).map((item) => [item.profile_id, item.present])))).catch(() => {}) }, [code, date, slot])
  const groupOrder = { ungdom_orange: 1, ungdom_svart: 2, junior: 3 }
  const visible = profiles.filter((profile) => group === 'all' || profile.trainingGroup === group).slice().sort((a, b) => {
    if (sortPresent && Boolean(attendance[b.id]) !== Boolean(attendance[a.id])) return Number(Boolean(attendance[b.id])) - Number(Boolean(attendance[a.id]))
    return (group === 'all' ? (groupOrder[a.trainingGroup] || 9) - (groupOrder[b.trainingGroup] || 9) : 0) || a.displayName.localeCompare(b.displayName, 'sv')
  })
  const presentCount = visible.filter((profile) => attendance[profile.id]).length
  const toggle = async (profile) => { const next = !attendance[profile.id]; setAttendance((current) => ({ ...current, [profile.id]: next })); setLoading(true); try { await apiRequest('/api/profiles', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'set-attendance', profileId: profile.id, date, slot, present: next }) }) } catch (error) { setAttendance((current) => ({ ...current, [profile.id]: !next })); window.alert(error.message) } finally { setLoading(false) } }
  return <section className="attendance-panel"><button className="attendance-toggle" onClick={() => setOpen((value) => !value)}>{open ? '▲ Dölj närvaro' : '📋 Närvaro under simpass'}<span>{presentCount}/{visible.length} närvarande</span></button>{open && <div className="attendance-body"><div className="library-controls"><label>Simpass<select value={slot} onChange={(event) => setSlot(event.target.value)}><option value="morning_swim">Morgonpass</option><option value="afternoon_swim">Eftermiddag / kväll</option></select></label><label>Grupper<select value={group} onChange={(event) => setGroup(event.target.value)}><option value="all">Alla grupper</option><option value="ungdom_orange">Ungdom Orange</option><option value="ungdom_svart">Ungdom Svart</option><option value="junior">Junior</option></select></label></div><div className="attendance-list">{visible.map((profile) => { const item = responses.find((response) => response.profileId === profile.id); const raceBefore = item?.type === 'before' && item.speedFeeling != null; const raceAfter = item?.type === 'after' && item.speedFeeling != null; return <button key={profile.id} className={attendance[profile.id] ? 'present' : ''} disabled={loading} onClick={() => toggle(profile)}><span>{profile.emoji}</span><strong>{profile.displayName}</strong><small>{raceAfter ? '🏅 Har tävlat' : raceBefore ? '🏁 Ska tävla' : item?.type === 'after' ? '✓ Har checkat in' : item?.type === 'before' ? '→ Ska träna' : 'Ej checkat in'}</small><b>{attendance[profile.id] ? '✓' : '○'}</b></button> })}</div></div>}</section>
}

function WeeklyMeeting({ code, profiles = [] }) {
  const [report, setReport] = useState(null)
  const [error, setError] = useState('')
  const [period, setPeriod] = useState('previous_week')
  const profileIds = profiles.map((profile) => profile.id).join(',')
  const range = useMemo(() => {
    const thisMonday = weekStart(new Date())
    const end = new Date(thisMonday)
    if (period === 'four_weeks') {
      const start = new Date(end); start.setDate(start.getDate() - 28)
      return { start, end }
    }
    if (period === 'term') {
      const now = new Date()
      const seasonStart = now.getMonth() >= 7 ? new Date(now.getFullYear(), 7, 1) : new Date(now.getFullYear(), 0, 1)
      return { start: weekStart(seasonStart), end }
    }
    const start = new Date(end); start.setDate(start.getDate() - 7)
    return { start, end }
  }, [period])
  useEffect(() => {
    setReport(null); setError('')
    const query = new URLSearchParams({ start: range.start.toISOString(), end: range.end.toISOString(), startDay: dateKey(range.start), endDay: dateKey(range.end), profileIds })
    apiRequest(`/api/weekly-report?${query}`, code).then(setReport).catch((nextError) => setError(nextError.message))
  }, [code, range, profileIds])
  const label = `${range.start.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })}–${new Date(range.end.getTime() - 1).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })}`
  if (error) return <EmptyPeriod title={error} periodLabel="Veckomöte" />
  if (!report) return <section className="empty-period"><span>≈</span><h2>Skapar veckobilden…</h2></section>
  const positives = [
    report.checkins > 0 && `${report.checkins} incheckningar gav tränarna bättre underlag.`,
    report.activeProfiles > 0 && `${report.activeProfiles} profiler var aktiva under ${report.activeDays} dagar.`,
    report.kudos > 0 && `${report.kudos} pepphälsningar stärkte gruppen.`,
    report.approvedGoals > 0 && `${report.approvedGoals} mål blev godkända.`,
    report.passRating >= 4 && `Passen fick ett starkt snittbetyg på ${report.passRating} av 5.`,
  ].filter(Boolean)
  const attention = [
    report.signals.lowBody > 0 && `${report.signals.lowBody} svar visade tung eller öm kropp.`,
    report.signals.highRpe > 0 && `${report.signals.highRpe} pass skattades som mycket ansträngande (RPE 9–10).`,
    report.signals.lowPass > 0 && `${report.signals.lowPass} svar gav passet lägsta betyg.`,
  ].filter(Boolean)
  const attendanceRows = [...(report.attendanceProfiles || [])].sort((a, b) => (b.percentage ?? -1) - (a.percentage ?? -1) || a.displayName.localeCompare(b.displayName, 'sv'))
  return <section className="weekly-meeting"><div className="period-heading"><div><p className="eyebrow">Underlag för söndags- eller måndagsmötet</p><h2>Veckobilden</h2></div><div className="big-count"><strong>{label}</strong><span>{period === 'term' ? 'avslutade veckor i terminen' : period === 'four_weeks' ? 'senaste fyra avslutade veckorna' : 'senast avslutade vecka'}</span></div></div><div className="meeting-period-switcher" role="group" aria-label="Välj period"><button className={period === 'previous_week' ? 'active' : ''} onClick={() => setPeriod('previous_week')}>Förra veckan</button><button className={period === 'four_weeks' ? 'active' : ''} onClick={() => setPeriod('four_weeks')}>Senaste 4 veckorna</button><button className={period === 'term' ? 'active' : ''} onClick={() => setPeriod('term')}>Terminen</button></div><div className="meeting-stats"><Stat title="Aktiva profiler" value={report.activeProfiles} note={`${report.activeDays} aktiva dagar`} /><Stat title="Incheckningar" value={report.checkins} note={`${report.afterSessions} efter simpass`} /><Stat title="Registrerad träning" value={report.swims + report.strength + report.dryland} note={`${report.swims} sim · ${report.strength} styrka · ${report.dryland} land`} /><Stat title="Erbjudna simmeter" value={report.offeredMeters ? `${report.offeredMeters.toLocaleString('sv-SE')} m` : '–'} note="Planerade eller publicerade pass" /><Stat title="Uppskattat simmat" value={report.estimatedMeters == null ? '–' : `${report.estimatedMeters.toLocaleString('sv-SE')} m`} note="Estim. utifrån närvaro mot mål" /><Stat title="Närvaro mot mål" value={report.attendancePercentage == null ? '–' : `${report.attendancePercentage}%`} note={report.expectedSwimPasses ? `${report.completedSwimPasses} av ${report.expectedSwimPasses} överenskomna simpass` : 'Inga överenskomna simmål'} /><Stat title="Pepp i gruppen" value={report.kudos} note={`${report.approvedGoals} godkända mål`} /><Stat title="Personbästa" value={report.personalBests || 0} note="Nya Tempus-resultat" /></div><details className="coach-card meeting-attendance"><summary className="meeting-attendance-summary"><div><p className="eyebrow">Individuell uppföljning</p><h2>Närvaro mot eget mål</h2></div><small>{report.expectedSwimPasses ? `${report.completedSwimPasses} av ${report.expectedSwimPasses} överenskomna pass totalt` : 'Visa simmarlistan'}</small></summary><div className="meeting-attendance-body">{attendanceRows.length ? <div className="attendance-goal-list">{attendanceRows.map((item) => <article key={item.profileId}><span>{item.emoji}</span><div><strong>{item.displayName}</strong><small>{item.expected ? `${item.completed} av ${item.expected} pass` : 'Inget simmål registrerat'}</small></div><b className={item.percentage == null ? 'muted' : item.percentage >= 100 ? 'good' : item.percentage >= 75 ? 'ok' : 'low'}>{item.percentage == null ? '–' : `${item.percentage}%`}</b></article>)}</div> : <p className="empty">Inga simmarprofiler hittades i perioden.</p>}<small className="attendance-goal-note">Procenten visar genomförda simpass i förhållande till den överenskomna mängden för perioden. Extra pass räknas inte som mer än 100 %.</small></div></details><div className="meeting-columns"><section className="coach-card meeting-highlights"><p className="eyebrow">Det här tar vi med oss</p><h2>Veckans positiva</h2>{positives.length ? positives.map((item) => <p key={item}><span>✓</span>{item}</p>) : <p className="empty">Mer data behövs för att skapa positiva highlights.</p>}</section><section className="coach-card meeting-attention"><p className="eyebrow">Följ upp tillsammans</p><h2>Signaler att vara nyfiken på</h2>{attention.length ? attention.map((item) => <p key={item}><span>!</span>{item}</p>) : <p><span>✓</span>Inga tydliga varningssignaler i veckans svar.</p>}<small>Visas endast på gruppnivå. Prata med gruppen och dra inte slutsatser om enskilda simmare från en ensam skattning.</small></section></div><section className="coach-card meeting-ratings"><h2>Träningsupplevelsen</h2><div><Stat title="Känsla" value={report.feeling == null ? '–' : `${report.feeling}/5`} note="Alla incheckningar" /><Stat title="Kroppen" value={report.body == null ? '–' : `${report.body}/5`} note="Självskattning" /><Stat title="Ansträngning" value={report.rpe == null ? '–' : `${report.rpe}/10`} note="Efter pass" /><Stat title="Passet" value={report.passRating == null ? '–' : `${report.passRating}/5`} note="Simmarnas betyg" /></div></section></section>
}

const ANALYSIS_PERIODS = [
  { key: 'yesterday', label: 'Föregående dag' }, { key: '7', label: '7 dagar' }, { key: 'previous_week', label: 'Förra veckan' },
  { key: 'this_month', label: 'Den här månaden' }, { key: 'previous_month', label: 'Föregående månad' }, { key: '30', label: '30 dagar' }, { key: '90', label: '3 månader' },
]

function analysisRange(period) {
  const now = new Date(), today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (period === 'yesterday') {
    const start = new Date(today); start.setDate(start.getDate() - 1)
    const previousStart = new Date(start); previousStart.setDate(previousStart.getDate() - 1)
    return { start, end: today, previousStart }
  }
  if (period === 'previous_week') {
    const thisMonday = weekStart(today), end = new Date(thisMonday)
    const start = new Date(end); start.setDate(start.getDate() - 7)
    const previousStart = new Date(start); previousStart.setDate(previousStart.getDate() - 7)
    return { start, end, previousStart }
  }
  if (period === 'this_month') {
    const start = new Date(today.getFullYear(), today.getMonth(), 1), end = new Date(today); end.setDate(end.getDate() + 1)
    const previousStart = new Date(start.getFullYear(), start.getMonth() - 1, 1)
    const previousMonthDays = new Date(start.getFullYear(), start.getMonth(), 0).getDate()
    const previousEnd = new Date(previousStart.getFullYear(), previousStart.getMonth(), Math.min(today.getDate(), previousMonthDays))
    return { start, end, previousStart, previousEnd }
  }
  if (period === 'previous_month') {
    const start = new Date(today.getFullYear(), today.getMonth() - 1, 1), end = new Date(today.getFullYear(), today.getMonth(), 1)
    const previousStart = new Date(today.getFullYear(), today.getMonth() - 2, 1)
    return { start, end, previousStart }
  }
  const days = Number(period)
  const end = new Date(today); end.setDate(end.getDate() + 1)
  const start = new Date(end); start.setDate(start.getDate() - days)
  const previousStart = new Date(start); previousStart.setDate(previousStart.getDate() - days)
  return { start, end, previousStart }
}

function TrendLineChart({ items }) {
  const [hoverIndex, setHoverIndex] = useState(null)
  const [visible, setVisible] = useState({ feeling: true, body: true, rpe: true, speedFeeling: true, passRating: true, distanceMeters: true })
  if (!items?.length) return <p className="empty">Inga genomförda pass under perioden.</p>
  const distanceMax = Math.max(1, ...items.map((item) => Number(item.distanceMeters) || 0))
  const metrics = [{ key: 'feeling', label: 'Känsla', color: '#26b7b0', max: 5 }, { key: 'body', label: 'Kropp', color: '#a9d33e', max: 5 }, { key: 'rpe', label: 'RPE', color: '#f59e9e', max: 10 }, { key: 'speedFeeling', label: 'Fartkänsla', color: '#9b8cff', max: 5 }, { key: 'passRating', label: 'Passet', color: '#f0b45b', max: 5 }, { key: 'distanceMeters', label: 'Meter', color: '#287b91', max: distanceMax }]
  const width = Math.max(560, items.length * 92), height = 230, left = 34, right = 16, top = 16, bottom = 34, chartWidth = width - left - right, chartHeight = height - top - bottom
  const x = (index) => left + (items.length === 1 ? chartWidth / 2 : (index / (items.length - 1)) * chartWidth)
  const y = (value, max) => top + chartHeight - (Number(value) / max) * chartHeight
  const lineSegments = (metric) => items.reduce((segments, item, index) => { const value = Number(item[metric.key]); if (!visible[metric.key] || !Number.isFinite(value)) return segments; const last = segments[segments.length - 1]; if (last && last[last.length - 1].index === index - 1) last.push({ index, value }); else segments.push([{ index, value }]); return segments }, [])
  const slotLabels = { morning_swim: 'Förmiddag', afternoon_swim: 'Eftermiddag' }
  return <div className="trend-line-section"><div className="trend-line-filter"><strong>Visa i diagrammet</strong>{metrics.map((metric) => <button type="button" className={visible[metric.key] ? 'active' : ''} key={metric.key} onClick={() => setVisible((current) => ({ ...current, [metric.key]: !current[metric.key] }))}><i style={{ background: metric.color }} />{metric.label}</button>)}</div><div className="trend-line-wrap"><svg className="trend-line-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Träningsupplevelse per genomfört pass">{[0, 1, 2, 3, 4, 5].map((tick) => <g key={tick}><line x1={left} x2={width - right} y1={y(tick, 5)} y2={y(tick, 5)} /><text x={left - 8} y={y(tick, 5) + 3}>{tick}</text></g>)}{metrics.map((metric) => lineSegments(metric).map((segment, segmentIndex) => <polyline key={`${metric.key}-${segmentIndex}`} className={`trend-line-${metric.key}`} points={segment.map((point) => `${x(point.index)},${y(point.value, metric.max)}`).join(' ')} fill="none" stroke={metric.color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />))}{metrics.map((metric) => visible[metric.key] && items.map((item, index) => { const value = Number(item[metric.key]); return Number.isFinite(value) ? <circle key={`${metric.key}-${index}`} className={`trend-dot-${metric.key}`} cx={x(index)} cy={y(value, metric.max)} r="4" fill={metric.color} onMouseEnter={() => setHoverIndex(index)} onMouseLeave={() => setHoverIndex(null)} /> : null }))}{items.map((item, index) => <text className="trend-x-label" key={`${item.date}-${index}`} x={x(index)} y={height - 10}>{new Date(`${item.date}T12:00:00`).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })}</text>)}</svg></div>{hoverIndex != null && <div className="trend-hover-card"><strong>{new Date(`${items[hoverIndex].date}T12:00:00`).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })}</strong>{metrics.filter((metric) => visible[metric.key]).map((metric) => Number.isFinite(Number(items[hoverIndex][metric.key])) && <span key={metric.key}><i style={{ background: metric.color }} />{metric.label}: {metric.key === 'distanceMeters' ? `${Number(items[hoverIndex][metric.key]).toLocaleString('sv-SE')} m` : items[hoverIndex][metric.key]}</span>)}</div>}<div className="trend-line-legend">{metrics.map((metric) => <span key={metric.key}><i style={{ background: metric.color }} />{metric.label}</span>)}</div><div className="trend-pass-list">{items.map((item, index) => <article key={`${item.date}-${index}`}><strong>{new Date(`${item.date}T12:00:00`).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })}</strong><span>{item.title}{item.focus ? ` · ${item.focus}` : ''}{item.sessionSlots?.length ? ` · ${item.sessionSlots.map((slot) => slotLabels[slot] || slot).join(' + ')}` : ''}</span><small>{[item.distanceMeters && `${Number(item.distanceMeters).toLocaleString('sv-SE')} m`, item.durationMinutes && `${item.durationMinutes} min`, `${item.count} svar`].filter(Boolean).join(' · ')}</small></article>)}</div></div>
}

function AnalysisDashboard({ code, profile, pointInfo, onBack, selfView = false, aiEnabled = true }) {
  const [period, setPeriod] = useState('7')
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [aiInsight, setAiInsight] = useState(null)
  const [aiCreatedAt, setAiCreatedAt] = useState(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState('')
  const [trainingContext, setTrainingContext] = useState({ phase: 'normal', minVolume: 30000, maxVolume: 40000 })
  useEffect(() => {
    setData(null); setError(''); setAiInsight(null); setAiCreatedAt(null)
    const range = analysisRange(period)
    const query = new URLSearchParams({ start: range.start.toISOString(), end: range.end.toISOString(), previousStart: range.previousStart.toISOString(), previousEnd: (range.previousEnd || range.start).toISOString() })
    query.set('period', period)
    if (profile) query.set('profileId', profile.id)
    apiRequest(`/api/analytics?${query}`, code).then((nextData) => { const safeData = { ...nextData, current: nextData.current || {}, previous: nextData.previous || {}, trend: Array.isArray(nextData.trend) ? nextData.trend : [], workoutAnalysis: nextData.workoutAnalysis || { focuses: [], workload: [] } }; setData(safeData); setAiInsight(safeData.savedInsight?.insight || null); setAiCreatedAt(safeData.savedInsight?.created_at || null) }).catch((nextError) => setError(nextError.message))
  }, [code, profile?.id, period])
  useEffect(() => {
    if (!data) return undefined
    const card = document.querySelector('.trend-card'); if (!card || card.querySelector('.trend-controls')) return undefined
    const controls = document.createElement('div'); controls.className = 'trend-controls'; controls.innerHTML = '<span>Visa:</span>';
    [['feeling', 'Känsla'], ['body', 'Kropp'], ['rpe', 'RPE'], ['speed', 'Fartkänsla'], ['pass', 'Passet']].forEach(([key, label]) => { const item = document.createElement('label'); const input = document.createElement('input'); input.type = 'checkbox'; input.checked = true; input.addEventListener('change', () => card.classList.toggle(`hide-trend-${key}`, !input.checked)); item.append(input, ` ${label}`); controls.append(item) })
    card.insertBefore(controls, card.firstChild)
    return () => controls.remove()
  }, [data])
  const change = (key) => {
    if (!data?.current || !data?.previous || data.current[key] == null || data.previous[key] == null) return null
    return Number((data.current[key] - data.previous[key]).toFixed(1))
  }
  const createAiInsight = async ({ customInstructions = '', guardrailOverrides = '' } = {}) => {
    if (!data || aiLoading) return
    setAiLoading(true); setAiError('')
    try {
      const label = ANALYSIS_PERIODS.find((item) => item.key === period)?.label || 'vald period'
      const result = await apiRequest('/api/analytics', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'ai-insights', periodLabel: label, period, profileId: profile?.id, trainingContext: selfView ? null : trainingContext, customInstructions, guardrailOverrides, data }) })
      setAiInsight(result.insight); setAiCreatedAt(result.createdAt)
    } catch (nextError) { setAiError(nextError.message) } finally { setAiLoading(false) }
  }
  const Metric = ({ title, metric, suffix = '', note }) => { const delta = change(metric); const value = data.current[metric]; return <><article className="analysis-metric"><span>{title} <HelpTip term={title} /></span><strong>{value == null ? '–' : `${value}${suffix}`}</strong>{delta != null && delta !== 0 ? <small className={delta > 0 ? 'up' : 'down'}>{delta > 0 ? '↑' : '↓'} {Math.abs(delta)} mot förra perioden</small> : <small>{note || 'Oförändrat mot förra perioden'}</small>}</article>{metric === 'checkins' && <><WorkoutTrendAnalysis analysis={data.workoutAnalysis} />{!selfView && <AiInsightCard title={profile ? `AI-analys: ${profile.displayName}` : 'Veckans tränarsammanfattning'} insight={aiInsight} createdAt={aiCreatedAt} loading={aiLoading} error={aiError} onGenerate={createAiInsight} />}{selfView && profile?.aiAnalysisStatus === 'approved' && <AiInsightCard title="Min personliga analys" insight={aiInsight} createdAt={aiCreatedAt} swimmerView />}{selfView && profile?.aiAnalysisStatus !== 'approved' && <section className="ai-insight-card swimmer-ai-locked"><p className="eyebrow">Personlig analys</p><h2>Inte aktiverad ännu</h2><p>Tränaren kan aktivera en personlig sammanfattning efter godkännande från vårdnadshavare.</p></section>}{profile && !selfView && <GoalCompliance data={data} code={code} profile={profile} />}</>}</> }
  const swimGoal = data?.goalProgress || data?.currentWeekGoal
  const strengthGoal = data?.crossProgress?.strength || data?.currentCrossGoals?.strength
  const drylandGoal = data?.crossProgress?.dryland || data?.currentCrossGoals?.dryland
  const goalNote = (goal) => goal ? `Mål ${goal.expected ?? goal.target} · ${goal.percentage}%` : 'Inget mål för perioden'
  return <section className="analysis-dashboard">{onBack && <button className="back-button inline" onClick={onBack}>← Alla simmare</button>}<div className="period-heading"><div><p className="eyebrow">{profile ? 'Endast svar kopplade till profilen' : 'Anonym sammanställning på gruppnivå'}</p><h2>{profile ? `${profile.emoji} ${profile.displayName}` : 'Gruppens utveckling'}</h2></div>{profile && pointInfo && <PointProgress info={pointInfo} compact />}</div><nav className="analysis-periods">{ANALYSIS_PERIODS.map((item) => <button className={period === item.key ? 'active' : ''} key={item.key} onClick={() => setPeriod(item.key)}>{item.label}</button>)}</nav>{error ? <p className="form-error">{error}</p> : !data ? <section className="empty-period"><span>≈</span><h2>Hämtar statistik…</h2></section> : <><div className="analysis-metrics"><Metric title="Incheckningar" metric="checkins" /><Metric title="Aktiva dagar" metric="activeDays" /><Metric title="Sjukdagar" metric="sickDays" /><Metric title="Vilodagar" metric="restDays" /><Metric title="Känsla" metric="feeling" suffix="/5" /><Metric title="Kroppen" metric="body" suffix="/5" /><Metric title="RPE" metric="rpe" suffix="/10" /><Metric title="Fartkänsla" metric="speedFeeling" suffix="/5" /><Metric title="Passet" metric="passRating" suffix="/5" /></div>{data.privacyLimited && <p className="privacy-limit">🔒 Minst tre gruppsvar behövs för att visa genomsnitt.</p>}<div className="analysis-columns"><section className="coach-card trend-card"><p className="eyebrow">Över tid</p><h2>Träningsupplevelsen över tid</h2>{data.trend.length ? <div className="trend-bars">{data.trend.map((item) => <div key={item.date}><div><i className="feeling-bar" style={{ height: `${(item.feeling || 0) * 18}%` }} title={`Känsla ${item.feeling ?? 'dold'}`} /><i className="body-bar" style={{ height: `${(item.body || 0) * 18}%` }} title={`Kropp ${item.body ?? 'dold'}`} /><i className="rpe-bar" style={{ height: `${(item.rpe || 0) * 9}%` }} title={`RPE ${item.rpe ?? 'dold'}`} /><i className="speed-bar" style={{ height: `${(item.speedFeeling || 0) * 18}%` }} title={`Fartkänsla ${item.speedFeeling ?? 'dold'}`} /><i className="pass-bar" style={{ height: `${(item.passRating || 0) * 18}%` }} title={`Passet ${item.passRating ?? 'dold'}`} /></div><small>{new Date(`${item.date}T12:00:00`).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })}</small><b>{item.count}</b></div>)}</div> : <p className="empty">Ingen data under perioden.</p>}<div className="chart-legend"><span><i className="legend-feeling" /> Känsla</span><span><i className="legend-body" /> Kropp</span><span><i className="legend-rpe" /> RPE</span><span><i className="legend-speed" /> Fartkänsla</span><span><i className="legend-pass" /> Passet</span></div></section><section className="coach-card training-summary"><p className="eyebrow">Registrerad träning</p><h2>Genomförda pass</h2><div><p><span>🏊</span><strong>{data.current.swimSessions}</strong><small>Simpass</small><em>{goalNote(swimGoal)}</em></p><p><span>🏋️</span><strong>{data.current.strengthSessions}</strong><small>Styrkepass</small><em>{goalNote(strengthGoal)}</em></p><p><span>🤸</span><strong>{data.current.drylandSessions}</strong><small>Landpass</small><em>{goalNote(drylandGoal)}</em></p></div></section></div>{profile && <section className="coach-card analysis-comments"><p className="eyebrow">Profilsvar</p><h2>Kommentarer under perioden</h2>{data.recent.length ? data.recent.map((item) => <blockquote key={`${item.date}-${item.comment}`}>{FEELINGS[item.feeling - 1]?.emoji} “{item.comment}” <small>{new Date(item.date).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })}</small></blockquote>) : <p className="empty">Inga profilkopplade kommentarer under perioden.</p>}</section>}</>}</section>
}

function LegacyAiInsightCard({ title = 'Veckans tränarsammanfattning', insight, createdAt, loading, error, onGenerate, swimmerView = false }) {
  if (title === 'Veckans tränarsammanfattning') title = 'Tränarsammanfattning för vald period'
  const [expanded, setExpanded] = useState(false)
  const [customPrompt, setCustomPrompt] = useState('')
  const [guardrailOverrides, setGuardrailOverrides] = useState('')
  return <section className={`ai-insight-card${expanded ? ' expanded' : ''}`}><div className="ai-insight-header"><div><p className="eyebrow">{swimmerView ? 'Din personliga analys' : 'AI-stöd för tränaren'}</p><h2>{title}</h2>{createdAt && <small>Senast skapad {new Date(createdAt).toLocaleString('sv-SE', { dateStyle: 'medium', timeStyle: 'short' })}</small>}</div><div className="ai-insight-actions">{insight && <button type="button" className="ai-expand-button" onClick={() => setExpanded((value) => !value)}>{expanded ? 'Minimera ↑' : 'Visa hela analysen ↓'}</button>}{onGenerate && <button className="secondary-button" onClick={() => onGenerate({ customInstructions: customPrompt, guardrailOverrides })} disabled={loading}>{loading ? 'Analyserar…' : insight ? 'Skapa ny analys' : 'Skapa analys'}</button>}</div></div>{onGenerate && <><details className="ai-prompt-editor"><summary>🎛️ Anpassa analysens instruktion</summary><p>Beskriv vad tränaren vill att modellen fokuserar extra på.</p><textarea maxLength={2000} value={customPrompt} onChange={(event) => setCustomPrompt(event.target.value)} placeholder="Exempel: Fokusera extra på om lägre mängd verkar sammanfalla med bättre fartkänsla inför tävlingen." /></details><details className="ai-prompt-editor ai-guardrail-editor"><summary>⚙️ Redigera tillfälliga skyddsregler</summary><p>Dessa regler ersätter analysens mjuka standardinstruktioner för nästa körning och sparas inte. Tekniska minimikrav för säkerhet, dataskydd och giltig JSON ligger alltid kvar i backend.</p><textarea maxLength={2000} value={guardrailOverrides} onChange={(event) => setGuardrailOverrides(event.target.value)} placeholder="Exempel: Skriv ett längre resonemang, jämför senaste tre passen och prioritera fartkänsla." /></details></>}{error && <p className="form-error">{error}</p>}{insight ? <div className="ai-insight-body"><p>{insight.summary}</p>{insight.positives?.length > 0 && <div><strong>Det ser bra ut</strong>{insight.positives.map((item) => <span key={item}>✓ {item}</span>)}</div>}{insight.attention?.length > 0 && <div><strong>Följ upp</strong>{insight.attention.map((item) => <span key={item}>! {item}</span>)}</div>}{insight.limitations?.length > 0 && <small>Begränsningar: {insight.limitations.join(' · ')}</small>}</div> : <p className="ai-insight-empty">Ingen sparad analys för den valda perioden ännu.</p>}</section>
}

const DEFAULT_AI_PROMPT_DISPLAY = `Du är ett försiktigt och noggrant analysstöd för simtränare. Analysera endast den data som skickas med och skriv på svenska.

• Beskriv datagrundens storlek, periodens volym och antal pass.
• Leta efter riktning över tid och jämför tidigare och senaste del av perioden.
• Jämför passinriktning med upplevd känsla, kropp, RPE, fartkänsla, temperatur och passbetyg.
• Beskriv möjliga samband som hypoteser – skriv ”samvarierar med” eller ”kan vara värt att undersöka”, aldrig ”beror på” utan tydligt stöd.
• Sjukdagar och vilodagar ska beskrivas neutralt. Dra aldrig medicinska slutsatser.
• Om underlaget är litet eller saknar svar ska det anges tydligt.
• Hitta inte på orsaker, värden, träningspass eller rekommendationer som inte stöds av underlaget.
• Tränarens dokumentation får användas som kontext, men observationer och tolkningar ska hållas isär.
• Returnera en kort, konkret och evidensnära sammanfattning på svenska.`

function AiInsightCard(props) {
  return <div className="ai-insight-with-prompt"><LegacyAiInsightCard {...props} />{props.onGenerate && <details className="ai-prompt-editor ai-default-prompt"><summary>👁 Visa standardprompt</summary><p>Detta är grundinstruktionerna. Periodens statistik, träningspass, dokumentation och eventuella extra instruktioner läggs till separat när analysen skapas.</p><pre>{DEFAULT_AI_PROMPT_DISPLAY}</pre></details>}</div>
}

function CoachGroups({ code, profiles, onProfilesChange }) {
  const [groups, setGroups] = useState([])
  const [newName, setNewName] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const load = () => { setLoading(true); apiRequest('/api/profiles?groups=true', code).then((data) => setGroups(data.groups || [])).catch((err) => setError(err.message || 'Kunde inte hämta grupper.')).finally(() => setLoading(false)) }
  useEffect(() => { load() }, [code])
  const mutate = async (body) => { setError(''); try { await apiRequest('/api/profiles', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); load(); onProfilesChange?.() } catch (err) { setError(err.message || 'Något gick fel.') } }
  const create = async (event) => { event.preventDefault(); if (!newName.trim()) return; await mutate({ action: 'create-group', name: newName.trim() }); setNewName('') }
  const assign = (profileId, trainingGroup) => mutate({ action: 'set-training-group', profileId, trainingGroup: trainingGroup || null })
  const active = groups.filter((group) => group.active !== false)
  const archived = groups.filter((group) => group.active === false)
  const withoutGroup = profiles.filter((profile) => !profile.trainingGroup)
  return <section className="coach-groups"><div className="period-heading"><div><p className="eyebrow">Tränarverktyg</p><h1>Grupper</h1><small>Samla simmarna rätt och håll gruppindelningen uppdaterad.</small></div><div className="big-count"><strong>{active.length}</strong><span>aktiva grupper</span></div></div><form className="group-form coach-card" onSubmit={create}><div><h2>Lägg till grupp</h2><p>Skapa en grupp när ni startar en ny träningsgrupp.</p></div><div className="group-form-row"><input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Exempel: Ungdom Orange" maxLength={80} /><button className="primary-button" type="submit">Skapa grupp</button></div></form>{error && <p className="form-error">{error}</p>}{loading ? <p className="empty">Hämtar grupper…</p> : <><div className="group-grid">{active.map((group) => { const members = profiles.filter((profile) => profile.trainingGroup === group.id); return <details className="group-card coach-card" key={group.id} open><summary><span><strong>{group.name}</strong><small>{members.length} {members.length === 1 ? 'simmare' : 'simmare'}</small></span><span>⌄</span></summary><div className="group-members">{members.length ? members.map((profile) => <div className="group-member" key={profile.id}><span className="profile-chip"><b>{profile.emoji}</b>{profile.displayName}</span><select aria-label={`Grupp för ${profile.displayName}`} value={profile.trainingGroup || ''} onChange={(event) => assign(profile.id, event.target.value)}><option value="">Utan grupp</option>{active.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></div>) : <p className="empty">Inga simmare i gruppen ännu.</p>}<button className="text-button danger-text" type="button" onClick={() => { if (window.confirm(`Arkivera ${group.name}?`)) mutate({ action: 'archive-group', id: group.id }) }}>Arkivera grupp</button></div></details> })}</div><section className="coach-card unassigned-card"><p className="eyebrow">Behöver placeras</p><h2>Profiler utan grupp</h2>{withoutGroup.length ? withoutGroup.map((profile) => <div className="group-member" key={profile.id}><span className="profile-chip"><b>{profile.emoji}</b>{profile.displayName}</span><select aria-label={`Välj grupp för ${profile.displayName}`} value="" onChange={(event) => assign(profile.id, event.target.value)}><option value="">Välj grupp…</option>{active.map((group) => <option value={group.id} key={group.id}>{group.name}</option>)}</select></div>) : <p className="empty">Alla godkända profiler har en grupp ✓</p>}</section>{archived.length > 0 && <details className="coach-card archived-groups"><summary>Arkiverade grupper ({archived.length})</summary>{archived.map((group) => <span key={group.id}>{group.name}</span>)}</details>}</>}</section>
}

function AuditLogs({ code }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => { apiRequest('/api/profiles?audit=true', code).then(setData).catch((nextError) => setError(nextError.message)) }, [code])
  if (error) return <EmptyPeriod title={error} periodLabel="Loggar" />
  if (!data) return <section className="empty-period"><span>◷</span><h2>Hämtar loggar…</h2></section>
  const eventLabels = { group_login: 'Gruppkod inloggad', profile_login: 'Simmare loggade in', 'ai:trend_analysis': 'AI trendanalys' }
  const swedishRegions = { AB: 'Stockholm', C: 'Uppsala', D: 'Södermanland', E: 'Östergötland', F: 'Jönköping', G: 'Kronoberg', H: 'Kalmar', I: 'Gotland', K: 'Blekinge', M: 'Skåne', N: 'Halland', O: 'Västra Götaland', S: 'Värmland', T: 'Örebro', U: 'Västmanland', W: 'Dalarna', X: 'Gävleborg', Y: 'Västernorrland', Z: 'Jämtland', AC: 'Västerbotten', BD: 'Norrbotten' }
  const countryNames = typeof Intl !== 'undefined' && Intl.DisplayNames ? new Intl.DisplayNames(['sv'], { type: 'region' }) : null
  const readableLocation = (location) => { if (!location) return ''; const country = location.country ? (countryNames?.of(location.country) || location.country) : ''; const region = location.country === 'SE' ? (swedishRegions[location.region] || location.region || '') : (location.region || ''); return [country, region].filter(Boolean).join(' · ') }
  const month = data.month || { calls: 0, totalTokens: 0, estimatedCostUsd: 0, tokenLimit: 0, byModel: [] }
  const money = (value) => value == null ? 'Pris saknas' : `${Number(value).toFixed(4).replace('.', ',')} USD`
  return <section className="audit-page"><div className="period-heading"><div><p className="eyebrow">Teknisk överblick</p><h1>Loggar</h1><small>Maskerade tekniska händelser och AI-användning. Råa IP-adresser sparas inte.</small></div><div className="big-count"><strong>{data.logs.length}</strong><span>senaste händelser</span></div></div><section className="audit-stats"><Stat title="AI-anrop" value={data.totals.calls} note={`${data.totals.successful} lyckade`} /><Stat title="Totala tokens" value={data.totals.totalTokens.toLocaleString('sv-SE')} note={`${data.totals.promptTokens.toLocaleString('sv-SE')} in · ${data.totals.completionTokens.toLocaleString('sv-SE')} ut`} /><Stat title="Inloggningar" value={data.logs.filter((item) => item.event_type.includes('login')).length} note="I senaste loggutdraget" /></section><section className="coach-card audit-month"><div className="audit-month-heading"><div><p className="eyebrow">Den här månaden</p><h2>AI-användning</h2></div><strong>{money(month.estimatedCostUsd)}</strong></div><div className="audit-month-metrics"><span><b>{month.totalTokens.toLocaleString('sv-SE')}</b>{month.tokenLimit ? ` / ${month.tokenLimit.toLocaleString('sv-SE')}` : ''} tokens</span><span><b>{month.calls}</b> anrop</span><small>Uppskattad tokenkostnad, inte faktureringsdata.{month.tokenLimit ? ' Tokenstaket gäller från inställningarna.' : ''}</small></div>{month.byModel?.length ? <div className="audit-model-list">{month.byModel.map((item) => <article key={item.model}><div><strong>{item.model}</strong><small>{item.calls} anrop · {item.totalTokens.toLocaleString('sv-SE')} tokens</small></div><span>{item.pricedCalls ? money(item.estimatedCostUsd) : 'Pris saknas'}</span></article>)}</div> : <p className="empty">Inga AI-anrop den här månaden.</p>}</section><section className="coach-card audit-ai"><h2>AI-anrop</h2>{data.aiUsage.length ? <div className="audit-list">{data.aiUsage.slice(0, 100).map((item) => <article key={item.id}><div><strong>{item.feature}</strong><small>{item.model || 'Okänd modell'} · {new Date(item.created_at).toLocaleString('sv-SE')}</small></div><span className={item.status === 'success' ? 'audit-ok' : 'audit-fail'}>{item.status === 'success' ? `${item.total_tokens || 0} tokens` : 'Misslyckat'}</span></article>)}</div> : <p className="empty">Inga AI-anrop loggade ännu.</p>}</section><section className="coach-card audit-events"><h2>Händelser</h2>{data.logs.length ? <div className="audit-list">{data.logs.map((item) => { const place = readableLocation(item.details?.location); const alias = item.details?.alias; const eventLabel = item.event_type === 'profile_login' && item.details?.login === 'remembered-session' ? 'Simmare loggade in (sparad profil)' : eventLabels[item.event_type] || item.event_type; return <article key={item.id}><div><strong>{alias ? `${alias} · ` : ''}{eventLabel}</strong><small>{item.role === 'coach' ? 'Tränare' : item.role === 'swimmer' ? 'Simmare' : item.role || 'Okänd roll'} · {new Date(item.created_at).toLocaleString('sv-SE')}{place ? ` · ${place}` : ' · Region saknas'}</small></div><span className={item.status === 'success' ? 'audit-ok' : 'audit-fail'}>{item.status === 'success' ? 'OK' : 'Fel'}</span></article> })}</div> : <p className="empty">Inga händelser ännu.</p>}</section></section>
}

function CoachAppFeedback({ code }) {
  const [data, setData] = useState(null)
  useEffect(() => { apiRequest('/api/community?appFeedback=true', code).then(setData).catch(() => setData({ total: 0, comments: [], counts: {} })) }, [code])
  const list = (values = {}) => Object.entries(values).sort((a, b) => b[1] - a[1])
  const labels = { checkin: 'Check-in', goals: 'Mina mål', games: 'Veckans spel', planning: 'Träningsplanering', messages: 'Pepp och meddelanden', speed: 'Snabbhet och enkelhet', design: 'Design och utseende', content: 'Innehåll', features: 'Funktioner', statistics: 'Mer statistik', other: 'Annat' }
  const reset = async () => { if (!window.confirm('Nollställ all appfeedback? Detta går inte att ångra.')) return; await apiRequest('/api/community', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'reset-app-feedback' }) }); setData({ total: 0, comments: [], counts: {} }) }
  return <section className="app-feedback-page"><div className="period-heading"><div><p className="eyebrow">Tränarverktyg</p><h1>Hur kan vi göra Simkoll bättre?</h1><small>Samlad feedback från simmare och tränare.</small></div><div className="big-count"><strong>{data?.total || 0}</strong><span>svar</span></div></div><AppFeedbackCard code={code} coach />{data?.total ? <><section className="feedback-summary-grid"><article className="coach-card"><p className="eyebrow">Helhetskänsla</p><strong className="feedback-average">{data.averageRating} <small>/ 5</small></strong></article><article className="coach-card"><p className="eyebrow">Vanligast uppskattat</p>{list(data.counts?.bestAreas).slice(0, 3).map(([key, count]) => <p className="feedback-stat" key={key}><span>{labels[key] || key}</span><b>{count}</b></p>)}</article><article className="coach-card"><p className="eyebrow">Vanligast att förbättra</p>{list(data.counts?.improveAreas).slice(0, 3).map(([key, count]) => <p className="feedback-stat" key={key}><span>{labels[key] || key}</span><b>{count}</b></p>)}</article></section><section className="coach-card feedback-comments"><p className="eyebrow">Fritext</p><h2>Tankar och önskemål</h2>{data.comments?.length ? data.comments.map((item, index) => <blockquote key={`${item.createdAt}-${index}`}>“{item.comment}”<small>{new Date(item.createdAt).toLocaleDateString('sv-SE')}</small></blockquote>) : <p className="empty">Inga fritextsvar ännu.</p>}</section></> : <section className="coach-card empty-period"><span>💬</span><h2>Inga svar ännu</h2><p>När feedback börjar komma visas sammanställningen här.</p></section>}<button type="button" className="text-button danger-text" onClick={reset}>Nollställ appfeedback</button></section>
}

function CoachPlanning({ code }) {
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [weekOffset, setWeekOffset] = useState(0)
  const [group, setGroup] = useState('all')
  const [sportAdmin, setSportAdmin] = useState({ activities: [], fetchedAt: null })
  const [sportAdminLoading, setSportAdminLoading] = useState(false)
  const [sportAdminError, setSportAdminError] = useState('')
  const importSportAdmin = async () => { setSportAdminLoading(true); setSportAdminError(''); try { setSportAdmin(await apiRequest('/api/workouts', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'import-sportadmin-calendar' }) })) } catch (error) { setSportAdminError(error.message || 'Kunde inte läsa SportAdmin-kalendern.') } finally { setSportAdminLoading(false) } }

  useEffect(() => {
    setLoading(true)
    setError('')
    apiRequest('/api/workouts?planning=true', code)
      .then((data) => setPlans(data.plans || []))
      .catch((requestError) => setError(requestError.message || 'Kunde inte hämta planeringen.'))
      .finally(() => setLoading(false))
  }, [code])

  const baseMonday = useMemo(() => {
    const value = new Date()
    value.setHours(0, 0, 0, 0)
    value.setDate(value.getDate() - ((value.getDay() + 6) % 7))
    return value
  }, [])
  const monday = useMemo(() => {
    const value = new Date(baseMonday)
    value.setDate(value.getDate() + weekOffset * 7)
    return value
  }, [baseMonday, weekOffset])
  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday)
    date.setDate(monday.getDate() + index)
    const key = dateKey(date)
    const activities = plans.filter((item) => item.date === key && (group === 'all' || item.targetGroups?.includes(group)))
    return { date, key, activities }
  }), [group, monday, plans])
  const totalMeters = days.reduce((sum, day) => sum + day.activities.filter((item) => item.activityType === 'swim').reduce((inner, item) => inner + (Number(item.distanceMeters) || 0), 0), 0)
  const totalMinutes = days.reduce((sum, day) => sum + day.activities.reduce((inner, item) => inner + (Number(item.durationMinutes) || 0), 0), 0)
  const weekLabel = `${monday.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })}–${days[6].date.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })}`
  const focusLabel = (focus) => WORKOUT_FOCUSES.find(([value]) => value === focus)?.[1] || 'Ingen inriktning'
  const groupLabel = (value) => ({ ungdom_orange: 'Ungdom Orange', ungdom_svart: 'Ungdom Svart', junior: 'Junior' }[value] || value)
  const typeLabel = (type) => ({ swim: 'Simning', strength: 'Styrka', dryland: 'Landträning', competition: 'Tävling' }[type] || type)
  return <section className="coach-planning"><div className="period-heading"><div><p className="eyebrow">Planera & följa upp</p><h1>Veckans grundplan</h1><small>{weekLabel} · {group === 'all' ? 'Alla grupper' : groupLabel(group)}</small></div><div className="big-count"><strong>{days.reduce((sum, day) => sum + day.activities.length, 0)}</strong><span>aktiviteter</span></div></div><div className="planning-controls"><button className="secondary-button" onClick={() => setWeekOffset((value) => Math.max(-4, value - 1))}>← Föregående vecka</button><button className="secondary-button" onClick={() => setWeekOffset(0)}>Den här veckan</button><button className="secondary-button" onClick={() => setWeekOffset((value) => Math.min(4, value + 1))}>Nästa vecka →</button><label>Grupp<select value={group} onChange={(event) => setGroup(event.target.value)}><option value="all">Alla grupper</option><option value="ungdom_orange">Ungdom Orange</option><option value="ungdom_svart">Ungdom Svart</option><option value="junior">Junior</option></select></label></div>{loading ? <p className="empty">Hämtar veckoplanering…</p> : error ? <p className="form-error">{error}</p> : <><div className="planning-summary"><div><strong>{totalMeters ? totalMeters.toLocaleString('sv-SE') : '–'}</strong><span>simmetrar</span></div><div><strong>{totalMinutes || '–'}</strong><span>minuter</span></div><div><strong>{days.reduce((sum, day) => sum + day.activities.length, 0)}</strong><span>aktiviteter</span></div></div><div className="planning-day-list">{days.map((day) => <article className={`planning-day${day.activities.length ? ' has-workout' : ''}`} key={day.key}><header><div><strong>{day.date.toLocaleDateString('sv-SE', { weekday: 'long' })}</strong><small>{day.date.toLocaleDateString('sv-SE', { day: 'numeric', month: 'long' })}</small></div><PlanningEditButton code={code} date={day.key} group={group} onSaved={(saved) => setPlans((current) => [...current, saved])} label="+ Lägg till" /></header>{day.activities.length ? day.activities.map((plan) => <div className="planning-workout" key={plan.id}><div className="planning-activity-title"><span className={`planning-type planning-type-${plan.activityType}`}>{typeLabel(plan.activityType)}</span><h2>{plan.title}</h2></div>{plan.focus && <span className="workout-focus-pill">{focusLabel(plan.focus)}</span>}<div className="workout-library-stats">{plan.distanceMeters && <span>{Number(plan.distanceMeters).toLocaleString('sv-SE')} m</span>}{plan.durationMinutes && <span>{plan.durationMinutes} min</span>}{plan.location && <span>{plan.location}</span>}</div>{plan.notes && <p>{plan.notes}</p>}<PlanningEditButton code={code} plan={plan} date={day.key} group={group} onSaved={(saved) => setPlans((current) => current.map((item) => item.id === saved.id ? saved : item))} /></div>) : <p className="planning-empty">Ingen aktivitet planerad</p>}</article>)}</div></>}</section>
}

function SportAdminImport({ code }) {
  const [data, setData] = useState({ activities: [], fetchedAt: null }), [loading, setLoading] = useState(false), [error, setError] = useState('')
  const importCalendar = async () => { setLoading(true); setError(''); try { setData(await apiRequest('/api/workouts', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'import-sportadmin-calendar' }) })) } catch (requestError) { setError(requestError.message || 'Kunde inte läsa SportAdmin-kalendern.') } finally { setLoading(false) } }
  return <section className="sportadmin-import"><button type="button" className="secondary-button" onClick={importCalendar} disabled={loading}>📅 {loading ? 'Läser kalender…' : 'Testa SportAdmin-kalender'}</button>{data.fetchedAt && <small>Hämtad {new Date(data.fetchedAt).toLocaleString('sv-SE')}</small>}{error && <small className="form-error">{error}</small>}{data.activities.length > 0 && <div><strong>{data.activities.length} aktiviteter hittades</strong>{data.activities.slice(0, 12).map((item) => <p key={item.id}>{item.date}{item.time ? ` · ${item.time}` : ''} · {item.title}{item.location ? ` · ${item.location}` : ''}</p>)}</div>}</section>
}

function BackupTools({ code }) {
  const [status, setStatus] = useState('')
  const [progress, setProgress] = useState(0)
  const [busy, setBusy] = useState(false)
  const exportBackup = async () => {
    setBusy(true); setProgress(10); setStatus('Hämtar databasen…')
    try {
      const backup = await apiRequest('/api/profiles?backup=export', code)
      setProgress(75); setStatus('Skapar lokal fil…')
      const stamp = new Date().toISOString().slice(0, 10), blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }), url = URL.createObjectURL(blob), link = document.createElement('a')
      link.href = url; link.download = `simkoll-backup-${stamp}-v${APP_VERSION}.json`; link.click(); URL.revokeObjectURL(url)
      const size = `${(blob.size / 1024).toFixed(1)} KB`; setProgress(100); setStatus(`Backup nedladdad (${size}).`)
    } catch (error) { setStatus(error.message) } finally { setBusy(false) }
  }
  const importBackup = async (event) => {
    const file = event.target.files?.[0]; event.target.value = ''
    if (!file) return
    if (file.size > 25 * 1024 * 1024) return setStatus('Filen är större än 25 MB och kan inte importeras här.')
    if (!window.confirm(`Importera ${file.name}? Befintliga poster kan uppdateras. Detta bör göras först efter att en aktuell backup har sparats.`)) return
    setBusy(true); setProgress(15); setStatus('Läser lokal backup…')
    try {
      const backup = JSON.parse(await file.text())
      setProgress(45); setStatus('Kontrollerar och importerar…')
      const result = await apiRequest('/api/profiles', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'backup-import', backup }) })
      setProgress(100); setStatus(result.warnings?.length ? `Import klar med varningar: ${result.warnings.join(', ')}.` : 'Import klar. Ladda om sidan för att se ändringarna.')
    } catch (error) { setStatus(error instanceof SyntaxError ? 'Filen innehåller inte giltig JSON.' : error.message) } finally { setBusy(false) }
  }
  return <section className="settings-card backup-tools"><h2>Exportera eller importera databas</h2><p className="settings-help">Säkerhetskopiera data lokalt på den här enheten eller läs in en tidigare Simkoll-backup. Filnamnet innehåller datum och Simkoll-version.</p><div className="backup-actions"><button type="button" className="secondary-button" onClick={exportBackup} disabled={busy}>⬇️ {busy ? 'Arbetar…' : 'Exportera backup'}</button><label className="secondary-button backup-file-button">⬆️ Importera backup<input type="file" accept="application/json,.json" onChange={importBackup} disabled={busy} /></label></div>{busy || progress > 0 ? <div className="backup-progress" role="progressbar" aria-valuenow={progress}><i style={{ width: `${progress}%` }} /></div> : null}{status && <small className="backup-status">{status}</small>}<small className="settings-note">Backupen sparas eller läses från din lokala enhet. Den skickas inte till en språkmodell. Hantera filen som personuppgift.</small></section>
}

function WebappSettings({ code }) {
  const [settings, setSettings] = useState({ swimmer: {}, coach: {} })
  const [saved, setSaved] = useState(false)
  const swimmerFeatures = [['planning', 'Veckoplanering'], ['workout', 'Dagens pass'], ['competition', 'Tävlingsresultat'], ['talks', 'Utvecklingssamtal'], ['games', 'Veckans spel'], ['community', 'Pepp och meddelanden'], ['stars', 'Träningsstjärnor']]
  const coachFeatures = [['swimmers', 'Simmare'], ['groups', 'Grupper'], ['workout', 'Pass'], ['planning', 'Planering'], ['competition-calendar', 'Tävlingskalender'], ['community', 'Meddelanden'], ['meeting', 'Veckomöte'], ['trends', 'Grupptrend'], ['history', 'Historik'], ['week', 'Förra veckan'], ['talks', 'Utvecklingssamtal'], ['goals', 'Utvecklingsmål'], ['programs', 'Träningsprogram'], ['rewards', 'Poäng & nivåer'], ['workout-library', 'Passbibliotek'], ['competition', 'Tävlingsresultat'], ['logs', 'Loggar'], ['faq', 'FAQ'], ['legal', 'Info & villkor']]
  const overviewFeatures = [['today', 'Idag'], ['swimmers', 'Simmare'], ['groups', 'Grupper'], ['workout', 'Pass'], ['planning', 'Planering'], ['competition-calendar', 'Tävlingar'], ['community', 'Meddelanden'], ['meeting', 'Veckomöte'], ['trends', 'Grupptrend'], ['history', 'Historik'], ['week', 'Förra veckan'], ['talks', 'Utvecklingssamtal'], ['competition', 'Tävlingsresultat'], ['workout-library', 'Passbibliotek'], ['goals', 'Utvecklingsmål'], ['programs', 'Träningsprogram'], ['rewards', 'Poäng & nivåer'], ['app-feedback', 'Appfeedback'], ['faq', 'FAQ'], ['legal', 'Info & villkor'], ['settings', 'Inställningar']]
  useEffect(() => { apiRequest('/api/goals?settings=true', code).then((data) => setSettings(data.settings || { swimmer: {}, coach: {} })).catch(() => {}) }, [code])
  const toggle = (role, key) => setSettings((current) => ({ ...current, [role]: { ...current[role], [key]: current[role]?.[key] === false } }))
  const save = async () => { await apiRequest('/api/goals', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'save-settings', settings }) }); window.dispatchEvent(new CustomEvent('simkoll-settings-updated', { detail: settings })); setSaved(true); setTimeout(() => setSaved(false), 1800) }
  const reset = async () => { const result = await apiRequest('/api/goals', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'reset-settings' }) }); setSettings(result.settings) }
  const list = (role, features) => <div className="settings-list">{features.map(([key, label]) => <label key={key}><span><strong>{label}</strong><small>{settings[role]?.[key] === false ? 'Dold' : 'Synlig'}</small></span><input type="checkbox" checked={settings[role]?.[key] !== false} onChange={() => toggle(role, key)} /></label>)}</div>
  return <section className="webapp-settings"><div className="period-heading"><div><p className="eyebrow">Tränarverktyg</p><h1>Webapp-inställningar</h1><small>Styr vad som syns utan att radera någon data.</small></div></div><section className="settings-card"><h2>Språkmodellstöd</h2><p className="settings-help">Stäng av alla anrop till språkmodeller. Trendanalyser, textförbättring och importtolkning blockeras då även på serversidan.</p><label className="settings-toggle-row"><span><strong>AI-stöd</strong><small>{settings.aiEnabled === false ? 'Avstängt – inga anrop görs' : 'På – AI-funktioner är tillgängliga'}</small></span><input type="checkbox" checked={settings.aiEnabled !== false} onChange={() => setSettings((current) => ({ ...current, aiEnabled: current.aiEnabled === false }))} /></label><label className="settings-field ai-token-limit"><span><strong>Tokenstak per månad</strong><small>0 betyder obegränsat. När taket nås stoppas nya AI-anrop tills nästa månad.</small></span><input type="number" min="0" step="1000" value={settings.aiMonthlyTokenLimit || 0} onChange={(event) => setSettings((current) => ({ ...current, aiMonthlyTokenLimit: Math.max(0, Number(event.target.value) || 0) }))} /></label></section><section className="settings-card"><h2>Simmarnas välkomstpepp</h2><p className="settings-help">Visa tävlingsnedräkning, passpepp och diskreta färgeffekter på simmarnas startsida.</p><label className="settings-toggle-row"><span><strong>Visuella effekter</strong><small>{settings.swimmerEffects === false ? 'Avstängda för alla simmare' : 'På för alla simmare'}</small></span><input type="checkbox" checked={settings.swimmerEffects !== false} onChange={() => setSettings((current) => ({ ...current, swimmerEffects: current.swimmerEffects === false }))} /></label></section><section className="settings-card"><h2>Genvägar i översiktskortet</h2><p className="settings-help">Välj vilka genvägar som ska visas. Idag är alltid kvar som startsida.</p>{list('overview', overviewFeatures)}</section><section className="settings-card"><h2>Simmarvyn</h2>{list('swimmer', swimmerFeatures)}</section><section className="settings-card"><h2>Appfeedback för simmare</h2><p className="settings-help">Visa eller dölj frågan “Hur kan vi göra Simkoll bättre?” längst ned på simmarens startsida.</p><label className="settings-toggle-row"><span><strong>Appfeedback</strong><small>{settings.swimmer?.appFeedback === false ? 'Dold för simmare' : 'Synlig för simmare'}</small></span><input type="checkbox" checked={settings.swimmer?.appFeedback !== false} onChange={() => toggle('swimmer', 'appFeedback')} /></label></section><section className="settings-card"><h2>Tränarvyns meny</h2>{list('coach', coachFeatures)}</section><div className="settings-actions"><button className="primary-button" onClick={save}>Spara inställningar</button><button className="secondary-button" onClick={reset}>Återställ standard</button>{saved && <span className="settings-saved">Sparat ✓</span>}</div><BackupTools code={code} /><p className="settings-note">Webapp-inställningar kan inte döljas och är alltid tillgängliga för tränare.</p></section>
}

function CoachCompetitionEntries({ code }) {
  const [competitions, setCompetitions] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [data, setData] = useState({ events: [], entries: [] })
  const [loading, setLoading] = useState(true)
  useEffect(() => { apiRequest('/api/workouts?calendar=true', code).then((result) => { const list = result.competitions || []; setCompetitions(list); if (list[0]) setSelectedId(list[0].id) }).catch(() => {}).finally(() => setLoading(false)) }, [code])
  useEffect(() => { if (!selectedId) return; setLoading(true); apiRequest(`/api/workouts?program=true&id=${selectedId}`, code).then(setData).catch(() => setData({ events: [], entries: [] })).finally(() => setLoading(false)) }, [code, selectedId])
  const safeEvents = Array.isArray(data.events) ? data.events : []
  const safeEvnents = safeEvents
  const safeEntries = Array.isArray(data.entries) ? data.entries : []
  const submitted = safeEntries.filter((entry) => entry.status === 'submitted')
  return <section className="competition-submissions"><div className="period-heading"><div><p className="eyebrow">Tävlingsplanering</p><h1>Tävlingsanmälningar</h1><small>Se vilka grenar simmarna har skickat in.</small></div></div>{competitions.length ? <label className="settings-field"><strong>Välj tävling</strong><select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>{competitions.map((item) => <option key={item.id} value={item.id}>{item.title} · {item.startDate}</option>)}</select></label> : <p className="empty">Inga tävlingar är skapade ännu.</p>}{loading ? <p className="empty">Hämtar anmälningar…</p> : data.events.length ? <div className="competition-submission-list">{data.events.map((event) => { const names = submitted.filter((entry) => entry.event_id === event.id || entry.eventId === event.id); return <article key={event.id}><div><strong>{event.eventNumber ? `${event.eventNumber} · ` : ''}{event.label}</strong><small>{event.gender || 'Alla'} · {event.ageClass || 'Alla åldrar'}</small></div><span>{names.length ? names.map((entry) => `${entry.profileEmoji || '🏊'} ${entry.profileName || 'Simmare'}`).join(', ') : 'Ingen inskickad ännu'}</span></article> })}</div> : <p className="empty">Tävlingsprogrammet är inte inläst ännu.</p>}</section>
}

class CompetitionSubmissionBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null } }
  static getDerivedStateFromError(error) { return { error } }
  componentDidCatch(error) { console.error('Competition submission view failed:', error) }
  render() { return this.state.error ? <section className="empty-period"><span>⚠️</span><h2>Tävlingsanmälningarna kunde inte visas</h2><p>{this.state.error.message || 'Ett oväntat fel uppstod.'}</p><small>Öppna webbläsarens konsol om felet behöver felsökas vidare.</small><button className="secondary-button" onClick={() => this.setState({ error: null })}>Försök igen</button></section> : this.props.children }
}

function CompetitionSubmissionManager({ code }) {
  const [competitions, setCompetitions] = useState([]), [selectedId, setSelectedId] = useState(''), [data, setData] = useState({ events: [], entries: [] }), [selectedProfile, setSelectedProfile] = useState(''), [chosen, setChosen] = useState([]), [loading, setLoading] = useState(true), [saving, setSaving] = useState(false)
  const load = () => { setLoading(true); apiRequest('/api/workouts?calendar=true', code).then((result) => { const list = result.competitions || []; setCompetitions(list); if (!selectedId && list[0]) setSelectedId(list[0].id) }).catch(() => {}).finally(() => setLoading(false)) }
  useEffect(load, [code])
  useEffect(() => { if (!selectedId) return; setLoading(true); apiRequest(`/api/workouts?program=true&id=${selectedId}`, code).then((result) => { setData(result); setSelectedProfile(''); setChosen([]) }).catch(() => setData({ events: [], entries: [] })).finally(() => setLoading(false)) }, [code, selectedId])
  const submitted = data.entries.filter((entry) => entry.status === 'submitted')
  const profiles = [...new Map(submitted.map((entry) => [entry.profile_id, entry])).values()]
  const selectProfile = (profileId) => { setSelectedProfile(profileId); setChosen(submitted.filter((entry) => entry.profile_id === profileId).map((entry) => entry.event_id)) }
  const save = async () => { setSaving(true); try { await apiRequest('/api/workouts', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'coach-update-competition-entry', competitionId: selectedId, profileId: selectedProfile, eventIds: chosen }) }); await new Promise((resolve) => setTimeout(resolve, 0)); const result = await apiRequest(`/api/workouts?program=true&id=${selectedId}`, code); setData(result); window.alert('Grenval sparat.') } catch (error) { window.alert(error.message) } finally { setSaving(false) } }
  const exportCsv = () => { const lines = [['Simmare', 'Gren', 'Kön', 'Klass'], ...profiles.flatMap((profile) => submitted.filter((entry) => entry.profile_id === profile.profile_id).map((entry) => { const event = safeEvents.find((item) => item.id === entry.event_id); return [profile.profileName || 'Simmare', event?.label || '', event?.gender || '', event?.ageClass || ''] }))]; const csv = lines.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(';')).join('\n'); const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `simkoll-tavlingsanmalningar-${todayKey()}.csv`; link.click(); URL.revokeObjectURL(url) }
  return <section className="competition-submissions"><div className="period-heading"><div><p className="eyebrow">Tävlingsplanering</p><h1>Tävlingsanmälningar</h1><small>Välj en simmare för att granska eller justera grenvalet.</small></div><button className="secondary-button" onClick={exportCsv} disabled={!submitted.length}>Exportera CSV</button></div>{competitions.length ? <label className="settings-field"><strong>Välj tävling</strong><select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>{competitions.map((item) => <option key={item.id} value={item.id}>{item.title} · {item.startDate}</option>)}</select></label> : <p className="empty">Inga tävlingar är skapade ännu.</p>}{profiles.length ? <div className="competition-swimmer-picker">{profiles.map((profile) => <button type="button" className={selectedProfile === profile.profile_id ? 'active' : ''} key={profile.profile_id} onClick={() => selectProfile(profile.profile_id)}>{profile.profileEmoji || '🏊'} {profile.profileName || 'Simmare'}<small>{submitted.filter((entry) => entry.profile_id === profile.profile_id).length} grenar</small></button>)}</div> : !loading && <p className="empty">Ingen simmare har skickat in sitt grenval ännu.</p>}{selectedProfile && <section className="competition-edit-selection"><h2>Justera grenval</h2><div className="competition-entry-list">{safeEvents.filter((event) => event.entryAllowed !== false).map((event) => <label key={event.id}><input type="checkbox" checked={chosen.includes(event.id)} onChange={() => setChosen((current) => current.includes(event.id) ? current.filter((id) => id !== event.id) : [...current, event.id])} /><span><strong>{event.eventNumber ? `${event.eventNumber} · ` : ''}{event.label}</strong><small>{event.gender} · {event.ageClass}</small></span></label>)}</div><button className="primary-button" onClick={save} disabled={saving}>{saving ? 'Sparar…' : 'Spara ändrat grenval'}</button></section>}</section>
}

/* unused program draft
function CompetitionCalendarDraft({ code }) {
  const [competitions, setCompetitions] = useState([])
  const [programs, setPrograms] = useState({})
  const [programLoading, setProgramLoading] = useState({})
  const [group, setGroup] = useState('all')
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ startDate: todayKey(), endDate: todayKey(), title: '', category: '', location: '', notes: '', targetGroups: ['ungdom_orange', 'ungdom_svart', 'junior'] })
  const groups = [['ungdom_orange', 'Ungdom Orange'], ['ungdom_svart', 'Ungdom Svart'], ['junior', 'Junior']]
  const load = () => apiRequest('/api/workouts?calendar=true', code).then((data) => setCompetitions(data.competitions || [])).catch(() => {})
  useEffect(() => { document.querySelectorAll('.competition-calendar-list article').forEach((card) => { const date = card.querySelector('.eyebrow')?.textContent?.trim().slice(-10); const past = /^\d{4}-\d{2}-\d{2}$/.test(date) && date < todayKey(); card.classList.toggle('past-competition', past) }) }, [competitions])
  const loadProgram = async (competitionId) => { try { const data = await apiRequest(`/api/workouts?program=true&id=${competitionId}`, code); setPrograms((current) => ({ ...current, [competitionId]: data.events || [] })) } catch (error) { window.alert(error.message) } }
  const importProgram = async (event, competitionId) => { const file = event.target.files?.[0]; event.target.value = ''; if (!file) return; if (!/^(image\/(png|jpe?g|webp)|application/pdf|application\/msword|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document|text\/plain)$/i.test(file.type)) return window.alert('Välj en bild, PDF eller Word-fil.'); if (file.size > 9 * 1024 * 1024) return window.alert('Filen är för stor. Välj en fil under 9 MB.'); const reader = new FileReader(); reader.onload = async () => { setProgramLoading((current) => ({ ...current, [competitionId]: true })); try { const data = await apiRequest('/api/workouts', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'import-competition-program', competitionId, fileData: reader.result, mimeType: file.type, fileName: file.name }) }); if (data.error) throw new Error(data.error); setPrograms((current) => ({ ...current, [competitionId]: data.events || [] })) } catch (error) { window.alert(error.message) } finally { setProgramLoading((current) => ({ ...current, [competitionId]: false })) } }; reader.readAsDataURL(file) }
  useEffect(() => { load() }, [code])
  const save = async (event) => { event.preventDefault(); try { const result = await apiRequest('/api/workouts', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'save-competition', ...form }) }); setCompetitions((current) => [...current, result.competition].sort((a, b) => a.startDate.localeCompare(b.startDate))); setForm({ ...form, title: '', notes: '' }); setOpen(false) } catch (error) { window.alert(error.message) } }
  const remove = async (item) => { if (!window.confirm(`Ta bort ${item.title}?`)) return; await apiRequest(`/api/workouts?calendar=true&id=${item.id}`, code, { method: 'DELETE' }); setCompetitions((current) => current.filter((entry) => entry.id !== item.id)) }
  const visible = competitions.filter((item) => group === 'all' || item.targetGroups.includes(group))
  const groupName = (value) => groups.find(([key]) => key === value)?.[1] || value
  return <section className="competition-calendar"><div className="period-heading"><div><p className="eyebrow">Planera & följa upp</p><h1>Tävlingskalender</h1><small>Tävlingar syns automatiskt i veckoplaneringen.</small></div><div className="big-count"><strong>{visible.length}</strong><span>visas</span></div></div><div className="calendar-group-filter"><span>Visa grupp</span>{[['all', 'Alla grupper'], ...groups].map(([value, label]) => <button type="button" className={group === value ? 'active' : ''} key={value} onClick={() => setGroup(value)}>{label}</button>)}</div><details className="competition-add-card" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}><summary>＋ Lägg till tävling</summary><form className="competition-form" onSubmit={save}><div className="competition-form-grid"><label>Från<input required type="date" value={form.startDate} onChange={(event) => setForm({ ...form, startDate: event.target.value })} /></label><label>Till<input required type="date" value={form.endDate} onChange={(event) => setForm({ ...form, endDate: event.target.value })} /></label><label>Tävlingsnamn<input required value={form.title} placeholder="t.ex. Sundsvall Swim" onChange={(event) => setForm({ ...form, title: event.target.value })} /></label><label>Plats<input value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} /></label></div><label>Typ av tävling<input value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} /></label><fieldset><legend>Berörda grupper</legend><div className="competition-group-checkboxes">{groups.map(([value, label]) => <label key={value}><input type="checkbox" checked={form.targetGroups.includes(value)} onChange={(event) => setForm({ ...form, targetGroups: event.target.checked ? [...form.targetGroups, value] : form.targetGroups.filter((item) => item !== value) })} />{label}</label>)}</div></fieldset><label>Kommentar<input value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label><button className="primary-button" type="submit">Spara tävling</button></form></details><div className="competition-calendar-list">{visible.length ? visible.map((item) => <article key={item.id}><div><p className="eyebrow">{item.startDate === item.endDate ? item.startDate : `${item.startDate} – ${item.endDate}`}</p><h2>{item.title}</h2><p>{[item.category, item.location].filter(Boolean).join(' · ')}</p><small>{item.targetGroups.map(groupName).join(' · ')}</small>{item.notes && <p>{item.notes}</p>}</div><button type="button" className="text-button" onClick={() => remove(item)}>Ta bort</button></article>) : <p className="empty">Inga tävlingar matchar gruppen ännu.</p>}</div></section>
}

}
*/
function CompetitionProgramPanel({ code, competition }) {
  const [events, setEvents] = useState(null)
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const load = async () => { setLoading(true); try { const data = await apiRequest(`/api/workouts?program=true&id=${competition.id}`, code); setEvents(data.events || []); setEntries(data.entries || []) } catch (error) { window.alert(error.message) } finally { setLoading(false) } }
  const importFile = (event) => { const file = event.target.files?.[0]; event.target.value = ''; if (!file) return; const allowed = file.type.startsWith('image/') || ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'].includes(file.type) || /\.(pdf|docx?)$/i.test(file.name); if (!allowed) return window.alert('Välj en bild, PDF eller Word-fil.'); if (file.size > 9 * 1024 * 1024) return window.alert('Filen är för stor. Välj en fil under 9 MB.'); const reader = new FileReader(); reader.onload = async () => { setImporting(true); try { const data = await apiRequest('/api/workouts', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'import-competition-program', competitionId: competition.id, fileData: reader.result, mimeType: file.type || 'application/octet-stream', fileName: file.name }) }); setEvents(data.events || []) } catch (error) { window.alert(error.message) } finally { setImporting(false) } }; reader.readAsDataURL(file) }
  return <details className="competition-program" onToggle={(event) => event.currentTarget.open && events === null && load()}><summary>{events?.length ? `Grenprogram · ${events.length} grenar` : 'Grenprogram · lägg till'}</summary><div className="competition-program-actions"><button type="button" className="secondary-button" onClick={load} disabled={loading}>{loading ? 'Laddar…' : 'Visa sparat program'}</button><label className="secondary-button">📎 {importing ? 'Tolkar…' : 'Läs in bild / PDF / Word'}<input type="file" accept="image/png,image/jpeg,image/webp,application/pdf,.doc,.docx" onChange={importFile} disabled={importing} /></label><small>AI plockar ut grenordning, kön och åldersklass. Granska alltid resultatet.</small></div>{events?.length ? <div className="competition-event-list">{events.map((item) => { const names = entries.filter((entry) => entry.event_id === item.id || entry.eventId === item.id && entry.status === 'submitted'); return <span key={item.id}>{item.eventNumber ? `${item.eventNumber} · ` : ''}{item.label || `${item.distanceMeters || ''} m ${item.stroke || ''}`} · {item.gender || 'Alla'} · {item.ageClass || 'Alla åldrar'}{names.length ? ` · ${names.map((entry) => `${entry.profileEmoji || '🏊'} ${entry.profileName || 'Simmare'}`).join(', ')}` : ''}</span> })}</div> : events ? <p className="empty">Inga grenar hittades ännu.</p> : null}</details>
}

function CompetitionCalendar({ code }) {
  const [competitions, setCompetitions] = useState([])
  const [form, setForm] = useState({ startDate: todayKey(), endDate: todayKey(), title: '', category: '', location: '', notes: '', targetGroups: ['ungdom_orange', 'ungdom_svart', 'junior'] })
  const load = () => apiRequest('/api/workouts?calendar=true', code).then((data) => setCompetitions(data.competitions || [])).catch(() => {})
  useEffect(() => { document.querySelectorAll('.competition-calendar-list article').forEach((card) => { const date = card.querySelector('.eyebrow')?.textContent?.trim().slice(-10); const past = /^\d{4}-\d{2}-\d{2}$/.test(date) && date < todayKey(); card.classList.toggle('past-competition', past) }) }, [competitions])
  useEffect(() => { load() }, [code])
  const save = async (event) => { event.preventDefault(); try { const result = await apiRequest('/api/workouts', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'save-competition', ...form }) }); setCompetitions((current) => [...current.filter((item) => item.id !== result.competition.id), result.competition].sort((a, b) => a.startDate.localeCompare(b.startDate))); setForm({ ...form, title: '', notes: '' }) } catch (error) { window.alert(error.message) } }
  const remove = async (competition) => { if (!window.confirm(`Ta bort ${competition.title}?`)) return; await apiRequest(`/api/workouts?calendar=true&id=${competition.id}`, code, { method: 'DELETE' }); setCompetitions((current) => current.filter((item) => item.id !== competition.id)) }
  const groupNames = { ungdom_orange: 'Ungdom Orange', ungdom_svart: 'Ungdom Svart', junior: 'Junior' }
  return <section className="competition-calendar"><div className="period-heading"><div><p className="eyebrow">Planera & följa upp</p><h1>Tävlingskalender</h1><small>Planerade tävlingar syns automatiskt i veckoplaneringen.</small></div><div className="big-count"><strong>{competitions.length}</strong><span>tävlingar</span></div></div><form className="competition-form" onSubmit={save}><h2>Lägg till tävling</h2><div className="competition-form-grid"><label>Från<input type="date" value={form.startDate} onChange={(event) => setForm({ ...form, startDate: event.target.value })} /></label><label>Till<input type="date" value={form.endDate} onChange={(event) => setForm({ ...form, endDate: event.target.value })} /></label><label>Tävlingsnamn<input required value={form.title} placeholder="t.ex. Sundsvall Swim" onChange={(event) => setForm({ ...form, title: event.target.value })} /></label><label>Plats<input value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} /></label></div><label>Typ av tävling<input value={form.category} placeholder="t.ex. mästerskap eller klubbtävling" onChange={(event) => setForm({ ...form, category: event.target.value })} /></label><fieldset><legend>Berörda grupper</legend><div className="competition-group-checkboxes">{Object.entries(groupNames).map(([value, label]) => <label key={value}><input type="checkbox" checked={form.targetGroups.includes(value)} onChange={(event) => setForm({ ...form, targetGroups: event.target.checked ? [...form.targetGroups, value] : form.targetGroups.filter((item) => item !== value) })} />{label}</label>)}</div></fieldset><label>Kommentar<input value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label><button className="primary-button" type="submit">Spara tävling</button></form><div className="competition-calendar-list">{competitions.length ? competitions.map((competition) => <article key={competition.id}><div><p className="eyebrow">{competition.startDate === competition.endDate ? competition.startDate : `${competition.startDate} – ${competition.endDate}`}</p><h2>{competition.title}</h2><p>{[competition.category, competition.location].filter(Boolean).join(' · ')}</p><small>{competition.targetGroups.map((group) => groupNames[group] || group).join(' · ')}</small>{competition.notes && <p>{competition.notes}</p>}<CompetitionProgramPanel code={code} competition={competition} /></div><button type="button" className="text-button" onClick={() => remove(competition)}>Ta bort</button></article>) : <p className="empty">Inga tävlingar inlagda ännu.</p>}</div></section>
}

function PlanningEditButton({ code, plan, date, group, onSaved, label = 'Redigera' }) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(null)
  const types = [['swim', 'Simning'], ['strength', 'Styrketräning'], ['dryland', 'Landträning'], ['competition', 'Tävling']]
  const suggestions = { swim: 'Träningspass', strength: 'Styrkepass', dryland: 'Landträningspass', competition: 'Tävlingsdag' }
  const openEditor = () => { const activityType = plan?.activityType || 'swim'; setForm({ activityType, title: plan?.title || suggestions[activityType], focus: plan?.focus || '', distanceMeters: plan?.distanceMeters || '', durationMinutes: plan?.durationMinutes || (activityType === 'swim' ? 120 : ''), timeOfDay: plan?.timeOfDay || '', targetGroups: plan?.targetGroups?.length ? plan.targetGroups : group === 'all' ? ['ungdom_orange', 'ungdom_svart', 'junior'] : [group], location: plan?.location || '', notes: plan?.notes || '' }); setOpen(true) }
  const selectType = (activityType) => setForm((current) => ({ ...current, activityType, title: current.title === suggestions[current.activityType] || !current.title ? suggestions[activityType] : current.title, durationMinutes: activityType === 'swim' && !current.durationMinutes ? 120 : current.durationMinutes }))
  const save = async (event) => { event.preventDefault(); try { const result = await apiRequest('/api/workouts', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'save-plan', id: plan?.id, date, ...form }) }); onSaved(result.plan); setOpen(false) } catch (error) { window.alert(error.message) } }
  return <><button type="button" className="text-button" onClick={openEditor}>{label}</button>{open && form && <div className="planning-editor-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setOpen(false)}><form className="planning-editor" onSubmit={save}><div className="planning-editor-head"><h2>{plan ? 'Redigera aktivitet' : 'Lägg till aktivitet'}</h2><button type="button" className="text-button" onClick={() => setOpen(false)}>Stäng</button></div><fieldset><legend>Vad planeras?</legend><div className="planning-type-buttons">{types.map(([value, text]) => <button type="button" className={form.activityType === value ? 'active' : ''} key={value} onClick={() => selectType(value)}>{text}</button>)}</div></fieldset>{form.activityType === 'swim' && <><label>Huvudinriktning<select value={form.focus} onChange={(event) => setForm({ ...form, focus: event.target.value })}><option value="">Välj inriktning</option>{WORKOUT_FOCUSES.map(([value, text]) => <option value={value} key={value}>{text}</option>)}</select></label><label>Tid på dagen<select value={form.timeOfDay} onChange={(event) => setForm({ ...form, timeOfDay: event.target.value, durationMinutes: event.target.value === 'morning' ? 90 : event.target.value === 'afternoon' ? 120 : form.durationMinutes })}><option value="">Välj tid</option><option value="morning">Förmiddag / morgon</option><option value="afternoon">Eftermiddag / kväll</option></select></label></>}<label>Rubrik<input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>{form.activityType === 'swim' && <label>Distans<select value={form.distanceMeters} onChange={(event) => setForm({ ...form, distanceMeters: event.target.value })}><option value="">Välj meter</option>{[1000, 1500, 2000, 2500, 3000, 4000, 5000, 6000, 7000].map((value) => <option value={value} key={value}>{value.toLocaleString('sv-SE')} m</option>)}<option value="custom">Annat (skriv nedan)</option></select></label>}{form.distanceMeters === 'custom' && <label>Egen distans<input type="number" min="1" onChange={(event) => setForm({ ...form, distanceMeters: event.target.value })} /></label>}<label>Tidsåtgång<select value={form.durationMinutes} onChange={(event) => setForm({ ...form, durationMinutes: event.target.value })}><option value="">Välj tid</option><option value="60">1 timme</option><option value="90">1,5 timmar</option><option value="120">2 timmar</option></select></label><fieldset><legend>Berörda grupper</legend><div className="competition-group-checkboxes">{[['ungdom_orange', 'Ungdom Orange'], ['ungdom_svart', 'Ungdom Svart'], ['junior', 'Junior']].map(([value, text]) => <label key={value}><input type="checkbox" checked={form.targetGroups.includes(value)} onChange={(event) => setForm({ ...form, targetGroups: event.target.checked ? [...form.targetGroups, value] : form.targetGroups.filter((item) => item !== value) })} />{text}</label>)}</div></fieldset><label>Kommentar eller plats<input value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label><button className="primary-button" type="submit">Spara planering</button></form></div>}</>
}

function WorkoutLibrary({ code, responses }) {
  const [workouts, setWorkouts] = useState([])
  const [filter, setFilter] = useState('all')
  const [sort, setSort] = useState('date')
  const focusLabels = { fart: 'Fart', troskel: 'Tröskel', syra: 'Syra', f2_frisim: 'F2 Frisim', f2_spec: 'F2 Spec', distans: 'Distans', teknik: 'Teknik', aterhamtning: 'Återhämtning', kondition_frisim: 'Kondition frisim', kondition_special: 'Kondition special' }
  const load = () => apiRequest('/api/workouts?history=true', code).then((data) => setWorkouts(data.workouts || [])).catch(() => {})
  useEffect(() => { load() }, [code])
  const editWorkout = async (workout) => { const title = window.prompt('Rubrik för passet', workout.title); if (title == null) return; const content = window.prompt('Huvudserie och upplägg', workout.content); if (content == null) return; const focus = window.prompt(`Huvudinriktning (kod):\n${Object.entries(focusLabels).map(([key, label]) => `${key} = ${label}`).join('\n')}`, workout.focus || ''); if (focus == null) return; try { await apiRequest('/api/workouts', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...workout, date: workout.date, title, content, focus }) }); await load() } catch (error) { window.alert(error.message) } }
  const today = todayKey()
  const visible = workouts.filter((workout) => filter === 'all' || (filter === 'upcoming' ? workout.date >= today : workout.date < today)).map((workout) => {
    const after = responses.filter((item) => item.type === 'after' && dateKey(responseDate(item)) === workout.date)
    const avg = (key) => { const values = after.map((item) => Number(item[key])).filter(Number.isFinite); return values.length ? (values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1) : null }
    return { ...workout, focusLabel: focusLabels[workout.focus] || workout.focus || 'Ingen inriktning', responses: after.length, rpe: avg('rpe'), pass: avg('pass'), setup: avg('setup') }
  }).sort((a, b) => sort === 'date' ? b.date.localeCompare(a.date) : sort === 'distance' ? (b.distanceMeters || 0) - (a.distanceMeters || 0) : sort === 'duration' ? (b.durationMinutes || 0) - (a.durationMinutes || 0) : sort === 'rpe' ? (Number(b.rpe) || -1) - (Number(a.rpe) || -1) : sort === 'pass' ? (Number(b.pass) || -1) - (Number(a.pass) || -1) : (Number(b.setup) || -1) - (Number(a.setup) || -1))
  return <section className="workout-library"><div className="period-heading"><div><p className="eyebrow">Träningspass</p><h1>Passbibliotek</h1></div><div className="big-count"><strong>{visible.length}</strong><span>pass</span></div></div><div className="library-controls"><label>Visa<select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">Alla pass</option><option value="upcoming">Kommande</option><option value="past">Tidigare</option></select></label><label>Sortera efter<select value={sort} onChange={(event) => setSort(event.target.value)}><option value="date">Datum</option><option value="distance">Distans</option><option value="duration">Tid</option><option value="rpe">RPE</option><option value="pass">Passbetyg</option><option value="setup">Upplägg</option></select></label></div>{visible.length ? <div className="workout-library-list">{visible.map((workout) => { const incomplete = !workout.title || !workout.content || !focusLabels[workout.focus]; return <article key={workout.id} className={`${workout.date >= today ? 'upcoming' : ''}${incomplete ? ' incomplete' : ''}`}><div className="workout-library-title"><div><p className="eyebrow">{new Date(`${workout.date}T12:00:00`).toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' })}</p><h2>{workout.title || 'Pass utan rubrik'}</h2><span className="workout-focus-pill">{workout.focusLabel}</span></div>{incomplete && <span className="workout-incomplete-flag" title="Passet behöver kompletteras">⚑</span>}</div><p className="workout-content-preview">{workout.content}</p><div className="workout-library-stats"><span>{workout.distanceMeters ? `${workout.distanceMeters.toLocaleString('sv-SE')} m` : '– m'}</span><span>{workout.durationMinutes ? `${workout.durationMinutes} min` : '– min'}</span><span>{workout.responses ? `${workout.responses} svar` : 'Inga svar'}</span><span>{workout.pass ? `Pass ${workout.pass}/5` : 'Pass –'}</span><span>{workout.rpe ? `RPE ${workout.rpe}/10` : 'RPE –'}</span></div><details className="workout-library-details"><summary>Visa hela passet</summary><button type="button" className="secondary-button workout-edit-button" onClick={() => editWorkout(workout)}>Redigera pass</button><WorkoutContent content={workout.content} />{workout.note && <aside><strong>Kommentar från tränaren</strong>{workout.note}</aside>}</details></article> })}</div> : <p className="empty">Inga pass matchar urvalet ännu.</p>}</section>
}

function CompetitionResults({ profiles, results: rawResults, loading, onSync: performSync, onSyncProfile }) {
  const [profileFilter, setProfileFilter] = useState('all')
  const results = rawResults.filter((item, index, all) => {
    const same = all.filter((other) => other.profile_id === item.profile_id && other.event === item.event && (other.pool || '') === (item.pool || '')).sort((a, b) => b.result_date.localeCompare(a.result_date))
    return same.indexOf(item) < 20
  })
  const visibleProfiles = profiles.filter((profile) => profile.tempusId && (profileFilter === 'all' || profile.id === profileFilter))
  const latestSync = rawResults.reduce((latest, item) => !latest || (item.synced_at && item.synced_at > latest) ? item.synced_at : latest, null)
  const onSync = () => {
    const previous = latestSync ? `Senaste hämtning: ${new Date(latestSync).toLocaleString('sv-SE', { dateStyle: 'medium', timeStyle: 'short' })}.` : 'Ingen tidigare hämtning finns sparad.'
    if (window.confirm(`Hämta Tempus-data för alla simmare?\n\n${previous}\n\nHämtningen kan ta en stund om många simmare har Tempus-ID.`)) performSync()
  }
  const strokeOrder = (event) => {
    const name = String(event || '').toLowerCase()
    const stroke = name.includes('bröst') || name.includes('breast') ? 0 : name.includes('frisim') || name.includes('freestyle') ? 1 : name.includes('rygg') || name.includes('backstroke') ? 2 : name.includes('fjäril') || name.includes('butterfly') ? 3 : name.includes('medley') ? 4 : 5
    const distance = Number((name.match(/\d+/) || ['99999'])[0])
    return [stroke, distance, name]
  }
  return <section className="competition-results"><div className="period-heading"><div><p className="eyebrow">Tempus Open</p><h1>Tävlingsresultat</h1></div><button className="primary-button" disabled={loading} onClick={onSync}>{loading ? 'Hämtar…' : 'Hämta Tempus-data för alla'}</button></div><div className="library-controls"><label>Simmare<select value={profileFilter} onChange={(event) => setProfileFilter(event.target.value)}><option value="all">Alla simmare</option>{profiles.filter((profile) => profile.tempusId).map((profile) => <option key={profile.id} value={profile.id}>{profile.emoji} {profile.displayName}</option>)}</select></label></div>{visibleProfiles.length ? <div className="competition-profile-list">{visibleProfiles.map((profile) => { const grouped = new Map(); results.filter((item) => item.profile_id === profile.id).forEach((item) => { const key = item.event; if (!grouped.has(key)) grouped.set(key, []); grouped.get(key).push(item) }); return <details className="competition-profile-card" key={profile.id}><summary><span>{profile.emoji} {profile.displayName}<small>Tempus-ID {profile.tempusId}</small></span><span><small>{grouped.size} event</small><button className="secondary-button" disabled={loading} onClick={(event) => { event.preventDefault(); event.stopPropagation(); onSyncProfile(profile.id) }}>{loading ? 'Hämtar…' : 'Hämta'}</button></span></summary>{grouped.size ? <div className="competition-event-list">{[...grouped.entries()].sort(([a], [b]) => { const aa = strokeOrder(a); const bb = strokeOrder(b); return aa[0] - bb[0] || aa[1] - bb[1] || aa[2].localeCompare(bb[2], 'sv') }).map(([event, eventItems]) => { const pools = new Map(); eventItems.forEach((item) => { const pool = item.pool || ''; if (!pools.has(pool)) pools.set(pool, []); pools.get(pool).push(item) }); const poolEntries = [...pools.entries()].sort(([a], [b]) => { const short = (value) => /25|kort|short/i.test(value) ? 0 : /50|lång|long/i.test(value) ? 1 : 2; return short(a) - short(b) || a.localeCompare(b, 'sv') }); return <details key={event}><summary><span>{event}</span></summary><div className="competition-history">{poolEntries.map(([pool, items]) => { const best = items.slice().sort((a, b) => (a.result_time || 999999) - (b.result_time || 999999))[0]; return <div key={pool || 'unknown'}><strong>{pool || 'Bassäng saknas'} · {best.swim_time}</strong>{items.slice().sort((a, b) => b.result_date.localeCompare(a.result_date)).map((item) => <span key={item.id}>{new Date(item.result_date).toLocaleDateString('sv-SE')} · {item.swim_time}{item.aqua_points != null ? ` · ${item.aqua_points} Aqua` : ''}</span>)}</div>})}</div></details> })}</div> : <p className="empty">Inga sparade resultat. Klicka Hämta.</p>}</details> })}</div> : <p className="empty">Inga sparade resultat ännu. Hämta Tempus-data för en simmare eller hela gruppen.</p>}</section>
}

function WorkoutTrendAnalysis({ analysis }) {
  if (!analysis?.focuses?.length && !analysis?.workload?.length && !analysis?.trend?.length) return null
  return <section className="workout-trend-analysis"><div className="workout-trend-heading"><div><p className="eyebrow">Passens innehåll och upplevelse</p><h2>Hur passen upplevs</h2></div><small>Inriktning jämförs med simmarnas svar</small></div>{analysis.trend?.length > 0 && <TrendLineChart items={analysis.trend} />}{analysis.focuses?.length > 0 && <div className="workout-focus-list">{analysis.focuses.map((item) => <article key={item.focus}><div><strong>{item.label}</strong><small>{item.workouts} planerade pass{item.sessions > item.workouts ? ` · ${item.sessions} registrerade pass` : ''}{item.distance ? ` · ${item.distance.toLocaleString('sv-SE')} m` : ''}{item.duration ? ` · ${item.duration} min` : ''}</small></div><div className="workout-focus-metrics"><span>{item.rpe == null ? '–' : `RPE ${item.rpe}${item.rpeSpread != null ? ` ±${item.rpeSpread}` : ''}`}</span><span>{item.feeling == null ? '–' : `Känsla ${item.feeling}/5`}</span><span>{item.speedFeeling == null ? '–' : `Fart ${item.speedFeeling}/5`}</span><span>{item.temperature == null ? '–' : `Temp ${item.temperature}/5`}</span><span>{item.passRating == null ? '–' : `Pass ${item.passRating}/5`}</span></div></article>)}</div>}{analysis.workload?.length > 0 && <div className="workload-trend"><p className="eyebrow">Mängd över tid</p>{analysis.workload.map((item) => <div key={item.weekStart}><span>{new Date(`${item.weekStart}T12:00:00`).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })}</span><b>{item.distance ? `${item.distance.toLocaleString('sv-SE')} m` : '–'}</b><small>{item.duration ? `${item.duration} min` : 'Ingen tidsdata'} · {item.workouts} pass</small></div>)}</div>}</section>
}

function GoalCompliance({ data, code, profile }) {
  const [targets, setTargets] = useState({ strengthTarget: 3, drylandTarget: 3 })
  const [scheduled, setScheduled] = useState(null)
  useEffect(() => { apiRequest('/api/training', code).then((training) => { const latest = training.crossGoals?.filter((goal) => goal.profileId === profile.id).sort((a, b) => b.startDate.localeCompare(a.startDate))[0]; if (latest) { setTargets({ strengthTarget: latest.strengthTarget, drylandTarget: latest.drylandTarget }); setScheduled(latest) } }).catch(() => {}) }, [code, profile.id])
  const save = async (event) => { event.preventDefault(); try { const result = await apiRequest('/api/training', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'cross-goals', profileId: profile.id, ...targets, strengthTarget: Number(targets.strengthTarget), drylandTarget: Number(targets.drylandTarget) }) }); setScheduled({ ...targets, startDate: result.startDate }); window.alert(`Målen börjar gälla ${result.startDate}.`) } catch (error) { window.alert(error.message) } }
  return <section className="goal-compliance"><div className="goal-compliance-title"><p className="eyebrow">Överenskomna träningspass</p><strong>Uppföljning för vald period</strong><small>Genomförda pass jämförs med veckomålet.</small></div>
    {data.currentWeekGoal && <GoalProgressBlock title="Pågående vecka · simning" completed={data.currentWeekGoal.completed} target={data.currentWeekGoal.target} percentage={data.currentWeekGoal.percentage} detail={data.currentWeekGoal.remaining ? `${data.currentWeekGoal.remaining} pass kvar enligt överenskommelsen` : 'Veckomålet är uppnått'} />}
    {data.goalProgress && <GoalProgressBlock title="Avslutade veckor · simning" completed={data.goalProgress.completed} target={data.goalProgress.expected} percentage={data.goalProgress.percentage} detail={`Målet nåddes ${data.goalProgress.weeksReached} av ${data.goalProgress.weeksCount} veckor · ${Math.max(0, data.goalProgress.expected - data.goalProgress.completed)} pass under mål`} />}
    {data.currentCrossGoals?.strength?.target > 0 && <GoalProgressBlock title="Pågående vecka · styrka" completed={data.currentCrossGoals.strength.completed} target={data.currentCrossGoals.strength.target} percentage={data.currentCrossGoals.strength.percentage} detail={`${data.currentCrossGoals.strength.remaining} pass kvar`} />}
    {data.currentCrossGoals?.dryland?.target > 0 && <GoalProgressBlock title="Pågående vecka · landträning" completed={data.currentCrossGoals.dryland.completed} target={data.currentCrossGoals.dryland.target} percentage={data.currentCrossGoals.dryland.percentage} detail={`${data.currentCrossGoals.dryland.remaining} pass kvar`} />}
    {data.crossProgress?.strength && <GoalProgressBlock title="Vald period · styrka" completed={data.crossProgress.strength.completed} target={data.crossProgress.strength.expected} percentage={data.crossProgress.strength.percentage} detail={`Målet nåddes ${data.crossProgress.strength.weeksReached} av ${data.crossProgress.strength.weeksCount} veckor · ${Math.max(0, data.crossProgress.strength.expected - data.crossProgress.strength.completed)} pass under mål`} />}
    {data.crossProgress?.dryland && <GoalProgressBlock title="Vald period · landträning" completed={data.crossProgress.dryland.completed} target={data.crossProgress.dryland.expected} percentage={data.crossProgress.dryland.percentage} detail={`Målet nåddes ${data.crossProgress.dryland.weeksReached} av ${data.crossProgress.dryland.weeksCount} veckor · ${Math.max(0, data.crossProgress.dryland.expected - data.crossProgress.dryland.completed)} pass under mål`} />}
    <form onSubmit={save}><p className="eyebrow">Simning, landträning och styrka</p><label>Styrkepass / vecka<input type="number" min="0" max="7" value={targets.strengthTarget} onChange={(event) => setTargets({ ...targets, strengthTarget: event.target.value })} /></label><label>Landträningar / vecka<input type="number" min="0" max="7" value={targets.drylandTarget} onChange={(event) => setTargets({ ...targets, drylandTarget: event.target.value })} /></label><button>Spara från nästa måndag</button><small>Simmaren anger sitt eget simmål under Mina mål. Förslag: landträning mån/ons/fre · styrka tis/tor/sön.</small>{scheduled && <small>Senast planerat: {scheduled.strengthTarget} styrka + {scheduled.drylandTarget} land från {scheduled.startDate}</small>}</form>
  </section>
}

function GoalProgressBlock({ title, completed, target, percentage, detail }) {
  return <div><p className="eyebrow">{title}</p><strong>{completed} av {target} pass · {percentage}%</strong><span><i style={{ width: `${Math.min(100, percentage)}%` }} /></span><small>{detail}</small></div>
}

function PointProgress({ info, compact = false }) {
  if (!info?.level) return null
  const range = info.next ? info.next.minPoints - info.level.minPoints : 1
  const progress = info.next ? ((info.total - info.level.minPoints) / range) * 100 : 100
  return <div className={`point-progress ${compact ? 'compact' : ''}`}><div><strong>{info.level.emoji} {info.level.name}</strong><b>{info.total} poäng</b></div><span><i style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} /></span><small>{info.next ? `${info.next.remaining} poäng kvar till ${info.next.name}` : 'Högsta nivån är nådd'}</small></div>
}

function CoachRewards({ code }) {
  const [data, setData] = useState({ levels: [], rules: [], profiles: [] })
  const [drafts, setDrafts] = useState({})
  const [newLevel, setNewLevel] = useState({ name: 'Platina', emoji: '🏅', minPoints: 400 })
  const [status, setStatus] = useState('')
  const load = () => apiRequest('/api/points', code).then((next) => { setData(next); setDrafts(Object.fromEntries(next.levels.map((level) => [level.id, { ...level }]))); setStatus('') })
  useEffect(() => { load().catch((error) => setStatus(error.message)) }, [code])
  const levelFor = (total, levels) => [...levels].sort((a, b) => b.minPoints - a.minPoints).find((level) => total >= level.minPoints) || levels[0]
  const updateDraft = (id, key, value) => setDrafts((current) => ({ ...current, [id]: { ...current[id], [key]: value } }))
  const save = async (level) => {
    const draft = drafts[level.id]
    const previewLevels = data.levels.map((item) => item.id === level.id ? { ...draft, minPoints: Number(draft.minPoints) } : item)
    const affected = data.profiles.filter((profile) => levelFor(profile.total, data.levels)?.id !== levelFor(profile.total, previewLevels)?.id).length
    if (draft.minPoints === 0 && level.minPoints !== 0) return window.alert('Startnivån måste ligga på 0 poäng.')
    if (!window.confirm(`${affected} profil${affected === 1 ? '' : 'er'} kan få en annan nivå. Vill du spara ändringen?`)) return
    try { await apiRequest('/api/points', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'update-level', ...draft, minPoints: Number(draft.minPoints) }) }); await load() } catch (error) { window.alert(error.message) }
  }
  const add = async (event) => {
    event.preventDefault()
    try { await apiRequest('/api/points', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'add-level', ...newLevel, minPoints: Number(newLevel.minPoints) }) }); setNewLevel({ name: '', emoji: '🏅', minPoints: '' }); await load() } catch (error) { window.alert(error.message) }
  }
  const remove = async (level) => {
    if (!confirmDestructive(`Nivån “${level.name}” tas bort. Simmarnas poäng behålls och deras nivå räknas om.`)) return
    try { await apiRequest('/api/points', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete-level', id: level.id }) }); await load() } catch (error) { window.alert(error.message) }
  }
  return <section className="coach-rewards"><div className="period-heading"><div><p className="eyebrow">Aktivitet i appen – inte simprestation</p><h2>Poäng & nivåer</h2></div></div>{status ? <p className="form-error">{status}</p> : <><div className="reward-admin-grid"><section className="coach-card"><h3>Så får simmarna poäng</h3><div className="point-rules">{data.rules.map((rule) => <div key={rule.activity}><strong>{rule.activity}</strong><b>+{rule.points} p</b><small>{rule.limit}</small></div>)}</div></section><section className="coach-card"><h3>Fördelning just nu</h3><div className="level-distribution">{data.levels.map((level) => <div key={level.id}><span>{level.emoji}</span><strong>{data.profiles.filter((profile) => profile.level?.name === level.name).length}</strong><small>{level.name}</small></div>)}</div><p className="reward-note">Nivån visar aktivitet och positiva bidrag i Simkoll. Den bedömer inte simmarens prestation eller förmåga.</p></section></div><section className="level-editor"><div><h3>Nivågränser</h3><small>Simmarnas poäng förändras inte när en gräns ändras.</small></div>{data.levels.map((level, index) => { const draft = drafts[level.id] || level; return <article key={level.id}><input className="emoji-input" aria-label="Emoji" maxLength="16" value={draft.emoji} onChange={(event) => updateDraft(level.id, 'emoji', event.target.value)} /><input aria-label="Nivåns namn" maxLength="30" value={draft.name} onChange={(event) => updateDraft(level.id, 'name', event.target.value)} /><label>Från <input type="number" min={index === 0 ? 0 : 1} disabled={index === 0} value={draft.minPoints} onChange={(event) => updateDraft(level.id, 'minPoints', event.target.value)} /> poäng</label><span>{data.profiles.filter((profile) => levelFor(profile.total, Object.values(drafts).map((item) => ({ ...item, minPoints: Number(item.minPoints) })))?.id === level.id).length} profiler i förhandsvisningen</span><button onClick={() => save(level)}>Spara</button>{index > 0 && <button className="delete-level" onClick={() => remove(level)}>Radera</button>}</article> })}<form className="add-level" onSubmit={add}><input className="emoji-input" required maxLength="16" value={newLevel.emoji} onChange={(event) => setNewLevel({ ...newLevel, emoji: event.target.value })} /><input required maxLength="30" placeholder="Ny nivå" value={newLevel.name} onChange={(event) => setNewLevel({ ...newLevel, name: event.target.value })} /><label>Från <input type="number" min="1" required value={newLevel.minPoints} onChange={(event) => setNewLevel({ ...newLevel, minPoints: event.target.value })} /> poäng</label><button className="primary-button">Lägg till nivå +</button></form></section></>}</section>
}

function DevelopmentTalkCoach({ code, profiles }) {
  const [talks, setTalks] = useState([]); const [selected, setSelected] = useState(null); const [answers, setAnswers] = useState({}); const [notes, setNotes] = useState(''); const [agreement, setAgreement] = useState(''); const [status, setStatus] = useState('')
  const load = () => apiRequest('/api/goals?talks=true', code).then((data) => setTalks(data.talks || []))
  useEffect(() => { load().catch((error) => setStatus(error.message)) }, [])
  const open = (talk) => { setSelected(talk); setAnswers(talk.swimmerAnswers || {}); setNotes(Object.values(talk.coachNotes || {}).join('\n')); setAgreement(Object.values(talk.agreement || {}).join('\n')) }
  const toggle = async (talk) => { try { const data = await apiRequest('/api/goals', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'toggle-talk', id: talk.id, enabled: !talk.enabled }) }); setTalks((current) => current.map((item) => item.id === talk.id ? data.talk : item)); if (selected?.id === talk.id) setSelected(data.talk) } catch (error) { setStatus(error.message) } }
  const save = async () => { try { const data = await apiRequest('/api/goals', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'update-talk', id: selected.id, profileId: selected.swimmerId, meetingDate: selected.meetingDate, status: 'completed', enabled: selected.enabled, swimmerAnswers: answers, coachNotes: { summary: notes }, agreement: { summary: agreement } }) }); setSelected(data.talk); setStatus('Sparat ✓'); await load() } catch (error) { setStatus(error.message) } }
  return <section className="coach-card talk-coach"><div className="period-heading"><div><p className="eyebrow">Förberedelser och överenskommelser</p><h2>Utvecklingssamtal</h2></div></div>{!selected ? <div className="talk-coach-list">{talks.length ? talks.map((talk) => { const swimmer = profiles.find((item) => item.id === talk.swimmerId); return <article key={talk.id} className="talk-coach-row"><button onClick={() => open(talk)}><span>{swimmer?.emoji || '🏊'}</span><strong>{swimmer?.displayName || 'Simmare'}</strong><small>{talk.meetingDate} · {talk.status === 'prepared' ? 'Redo för samtal' : talk.status}</small>→</button><button className={`talk-switch ${talk.enabled ? 'on' : ''}`} onClick={() => toggle(talk)} aria-label={`${talk.enabled ? 'Inaktivera' : 'Aktivera'} utvecklingssamtal`}>{talk.enabled ? 'På' : 'Av'}</button></article> }) : <p className="empty">Inga utvecklingssamtal är inskickade ännu.</p>}</div> : <div className="talk-coach-detail"><button className="back-button" onClick={() => setSelected(null)}>← Alla samtal</button><h3>{profiles.find((item) => item.id === selected.swimmerId)?.displayName || 'Simmare'} · {selected.meetingDate}</h3><button className={`talk-switch ${selected.enabled ? 'on' : ''}`} onClick={() => toggle(selected)}>{selected.enabled ? 'Utvecklingssamtal på' : 'Utvecklingssamtal av'}</button><h4>Simmarens svar</h4><div className="talk-answer-list">{Object.entries(answers).filter(([, value]) => value).map(([key, value]) => <label key={key}><strong>{TALK_FIELD_LABELS[key] || key}</strong><textarea value={value} onChange={(event) => setAnswers((current) => ({ ...current, [key]: event.target.value }))} /></label>)}</div><label>Tränarens interna anteckningar<textarea value={notes} onChange={(event) => setNotes(event.target.value)} /></label><label>Gemensam överenskommelse<textarea value={agreement} onChange={(event) => setAgreement(event.target.value)} /></label><button className="primary-button" onClick={save}>Spara samtal</button>{status && <small>{status}</small>}</div>}</section>
}

function CoachPrograms({ code, profiles }) {
  const [training, setTraining] = useState(null)
  const [programForm, setProgramForm] = useState({ type: 'strength', title: '', description: '', content: '', startDate: localDateValue(), endDate: '', profileIds: [] })
  const [goalForm, setGoalForm] = useState({})
  const [reviews, setReviews] = useState({})
  const [status, setStatus] = useState('')
  const load = () => apiRequest('/api/training', code).then(setTraining)
  useEffect(() => { load().catch((error) => setStatus(error.message)) }, [])
  const createProgram = async (event) => {
    event.preventDefault(); setStatus('Sparar…')
    try {
      await apiRequest('/api/training', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'create-program', ...programForm }) })
      setProgramForm({ type: 'strength', title: '', description: '', content: '', startDate: localDateValue(), endDate: '', profileIds: [] }); setStatus('Programmet är publicerat.'); await load()
    } catch (error) { setStatus(error.message) }
  }
  const addGoal = async (assignmentId) => {
    const form = goalForm[assignmentId] || { rewardPoints: 5 }
    if (!form.title?.trim() || !form.description?.trim()) return
    try {
      await apiRequest('/api/training', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'program-goal', assignmentId, ...form, rewardPoints: Number(form.rewardPoints || 5) }) })
      setGoalForm({ ...goalForm, [assignmentId]: { rewardPoints: 5, title: '', description: '' } }); await load()
    } catch (error) { window.alert(error.message) }
  }
  const review = async (goalId, approved) => {
    try {
      await apiRequest('/api/training', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'review-program-goal', goalId, approved, feedback: reviews[goalId] || '' }) })
      setReviews({ ...reviews, [goalId]: '' }); await load()
    } catch (error) { window.alert(error.message) }
  }
  const toggleProfile = (profileId) => setProgramForm((current) => ({ ...current, profileIds: current.profileIds.includes(profileId) ? current.profileIds.filter((id) => id !== profileId) : [...current.profileIds, profileId] }))
  const profileFor = (id) => profiles.find((profile) => profile.id === id)
  const weekSessions = (profileId) => currentWeekSwims({ sessions: training?.sessions?.filter((item) => item.profileId === profileId) || [] })
  const weekCount = (profileId, type) => (training?.sessions || []).filter((item) => item.profileId === profileId && item.type === type && item.date >= dateKey(weekStart(new Date())) && item.date <= todayKey()).length
  const activeGoalFor = (profileId) => (training?.seasonGoals || []).find((goal) => goal.profileId === profileId && goal.active && localDateValue() >= goal.startDate && localDateValue() <= goal.endDate)
  const activeCrossGoalFor = (profileId) => (training?.crossGoals || []).find((goal) => goal.profileId === profileId && goal.startDate <= todayKey() && (!goal.endDate || goal.endDate >= todayKey()))
  return <section className="coach-programs">
    <div className="period-heading"><div><p className="eyebrow">Styrka · landträning · eget ansvar</p><h2>Träningsprogram</h2></div></div>
    <section className="coach-card season-overview"><h3>Veckans träningsmål</h3><div>{profiles.map((profile) => { const goal = activeGoalFor(profile.id), cross = activeCrossGoalFor(profile.id); const count = weekSessions(profile.id), strength = weekCount(profile.id, 'strength'), dryland = weekCount(profile.id, 'dryland'); const goals = [{ label: 'Simning', icon: '🏊', count, target: goal?.target }, { label: 'Styrka', icon: '🏋️', count: strength, target: cross?.strengthTarget }, { label: 'Land', icon: '🤸', count: dryland, target: cross?.drylandTarget }]; return <article key={profile.id}><span>{profile.emoji}</span><div><strong>{profile.displayName}</strong><small>{goals.map((item) => `${item.icon} ${item.target != null ? `${item.count}/${item.target}` : `${item.label}: inget mål`}`).join('  ')}</small></div><b>{goals.some((item) => item.target != null && item.count < item.target) ? 'Pågår' : goals.some((item) => item.target != null) ? '✓' : 'Saknar mål'}</b></article> })}</div></section>
    <section className="coach-card missing-weekly-goals"><h3>Profiler utan komplett veckomål</h3><div>{profiles.filter((profile) => !activeGoalFor(profile.id) || !activeCrossGoalFor(profile.id)).map((profile) => { const missing = []; if (!activeGoalFor(profile.id)) missing.push('simning'); if (!activeCrossGoalFor(profile.id)) missing.push('styrka/land'); return <span key={profile.id}>{profile.emoji} {profile.displayName} <small>saknar {missing.join(' och ')}</small></span> })}</div>{!profiles.some((profile) => !activeGoalFor(profile.id) || !activeCrossGoalFor(profile.id)) && <p className="empty">Alla aktiva profiler har kompletta veckomål.</p>}</section>
    <form className="program-form" onSubmit={createProgram}><h3>Skapa nytt program</h3><div className="program-form-grid"><label>Typ<select value={programForm.type} onChange={(event) => setProgramForm({ ...programForm, type: event.target.value })}><option value="strength">Styrketräning</option><option value="dryland">Landträning</option></select></label><label>Titel<input required maxLength="100" value={programForm.title} onChange={(event) => setProgramForm({ ...programForm, title: event.target.value })} /></label><label>Start<input type="date" required value={programForm.startDate} onChange={(event) => setProgramForm({ ...programForm, startDate: event.target.value })} /></label><label>Slut (valfritt)<input type="date" min={programForm.startDate} value={programForm.endDate} onChange={(event) => setProgramForm({ ...programForm, endDate: event.target.value })} /></label><label className="wide">Kort beskrivning<textarea required maxLength="1000" value={programForm.description} onChange={(event) => setProgramForm({ ...programForm, description: event.target.value })} /></label><label className="wide">Program / övningar<textarea required className="program-content-input" maxLength="5000" value={programForm.content} onChange={(event) => setProgramForm({ ...programForm, content: event.target.value })} /></label></div><fieldset><legend>Tilldela simmare</legend><div className="profile-checks">{profiles.map((profile) => <label key={profile.id}><input type="checkbox" checked={programForm.profileIds.includes(profile.id)} onChange={() => toggleProfile(profile.id)} /> {profile.emoji} {profile.displayName}</label>)}</div></fieldset><button className="primary-button">Publicera program →</button>{status && <small>{status}</small>}</form>
    <div className="coach-program-list">{training?.assignments?.map((assignment) => { const profile = profileFor(assignment.profileId); const goals = training.programGoals.filter((goal) => goal.assignmentId === assignment.id); const form = goalForm[assignment.id] || { rewardPoints: 5 }; return <article key={assignment.id}><header><span>{assignment.program.type === 'strength' ? '🏋️' : '🤸'}</span><div><strong>{assignment.program.title}</strong><small>{profile ? `${profile.emoji} ${profile.displayName}` : 'Okänd profil'}</small></div></header><p>{assignment.program.description}</p><details><summary>Visa programmet</summary><pre>{assignment.program.content}</pre></details><div className="coach-program-goals">{goals.map((goal) => <div key={goal.id}><strong>🎯 {goal.title} · {goal.rewardPoints} p</strong><p>{goal.description}</p><small>{goal.status === 'submitted' ? 'Väntar på godkännande' : goal.status === 'approved' ? 'Godkänt' : goal.status === 'continue' ? 'Simmaren fortsätter jobba' : 'Pågår'}</small>{goal.status === 'submitted' && <div className="review-goal"><input maxLength="500" placeholder="Återkoppling till simmaren…" value={reviews[goal.id] || ''} onChange={(event) => setReviews({ ...reviews, [goal.id]: event.target.value })} /><button onClick={() => review(goal.id, false)}>Fortsätt jobba</button><button className="approve" onClick={() => review(goal.id, true)}>Godkänn +{goal.rewardPoints} p</button></div>}</div>)}</div><div className="new-program-goal"><input placeholder="Nytt mål" value={form.title || ''} onChange={(event) => setGoalForm({ ...goalForm, [assignment.id]: { ...form, title: event.target.value } })} /><input placeholder="Vad ska simmaren klara?" value={form.description || ''} onChange={(event) => setGoalForm({ ...goalForm, [assignment.id]: { ...form, description: event.target.value } })} /><select value={form.rewardPoints || 5} onChange={(event) => setGoalForm({ ...goalForm, [assignment.id]: { ...form, rewardPoints: Number(event.target.value) } })}><option value="5">5 poäng</option><option value="10">10 poäng</option><option value="20">20 poäng</option></select><button onClick={() => addGoal(assignment.id)}>Lägg till mål</button></div></article> })}</div>
  </section>
}

const FEEDBACK_OPTIONS = [
  ['progress', 'Bra framsteg · +5'], ['strong_week', 'Stark träningsvecka · +5'],
  ['milestone', 'Delmål klart · +10'], ['goal_complete', 'Utvecklingsmål klart · +20'],
]

function CoachGoals({ code, profiles }) {
  const [goals, setGoals] = useState([])
  const [form, setForm] = useState({ profileId: '', title: '', description: '', nextStep: '', startDate: localDateValue(), targetDate: '' })
  const [feedback, setFeedback] = useState({})
  const [showCreate, setShowCreate] = useState(false)
  const load = () => apiRequest('/api/goals', code).then((data) => setGoals(data.goals))
  useEffect(() => { load().catch((error) => window.alert(error.message)) }, [])
  const create = async (event) => {
    event.preventDefault()
    try {
      await apiRequest('/api/goals', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'create', ...form }) })
      setForm({ profileId: '', title: '', description: '', nextStep: '', startDate: localDateValue(), targetDate: '' }); setShowCreate(false); await load()
    } catch (error) { window.alert(error.message) }
  }
  const updateStatus = async (goalId, status) => {
    try { await apiRequest('/api/goals', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'status', goalId, status }) }); await load() } catch (error) { window.alert(error.message) }
  }
  const sendFeedback = async (goalId) => {
    const entry = feedback[goalId] || { type: 'progress', content: '' }
    if (!entry.content?.trim()) return
    try {
      await apiRequest('/api/goals', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'feedback', goalId, feedbackType: entry.type || 'progress', content: entry.content }) })
      setFeedback({ ...feedback, [goalId]: { type: 'progress', content: '' } }); await load()
    } catch (error) { window.alert(error.message) }
  }
  const remove = async (goal) => {
    if (!confirmDestructive(`Utvecklingsmålet “${goal.title}” och all tillhörande återkoppling raderas permanent.`)) return
    try { await apiRequest(`/api/goals?id=${goal.id}`, code, { method: 'DELETE' }); await load() } catch (error) { window.alert(error.message) }
  }
  const profileFor = (id) => profiles.find((profile) => profile.id === id)
  return <section className="coach-goals"><div className="period-heading"><div><p className="eyebrow">Privat tränare + simmare</p><h2>Utvecklingsmål</h2></div><button className="primary-button" onClick={() => setShowCreate(!showCreate)}>{showCreate ? 'Stäng' : 'Nytt mål +'}</button></div>{showCreate && <form className="goal-form" onSubmit={create}><label>Simmare<select required value={form.profileId} onChange={(event) => setForm({ ...form, profileId: event.target.value })}><option value="">Välj profil…</option>{profiles.map((profile) => <option value={profile.id} key={profile.id}>{profile.emoji} {profile.displayName}</option>)}</select></label><label>Rubrik<input required maxLength="100" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label><label className="wide">Beskrivning<textarea required maxLength="2000" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label><label className="wide">Nästa steg<input maxLength="500" value={form.nextStep} onChange={(event) => setForm({ ...form, nextStep: event.target.value })} /></label><label>Startdatum<input type="date" required value={form.startDate} onChange={(event) => setForm({ ...form, startDate: event.target.value })} /></label><label>Måldatum<input type="date" value={form.targetDate} onChange={(event) => setForm({ ...form, targetDate: event.target.value })} /></label><button className="primary-button">Skapa mål →</button></form>}{goals.length ? <div className="coach-goal-list">{goals.map((goal) => { const owner = profileFor(goal.profileId); const entry = feedback[goal.id] || { type: 'progress', content: '' }; return <article key={goal.id}><header><div><span>{owner?.emoji}</span><p><strong>{goal.title}</strong><small>{owner?.displayName || 'Okänd profil'}</small></p></div><select value={goal.status} onChange={(event) => updateStatus(goal.id, event.target.value)}>{Object.entries(GOAL_STATUS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></header><p>{goal.description}</p>{goal.nextStep && <div className="next-step"><strong>Nästa steg</strong><span>{goal.nextStep}</span></div>}<details><summary>Historik och återkoppling ({goal.updates.length})</summary><div className="goal-timeline">{goal.updates.map((update) => <div key={update.id}><span>{update.authorRole === 'coach' ? '🎯' : '💭'}</span><p><strong>{update.authorRole === 'coach' ? 'Tränarna' : owner?.displayName} {update.points > 0 && <b>+{update.points} p</b>}</strong><small>{update.content}</small></p></div>)}</div></details><div className="feedback-form"><select value={entry.type} onChange={(event) => setFeedback({ ...feedback, [goal.id]: { ...entry, type: event.target.value } })}>{FEEDBACK_OPTIONS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><input maxLength="1000" placeholder="Skriv privat återkoppling…" value={entry.content} onChange={(event) => setFeedback({ ...feedback, [goal.id]: { ...entry, content: event.target.value } })} /><button onClick={() => sendFeedback(goal.id)}>Skicka</button></div><button className="delete-goal" onClick={() => remove(goal)}>Radera mål</button></article> })}</div> : !showCreate && <EmptyPeriod title="Inga mål ännu" periodLabel="Utvecklingsmål" />}</section>
}

function CoachCommunity({ code, profiles }) {
  const [content, setContent] = useState('')
  const [polishing, setPolishing] = useState(false)
  const [message, setMessage] = useState('')
  const [recipientId, setRecipientId] = useState('')
  const [items, setItems] = useState([])
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const load = () => apiRequest(`/api/community?feed=${Date.now()}`, code).then((data) => { setItems(data.items); setMessages(data.messages || []) }).finally(() => setLoading(false))
  useEffect(() => { load().catch((error) => window.alert(error.message)) }, [])
  const publish = async (event) => {
    event.preventDefault(); setLoading(true)
    try {
      await apiRequest('/api/community', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content }) })
      setContent(''); await load()
    } catch (error) { window.alert(error.message); setLoading(false) }
  }
  const improvePost = async () => {
    if (!content.trim()) return
    setPolishing(true)
    try {
      const result = await apiRequest('/api/community', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'polish-community-post', content }) })
      setContent(result.text || content)
    } catch (error) { window.alert(error.message) } finally { setPolishing(false) }
  }
  const remove = async (id) => {
    if (!confirmDestructive('Meddelandet tas bort från alla simmares flöde.')) return
    try { await apiRequest(`/api/community?id=${id}`, code, { method: 'DELETE' }); await load() } catch (error) { window.alert(error.message) }
  }
  const sendMessage = async (event) => { event.preventDefault(); try { await apiRequest('/api/community', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'message', recipientId, content: message }) }); setMessage(''); setRecipientId(''); await load() } catch (error) { window.alert(error.message) } }
  return <section className="coach-community"><div className="period-heading"><div><p className="eyebrow">Syns för alla profiler</p><h2>Klubbflödet</h2></div></div><form onSubmit={publish}><textarea required maxLength="1000" placeholder="Skriv ett meddelande till gruppen…" value={content} onChange={(event) => setContent(event.target.value)} /><div className="community-post-actions"><button type="button" className="text-button" disabled={polishing || !content.trim()} onClick={improvePost}>✨ Förbättra text med AI</button><small>{content.length}/1000</small><button className="primary-button" disabled={loading || polishing}>Publicera →</button></div></form><section className="coach-private-message"><h3>Skicka privat till simmare</h3><form onSubmit={sendMessage}><select required value={recipientId} onChange={(event) => setRecipientId(event.target.value)}><option value="">Välj simmare…</option>{profiles.filter((profile) => !profile.isTestProfile).map((profile) => <option value={profile.id} key={profile.id}>{profile.emoji} {profile.displayName}</option>)}</select><textarea required maxLength="1000" placeholder="Skriv ett privat meddelande…" value={message} onChange={(event) => setMessage(event.target.value)} /><button className="primary-button">Skicka privat →</button></form></section><section className="coach-messages"><h3>Privata meddelanden till tränarna</h3>{messages.filter((item) => item.toCoach).length ? messages.filter((item) => item.toCoach).map((item) => <article key={item.id}><span>{item.sender?.emoji || '👤'}</span><div><strong>{item.sender?.displayName || 'Simmare'}</strong><p>{item.content}</p><small>{formatFeedDate(item.createdAt)}</small></div></article>) : <p className="empty">Inga privata meddelanden ännu.</p>}</section><div className="coach-feed">{items.map((item) => <article key={`${item.type}-${item.id}`}><span>{item.type === 'coach' ? '📣' : item.sender?.emoji}</span><div><strong>{item.type === 'coach' ? 'Tränarna' : `${item.sender?.displayName} → hela gruppen`}</strong><p>{item.content}</p><small>{formatFeedDate(item.createdAt)}</small></div>{item.type === 'coach' && <button onClick={() => remove(item.id)}>Ta bort</button>}</article>)}</div></section>
}

function localDateValue() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function WorkoutEditor({ code, responses, aiEnabled = true }) {
  const [date, setDate] = useState(localDateValue)
  const [form, setForm] = useState({ title: '', content: '', note: '', focus: '', distanceMeters: '', durationMinutes: '', targetGroups: ['ungdom_orange', 'ungdom_svart', 'junior'] })
  const [loading, setLoading] = useState(true)
  const [polishing, setPolishing] = useState(false)
  const [recording, setRecording] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const recorderRef = useRef(null)
  const [saved, setSaved] = useState(false)
  const [library, setLibrary] = useState([])
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [criteria, setCriteria] = useState(['focus', 'pass', 'rpe'])
  const [focusPreference, setFocusPreference] = useState('')
  const [generatorOpen, setGeneratorOpen] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [generator, setGenerator] = useState({ focus: 'fart', distanceMeters: 4000, durationMinutes: 90, rpe: '6–7', groups: ['ungdom_orange', 'ungdom_svart', 'junior'] })
  const loadLibrary = async () => { try { const data = await apiRequest('/api/workouts?history=true', code); setLibrary(data.workouts || []); setLibraryOpen(true) } catch (error) { window.alert(error.message) } }
  const rankedLibrary = library.map((workout) => { const answers = responses.filter((item) => item.type === 'after' && dateKey(responseDate(item)) === workout.date); const average = (key) => { const values = answers.map((item) => Number(item[key])).filter(Number.isFinite); return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null }; return { ...workout, pass: average('pass'), rpe: average('rpe') } }).sort((a, b) => { for (const key of criteria) { const value = (workout) => key === 'focus' ? (focusPreference ? (workout.focus === focusPreference ? 1 : 0) : (workout.focus ? 1 : 0)) : key === 'distance' ? (workout.distanceMeters || 0) : key === 'duration' ? (workout.durationMinutes || 0) : (workout[key] ?? -1); const difference = value(b) - value(a); if (difference) return difference } return b.date.localeCompare(a.date) })
  const importSheet = async () => { setLoading(true); try { const data = await apiRequest('/api/workouts', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'import-sheet', url: 'https://docs.google.com/spreadsheets/d/1V_Y170h0mOPf3AsrF-9wW9o3paL_X579n4w7aKQgeoc/edit?usp=sharing' }) }); setForm((current) => ({ ...current, ...data.draft })); setSaved(false) } catch (error) { window.alert(error.message) } finally { setLoading(false) } }
  const generateFromLibrary = async (event) => { event.preventDefault(); if (!aiEnabled) return window.alert('AI-stöd är avstängt i webapp-inställningarna.'); setGenerating(true); try { let source = [...rankedLibrary].sort((a, b) => (b.pass ?? -1) - (a.pass ?? -1) || (a.rpe ?? 99) - (b.rpe ?? 99)).slice(0, 8); if (!source.length) { const data = await apiRequest('/api/workouts?history=true', code); setLibrary(data.workouts || []); source = (data.workouts || []).slice(0, 8) } const data = await apiRequest('/api/workouts', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'generate-from-library', ...generator, library: source }) }); if (data.error) throw new Error(data.error); setForm((current) => ({ ...current, ...data.draft, targetGroups: generator.groups })); setSaved(false); setGeneratorOpen(false) } catch (error) { window.alert(error.message) } finally { setGenerating(false) } }
  const polishContent = async () => { if (!form.content?.trim()) return; setPolishing(true); try { const data = await apiRequest('/api/workouts', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'polish-workout-content', content: form.content, title: form.title, focus: form.focus }) }); setForm((current) => ({ ...current, content: data.text || current.content })); setSaved(false) } catch (error) { window.alert(error.message) } finally { setPolishing(false) } }
  const importImage = async (event) => { const file = event.target.files?.[0]; event.target.value = ''; if (!file) return; if (!/^image\/(png|jpe?g|webp)$/i.test(file.type)) { window.alert('Välj en PNG-, JPG- eller WebP-bild.'); return } if (file.size > 6 * 1024 * 1024) { window.alert('Bilden är för stor. Välj en bild under cirka 6 MB.'); return } const reader = new FileReader(); reader.onload = async () => { setLoading(true); try { const data = await apiRequest('/api/workouts', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'interpret-workout-image', fileData: reader.result, mimeType: file.type, fileName: file.name }) }); if (data.error) throw new Error(data.error); setForm((current) => ({ ...current, ...data.draft })); setSaved(false) } catch (error) { window.alert(error.message) } finally { setLoading(false) } }; reader.readAsDataURL(file) }

  const importTextFile = async (event) => { const file = event.target.files?.[0]; event.target.value = ''; if (!file) return; if (!/\.(txt|csv|md)$/i.test(file.name) && !/^text\//i.test(file.type)) { window.alert('Välj en text-, CSV- eller Markdown-fil.'); return } const reader = new FileReader(); reader.onload = async () => { setLoading(true); try { const data = await apiRequest('/api/workouts', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'polish-workout-content', content: String(reader.result || ''), title: file.name.replace(/\.[^.]+$/, ''), focus: form.focus }) }); setForm((current) => ({ ...current, title: current.title || file.name.replace(/\.[^.]+$/, ''), content: data.text || String(reader.result || '') })); setSaved(false) } catch (error) { window.alert(error.message) } finally { setLoading(false) } }; reader.readAsText(file) }

  const startWorkoutRecording = async () => {
    if (!aiEnabled) return window.alert('AI-stöd är avstängt i webapp-inställningarna.')
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return window.alert('Den här webbläsaren stöder inte ljudinspelning.')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((type) => MediaRecorder.isTypeSupported(type)) || ''
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      const chunks = []
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data) }
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop())
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' })
        const reader = new FileReader()
        reader.onload = async () => {
          setTranscribing(true)
          try {
            const data = await apiRequest('/api/workouts', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'transcribe-audio', dataUrl: reader.result, mimeType: blob.type }) })
            if (data.error) throw new Error(data.error)
            setForm((current) => ({ ...current, content: current.content?.trim() ? `${current.content.trim()}\n\n${data.text || ''}`.trim() : (data.text || '') }))
            setSaved(false)
          } catch (error) { window.alert(error.message) } finally { setTranscribing(false) }
        }
        reader.readAsDataURL(blob)
      }
      recorderRef.current = recorder
      recorder.start()
      setRecording(true)
    } catch (error) { window.alert(error.name === 'NotAllowedError' ? 'Mikrofontillstånd nekades. Tillåt mikrofonen i webbläsaren.' : 'Kunde inte starta inspelningen.') }
  }
  const stopWorkoutRecording = () => { recorderRef.current?.stop(); recorderRef.current = null; setRecording(false) }

  useEffect(() => {
    setLoading(true)
    apiRequest(`/api/workouts?date=${date}`, code)
      .then((data) => setForm(data.workout || { title: '', content: '', note: '', focus: '', distanceMeters: '', durationMinutes: '', targetGroups: ['ungdom_orange', 'ungdom_svart', 'junior'] }))
      .catch((error) => window.alert(error.message))
      .finally(() => setLoading(false))
  }, [code, date])

  const save = async (event) => {
    event.preventDefault()
    setLoading(true)
    setSaved(false)
    try {
      const data = await apiRequest('/api/workouts', code, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, date }),
      })
      setForm(data.workout)
      setSaved(true)
    } catch (error) { window.alert(error.message) } finally { setLoading(false) }
  }

  const remove = async () => {
    if (!confirmDestructive(`Passet för ${date} försvinner för alla simmare.`)) return
    try {
      await apiRequest(`/api/workouts?date=${date}`, code, { method: 'DELETE' })
      setForm({ title: '', content: '', note: '', focus: '', distanceMeters: '', durationMinutes: '', targetGroups: ['ungdom_orange', 'ungdom_svart', 'junior'] })
      setSaved(false)
    } catch (error) { window.alert(error.message) }
  }

  return (
    <section className="workout-editor">
      <div className="period-heading"><div><p className="eyebrow">Syns för inloggade simmare</p><h2>Lägg upp ett pass</h2><small className="workout-import-hint">Läs in dagens pass från Google Drive eller välj ett tidigare pass.</small></div><div className="editor-import-actions"><button type="button" className="secondary-button" onClick={importSheet} disabled={loading}>Läs in Dagenspass från Google Drive</button><button type="button" className="secondary-button" onClick={loadLibrary}>Hämta från bibliotek</button>{aiEnabled && <button type="button" className="secondary-button" onClick={() => setGeneratorOpen((open) => !open)}>✨ Skapa passförslag</button>}</div></div>
      {generatorOpen && <form className="workout-generator coach-card" onSubmit={generateFromLibrary}><div className="workout-picker-head"><div><p className="eyebrow">Bygg från passbiblioteket</p><h3>Skapa ett redigerbart passförslag</h3></div><button type="button" className="text-button" onClick={() => setGeneratorOpen(false)}>Stäng</button></div><p className="settings-help">AI:n prioriterar tidigare pass med högt passbetyg, därefter RPE. Starttider och gruppval följer med i förslaget.</p><div className="workout-generator-grid"><label>Huvudinriktning<select value={generator.focus} onChange={(event) => setGenerator({ ...generator, focus: event.target.value })}>{WORKOUT_FOCUSES.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label>Distans<select value={generator.distanceMeters} onChange={(event) => setGenerator({ ...generator, distanceMeters: Number(event.target.value) })}>{[2000, 2500, 3000, 3500, 4000, 4500, 5000, 6000, 7000].map((value) => <option value={value} key={value}>{value.toLocaleString('sv-SE')} m</option>)}</select></label><label>Tidsåtgång<select value={generator.durationMinutes} onChange={(event) => setGenerator({ ...generator, durationMinutes: Number(event.target.value) })}><option value="60">1 timme</option><option value="75">1 timme 15 min</option><option value="90">1,5 timmar</option><option value="120">2 timmar</option></select></label><label>Mål-RPE<select value={generator.rpe} onChange={(event) => setGenerator({ ...generator, rpe: event.target.value })}><option value="4–5">4–5 · lugnt</option><option value="5–6">5–6 · medel</option><option value="6–7">6–7 · standard</option><option value="7–8">7–8 · hårt</option></select></label></div><fieldset className="workout-groups"><legend>Passet gäller för</legend><div>{[['ungdom_orange', 'Ungdom Orange'], ['ungdom_svart', 'Ungdom Svart'], ['junior', 'Junior']].map(([value, label]) => <label key={value}><input type="checkbox" checked={generator.groups.includes(value)} onChange={(event) => setGenerator({ ...generator, groups: event.target.checked ? [...generator.groups, value] : generator.groups.filter((item) => item !== value) })} />{label}</label>)}</div></fieldset><button className="primary-button" type="submit" disabled={generating}>{generating ? 'Skapar förslag…' : 'Skapa passförslag →'}</button></form>}
      {libraryOpen && <section className="workout-picker"><div className="workout-picker-head"><h3>Välj ett tidigare pass</h3><button type="button" className="text-button" onClick={() => setLibraryOpen(false)}>Stäng</button></div><p>Välj upp till tre prioriteringar. Bäst match hamnar först.</p><div className="workout-picker-criteria">{[0, 1, 2].map((index) => <label key={index}>{index + 1}. prioritet<select value={criteria[index]} onChange={(event) => { const next = [...criteria]; next[index] = event.target.value; setCriteria(next) }}><option value="focus">Huvudinriktning</option><option value="pass">Passbetyg</option><option value="rpe">RPE</option><option value="distance">Meter</option><option value="duration">Tidsåtgång</option></select></label>)}</div>{criteria.includes('focus') && <label className="workout-focus-preference">Vilken huvudinriktning?<select value={focusPreference} onChange={(event) => setFocusPreference(event.target.value)}><option value="">Alla inriktningar</option>{WORKOUT_FOCUSES.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>}<div className="workout-picker-list">{rankedLibrary.slice(0, 8).map((workout) => <button type="button" key={workout.id} onClick={() => { setForm((current) => ({ ...current, title: workout.title, content: workout.content, note: workout.note, focus: workout.focus || '', distanceMeters: workout.distanceMeters || '', durationMinutes: workout.durationMinutes || '', targetGroups: workout.targetGroups || current.targetGroups })); setLibraryOpen(false); setSaved(false) }}><span><strong>{workout.title}</strong><small>{workout.date} · {workout.distanceMeters ? `${workout.distanceMeters} m` : 'meter saknas'} · {workout.pass ? `Pass ${workout.pass.toFixed(1)}/5` : 'inget betyg'}</small></span><b>Välj →</b></button>)}</div></section>}
      <form onSubmit={save}>
        <label>Datum<input type="date" value={date} onChange={(event) => { setSaved(false); setDate(event.target.value) }} /></label>
        <label>Rubrik<input required maxLength="80" placeholder="Till exempel: Tröskel + teknik" value={form.title || ''} onChange={(event) => { setSaved(false); setForm({ ...form, title: event.target.value }) }} /></label>
        <div className="workout-meta-fields"><label>Huvudinriktning<select value={form.focus || ''} onChange={(event) => { setSaved(false); setForm({ ...form, focus: event.target.value }) }}><option value="">Välj inriktning…</option>{WORKOUT_FOCUSES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Längd (meter)<input type="number" min="1" max="50000" placeholder="t.ex. 4000" value={form.distanceMeters ?? ''} onChange={(event) => { setSaved(false); setForm({ ...form, distanceMeters: event.target.value }) }} /></label><label>Tidsåtgång (minuter)<input type="number" min="1" max="600" placeholder="t.ex. 75" value={form.durationMinutes ?? ''} onChange={(event) => { setSaved(false); setForm({ ...form, durationMinutes: event.target.value }) }} /></label></div>
        <fieldset className="workout-groups"><legend>Passet gäller för</legend><div>{[['ungdom_orange', 'Ungdom Orange'], ['ungdom_svart', 'Ungdom Svart'], ['junior', 'Junior']].map(([value, label]) => <label key={value}><input type="checkbox" checked={(form.targetGroups || []).includes(value)} onChange={(event) => { setSaved(false); const groups = new Set(form.targetGroups || []); event.target.checked ? groups.add(value) : groups.delete(value); setForm({ ...form, targetGroups: [...groups] }) }} />{label}</label>)}</div><small>Välj en eller flera grupper. Passet visas bara för valda grupper.</small></fieldset>
        <label>Huvudserie<textarea required maxLength="5000" placeholder={'Till exempel:\n8 × 50 m teknik\nHuvudserie…'} value={form.content || ''} onChange={(event) => { setSaved(false); setForm({ ...form, content: event.target.value }) }} /><div className="workout-ai-actions">{aiEnabled && <button type="button" className="secondary-button" onClick={polishContent} disabled={polishing || loading || recording || transcribing || !form.content?.trim()}>{polishing ? 'Förbättrar…' : '✨ Förbättra träningspass med AI'}</button>}{aiEnabled && <button type="button" className={recording ? 'recording-button' : 'secondary-button'} onClick={recording ? stopWorkoutRecording : startWorkoutRecording} disabled={loading || polishing || transcribing}>{recording ? '⏹ Stoppa inspelning' : transcribing ? 'Transkriberar…' : '🎙️ Läs in med röst'}</button>}<label className="secondary-button workout-upload-button">🖼️ Tolka bild av pass<input type="file" accept="image/png,image/jpeg,image/webp" onChange={importImage} disabled={loading || polishing || recording || transcribing} /></label></div><small className="settings-note">Du kan läsa in passet med rösten. Kontrollera alltid texten och formateringen före publicering.</small></label>
        <label>Meddelande till simmarna <small>Frivilligt</small><textarea className="short" maxLength="500" placeholder="Fokus för dagen eller något att tänka på…" value={form.note || ''} onChange={(event) => { setSaved(false); setForm({ ...form, note: event.target.value }) }} /></label>
        <div className="editor-actions">{form.id && <button type="button" className="delete-workout" onClick={remove}>Ta bort passet</button>}<span>{saved ? '✓ Sparat och publicerat' : ''}</span><button className="primary-button" disabled={loading}>{loading ? 'Vänta…' : 'Publicera passet →'}</button></div>
      </form>
    </section>
  )
}

function SwimmerNotes({ profile, code }) {
  const [notes, setNotes] = useState([])
  const [date, setDate] = useState(todayKey())
  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [polishing, setPolishing] = useState(false)
  const [recording, setRecording] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const recorderRef = useRef(null)
  const [editing, setEditing] = useState(null)
  const [editDraft, setEditDraft] = useState({ date: '', content: '' })
  const [status, setStatus] = useState('')
  const load = () => apiRequest(`/api/profiles?notes=true&profileId=${profile.id}`, code).then((data) => setNotes(data.notes || [])).catch(() => setStatus('Kunde inte hämta observationer.'))
  useEffect(() => { load() }, [code, profile.id])
  const save = async (event) => {
    event.preventDefault(); if (!content.trim()) return
    setSaving(true); setStatus('')
    try { await apiRequest('/api/profiles', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'save-swimmer-note', profileId: profile.id, noteDate: date, content }) }); setContent(''); setStatus('Sparad.'); await load() } catch (error) { setStatus(error.message) } finally { setSaving(false) }
  }
  const improve = async (text, noteDate, onResult) => {
    if (!text.trim()) return
    setPolishing(true); setStatus('Förbättrar text…')
    try { const result = await apiRequest('/api/profiles', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'polish-swimmer-note', noteDate, content: text }) }); onResult(result.text || text); setStatus(result.usedAi ? 'Texten är förbättrad – kontrollera den före sparning.' : 'Texten kunde inte förbättras just nu.') } catch (error) { setStatus(error.message) } finally { setPolishing(false) }
  }
  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return setStatus('Den här webbläsaren stöder inte ljudinspelning.')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((type) => MediaRecorder.isTypeSupported(type)) || ''
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      const chunks = []
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data) }
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop())
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' })
        const reader = new FileReader()
        reader.onload = async () => {
          setTranscribing(true); setStatus('Transkriberar inspelningen…')
          try {
            const data = await apiRequest('/api/workouts', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'transcribe-audio', dataUrl: reader.result, mimeType: blob.type }) })
            if (data.error) throw new Error(data.error)
            setContent((current) => current.trim() ? `${current.trim()}\n\n${data.text || ''}`.trim() : (data.text || ''))
            setStatus(data.text ? 'Transkriberingen är klar – kontrollera texten före sparning.' : 'Inget tal kunde urskiljas.')
          } catch (error) { setStatus(error.message) } finally { setTranscribing(false) }
        }
        reader.readAsDataURL(blob)
      }
      recorderRef.current = recorder; recorder.start(); setRecording(true); setStatus('Spelar in… tryck på stoppa när du är klar.')
    } catch (error) { setStatus(error.name === 'NotAllowedError' ? 'Mikrofontillstånd nekades. Tillåt mikrofonen i webbläsaren.' : 'Kunde inte starta inspelningen.') }
  }
  const stopRecording = () => { recorderRef.current?.stop(); recorderRef.current = null; setRecording(false) }
  const startEdit = (note) => { setEditing(note.id); setEditDraft({ date: note.noteDate, content: note.content }); setStatus('') }
  const saveEdit = async () => {
    if (!editDraft.content.trim()) return
    setSaving(true); setStatus('')
    try { await apiRequest('/api/profiles', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'update-swimmer-note', noteId: editing, profileId: profile.id, noteDate: editDraft.date, content: editDraft.content }) }); setEditing(null); setStatus('Anteckningen är uppdaterad.'); await load() } catch (error) { setStatus(error.message) } finally { setSaving(false) }
  }
  const remove = async (note) => {
    if (!confirmDestructive('Anteckningen tas bort permanent.')) return
    setSaving(true); setStatus('')
    try { await apiRequest('/api/profiles', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete-swimmer-note', noteId: note.id, profileId: profile.id }) }); setStatus('Anteckningen är raderad.'); await load() } catch (error) { setStatus(error.message) } finally { setSaving(false) }
  }
  return (
    <section className="swimmer-notes">
      <div className="swimmer-notes-heading"><div><p className="eyebrow">Tränarens observationer</p><strong>Anteckningar</strong></div><small>Sparas med datum och syns bara för tränare.</small></div>
      <form onSubmit={save}><div><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /><textarea maxLength={3000} placeholder="Skriv en observation eller något att följa upp…" value={content} onChange={(event) => setContent(event.target.value)} /><div className="swimmer-note-tools">{recording ? <button type="button" className="recording-button" onClick={stopRecording} disabled={transcribing}>⏹ Stoppa inspelning</button> : <button type="button" className="text-button note-ai-button" onClick={startRecording} disabled={polishing || transcribing}>🎙️ Läs in med röst</button>}<button type="button" className="text-button note-ai-button" disabled={polishing || transcribing || !content.trim()} onClick={() => improve(content, date, setContent)}>✨ Förbättra text med AI</button></div></div><button className="secondary-button" disabled={saving || polishing || recording || transcribing || !content.trim()}>{saving ? 'Sparar…' : transcribing ? 'Transkriberar…' : 'Spara anteckning'}</button></form>
      {status && <small className="coach-note-status">{status}</small>}
      {notes.length > 0 ? <div className="swimmer-notes-list">{notes.map((note) => <article key={note.id}><details><summary><time dateTime={note.noteDate}>{new Date(`${note.noteDate}T12:00:00`).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' })}</time><span>{note.content.slice(0, 90)}{note.content.length > 90 ? '…' : ''}</span></summary>
        {editing === note.id ? <div className="swimmer-note-edit"><input type="date" value={editDraft.date} onChange={(event) => setEditDraft({ ...editDraft, date: event.target.value })} /><textarea maxLength={3000} value={editDraft.content} onChange={(event) => setEditDraft({ ...editDraft, content: event.target.value })} /><div><button type="button" className="text-button" disabled={polishing || !editDraft.content.trim()} onClick={() => improve(editDraft.content, editDraft.date, (text) => setEditDraft((current) => ({ ...current, content: text })))}>✨ Förbättra text med AI</button><button type="button" className="secondary-button" disabled={saving} onClick={saveEdit}>Spara ändring</button><button type="button" className="text-button" onClick={() => setEditing(null)}>Avbryt</button></div></div> : <><p>{note.content}</p><div className="swimmer-note-actions"><button type="button" className="text-button" onClick={() => startEdit(note)}>Redigera</button><button type="button" className="text-button danger-text" disabled={saving} onClick={() => remove(note)}>Radera</button></div></>}
      </details></article>)}</div> : <p className="notes-empty">Inga sparade anteckningar ännu.</p>}
    </section>
  )
}

function Swimmers({ profiles, pendingProfiles, onProfilesChange, responses, code }) {
  const [reset, setReset] = useState(null)
  const [search, setSearch] = useState('')
  const [trafficFilter, setTrafficFilter] = useState('all')
  const [expandedProfile, setExpandedProfile] = useState(null)
  const [selectedProfile, setSelectedProfile] = useState(null)
  const [profilePoints, setProfilePoints] = useState({})
  const [artifactCatalog, setArtifactCatalog] = useState([])
  const [artifactAssignments, setArtifactAssignments] = useState([])
  const [artifactStatus, setArtifactStatus] = useState({})
  const [artifactError, setArtifactError] = useState('')
  const [training, setTraining] = useState(null)
  const [trainingGoalDrafts, setTrainingGoalDrafts] = useState({})
  const [trainingGoalStatus, setTrainingGoalStatus] = useState({})
  const [groupStatus, setGroupStatus] = useState({})
  const [tempusResults, setTempusResults] = useState({})
  const [tempusLoading, setTempusLoading] = useState({})
  useEffect(() => { apiRequest('/api/points?artifacts=true', code).then((data) => { setArtifactCatalog(data.catalog || []); setArtifactAssignments(data.assignments || []); setArtifactError('') }).catch((error) => setArtifactError(error.message || 'Kunde inte hämta artefakterna.')) }, [code])
  useEffect(() => { apiRequest('/api/points', code).then((data) => setProfilePoints(Object.fromEntries((data.profiles || []).map((item) => [item.profileId, item])))).catch(() => {}) }, [code])
  const loadTraining = () => apiRequest('/api/training', code).then(setTraining)
  useEffect(() => { loadTraining().catch(() => {}) }, [code])
  const reviewProfile = async (profile, approved) => {
    if (!approved && !confirmDestructive(`Profilförfrågan från “${profile.displayName}” tas bort. Användarnamnet blir ledigt igen.`)) return
    try { await apiRequest('/api/profiles', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: approved ? 'approve-profile' : 'reject-profile', profileId: profile.id }) }); await onProfilesChange() } catch (error) { window.alert(error.message) }
  }
  const createReset = async (profile) => {
    try {
      const data = await apiRequest('/api/profiles', code, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create-reset', profileId: profile.id }),
      })
      setReset({ profile, code: data.resetCode })
    } catch (error) { window.alert(error.message) }
  }
  const toggleTestProfile = async (profile) => {
    try {
      await apiRequest('/api/profiles', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'set-test-profile', profileId: profile.id, isTestProfile: !profile.isTestProfile }) })
      await onProfilesChange()
    } catch (error) { window.alert(error.message) }
  }
  const removeProfile = async (profile) => {
    if (!confirmDestructive(`Profilen “${profile.displayName}” och all kopplad historik tas bort permanent. Detta går inte att ångra.`, 'RADERA PROFIL')) return
    try { await apiRequest('/api/profiles', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete-profile', profileId: profile.id }) }); await onProfilesChange() } catch (error) { window.alert(error.message) }
  }
  const trafficColorFor = (profile) => { const recent = responses.filter((item) => item.profileId === profile.id && responseDate(item) >= new Date(Date.now() - 6 * 86400000)); const sick = new Set(recent.filter((item) => item.type === 'sick').map((item) => dateKey(responseDate(item)))).size; const lowBody = recent.filter((item) => Number(item.body) <= 2).length; const lowFeeling = recent.filter((item) => Number(item.feeling) <= 2).length; if (!recent.length) return 'unknown'; if (sick >= 2 || (lowBody >= 2 && lowFeeling >= 2)) return 'red'; if (sick || lowBody || lowFeeling) return 'yellow'; return 'green' }
  const visibleProfiles = profiles
    .filter((profile) => trafficFilter === 'all' || trafficColorFor(profile) === trafficFilter)
    .filter((profile) => `${profile.displayName} ${profile.username}`.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => {
      const latestToday = (profile) => responses
        .filter((item) => item.profileId === profile.id && dateKey(responseDate(item)) === todayKey())
        .sort((first, second) => responseDate(second) - responseDate(first))[0]
      const activityRank = (item) => item?.type === 'after' ? 3 : item?.type === 'before' && item.speedFeeling != null ? 2 : item ? 1 : 0
      return activityRank(latestToday(b)) - activityRank(latestToday(a)) || a.displayName.localeCompare(b.displayName, 'sv')
    })
  const grantArtifact = async (profile, artifact) => {
    setArtifactStatus((current) => ({ ...current, [`${profile.id}-${artifact.artifact_key}`]: 'Sparar…' }))
    try {
      const result = await apiRequest('/api/points', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'grant-artifact', profileId: profile.id, artifactKey: artifact.artifact_key }) })
      if (!result.alreadyAssigned) setArtifactAssignments((current) => [...current, { profile_id: profile.id, artifact_id: artifact.id }])
      setArtifactStatus((current) => ({ ...current, [`${profile.id}-${artifact.artifact_key}`]: result.alreadyAssigned ? 'Redan tilldelad' : 'Tilldelad ✓' }))
    } catch (error) { setArtifactStatus((current) => ({ ...current, [`${profile.id}-${artifact.artifact_key}`]: error.message })) }
  }
  const revokeArtifact = async (profile, artifact) => {
    const key = `${profile.id}-${artifact.artifact_key}`
    if (!window.confirm(`Återkalla ${artifact.name} från ${profile.displayName}? Artefakten tas bort, men intjänade poäng påverkas inte.`)) return
    setArtifactStatus((current) => ({ ...current, [key]: 'Återkallar…' }))
    try {
      await apiRequest('/api/points', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'revoke-artifact', profileId: profile.id, artifactKey: artifact.artifact_key }) })
      setArtifactAssignments((current) => current.filter((item) => !(item.profile_id === profile.id && item.artifact_id === artifact.id)))
      setArtifactStatus((current) => ({ ...current, [key]: 'Återkallad' }))
    } catch (error) { setArtifactStatus((current) => ({ ...current, [key]: error.message })) }
  }
  const saveTrainingGoals = async (profile, swimGoal, crossGoal) => {
    const draft = trainingGoalDrafts[profile.id] || {}
    const swimTarget = Number(draft.swim ?? swimGoal?.target), strengthTarget = Number(draft.strength ?? crossGoal?.strengthTarget ?? 3), drylandTarget = Number(draft.dryland ?? crossGoal?.drylandTarget ?? 3)
    if (!Number.isInteger(swimTarget) || swimTarget < 1 || swimTarget > 14 || !Number.isInteger(strengthTarget) || strengthTarget < 0 || strengthTarget > 7 || !Number.isInteger(drylandTarget) || drylandTarget < 0 || drylandTarget > 7) { setTrainingGoalStatus((current) => ({ ...current, [profile.id]: 'Kontrollera målen: simning 1–14, land/styrka 0–7.' })); return }
    setTrainingGoalStatus((current) => ({ ...current, [profile.id]: 'Sparar…' }))
    try {
      await apiRequest('/api/training', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'coach-season-goal', profileId: profile.id, target: swimTarget, title: swimGoal?.title || 'Mitt simmål', startDate: localDateValue(), endDate: `${new Date().getFullYear()}-12-20`, reflection: swimGoal?.reflection || '' }) })
      await apiRequest('/api/training', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'cross-goals', profileId: profile.id, strengthTarget, drylandTarget }) })
      await loadTraining()
      setTrainingGoalStatus((current) => ({ ...current, [profile.id]: 'Sparat ✓' }))
    } catch (error) { setTrainingGoalStatus((current) => ({ ...current, [profile.id]: error.message })) }
  }
  const saveGroup = async (profile, trainingGroup) => {
    setGroupStatus((current) => ({ ...current, [profile.id]: 'Sparar…' }))
    try { await apiRequest('/api/profiles', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'set-training-group', profileId: profile.id, trainingGroup: trainingGroup || null }) }); await onProfilesChange(); setGroupStatus((current) => ({ ...current, [profile.id]: 'Sparat ✓' })) } catch (error) { setGroupStatus((current) => ({ ...current, [profile.id]: error.message })) }
  }
  const loadTempusResults = async (profile) => {
    setTempusLoading((current) => ({ ...current, [profile.id]: true }))
    try { const data = await apiRequest('/api/profiles', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'get-tempus-results', tempusId: profile.tempusId }) }); setTempusResults((current) => ({ ...current, [profile.id]: data })) } catch (error) { window.alert(error.message) } finally { setTempusLoading((current) => ({ ...current, [profile.id]: false })) }
  }

  if (selectedProfile) return <AnalysisDashboard code={code} profile={selectedProfile} pointInfo={profilePoints[selectedProfile.id]} onBack={() => setSelectedProfile(null)} />
  return (
    <section className="swimmers-section">
      <div className="period-heading"><div><p className="eyebrow">Frivilliga profiler</p><h2>Simmare</h2></div><div className="big-count"><strong>{profiles.length}</strong><span>profiler</span></div></div>
      <label className="swimmer-search"><span>🔎</span><input type="search" placeholder="Sök namn eller användarnamn…" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
      <div className="swimmer-traffic-filters" aria-label="Filtrera trafikljus"><span>Visa:</span>{[['all', 'Alla'], ['red', '🔴 Röda'], ['yellow', '🟡 Gula'], ['green', '🟢 Gröna']].map(([value, label]) => <button type="button" className={trafficFilter === value ? 'active' : ''} key={value} onClick={() => setTrafficFilter(value)}>{label}</button>)}</div>
      {artifactError && <p className="form-error">Artefakter kunde inte laddas. Kontrollera att migration 013 är körd i Supabase.</p>}
      {pendingProfiles.length > 0 && <section className="pending-profiles"><div><p className="eyebrow">Behöver granskas</p><h3>Nya profilförfrågningar</h3></div>{pendingProfiles.map((profile) => <article key={profile.id}><span>{profile.emoji}</span><div><strong>{profile.displayName}</strong><small>@{profile.username} · skapad {new Date(profile.createdAt).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })}</small></div><button className="approve-profile" onClick={() => reviewProfile(profile, true)}>Godkänn</button><button onClick={() => reviewProfile(profile, false)}>Avvisa</button></article>)}</section>}
      {reset && <div className="reset-banner"><span>{reset.profile.emoji}</span><div><small>Engångskod för {reset.profile.displayName} · giltig 30 minuter</small><strong>{reset.code}</strong></div><button onClick={() => setReset(null)}>×</button></div>}
      {visibleProfiles.length ? <div className="swimmer-grid">{visibleProfiles.map((profile) => {
        const items = responses.filter((item) => item.profileId === profile.id)
        const todayItem = items.filter((item) => dateKey(responseDate(item)) === todayKey()).sort((a, b) => responseDate(b) - responseDate(a))[0]
        const after = items.filter((item) => item.type === 'after')
        const level = profilePoints[profile.id]?.level || { emoji: '🥉', name: 'Brons' }
        const profileStars = currentStarState(training, profile.id)
        const starCount = [profileStars.weeklyPlan, profileStars.crossGoals, profileStars.swimGoal, profileStars.monthlySwim].filter(Boolean).length
        const earnedArtifacts = artifactAssignments.filter((item) => item.profile_id === profile.id).map((item) => artifactCatalog.find((artifact) => artifact.id === item.artifact_id)).filter(Boolean)
        const weekStartDate = dateKey(weekStart(new Date()))
        const profileSessions = training?.sessions?.filter((item) => item.profileId === profile.id && item.date >= weekStartDate && item.date <= todayKey()) || []
        const hasSwimToday = profileSessions.some((item) => item.type === 'swim' && item.date === todayKey())
        const raceBefore = todayItem?.type === 'before' && todayItem.speedFeeling != null
        const raceAfter = todayItem?.type === 'after' && todayItem.speedFeeling != null
        const status = hasSwimToday ? ['after', '✓ Har tränat idag'] : todayItem && ({ sick: ['sick', '🤒 Sjuk idag'], rest: ['rest', '⏸️ Tränar inte idag'], before: [raceBefore ? 'race' : 'before', raceBefore ? '🏁 Ska tävla idag' : '→ Ska träna idag'], after: [raceAfter ? 'race' : 'after', raceAfter ? '🏅 Har tävlat idag' : '✓ Har tränat idag'] }[todayItem.type])
        const attention = hasSwimToday ? '🏊 Tränat idag' : raceBefore ? '🏁 Ska tävla idag' : raceAfter ? '🏅 Har tävlat idag' : todayItem?.type === 'after' ? '🏊 Tränat idag' : todayItem?.type === 'sick' ? '🤒 Sjuk idag' : todayItem?.type === 'rest' ? '⏸️ Tränar inte idag' : todayItem?.body <= 2 ? `⚠️ Kroppen ${todayItem.body}/5` : todayItem?.feeling <= 2 ? `⚠️ Känsla ${todayItem.feeling}/5` : todayItem ? '✓ Aktiv idag' : 'Ingen aktivitet idag'
        const swimGoal = training?.seasonGoals?.find((goal) => goal.profileId === profile.id && goal.active && goal.startDate <= todayKey() && goal.endDate >= todayKey())
        const crossGoal = training?.crossGoals?.find((goal) => goal.profileId === profile.id && goal.startDate <= todayKey() && (!goal.endDate || goal.endDate >= todayKey()))
        const recentItems = items.filter((item) => { const date = responseDate(item); const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 6); return date >= cutoff })
        const lowBody = recentItems.filter((item) => Number(item.body) <= 2).length, lowFeeling = recentItems.filter((item) => Number(item.feeling) <= 2).length, sickDays = new Set(recentItems.filter((item) => item.type === 'sick').map((item) => dateKey(responseDate(item)))).size
        const plannedRecent = training?.plannedSessions?.filter((item) => item.profileId === profile.id && item.date >= weekStartDate && item.date <= todayKey()) || []
        const missedPlanned = plannedRecent.filter((item) => !profileSessions.some((session) => session.date === item.date && session.slot === item.slot)).length
        const signalReasons = []
        if (sickDays) signalReasons.push(`${sickDays} sjukdag${sickDays > 1 ? 'ar' : ''}`)
        if (lowBody) signalReasons.push(`tung kropp ${lowBody} gång${lowBody > 1 ? 'er' : ''}`)
        if (lowFeeling) signalReasons.push(`låg känsla ${lowFeeling} gång${lowFeeling > 1 ? 'er' : ''}`)
        if (missedPlanned) signalReasons.push(`${missedPlanned} missat planerat pass`)
        const hasActivityData = recentItems.length > 0 || profileSessions.length > 0 || plannedRecent.length > 0
        const traffic = !hasActivityData ? { color: 'unknown', label: 'För lite data', icon: '⚪' } : (sickDays >= 2 || missedPlanned >= 3 || (lowBody >= 2 && lowFeeling >= 2)) ? { color: 'red', label: 'Följ upp', icon: '🔴' } : signalReasons.length ? { color: 'yellow', label: 'Var uppmärksam', icon: '🟡' } : { color: 'green', label: 'Ser stabilt ut', icon: '🟢' }
        const trainingGoals = [{ icon: '🏊', label: 'Simning', completed: profileSessions.filter((item) => item.type === 'swim').length, target: swimGoal?.target }, { icon: '🤸', label: 'Landträning', completed: profileSessions.filter((item) => item.type === 'dryland').length, target: crossGoal?.drylandTarget ?? 3 }, { icon: '🏋️', label: 'Styrka', completed: profileSessions.filter((item) => item.type === 'strength').length, target: crossGoal?.strengthTarget ?? 3 }].filter((item) => item.target > 0)
        const isExpanded = expandedProfile === profile.id
        return <article key={profile.id} className={`swimmer-card ${isExpanded ? 'expanded' : 'compact'}`}>
          <button type="button" className="swimmer-card-toggle" aria-expanded={isExpanded} onClick={() => setExpandedProfile(isExpanded ? null : profile.id)}>
            <div className="swimmer-name"><span>{profile.emoji}</span><div><strong>{profile.displayName}</strong><small>@{profile.username}</small></div><b className="swimmer-level">{level.emoji} {level.name}</b></div>
            <div className="swimmer-card-meta"><span className="swimmer-stars" title={`${starCount} av 4 träningsstjärnor`}>★ {starCount}/4</span><span className={`swimmer-traffic ${traffic.color}`} title={signalReasons.length ? signalReasons.join(' · ') : traffic.label}>{traffic.icon} <small>{traffic.label}</small></span><span className="swimmer-mood" title={todayItem?.feeling ? 'Simmarens känsla idag' : undefined}>{todayItem?.feeling ? FEELINGS[Number(todayItem.feeling) - 1]?.emoji : ''}</span><span className={`swimmer-attention ${todayItem?.type === 'sick' || todayItem?.body <= 2 || todayItem?.feeling <= 2 ? 'needs-attention' : ''}`}>{attention}</span><span className="swimmer-expand-hint">{isExpanded ? '▲ Dölj' : '▼ Visa mer'}</span></div>
          </button>
          {isExpanded && <div className="swimmer-card-details">
            {profile.isTestProfile && <div className="test-profile-badge">🧪 Testprofil · räknas inte i gruppstatistik</div>}
            {signalReasons.length > 0 && <div className={`swimmer-traffic-reasons ${traffic.color}`}><strong>{traffic.icon} Att följa upp</strong><span>{signalReasons.join(' · ')}</span></div>}
            {status && <div className={`swimmer-status ${status[0]}`}>{status[1]}</div>}
            <SwimmerNotes profile={profile} code={code} />
            <div className="tempus-edit"><div><strong>Tempus-ID</strong><small>{profile.tempusId ? 'Används i Tävlingsresultat' : 'Lägg till för att koppla resultat'}</small></div><form onSubmit={(event) => { event.preventDefault(); const value = event.currentTarget.elements.tempusId.value.trim(); apiRequest('/api/profiles', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'set-tempus-id', profileId: profile.id, tempusId: value }) }).then(() => onProfilesChange()).catch((error) => window.alert(error.message)) }}><label><input name="tempusId" inputMode="numeric" pattern="[0-9]{1,12}" maxLength="12" defaultValue={profile.tempusId || ''} placeholder="t.ex. 273688" /></label><button type="submit">Spara</button></form></div>
            <div className="tempus-edit"><div><strong>Träningsgrupp</strong><small>Styr vilka pass simmaren ser</small></div><label><select value={profile.trainingGroup || ''} onChange={(event) => saveGroup(profile, event.target.value)}><option value="">Ingen grupp</option><option value="ungdom_orange">Ungdom Orange</option><option value="ungdom_svart">Ungdom Svart</option><option value="junior">Junior</option></select></label>{groupStatus[profile.id] && <small>{groupStatus[profile.id]}</small>}</div>
            {profilePoints[profile.id] && <PointProgress info={profilePoints[profile.id]} compact />}
            <section className="swimmer-training-goals"><p className="eyebrow">Simning, landträning och styrka</p>{trainingGoals.length ? <div>{trainingGoals.map((item) => <div key={item.label}><span>{item.icon}</span><p><strong>{item.completed} av {item.target} {item.label.toLowerCase()}</strong><i><b style={{ width: `${Math.min(100, Math.round((item.completed / item.target) * 100))}%` }} /></i></p></div>)}</div> : <small>Inga aktiva träningsmål registrerade.</small>}<details className="swimmer-goal-edit"><summary>Ändra överenskomna mål</summary><form onSubmit={(event) => { event.preventDefault(); saveTrainingGoals(profile, swimGoal, crossGoal) }}><label>Simning / vecka<input type="number" min="1" max="14" value={trainingGoalDrafts[profile.id]?.swim ?? swimGoal?.target ?? ''} onChange={(event) => setTrainingGoalDrafts((current) => ({ ...current, [profile.id]: { ...(current[profile.id] || {}), swim: event.target.value } }))} /></label><label>Land / vecka<input type="number" min="0" max="7" value={trainingGoalDrafts[profile.id]?.dryland ?? crossGoal?.drylandTarget ?? 3} onChange={(event) => setTrainingGoalDrafts((current) => ({ ...current, [profile.id]: { ...(current[profile.id] || {}), dryland: event.target.value } }))} /></label><label>Styrka / vecka<input type="number" min="0" max="7" value={trainingGoalDrafts[profile.id]?.strength ?? crossGoal?.strengthTarget ?? 3} onChange={(event) => setTrainingGoalDrafts((current) => ({ ...current, [profile.id]: { ...(current[profile.id] || {}), strength: event.target.value } }))} /></label><button type="submit">Spara mål</button>{trainingGoalStatus[profile.id] && <small>{trainingGoalStatus[profile.id]}</small>}</form><small>Ändras efter dialog med simmaren.</small></details></section>
            <div className="swimmer-stats"><div><strong>{items.length}</strong><small>svar</small></div><div><strong>{average('feeling', items)}</strong><small>känsla</small></div><div><strong>{average('rpe', after)}</strong><small>RPE</small></div></div>
            {items.length > 0 && <details className="swimmer-details"><summary>Visa senaste svar</summary>{items.slice(0, 5).map((item) => <div key={item.id}><span>{FEELINGS[item.feeling - 1]?.emoji}</span><p><strong>{new Date(item.createdAt).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })}</strong><small>{item.rpe ? `RPE ${item.rpe}` : DAY_TYPES.find((type) => type.value === item.type)?.title}{item.temperature ? ` · 🌡️ ${TEMPERATURE_LABELS[Number(item.temperature) - 1] || `${item.temperature}/5`}` : ''}{item.comment ? ` · “${item.comment}”` : ''}</small></p></div>)}</details>}
            {artifactCatalog.length > 0 && <details className="artifact-picker"><summary>⭐ Artefakter för {profile.displayName}</summary><div>{artifactCatalog.map((artifact) => { const key = `${profile.id}-${artifact.artifact_key}`; const assigned = earnedArtifacts.some((item) => item.id === artifact.id); const busy = artifactStatus[key] === 'Sparar…' || artifactStatus[key] === 'Återkallar…'; return <button type="button" key={artifact.id} disabled={busy} className={assigned ? 'assigned' : ''} onClick={() => assigned ? revokeArtifact(profile, artifact) : grantArtifact(profile, artifact)} title={artifact.description}>{artifact.emoji} <span>{assigned ? 'Återkalla' : `Ge ${artifact.name}`}</span>{artifactStatus[key] && <small>{artifactStatus[key]}</small>}</button> })}</div></details>}
            <details className="profile-tools ai-profile-tools"><summary>✨ Personlig AI-analys</summary><div><small>{profile.aiAnalysisStatus === 'approved' ? 'Aktiverad – simmaren kan läsa sparade analyser.' : profile.aiAnalysisStatus === 'pending' ? 'Väntar på vårdnadshavares godkännande.' : profile.aiAnalysisStatus === 'revoked' ? 'Återkallad.' : 'Inte aktiverad.'}</small>{profile.aiAnalysisStatus !== 'approved' && <button onClick={async () => { try { await apiRequest('/api/profiles', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'set-ai-analysis-status', profileId: profile.id, status: 'pending' }) }); await onProfilesChange() } catch (error) { window.alert(error.message) } }}>Be om godkännande</button>}{profile.aiAnalysisStatus === 'pending' && <button onClick={async () => { if (!window.confirm('Har vårdnadshavaren godkänt personlig AI-analys enligt klubbens rutin?')) return; try { await apiRequest('/api/profiles', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'set-ai-analysis-status', profileId: profile.id, status: 'approved' }) }); await onProfilesChange() } catch (error) { window.alert(error.message) } }}>Registrera godkännande</button>}{profile.aiAnalysisStatus === 'approved' && <button onClick={async () => { try { await apiRequest('/api/profiles', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'set-ai-analysis-status', profileId: profile.id, status: 'revoked' }) }); await onProfilesChange() } catch (error) { window.alert(error.message) } }}>Stäng av</button>}</div></details>
            <div className="swimmer-actions"><button className="view-stats" onClick={() => setSelectedProfile(profile)}>Visa statistik</button></div>
            <details className="profile-tools"><summary>⚙️ Profilverktyg</summary><div><button onClick={() => createReset(profile)}>Återställ PIN</button><button className="test-profile-toggle" onClick={() => toggleTestProfile(profile)}>{profile.isTestProfile ? 'Ta med i statistik igen' : 'Markera som testprofil'}</button><button className="delete-profile-button" onClick={() => removeProfile(profile)}>Radera profil</button></div></details>
          </div>}
        </article>
      })}</div> : <EmptyPeriod title={profiles.length ? 'Ingen simmare matchar sökningen' : 'Inga profiler ännu'} periodLabel="Simmare" />}
    </section>
  )
}

function PeriodOverview({ responses, profiles, title, periodLabel, showDays }) {
  const [selectedFeeling, setSelectedFeeling] = useState(null)
  const after = responses.filter((item) => item.type === 'after')
  const profileById = useMemo(() => new Map((profiles || []).map((profile) => [profile.id, profile])), [profiles])
  const distribution = useMemo(() => FEELINGS.map((feeling) => ({
    ...feeling,
    count: responses.filter((item) => item.feeling === feeling.value).length,
  })), [responses])
  const selectedItems = selectedFeeling ? responses.filter((item) => item.feeling === selectedFeeling) : []
  const identifiedItems = selectedItems.filter((item) => item.profileId && profileById.has(item.profileId))
  const latestByProfile = [...identifiedItems].sort((a, b) => responseDate(b) - responseDate(a)).reduce((result, item) => {
    if (!result.some((entry) => entry.profileId === item.profileId)) result.push(item)
    return result
  }, [])
  const signalFor = (item) => item.raceConcern === 'sick_or_pain' ? '⚠️ Sjuk eller ont inför tävling' : item.type === 'sick' ? '🤒 Känner sig sjuk' : item.type === 'rest' ? '⏸️ Tränar inte idag' : item.body <= 2 ? `Kroppen ${item.body}/5` : item.feeling <= 2 ? `Känsla ${item.feeling}/5` : ''

  if (!responses.length) {
    return <EmptyPeriod title={title} periodLabel={periodLabel} />
  }

  return (
    <>
      <div className="period-heading"><div><p className="eyebrow">{periodLabel}</p><h2>{title}</h2></div><div className="big-count"><strong>{responses.length}</strong><span>anonyma svar</span></div></div>
      <section className="stats-grid">
        <Stat title="Gruppens känsla" helpTerm="Känsla" value={`${average('feeling', responses)} / 5`} note="Alla svar" />
        <Stat title="Upplevd ansträngning" helpTerm="RPE" value={`${average('rpe', after)} / 10`} note={`${after.length} efter passet`} />
        <Stat title="Passet" value={`${average('pass', after)} / 5`} note="Simmarnas betyg" />
        <Stat title="Upplägget" value={`${average('setup', after)} / 5`} note="Hur det fungerade" />
      </section>

      {showDays && <WeekDays responses={responses} />}

      <section className="coach-card">
        <div className="section-heading"><div><p className="eyebrow">Överblick</p><h2>Så känns det i gruppen</h2></div></div>
        <div className="distribution">
          {distribution.map((item) => (
            <button type="button" className={`distribution-item ${selectedFeeling === item.value ? 'selected' : ''}`} key={item.value} onClick={() => setSelectedFeeling(selectedFeeling === item.value ? null : item.value)}><span className="dist-emoji">{item.emoji}</span><span className="bar-track"><span style={{ height: `${Math.max(8, (item.count / responses.length) * 100)}%` }} /></span><strong>{item.count}</strong><small>{item.label}</small></button>
          ))}
        </div>
        {selectedFeeling && <section className="feeling-followup"><div><p className="eyebrow">Profilerade svar · {FEELINGS[selectedFeeling - 1].label}</p><h3>Vilka valde detta?</h3></div><button type="button" onClick={() => setSelectedFeeling(null)}>Stäng</button>{latestByProfile.length ? <div className="feeling-profile-list">{latestByProfile.map((item) => { const owner = profileById.get(item.profileId); return <article key={item.profileId}><span>{owner.emoji}</span><div><strong>{owner.displayName}</strong><small>{signalFor(item) || 'Svarade på känslan'} · {new Date(item.createdAt).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })}</small></div></article> })}</div> : <p className="empty">Inga profilerade svar på denna nivå.</p>}<small className="feeling-anonymous">{selectedItems.length - identifiedItems.length} anonyma svar visas inte individuellt.</small></section>}
      </section>

      <div className="coach-columns">
        <section className="coach-card">
          <p className="eyebrow">Aktivitet</p><h2>Vad har gruppen gjort?</h2>
          <div className="type-list">
            {DAY_TYPES.map((type) => <div key={type.value}><span>{type.title}</span><strong>{responses.filter((item) => item.type === type.value).length}</strong></div>)}
          </div>
        </section>
        <section className="coach-card comments-card">
          <p className="eyebrow">Anonymt</p><h2>Kommentarer</h2>
          {(() => { const comments = [...new Map(responses.filter((item) => item.comment?.trim()).map((item) => [item.comment.trim().toLocaleLowerCase('sv-SE'), item.comment.trim()])).values()]; return comments.length ? comments.map((comment) => <blockquote key={comment}>“{comment}”</blockquote>) : <p className="empty">Inga kommentarer under perioden.</p> })()}
        </section>
      </div>
    </>
  )
}

function WeekDays({ responses }) {
  const { start } = previousWeekRange()
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start)
    date.setDate(start.getDate() + index)
    const items = responses.filter((response) => dateKey(responseDate(response)) === dateKey(date))
    return { date, items }
  })

  return (
    <section className="coach-card week-card">
      <p className="eyebrow">Dag för dag</p><h2>Veckans utveckling</h2>
      <div className="week-days">
        {days.map(({ date, items }) => (
          <div key={dateKey(date)} className={items.length ? '' : 'no-data'}>
            <span>{date.toLocaleDateString('sv-SE', { weekday: 'short' }).replace('.', '')}</span>
            <strong>{items.length ? FEELINGS[Math.max(0, Math.round(Number(average('feeling', items))) - 1)]?.emoji : '–'}</strong>
            <small>{items.length} svar</small>
          </div>
        ))}
      </div>
    </section>
  )
}

function History({ responses }) {
  const groups = useMemo(() => {
    const byDay = responses.reduce((result, response) => {
      const key = dateKey(responseDate(response))
      result[key] = [...(result[key] || []), response]
      return result
    }, {})
    return Object.entries(byDay).sort(([a], [b]) => b.localeCompare(a))
  }, [responses])

  if (!groups.length) return <EmptyPeriod title="Ingen historik ännu" periodLabel="Tidigare svar" />

  return (
    <section className="history-section">
      <div className="period-heading"><div><p className="eyebrow">Alla registrerade dagar</p><h2>Historik</h2></div><div className="big-count"><strong>{groups.length}</strong><span>dagar med svar</span></div></div>
      <div className="history-list">
        {groups.map(([key, items]) => {
          const after = items.filter((item) => item.type === 'after')
          return (
            <article key={key} className="history-row">
              <div className="history-date"><strong>{new Date(`${key}T12:00:00`).toLocaleDateString('sv-SE', { weekday: 'long' })}</strong><span>{new Date(`${key}T12:00:00`).toLocaleDateString('sv-SE', { day: 'numeric', month: 'long', year: 'numeric' })}</span></div>
              <div className="history-mood"><span>{FEELINGS[Math.max(0, Math.round(Number(average('feeling', items))) - 1)]?.emoji}</span><small>Känsla {average('feeling', items)}/5</small></div>
              <div><strong>{items.length}</strong><small>svar</small></div>
              <div><strong>{average('rpe', after)}</strong><small>RPE</small></div>
              <div><strong>{average('pass', after)}</strong><small>passet</small></div>
            </article>
          )
        })}
      </div>
    </section>
  )
}

function EmptyPeriod({ title, periodLabel }) {
  return <section className="empty-period"><span>≈</span><p className="eyebrow">{periodLabel}</p><h2>{title}</h2><p>När simmarna har svarat visas sammanställningen här.</p></section>
}

function Stat({ title, value, note, helpTerm }) {
  return <article className="stat"><span>{title} <HelpTip term={helpTerm || title} /></span><strong>{value}</strong><small>{note}</small></article>
}

createRoot(document.getElementById('root')).render(<App />)
