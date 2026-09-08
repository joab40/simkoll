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

const dateKey = (date) => {
  const value = new Date(date)
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
}

const responseDate = (response) => new Date(response.createdAt)
const todayKey = () => dateKey(new Date())
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
  const [points, setPoints] = useState(null)
  const [notifications, setNotifications] = useState([])
  const [training, setTraining] = useState(null)
  const [identified, setIdentified] = useState(false)
  const [loading, setLoading] = useState(false)
  const [screen, setScreen] = useState('home')

  useEffect(() => {
    if (!auth) return
    setLoading(true)
    Promise.all([
      fetchResponses(auth.code),
      auth.role === 'coach' ? apiRequest('/api/profiles', auth.code) : Promise.resolve({ profiles: [], pendingProfiles: [] }),
      auth.role === 'coach' ? apiRequest('/api/activity', auth.code).then((data) => data.activeProfilesToday) : Promise.resolve(0),
    ])
      .then(([nextResponses, profileData, activeCount]) => { setResponses(nextResponses); setProfiles(profileData.profiles); setPendingProfiles(profileData.pendingProfiles || []); setActiveProfilesToday(activeCount) })
      .catch((error) => window.alert(error.message))
      .finally(() => setLoading(false))
  }, [auth])

  useEffect(() => {
    if (!auth || !profile) { setWorkout(null); setTomorrowWorkout(null); setWorkoutLocked(false); return }
    ;(async () => {
      const trainingData = await apiRequest('/api/training', auth.code)
      const tomorrow = dateKey(new Date(Date.now() + 86400000))
      const [workoutData, tomorrowData, activityData, pointsData, notificationData] = await Promise.all([apiRequest('/api/workouts', auth.code), apiRequest(`/api/workouts?date=${tomorrow}`, auth.code), apiRequest('/api/activity', auth.code), apiRequest('/api/points', auth.code), apiRequest('/api/notifications', auth.code).catch(() => ({ notifications: [] }))])
      setWorkout(workoutData.workout); setWorkoutLocked(workoutData.locked); setTomorrowWorkout(tomorrowData.workout); setActiveProfilesToday(activityData.activeProfilesToday); setPoints(pointsData); setNotifications(notificationData.notifications || []); setTraining(trainingData)
    })().catch(() => { setWorkout(null); setWorkoutLocked(false) })
  }, [auth, profile])

  useEffect(() => {
    if (!auth || !profile) return undefined
    const refresh = () => apiRequest('/api/notifications', auth.code).then((data) => setNotifications(data.notifications || [])).catch(() => {})
    refresh()
    const timer = window.setInterval(refresh, 30000)
    return () => window.clearInterval(timer)
  }, [auth, profile])

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
    setScreen('home')
  }

  if (auth.role === 'coach') {
    return <Coach responses={responses} profiles={profiles} pendingProfiles={pendingProfiles} onProfilesChange={async () => { const data = await apiRequest('/api/profiles', auth.code); setProfiles(data.profiles); setPendingProfiles(data.pendingProfiles || []) }} activeProfilesToday={activeProfilesToday} code={auth.code} loading={loading} onLogout={logout} onClear={async () => {
      await apiRequest('/api/responses', auth.code, { method: 'DELETE' })
      setResponses([])
    }} />
  }

  return (
    <Shell profile={profile} onCommunity={() => setScreen('community')} onGoals={() => setScreen('goals')} onHelp={() => setScreen('faq')} onProfile={() => setScreen('profile')} onGame={() => setScreen('game')} onLogout={logout}>
      {screen === 'game' && <Simpaus code={auth.code} onBack={() => setScreen('home')} />}
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
        <Home responses={responses} profile={profile} points={points} notifications={notifications} onNotificationsChange={setNotifications} training={training} workout={workout} tomorrowWorkout={tomorrowWorkout} workoutLocked={workoutLocked} activeProfilesToday={activeProfilesToday} onCommunity={() => setScreen('community')} onGoals={() => setScreen('goals')} onGame={() => setScreen('game')} onToggleSession={async (date, slot, completed) => { const result = await apiRequest('/api/training', auth.code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'toggle-session', date, slot, completed, skipCheer: true }) }); apiRequest('/api/training', auth.code).then(setTraining).catch(() => {}); return result }} onTogglePlan={async (date, slot, planned) => { const result = await apiRequest('/api/training', auth.code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'toggle-plan', date, slot, planned }) }); apiRequest('/api/training', auth.code).then(setTraining).catch(() => {}); return result }} onStart={() => {
          if (profile) setScreen('privacy-choice')
          else { setIdentified(false); setScreen('checkin') }
        }} />
      )}
      {screen === 'privacy-choice' && <PrivacyChoice profile={profile} onBack={() => setScreen('home')} onChoose={(value) => { setIdentified(value); setScreen('checkin') }} />}
      {screen === 'checkin' && (
        <CheckIn
          hasProfile={Boolean(profile)}
          onBack={() => setScreen('home')}
          onSubmit={async (response) => {
            const result = await apiRequest('/api/responses', auth.code, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ...response, identified }),
            })
            setResponses((current) => [...current, result.response])
            if (profile) {
              const trainingData = await apiRequest('/api/training', auth.code)
              const tomorrow = dateKey(new Date(Date.now() + 86400000))
              const [workoutData, tomorrowData, activityData, pointsData] = await Promise.all([apiRequest('/api/workouts', auth.code), apiRequest(`/api/workouts?date=${tomorrow}`, auth.code), apiRequest('/api/activity', auth.code), apiRequest('/api/points', auth.code)])
              setWorkout(workoutData.workout)
              setWorkoutLocked(workoutData.locked)
              setTomorrowWorkout(tomorrowData.workout)
              setActiveProfilesToday(activityData.activeProfilesToday)
              setPoints(pointsData)
              setTraining(trainingData)
            }
            setScreen('thanks')
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

function Shell({ children, profile, onCommunity, onGoals, onHelp, onProfile, onGame, onLogout }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const go = (handler) => () => { setMenuOpen(false); handler() }
  return (
    <main className="app-shell">
      <header><ClubBrand /><button className="mobile-menu-toggle" type="button" aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>{menuOpen ? 'Stäng' : 'Meny'} <span>{menuOpen ? '×' : '☰'}</span></button><div className={`header-actions ${menuOpen ? 'open' : ''}`}>{profile && <button className="feed-link" onClick={go(onCommunity)}>Peppflödet</button>}{profile && <button className="feed-link" onClick={go(onGoals)}>Mina mål</button>}<button className="feed-link" onClick={go(onHelp)}>FAQ</button>{profile && <button className="profile-chip" onClick={go(onProfile)}><span>{profile.emoji}</span>{profile.displayName}</button>}{!profile && <button className="text-button" onClick={go(onLogout)}>Logga ut</button>}</div></header>
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
  'Passet': 'Upplevelsen av passet, inte ett betyg på den egna prestationen.',
  'Upplägget': 'Om passets innehåll och struktur fungerade för simmaren.',
  'Aktiva dagar': 'Dagar då profilen har använt en profilfunktion i Simkoll.',
  'Registrerade pass': 'Pass som simmaren aktivt valt att lägga till i sin veckoräknare.',
  'Poäng och nivå': 'Visar aktivitet och positiva bidrag i Simkoll, inte simförmåga.',
  'Trend': 'Ett mönster över flera svar. En enstaka skattning ska inte övertolkas.',
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

function HelpTip({ term }) {
  return HELP_TEXT[term] ? <button type="button" className="help-tip" title={HELP_TEXT[term]} aria-label={`${term}: ${HELP_TEXT[term]}`}>i</button> : null
}

function Faq({ role, onBack }) {
  return <div className="faq-page">{onBack && <button className="back-button" onClick={onBack}>← Tillbaka</button>}<section className="faq-content"><p className="eyebrow">Simkolls mätningar</p><h1>Vad betyder det?</h1><p className="faq-intro">Svaren beskriver simmarens egen upplevelse. De är ett stöd för samtal och träningsplanering, inte ett prov eller en medicinsk bedömning.</p><div className="faq-list">{Object.entries(HELP_TEXT).map(([term, description]) => <details key={term}><summary>{term}<span>+</span></summary><p>{description}</p>{FAQ_SCALES[term] && <div className={`rpe-guide scale-${FAQ_SCALES[term].length}`}>{FAQ_SCALES[term].map(([value, label]) => <span key={value}><b>{value}</b>{label}</span>)}</div>}</details>)}</div>{role === 'coach' && <section className="coach-interpretation"><p className="eyebrow">För tränare</p><h2>Tolka med nyfikenhet</h2><ul><li>Titta efter återkommande mönster, inte enstaka svar.</li><li>RPE är individuell och ska inte användas för att jämföra simmare.</li><li>Hög RPE är inte automatiskt negativt när passet var planerat att vara hårt.</li><li>Låg energi eller tung kropp är en signal att fråga – inte en diagnos.</li><li>Kombinera alltid appens data med samtal och egna observationer.</li><li>Gruppvärden visas först när minst tre svar finns.</li></ul></section>}</section></div>
}

function Home({ responses, profile, points, notifications, onNotificationsChange, training, workout, tomorrowWorkout, workoutLocked, activeProfilesToday, onCommunity, onGoals, onGame, onToggleSession, onTogglePlan, onStart }) {
  const todayResponses = responses.filter((response) => dateKey(responseDate(response)) === todayKey())
  const groupFeeling = todayResponses.length ? todayResponses.reduce((sum, response) => sum + response.feeling, 0) / todayResponses.length : 0
  const energized = todayResponses.length >= 3 && groupFeeling >= 4
  return (
    <div className="page-content home">
      <section className={`mood-hero ${energized ? 'energized' : ''}`}>
        <p className="eyebrow light">Idag i gruppen</p>
        <h1>Så här känns det</h1>
        <div className="emoji-cloud" aria-label={`${todayResponses.length} svar idag`}>
          {todayResponses.length ? todayResponses.map((response, index) => (
            <span className={response.feeling === 5 ? 'top-mood' : response.feeling === 4 ? 'good-mood' : ''} key={response.id} style={{ '--delay': `${index * 40}ms` }}>
              {FEELINGS.find((item) => item.value === response.feeling)?.emoji}
            </span>
          )) : <p>Inga svar ännu – bli först!</p>}
        </div>
        <div className="response-count"><span><strong>{todayResponses.length}</strong> svar idag</span>{profile && <span className="active-count">● {activeProfilesToday} profiler inne idag</span>}</div>
      </section>

      {profile && <StartCard profile={profile} onStart={onStart} />}
      {profile && <WorkoutCard workout={workout} locked={workoutLocked} />}
      {profile && tomorrowWorkout && <TomorrowWorkoutCard workout={tomorrowWorkout} />}
      {profile && <NotificationCard profile={profile} notifications={notifications} onChange={onNotificationsChange} onCommunity={onCommunity} onGoals={onGoals} />}
      {profile && <RewardCard points={points} onCommunity={onCommunity} />}
      {profile && <WeeklySwimCard training={training} onOpen={onGoals} onToggle={onToggleSession} onPlan={onTogglePlan} />}
      {profile && <GameCard onOpen={onGame} />}
      {!profile && <StartCard profile={profile} onStart={onStart} />}
    </div>
  )
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

function GameCard({ onOpen }) {
  return <section className="game-card"><div><p className="eyebrow">En liten paus</p><h2>Simpaus 🐬</h2><p>Testa hur länge du kan hålla dig mellan vågorna.</p></div><button className="primary-button" onClick={onOpen}>Spela →</button></section>
}

function Simpaus({ code, onBack }) {
  const canvasRef = useRef(null)
  const gameRef = useRef({ running: false })
  const [status, setStatus] = useState('ready')
  const [score, setScore] = useState(0)
  const [gameData, setGameData] = useState({ leaderboard: [], ownBest: 0 })

  useEffect(() => { apiRequest('/api/points?game=simpaus', code).then(setGameData).catch(() => {}) }, [code])

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
      game.obstacles.forEach((obstacle) => { obstacle.x -= 145 * delta; if (!obstacle.passed && obstacle.x + obstacle.width < 56) { obstacle.passed = true; game.score += 1; setScore(game.score) } })
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

function WeeklySwimCard({ training, onOpen, onToggle, onPlan }) {
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
  const toggle = async (date, slot, checked) => { const key = `${date}-${slot}`; const previous = localSessions || []; const type = slot.includes('swim') ? 'swim' : slot; const next = checked ? [...previous.filter((item) => !(item.date === date && item.slot === slot)), { date, slot, type }] : previous.filter((item) => !(item.date === date && item.slot === slot)); setLocalSessions(next); setSaving(key); try { const result = await onToggle(date, slot, checked); setCheer(result?.message || (checked ? 'Passet är registrerat! ✓' : 'Passet är avmarkerat.')) } catch (error) { setLocalSessions(previous); window.alert(error.message) } finally { setSaving('') } }
  const togglePlan = async (date, slot, checked) => { const key = `plan-${date}-${slot}`; const previous = localPlans || []; const next = checked ? [...previous.filter((item) => !(item.date === date && item.slot === slot)), { date, slot, weekStart: dateKey(start) }] : previous.filter((item) => !(item.date === date && item.slot === slot)); setLocalPlans(next); setSaving(key); try { const result = await onPlan(date, slot, checked); setCheer(result?.message || (checked ? 'Passet är planerat! 🗓️' : 'Planeringen är uppdaterad.')) } catch (error) { setLocalPlans(previous); window.alert(error.message) } finally { setSaving('') } }
  const percentage = goal ? Math.round((completed / goal.target) * 100) : null
  return <section className="weekly-training-card">
    <div className="weekly-summary"><div><p className="eyebrow">Min träning den här veckan</p><h3>{goal ? `${completed} av ${goal.target} simpass · ${percentage} %` : `${completed} simpass`}</h3>{goal ? <><div className="session-dots">{Array.from({ length: goal.target }, (_, index) => <i className={index < completed ? 'done' : ''} key={index} />)}</div><small>{completed >= goal.target ? 'Veckomålet är uppnått!' : `${goal.target - completed} simpass kvar enligt din överenskommelse`} · {weeklySessions.length} pass totalt</small></> : <small>{weeklySessions.length} pass totalt · <button onClick={onOpen}>sätt ett simmål</button></small>}<small>{plannedDays} planerade dagar · planera minst 3 dagar för +2 poäng</small></div><button onClick={onOpen}>Mina mål →</button></div>
    {crossGoal && <div className="cross-progress"><MiniGoal icon="🏋️" label="Styrka" {...typeProgress.strength} /><MiniGoal icon="🤸" label="Landträning" {...typeProgress.dryland} /></div>}
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
  return (
    <section className={`workout-card ${workout ? '' : 'workout-empty'}`}>
      <div className="workout-label"><span>🏊</span><div><p className="eyebrow">Endast för profiler</p><h2>Dagens pass</h2></div></div>
      {locked ? <div className="locked-workout"><span>🔒</span><div><strong>Checka in för att se passet</strong><small>Du kan fortfarande välja att svara anonymt.</small></div></div> : workout ? <div className="workout-body"><h3>{workout.title}</h3><p>{workout.content}</p>{workout.note && <aside><strong>Från tränaren</strong>{workout.note}</aside>}</div> : <p className="empty">Tränaren har inte lagt upp något pass idag.</p>}
    </section>
  )
}

function TomorrowWorkoutCard({ workout }) {
  return <section className="tomorrow-card"><div><p className="eyebrow">Imorgon</p><h2>{workout.title}</h2><p>{workout.content}</p></div><span>🔓</span></section>
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
  ['group_energy', 'Bra energi på träningen idag! ⚡'], ['group_fun', 'Kul att simma med er! 🌊'],
  ['group_great_job', 'Grymt jobbat allihop! 💪'], ['group_thanks', 'Tack för ett bra pass! 🙌'],
  ['group_spirit', 'Härlig stämning idag! 😊'],
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

  const load = async () => {
    const [feed, directory] = await Promise.all([apiRequest('/api/community', code), apiRequest('/api/profiles?directory=true', code)])
    setItems(feed.items); setPrivateKudos(feed.privateKudos || []); setMessages(feed.messages || []); setProfiles(directory.profiles); setLoading(false)
  }
  useEffect(() => { load().catch((error) => { setStatus(error.message); setLoading(false) }) }, [])

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
    <aside className="kudos-panel"><p className="eyebrow">Sprid bra energi</p><h2>Skicka pepp</h2><p>Privat till en kompis, tränarna eller öppet till hela gruppen.</p><small className="kudos-limit">3 privata + 1 grupp-pepp per dag · +1 poäng per pepp</small>
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
  const [seasonForm, setSeasonForm] = useState({ title: 'Mitt höstmål', target: 4, startDate: localDateValue(), endDate: `${new Date().getFullYear()}-12-20`, reflection: '' })
  const load = () => Promise.all([apiRequest('/api/goals', code), apiRequest('/api/training', code)]).then(([goalData, trainingData]) => { setGoals(goalData.goals); setTraining(trainingData); onTrainingChange(trainingData) }).finally(() => setLoading(false))
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
  const [loading, setLoading] = useState(true)
  const [showAnalytics, setShowAnalytics] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState({ displayName: profile.displayName, emoji: profile.emoji })
  const [editError, setEditError] = useState('')
  useEffect(() => {
    apiRequest('/api/responses?mine=true', code).then((data) => setResponses(data.responses)).finally(() => setLoading(false))
    apiRequest('/api/points?artifacts=true', code).then((data) => setArtifacts(data.artifacts || [])).catch(() => {})
  }, [code])
  return (
    <div className="my-profile-page">
      <button className="back-button" onClick={onBack}>← Tillbaka</button>
      <section className="profile-summary"><span>{profile.emoji}</span><div><p className="eyebrow">Min profil</p><h1>{profile.displayName}</h1><small>@{profile.username}</small></div>{points?.current && <div className="profile-level"><b>{points.current.emoji} {points.current.name}</b><span>{points.total} poäng</span></div>}</section>
      {!editing ? <button className="profile-edit-button" onClick={() => { setEditForm({ displayName: profile.displayName, emoji: profile.emoji }); setEditError(''); setEditing(true) }}>✏️ Ändra namn eller emoji</button> : <form className="profile-edit-form" onSubmit={async (event) => { event.preventDefault(); setEditError(''); try { const data = await apiRequest('/api/profiles', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'update-profile', ...editForm }) }); onProfileChange(data.profile); setEditing(false) } catch (error) { setEditError(error.message) } }}><label>Visningsnamn<input maxLength="40" required value={editForm.displayName} onChange={(event) => setEditForm({ ...editForm, displayName: event.target.value })} /></label><fieldset><legend>Välj emoji</legend><div className="avatar-picker">{PROFILE_EMOJIS.map((emoji) => <button type="button" className={editForm.emoji === emoji ? 'selected' : ''} key={emoji} onClick={() => setEditForm({ ...editForm, emoji })}>{emoji}</button>)}</div><input className="custom-emoji-input" maxLength="16" aria-label="Egen emoji" placeholder="Eller skriv en egen emoji" value={editForm.emoji} onChange={(event) => setEditForm({ ...editForm, emoji: event.target.value })} /></fieldset>{editError && <p className="form-error">{editError}</p>}<div><button type="button" className="secondary-button" onClick={() => setEditing(false)}>Avbryt</button><button className="primary-button">Spara ändringar</button></div></form>}
      <section className="artifact-collection"><div><p className="eyebrow">Min samling</p><h2>Artefakter</h2><small>Små bevis på vanor, utveckling och lagkänsla.</small></div>{artifacts.length ? <div className="artifact-grid">{artifacts.map((artifact) => <article key={artifact.id} title={artifact.description}><span>{artifact.emoji}</span><strong>{artifact.name}</strong><small>{new Date(artifact.awardedAt).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })}</small></article>)}</div> : <p className="empty">Din samling är tom än så länge.</p>}</section>
      <section className="my-history">
        <div><h2>Min historik</h2><small>Endast svar du valde att koppla till profilen</small></div>
        {loading ? <p className="empty">Hämtar…</p> : responses.length ? responses.map((item) => <article key={item.id}><span>{FEELINGS[item.feeling - 1]?.emoji}</span><div><strong>{new Date(item.createdAt).toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'short' })}</strong><small>{DAY_TYPES.find((type) => type.value === item.type)?.title}</small></div>{item.rpe && <b>RPE {item.rpe}</b>}</article>) : <p className="empty">Inga profilsvar ännu.</p>}
      </section>
      {!showAnalytics ? <button className="primary-button profile-stats-button" onClick={() => setShowAnalytics(true)}>📊 Visa min statistik →</button> : <AnalysisDashboard code={code} profile={profile} selfView onBack={() => setShowAnalytics(false)} />}
      <button className="profile-logout" onClick={onProfileLogout}>Logga ut från profilen</button>
    </div>
  )
}

function CheckIn({ hasProfile, onBack, onSubmit }) {
  const [step, setStep] = useState(0)
  const [form, setForm] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const typeQuestions = form.type ? getQuestions(form.type) : []
  const total = 2 + typeQuestions.length

  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }))
  const next = () => setStep((current) => current + 1)
  const submit = async () => {
    setSubmitting(true)
    setSubmitError('')
    try {
      await onSubmit(form)
    } catch (error) {
      setSubmitError(error.message || 'Kunde inte skicka svaret. Försök igen.')
      setSubmitting(false)
    }
  }

  let content
  if (step === 0) {
    content = (
      <Question title="Hur ser din dag ut?" hint="Välj det som stämmer bäst just nu.">
        <div className="choice-stack">
          {DAY_TYPES.map((type) => (
            <button key={type.value} className="choice-card" onClick={() => { setForm((current) => ({ ...current, type: type.value, registerTraining: hasProfile && type.value === 'after', trainingSlot: type.value === 'after' ? 'afternoon_swim' : undefined })); next() }}>
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
    const question = typeQuestions[step - 2]
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
        {question.kind === 'comment' && (
          <div className="comment-box">
            <textarea autoFocus maxLength="300" placeholder="Skriv här…" value={form.comment || ''} onChange={(event) => update('comment', event.target.value)} />
            {hasProfile && form.type === 'after' && <div className="training-register"><label className="training-toggle"><input type="checkbox" checked={form.registerTraining === true} onChange={(event) => update('registerTraining', event.target.checked)} /><span><strong>Registrera som simpass</strong><small>Läggs i din personliga veckoräknare. Feedbacken kan fortfarande vara anonym.</small></span></label>{form.registerTraining && <div className="swim-slot"><button type="button" className={form.trainingSlot === 'morning_swim' ? 'active' : ''} onClick={() => update('trainingSlot', 'morning_swim')}>🌅 Morgon</button><button type="button" className={form.trainingSlot === 'afternoon_swim' ? 'active' : ''} onClick={() => update('trainingSlot', 'afternoon_swim')}>🌇 Eftermiddag</button></div>}</div>}
            {submitError && <span className="error-text">{submitError}</span>}
            <div><button className="skip-button" disabled={submitting} onClick={submit}>Hoppa över</button><button className="primary-button small" disabled={submitting} onClick={submit}>{submitting ? 'Skickar…' : 'Skicka →'}</button></div>
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

function Coach({ responses, profiles, pendingProfiles, onProfilesChange, activeProfilesToday, code, loading, onLogout, onClear }) {
  const [view, setView] = useState('today')
  const previousWeek = previousWeekRange()
  const todayResponses = responses.filter((response) => dateKey(responseDate(response)) === todayKey())
  const previousWeekResponses = responses.filter((response) => {
    const date = responseDate(response)
    return date >= previousWeek.start && date <= previousWeek.end
  })
  const scopedResponses = view === 'today' ? todayResponses : previousWeekResponses

  const previousWeekLabel = `${previousWeek.start.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })}–${previousWeek.end.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })}`

  return (
    <main className="coach-shell">
      <header><ClubBrand /><div><span className="coach-badge">Tränarvy</span><button className="text-button" onClick={onLogout}>Logga ut</button></div></header>
      <div className="coach-content">
        <div className="coach-heading"><div><p className="eyebrow">Tränaröversikt</p><h1>Gruppens läge</h1></div><div className="usage-summary"><div className="usage-stat"><strong>{activeProfilesToday}</strong><span>aktiva profiler idag</span></div><b className="usage-divider">·</b><div className="usage-stat"><strong>{todayResponses.length}</strong><span>incheckningar</span></div>{todayResponses.some((item) => item.type === 'sick') && <><b className="usage-divider">·</b><div className="usage-stat"><strong className="sick-count">{todayResponses.filter((item) => item.type === 'sick').length}</strong><span>sjuka idag</span></div></>}</div></div>
        <nav className="coach-tabs" aria-label="Välj tidsperiod">
          <button className={view === 'today' ? 'active' : ''} onClick={() => setView('today')}>Idag</button>
          <button className={view === 'week' ? 'active' : ''} onClick={() => setView('week')}>Förra veckan</button>
          <button className={view === 'meeting' ? 'active' : ''} onClick={() => setView('meeting')}>Veckomöte</button>
          <button className={view === 'trends' ? 'active' : ''} onClick={() => setView('trends')}>Grupptrend</button>
          <button className={view === 'history' ? 'active' : ''} onClick={() => setView('history')}>Historik</button>
          <button className={view === 'swimmers' ? 'active' : ''} onClick={() => setView('swimmers')}>Simmare{pendingProfiles.length > 0 && <b className="tab-count">{pendingProfiles.length}</b>}</button>
          <button className={view === 'workout' ? 'active' : ''} onClick={() => setView('workout')}>Dagens pass</button>
          <button className={view === 'community' ? 'active' : ''} onClick={() => setView('community')}>Klubbflöde</button>
          <button className={view === 'goals' ? 'active' : ''} onClick={() => setView('goals')}>Utvecklingsmål</button>
          <button className={view === 'programs' ? 'active' : ''} onClick={() => setView('programs')}>Träningsprogram</button>
          <button className={view === 'rewards' ? 'active' : ''} onClick={() => setView('rewards')}>Poäng & nivåer</button>
          <button className={view === 'faq' ? 'active' : ''} onClick={() => setView('faq')}>FAQ</button>
        </nav>

        {loading ? <section className="empty-period"><span>≈</span><h2>Hämtar svar…</h2></section> : view === 'faq' ? (
          <Faq role="coach" />
        ) : view === 'trends' ? (
          <AnalysisDashboard code={code} />
        ) : view === 'rewards' ? (
          <CoachRewards code={code} />
        ) : view === 'meeting' ? (
          <WeeklyMeeting code={code} />
        ) : view === 'programs' ? (
          <CoachPrograms code={code} profiles={profiles} />
        ) : view === 'goals' ? (
          <CoachGoals code={code} profiles={profiles} />
        ) : view === 'community' ? (
          <CoachCommunity code={code} profiles={profiles} />
        ) : view === 'workout' ? (
          <WorkoutEditor code={code} />
        ) : view === 'swimmers' ? (
          <Swimmers profiles={profiles} pendingProfiles={pendingProfiles} onProfilesChange={onProfilesChange} responses={responses} code={code} />
        ) : view === 'history' ? (
          <History responses={responses} />
        ) : (
          <PeriodOverview
            responses={scopedResponses}
            title={view === 'today' ? 'Idag' : 'Förra veckan'}
            profiles={profiles}
            periodLabel={view === 'today'
              ? new Date().toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' })
              : previousWeekLabel}
            showDays={view === 'week'}
          />
        )}
        <button className="clear-button" onClick={async () => {
          if (!confirmDestructive('Alla incheckningar och all historik kommer att raderas permanent.')) return
          try { await onClear() } catch (error) { window.alert(error.message) }
        }}>Radera alla svar</button>
        <footer className="app-meta"><span>Simkoll v{APP_VERSION}</span><span>Uppdaterad {new Date(BUILD_TIME).toLocaleString('sv-SE', { dateStyle: 'medium', timeStyle: 'short' })}</span><span>Build {COMMIT_SHA}</span></footer>
      </div>
    </main>
  )
}

function WeeklyMeeting({ code }) {
  const [report, setReport] = useState(null)
  const [error, setError] = useState('')
  const range = useMemo(() => {
    const previous = previousWeekRange()
    return { start: previous.start, end: new Date(previous.end.getTime() + 1) }
  }, [])
  useEffect(() => {
    const query = new URLSearchParams({ start: range.start.toISOString(), end: range.end.toISOString(), startDay: dateKey(range.start), endDay: dateKey(range.end) })
    apiRequest(`/api/weekly-report?${query}`, code).then(setReport).catch((nextError) => setError(nextError.message))
  }, [code])
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
  return <section className="weekly-meeting"><div className="period-heading"><div><p className="eyebrow">Underlag för söndags- eller måndagsmötet</p><h2>Veckobilden</h2></div><div className="big-count"><strong>{label}</strong><span>senast avslutade vecka</span></div></div><div className="meeting-stats"><Stat title="Aktiva profiler" value={report.activeProfiles} note={`${report.activeDays} aktiva dagar`} /><Stat title="Incheckningar" value={report.checkins} note={`${report.afterSessions} efter simpass`} /><Stat title="Registrerad träning" value={report.swims + report.strength + report.dryland} note={`${report.swims} sim · ${report.strength} styrka · ${report.dryland} land`} /><Stat title="Pepp i gruppen" value={report.kudos} note={`${report.approvedGoals} godkända mål`} /></div><div className="meeting-columns"><section className="coach-card meeting-highlights"><p className="eyebrow">Det här tar vi med oss</p><h2>Veckans positiva</h2>{positives.length ? positives.map((item) => <p key={item}><span>✓</span>{item}</p>) : <p className="empty">Mer data behövs för att skapa positiva highlights.</p>}</section><section className="coach-card meeting-attention"><p className="eyebrow">Följ upp tillsammans</p><h2>Signaler att vara nyfiken på</h2>{attention.length ? attention.map((item) => <p key={item}><span>!</span>{item}</p>) : <p><span>✓</span>Inga tydliga varningssignaler i veckans svar.</p>}<small>Visas endast på gruppnivå. Prata med gruppen och dra inte slutsatser om enskilda simmare från en ensam skattning.</small></section></div><section className="coach-card meeting-ratings"><h2>Träningsupplevelsen</h2><div><Stat title="Känsla" value={report.feeling == null ? '–' : `${report.feeling}/5`} note="Alla incheckningar" /><Stat title="Kroppen" value={report.body == null ? '–' : `${report.body}/5`} note="Självskattning" /><Stat title="Ansträngning" value={report.rpe == null ? '–' : `${report.rpe}/10`} note="Efter pass" /><Stat title="Passet" value={report.passRating == null ? '–' : `${report.passRating}/5`} note="Simmarnas betyg" /></div></section></section>
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

function AnalysisDashboard({ code, profile, pointInfo, onBack, selfView = false }) {
  const [period, setPeriod] = useState('7')
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    setData(null); setError('')
    const range = analysisRange(period)
    const query = new URLSearchParams({ start: range.start.toISOString(), end: range.end.toISOString(), previousStart: range.previousStart.toISOString(), previousEnd: (range.previousEnd || range.start).toISOString() })
    if (profile) query.set('profileId', profile.id)
    apiRequest(`/api/analytics?${query}`, code).then(setData).catch((nextError) => setError(nextError.message))
  }, [code, profile?.id, period])
  const change = (key) => {
    if (!data?.current || !data?.previous || data.current[key] == null || data.previous[key] == null) return null
    return Number((data.current[key] - data.previous[key]).toFixed(1))
  }
  const Metric = ({ title, metric, suffix = '', note }) => { const delta = change(metric); const value = data.current[metric]; return <><article className="analysis-metric"><span>{title} <HelpTip term={title} /></span><strong>{value == null ? '–' : `${value}${suffix}`}</strong>{delta != null && delta !== 0 ? <small className={delta > 0 ? 'up' : 'down'}>{delta > 0 ? '↑' : '↓'} {Math.abs(delta)} mot förra perioden</small> : <small>{note || 'Oförändrat mot förra perioden'}</small>}</article>{metric === 'checkins' && profile && !selfView && <GoalCompliance data={data} code={code} profile={profile} />}</> }
  return <section className="analysis-dashboard">{onBack && <button className="back-button inline" onClick={onBack}>← Alla simmare</button>}<div className="period-heading"><div><p className="eyebrow">{profile ? 'Endast svar kopplade till profilen' : 'Anonym sammanställning på gruppnivå'}</p><h2>{profile ? `${profile.emoji} ${profile.displayName}` : 'Gruppens utveckling'}</h2></div>{profile && pointInfo && <PointProgress info={pointInfo} compact />}</div><nav className="analysis-periods">{ANALYSIS_PERIODS.map((item) => <button className={period === item.key ? 'active' : ''} key={item.key} onClick={() => setPeriod(item.key)}>{item.label}</button>)}</nav>{error ? <p className="form-error">{error}</p> : !data ? <section className="empty-period"><span>≈</span><h2>Hämtar statistik…</h2></section> : <><div className="analysis-metrics"><Metric title="Incheckningar" metric="checkins" /><Metric title="Aktiva dagar" metric="activeDays" /><Metric title="Sjukdagar" metric="sickDays" /><Metric title="Vilodagar" metric="restDays" /><Metric title="Känsla" metric="feeling" suffix="/5" /><Metric title="Kroppen" metric="body" suffix="/5" /><Metric title="RPE" metric="rpe" suffix="/10" /><Metric title="Passet" metric="passRating" suffix="/5" /></div>{data.privacyLimited && <p className="privacy-limit">🔒 Minst tre gruppsvar behövs för att visa genomsnitt.</p>}<div className="analysis-columns"><section className="coach-card trend-card"><p className="eyebrow">Över tid</p><h2>Känsla och kropp</h2>{data.trend.length ? <div className="trend-bars">{data.trend.map((item) => <div key={item.date}><div><i style={{ height: `${(item.feeling || 0) * 18}%` }} title={`Känsla ${item.feeling ?? 'dold'}`} /><i className="body-bar" style={{ height: `${(item.body || 0) * 18}%` }} title={`Kropp ${item.body ?? 'dold'}`} /></div><small>{new Date(`${item.date}T12:00:00`).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })}</small><b>{item.count}</b></div>)}</div> : <p className="empty">Ingen data under perioden.</p>}<div className="chart-legend"><span><i /> Känsla</span><span><i /> Kropp</span></div></section><section className="coach-card training-summary"><p className="eyebrow">Registrerad träning</p><h2>Genomförda pass</h2><div><p><span>🏊</span><strong>{data.current.swimSessions}</strong><small>Simpass</small></p><p><span>🏋️</span><strong>{data.current.strengthSessions}</strong><small>Styrkepass</small></p><p><span>🤸</span><strong>{data.current.drylandSessions}</strong><small>Landpass</small></p></div></section></div>{profile && <section className="coach-card analysis-comments"><p className="eyebrow">Profilsvar</p><h2>Kommentarer under perioden</h2>{data.recent.length ? data.recent.map((item) => <blockquote key={`${item.date}-${item.comment}`}>{FEELINGS[item.feeling - 1]?.emoji} “{item.comment}” <small>{new Date(item.date).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })}</small></blockquote>) : <p className="empty">Inga profilkopplade kommentarer under perioden.</p>}</section>}</>}</section>
}

function GoalCompliance({ data, code, profile }) {
  const [targets, setTargets] = useState({ strengthTarget: 3, drylandTarget: 3 })
  const [scheduled, setScheduled] = useState(null)
  useEffect(() => { apiRequest('/api/training', code).then((training) => { const latest = training.crossGoals?.filter((goal) => goal.profileId === profile.id).sort((a, b) => b.startDate.localeCompare(a.startDate))[0]; if (latest) { setTargets({ strengthTarget: latest.strengthTarget, drylandTarget: latest.drylandTarget }); setScheduled(latest) } }).catch(() => {}) }, [code, profile.id])
  const save = async (event) => { event.preventDefault(); try { const result = await apiRequest('/api/training', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'cross-goals', profileId: profile.id, ...targets, strengthTarget: Number(targets.strengthTarget), drylandTarget: Number(targets.drylandTarget) }) }); setScheduled({ ...targets, startDate: result.startDate }); window.alert(`Målen börjar gälla ${result.startDate}.`) } catch (error) { window.alert(error.message) } }
  return <section className="goal-compliance">
    {data.currentWeekGoal && <GoalProgressBlock title="Pågående vecka · simning" completed={data.currentWeekGoal.completed} target={data.currentWeekGoal.target} percentage={data.currentWeekGoal.percentage} detail={data.currentWeekGoal.remaining ? `${data.currentWeekGoal.remaining} pass kvar enligt överenskommelsen` : 'Veckomålet är uppnått'} />}
    {data.goalProgress && <GoalProgressBlock title="Avslutade veckor · simning" completed={data.goalProgress.completed} target={data.goalProgress.expected} percentage={data.goalProgress.percentage} detail={`Målet nåddes ${data.goalProgress.weeksReached} av ${data.goalProgress.weeksCount} veckor · ${Math.max(0, data.goalProgress.expected - data.goalProgress.completed)} pass under mål`} />}
    {data.currentCrossGoals?.strength?.target > 0 && <GoalProgressBlock title="Pågående vecka · styrka" completed={data.currentCrossGoals.strength.completed} target={data.currentCrossGoals.strength.target} percentage={data.currentCrossGoals.strength.percentage} detail={`${data.currentCrossGoals.strength.remaining} pass kvar`} />}
    {data.currentCrossGoals?.dryland?.target > 0 && <GoalProgressBlock title="Pågående vecka · landträning" completed={data.currentCrossGoals.dryland.completed} target={data.currentCrossGoals.dryland.target} percentage={data.currentCrossGoals.dryland.percentage} detail={`${data.currentCrossGoals.dryland.remaining} pass kvar`} />}
    {data.crossProgress?.strength && <GoalProgressBlock title="Vald period · styrka" completed={data.crossProgress.strength.completed} target={data.crossProgress.strength.expected} percentage={data.crossProgress.strength.percentage} detail={`Målet nåddes ${data.crossProgress.strength.weeksReached} av ${data.crossProgress.strength.weeksCount} veckor · ${Math.max(0, data.crossProgress.strength.expected - data.crossProgress.strength.completed)} pass under mål`} />}
    {data.crossProgress?.dryland && <GoalProgressBlock title="Vald period · landträning" completed={data.crossProgress.dryland.completed} target={data.crossProgress.dryland.expected} percentage={data.crossProgress.dryland.percentage} detail={`Målet nåddes ${data.crossProgress.dryland.weeksReached} av ${data.crossProgress.dryland.weeksCount} veckor · ${Math.max(0, data.crossProgress.dryland.expected - data.crossProgress.dryland.completed)} pass under mål`} />}
    <form onSubmit={save}><p className="eyebrow">Styrka och landträning</p><label>Styrkepass / vecka<input type="number" min="0" max="7" value={targets.strengthTarget} onChange={(event) => setTargets({ ...targets, strengthTarget: event.target.value })} /></label><label>Landträningar / vecka<input type="number" min="0" max="7" value={targets.drylandTarget} onChange={(event) => setTargets({ ...targets, drylandTarget: event.target.value })} /></label><button>Spara från nästa måndag</button><small>Förslag på dagar: landträning mån/ons/fre · styrka tis/tor/sön. Simmaren markerar själv planerade dagar.</small>{scheduled && <small>Senast planerat: {scheduled.strengthTarget} styrka + {scheduled.drylandTarget} land från {scheduled.startDate}</small>}</form>
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
  const activeGoalFor = (profileId) => (training?.seasonGoals || []).find((goal) => goal.profileId === profileId && goal.active && localDateValue() >= goal.startDate && localDateValue() <= goal.endDate)
  return <section className="coach-programs">
    <div className="period-heading"><div><p className="eyebrow">Styrka · landträning · eget ansvar</p><h2>Träningsprogram</h2></div></div>
    <section className="coach-card season-overview"><h3>Veckans simmål</h3><div>{profiles.map((profile) => { const goal = activeGoalFor(profile.id); const count = weekSessions(profile.id); return <article key={profile.id}><span>{profile.emoji}</span><div><strong>{profile.displayName}</strong><small>{goal ? `${count} av ${goal.target} simpass` : 'Inget terminsmål'}</small></div>{goal && <b className={count >= goal.target ? 'reached' : ''}>{count}/{goal.target}</b>}</article> })}</div></section>
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
  const [message, setMessage] = useState('')
  const [recipientId, setRecipientId] = useState('')
  const [items, setItems] = useState([])
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const load = () => apiRequest('/api/community', code).then((data) => { setItems(data.items); setMessages(data.messages || []) }).finally(() => setLoading(false))
  useEffect(() => { load().catch((error) => window.alert(error.message)) }, [])
  const publish = async (event) => {
    event.preventDefault(); setLoading(true)
    try {
      await apiRequest('/api/community', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content }) })
      setContent(''); await load()
    } catch (error) { window.alert(error.message); setLoading(false) }
  }
  const remove = async (id) => {
    if (!confirmDestructive('Meddelandet tas bort från alla simmares flöde.')) return
    try { await apiRequest(`/api/community?id=${id}`, code, { method: 'DELETE' }); await load() } catch (error) { window.alert(error.message) }
  }
  const sendMessage = async (event) => { event.preventDefault(); try { await apiRequest('/api/community', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'message', recipientId, content: message }) }); setMessage(''); setRecipientId(''); await load() } catch (error) { window.alert(error.message) } }
  return <section className="coach-community"><div className="period-heading"><div><p className="eyebrow">Syns för alla profiler</p><h2>Klubbflödet</h2></div></div><form onSubmit={publish}><textarea required maxLength="1000" placeholder="Skriv ett meddelande till gruppen…" value={content} onChange={(event) => setContent(event.target.value)} /><div><small>{content.length}/1000</small><button className="primary-button" disabled={loading}>Publicera →</button></div></form><section className="coach-private-message"><h3>Skicka privat till simmare</h3><form onSubmit={sendMessage}><select required value={recipientId} onChange={(event) => setRecipientId(event.target.value)}><option value="">Välj simmare…</option>{profiles.filter((profile) => !profile.isTestProfile).map((profile) => <option value={profile.id} key={profile.id}>{profile.emoji} {profile.displayName}</option>)}</select><textarea required maxLength="1000" placeholder="Skriv ett privat meddelande…" value={message} onChange={(event) => setMessage(event.target.value)} /><button className="primary-button">Skicka privat →</button></form></section><section className="coach-messages"><h3>Privata meddelanden till tränarna</h3>{messages.filter((item) => item.toCoach).length ? messages.filter((item) => item.toCoach).map((item) => <article key={item.id}><span>{item.sender?.emoji || '👤'}</span><div><strong>{item.sender?.displayName || 'Simmare'}</strong><p>{item.content}</p><small>{formatFeedDate(item.createdAt)}</small></div></article>) : <p className="empty">Inga privata meddelanden ännu.</p>}</section><div className="coach-feed">{items.map((item) => <article key={`${item.type}-${item.id}`}><span>{item.type === 'coach' ? '📣' : item.sender?.emoji}</span><div><strong>{item.type === 'coach' ? 'Tränarna' : `${item.sender?.displayName} → hela gruppen`}</strong><p>{item.content}</p><small>{formatFeedDate(item.createdAt)}</small></div>{item.type === 'coach' && <button onClick={() => remove(item.id)}>Ta bort</button>}</article>)}</div></section>
}

function localDateValue() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function WorkoutEditor({ code }) {
  const [date, setDate] = useState(localDateValue)
  const [form, setForm] = useState({ title: '', content: '', note: '' })
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setLoading(true)
    apiRequest(`/api/workouts?date=${date}`, code)
      .then((data) => setForm(data.workout || { title: '', content: '', note: '' }))
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
      setForm({ title: '', content: '', note: '' })
      setSaved(false)
    } catch (error) { window.alert(error.message) }
  }

  return (
    <section className="workout-editor">
      <div className="period-heading"><div><p className="eyebrow">Syns för inloggade simmare</p><h2>Lägg upp ett pass</h2></div></div>
      <form onSubmit={save}>
        <label>Datum<input type="date" value={date} onChange={(event) => { setSaved(false); setDate(event.target.value) }} /></label>
        <label>Rubrik<input required maxLength="80" placeholder="Till exempel: Tröskel + teknik" value={form.title || ''} onChange={(event) => { setSaved(false); setForm({ ...form, title: event.target.value }) }} /></label>
        <label>Passet<textarea required maxLength="5000" placeholder={'Insim 800 m\n8 × 50 m teknik\nHuvudserie…'} value={form.content || ''} onChange={(event) => { setSaved(false); setForm({ ...form, content: event.target.value }) }} /></label>
        <label>Meddelande till simmarna <small>Frivilligt</small><textarea className="short" maxLength="500" placeholder="Fokus för dagen eller något att tänka på…" value={form.note || ''} onChange={(event) => { setSaved(false); setForm({ ...form, note: event.target.value }) }} /></label>
        <div className="editor-actions">{form.id && <button type="button" className="delete-workout" onClick={remove}>Ta bort passet</button>}<span>{saved ? '✓ Sparat och publicerat' : ''}</span><button className="primary-button" disabled={loading}>{loading ? 'Vänta…' : 'Publicera passet →'}</button></div>
      </form>
    </section>
  )
}

function Swimmers({ profiles, pendingProfiles, onProfilesChange, responses, code }) {
  const [reset, setReset] = useState(null)
  const [search, setSearch] = useState('')
  const [expandedProfile, setExpandedProfile] = useState(null)
  const [selectedProfile, setSelectedProfile] = useState(null)
  const [profilePoints, setProfilePoints] = useState({})
  const [artifactCatalog, setArtifactCatalog] = useState([])
  const [artifactAssignments, setArtifactAssignments] = useState([])
  const [artifactStatus, setArtifactStatus] = useState({})
  const [artifactError, setArtifactError] = useState('')
  useEffect(() => { apiRequest('/api/points?artifacts=true', code).then((data) => { setArtifactCatalog(data.catalog || []); setArtifactAssignments(data.assignments || []); setArtifactError('') }).catch((error) => setArtifactError(error.message || 'Kunde inte hämta artefakterna.')) }, [code])
  useEffect(() => { apiRequest('/api/points', code).then((data) => setProfilePoints(Object.fromEntries((data.profiles || []).map((item) => [item.profileId, item])))).catch(() => {}) }, [code])
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
  const visibleProfiles = profiles.filter((profile) => `${profile.displayName} ${profile.username}`.toLowerCase().includes(search.trim().toLowerCase()))
  const grantArtifact = async (profile, artifact) => {
    setArtifactStatus((current) => ({ ...current, [`${profile.id}-${artifact.artifact_key}`]: 'Sparar…' }))
    try {
      const result = await apiRequest('/api/points', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'grant-artifact', profileId: profile.id, artifactKey: artifact.artifact_key }) })
      if (!result.alreadyAssigned) setArtifactAssignments((current) => [...current, { profile_id: profile.id, artifact_id: artifact.id }])
      setArtifactStatus((current) => ({ ...current, [`${profile.id}-${artifact.artifact_key}`]: result.alreadyAssigned ? 'Redan tilldelad' : 'Tilldelad ✓' }))
    } catch (error) { setArtifactStatus((current) => ({ ...current, [`${profile.id}-${artifact.artifact_key}`]: error.message })) }
  }

  if (selectedProfile) return <AnalysisDashboard code={code} profile={selectedProfile} pointInfo={profilePoints[selectedProfile.id]} onBack={() => setSelectedProfile(null)} />
  return (
    <section className="swimmers-section">
      <div className="period-heading"><div><p className="eyebrow">Frivilliga profiler</p><h2>Simmare</h2></div><div className="big-count"><strong>{profiles.length}</strong><span>profiler</span></div></div>
      <label className="swimmer-search"><span>🔎</span><input type="search" placeholder="Sök namn eller användarnamn…" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
      {artifactError && <p className="form-error">Artefakter kunde inte laddas. Kontrollera att migration 013 är körd i Supabase.</p>}
      {pendingProfiles.length > 0 && <section className="pending-profiles"><div><p className="eyebrow">Behöver granskas</p><h3>Nya profilförfrågningar</h3></div>{pendingProfiles.map((profile) => <article key={profile.id}><span>{profile.emoji}</span><div><strong>{profile.displayName}</strong><small>@{profile.username} · skapad {new Date(profile.createdAt).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })}</small></div><button className="approve-profile" onClick={() => reviewProfile(profile, true)}>Godkänn</button><button onClick={() => reviewProfile(profile, false)}>Avvisa</button></article>)}</section>}
      {reset && <div className="reset-banner"><span>{reset.profile.emoji}</span><div><small>Engångskod för {reset.profile.displayName} · giltig 30 minuter</small><strong>{reset.code}</strong></div><button onClick={() => setReset(null)}>×</button></div>}
      {visibleProfiles.length ? <div className="swimmer-grid">{visibleProfiles.map((profile) => {
        const items = responses.filter((item) => item.profileId === profile.id)
        const todayItem = items.filter((item) => dateKey(responseDate(item)) === todayKey()).sort((a, b) => responseDate(b) - responseDate(a))[0]
        const after = items.filter((item) => item.type === 'after')
        const level = profilePoints[profile.id]?.level || { emoji: '🥉', name: 'Brons' }
        const status = todayItem && ({ sick: ['sick', '🤒 Sjuk idag'], rest: ['rest', '⏸️ Tränar inte idag'], before: ['before', '→ Ska träna idag'], after: ['after', '✓ Har tränat idag'] }[todayItem.type])
        const attention = todayItem?.type === 'sick' ? '🤒 Sjuk idag' : todayItem?.type === 'rest' ? '⏸️ Tränar inte idag' : todayItem?.body <= 2 ? `⚠️ Kroppen ${todayItem.body}/5` : todayItem?.feeling <= 2 ? `⚠️ Känsla ${todayItem.feeling}/5` : todayItem ? '✓ Aktiv idag' : 'Ingen aktivitet idag'
        const earnedArtifacts = artifactAssignments.filter((item) => item.profile_id === profile.id).map((item) => artifactCatalog.find((artifact) => artifact.id === item.artifact_id)).filter(Boolean)
        const isExpanded = expandedProfile === profile.id
        return <article key={profile.id} className={`swimmer-card ${isExpanded ? 'expanded' : 'compact'}`}>
          <button type="button" className="swimmer-card-toggle" aria-expanded={isExpanded} onClick={() => setExpandedProfile(isExpanded ? null : profile.id)}>
            <div className="swimmer-name"><span>{profile.emoji}</span><div><strong>{profile.displayName}</strong><small>@{profile.username}</small></div><b className="swimmer-level">{level.emoji} {level.name}</b></div>
            <div className="swimmer-card-meta"><span className={`swimmer-attention ${todayItem?.type === 'sick' || todayItem?.body <= 2 || todayItem?.feeling <= 2 ? 'needs-attention' : ''}`}>{attention}</span><span className="swimmer-expand-hint">{isExpanded ? '▲ Dölj' : '▼ Visa mer'}</span></div>
          </button>
          {isExpanded && <div className="swimmer-card-details">
            {profile.isTestProfile && <div className="test-profile-badge">🧪 Testprofil · räknas inte i gruppstatistik</div>}
            {status && <div className={`swimmer-status ${status[0]}`}>{status[1]}</div>}
            {earnedArtifacts.length > 0 && <div className="swimmer-artifacts" title="Tilldelade artefakter">{earnedArtifacts.map((artifact) => <span key={artifact.id} title={`${artifact.name}: ${artifact.description}`}>{artifact.emoji}</span>)}</div>}
            {profilePoints[profile.id] && <PointProgress info={profilePoints[profile.id]} compact />}
            <div className="swimmer-stats"><div><strong>{items.length}</strong><small>svar</small></div><div><strong>{average('feeling', items)}</strong><small>känsla</small></div><div><strong>{average('rpe', after)}</strong><small>RPE</small></div></div>
            {items.length > 0 && <details className="swimmer-details"><summary>Visa senaste svar</summary>{items.slice(0, 5).map((item) => <div key={item.id}><span>{FEELINGS[item.feeling - 1]?.emoji}</span><p><strong>{new Date(item.createdAt).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })}</strong><small>{item.rpe ? `RPE ${item.rpe}` : DAY_TYPES.find((type) => type.value === item.type)?.title}{item.comment ? ` · “${item.comment}”` : ''}</small></p></div>)}</details>}
            {artifactCatalog.length > 0 && <details className="artifact-picker"><summary>⭐ Ge artefakt till {profile.displayName}</summary><div>{artifactCatalog.map((artifact) => { const key = `${profile.id}-${artifact.artifact_key}`; const assigned = earnedArtifacts.some((item) => item.id === artifact.id); return <button key={artifact.id} disabled={assigned || artifactStatus[key] === 'Sparar…'} className={assigned ? 'assigned' : ''} onClick={() => grantArtifact(profile, artifact)} title={artifact.description}>{artifact.emoji} <span>{artifact.name}</span>{artifactStatus[key] && <small>{artifactStatus[key]}</small>}</button> })}</div></details>}
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
  const signalFor = (item) => item.type === 'sick' ? '🤒 Känner sig sjuk' : item.type === 'rest' ? '⏸️ Tränar inte idag' : item.body <= 2 ? `Kroppen ${item.body}/5` : item.feeling <= 2 ? `Känsla ${item.feeling}/5` : ''

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
          {responses.filter((item) => item.comment).length ? responses.filter((item) => item.comment).map((item) => <blockquote key={item.id}>“{item.comment}”</blockquote>) : <p className="empty">Inga kommentarer under perioden.</p>}
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
