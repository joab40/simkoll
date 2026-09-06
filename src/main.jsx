import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'

const APP_VERSION = __APP_VERSION__
const BUILD_TIME = __BUILD_TIME__
const COMMIT_SHA = __COMMIT_SHA__

const FEELINGS = [
  { value: 1, emoji: '😣', label: 'Tungt' },
  { value: 2, emoji: '😕', label: 'Segt' },
  { value: 3, emoji: '😐', label: 'Okej' },
  { value: 4, emoji: '🙂', label: 'Bra' },
  { value: 5, emoji: '🤩', label: 'Toppen' },
]

const DAY_TYPES = [
  { value: 'before', title: 'Jag ska träna', icon: '→' },
  { value: 'after', title: 'Jag har tränat', icon: '✓' },
  { value: 'rest', title: 'Ingen träning idag', icon: '–' },
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

const confirmDestructive = (description) => window.prompt(`${description}\n\nSkriv RADERA för att bekräfta.`) === 'RADERA'

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
  const [workout, setWorkout] = useState(null)
  const [workoutLocked, setWorkoutLocked] = useState(false)
  const [activeProfilesToday, setActiveProfilesToday] = useState(0)
  const [points, setPoints] = useState(null)
  const [training, setTraining] = useState(null)
  const [identified, setIdentified] = useState(false)
  const [loading, setLoading] = useState(false)
  const [screen, setScreen] = useState('home')

  useEffect(() => {
    if (!auth) return
    setLoading(true)
    Promise.all([
      fetchResponses(auth.code),
      auth.role === 'coach' ? apiRequest('/api/profiles', auth.code).then((data) => data.profiles) : Promise.resolve([]),
      auth.role === 'coach' ? apiRequest('/api/activity', auth.code).then((data) => data.activeProfilesToday) : Promise.resolve(0),
    ])
      .then(([nextResponses, nextProfiles, activeCount]) => { setResponses(nextResponses); setProfiles(nextProfiles); setActiveProfilesToday(activeCount) })
      .catch((error) => window.alert(error.message))
      .finally(() => setLoading(false))
  }, [auth])

  useEffect(() => {
    if (!auth || !profile) { setWorkout(null); setWorkoutLocked(false); return }
    Promise.all([apiRequest('/api/workouts', auth.code), apiRequest('/api/activity', auth.code), apiRequest('/api/points', auth.code), apiRequest('/api/training', auth.code)])
      .then(([workoutData, activityData, pointsData, trainingData]) => { setWorkout(workoutData.workout); setWorkoutLocked(workoutData.locked); setActiveProfilesToday(activityData.activeProfilesToday); setPoints(pointsData); setTraining(trainingData) })
      .catch(() => { setWorkout(null); setWorkoutLocked(false) })
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
    setWorkout(null)
    setWorkoutLocked(false)
    setActiveProfilesToday(0)
    setPoints(null)
    setTraining(null)
    setScreen('home')
  }

  if (auth.role === 'coach') {
    return <Coach responses={responses} profiles={profiles} activeProfilesToday={activeProfilesToday} code={auth.code} loading={loading} onLogout={logout} onClear={async () => {
      await apiRequest('/api/responses', auth.code, { method: 'DELETE' })
      setResponses([])
    }} />
  }

  return (
    <Shell profile={profile} onCommunity={() => setScreen('community')} onGoals={() => setScreen('goals')} onProfile={() => setScreen('profile')} onLogout={logout}>
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
        <Home responses={responses} profile={profile} points={points} training={training} workout={workout} workoutLocked={workoutLocked} activeProfilesToday={activeProfilesToday} onCommunity={() => setScreen('community')} onGoals={() => setScreen('goals')} onStart={() => {
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
              const [workoutData, activityData, pointsData, trainingData] = await Promise.all([apiRequest('/api/workouts', auth.code), apiRequest('/api/activity', auth.code), apiRequest('/api/points', auth.code), apiRequest('/api/training', auth.code)])
              setWorkout(workoutData.workout)
              setWorkoutLocked(workoutData.locked)
              setActiveProfilesToday(activityData.activeProfilesToday)
              setPoints(pointsData)
              setTraining(trainingData)
            }
            setScreen('thanks')
          }}
        />
      )}
      {screen === 'thanks' && <Thanks responses={responses} profile={profile} identified={identified} workout={workout} onDone={() => setScreen('home')} />}
      {screen === 'community' && <Community profile={profile} code={auth.code} points={points} onBack={() => setScreen('home')} onPointsChange={setPoints} />}
      {screen === 'goals' && <MyGoals code={auth.code} onBack={() => setScreen('home')} />}
      {screen === 'profile' && <MyProfile profile={profile} points={points} code={auth.code} onBack={() => setScreen('home')} onProfileLogout={async () => {
        await apiRequest('/api/profiles', auth.code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'logout' }) })
        setProfile(null)
        setPoints(null)
        setTraining(null)
        setScreen('account')
      }} />}
    </Shell>
  )
}

async function apiRequest(url, code, options = {}) {
  const result = await fetch(url, {
    ...options,
    headers: { ...options.headers, 'x-simkoll-code': code },
  })
  const data = await result.json().catch(() => ({}))
  if (!result.ok) throw new Error(data.error || 'Något gick fel. Försök igen.')
  return data
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

function Shell({ children, profile, onCommunity, onGoals, onProfile, onLogout }) {
  return (
    <main className="app-shell">
      <header><ClubBrand /><div className="header-actions">{profile && <button className="feed-link" onClick={onCommunity}>Peppflödet</button>}{profile && <button className="feed-link" onClick={onGoals}>Mina mål</button>}{profile && <button className="profile-chip" onClick={onProfile}><span>{profile.emoji}</span>{profile.displayName}</button>}<button className="text-button" onClick={onLogout}>Logga ut</button></div></header>
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

function Home({ responses, profile, points, training, workout, workoutLocked, activeProfilesToday, onCommunity, onGoals, onStart }) {
  const todayResponses = responses.filter((response) => dateKey(responseDate(response)) === todayKey())
  return (
    <div className="page-content home">
      <section className="mood-hero">
        <p className="eyebrow light">Idag i gruppen</p>
        <h1>Så här känns det</h1>
        <div className="emoji-cloud" aria-label={`${todayResponses.length} svar idag`}>
          {todayResponses.length ? todayResponses.map((response, index) => (
            <span key={response.id} style={{ '--delay': `${index * 40}ms` }}>
              {FEELINGS.find((item) => item.value === response.feeling)?.emoji}
            </span>
          )) : <p>Inga svar ännu – bli först!</p>}
        </div>
        <div className="response-count"><span><strong>{todayResponses.length}</strong> svar idag</span>{profile && <span className="active-count">● {activeProfilesToday} profiler inne idag</span>}</div>
      </section>

      {profile && <StartCard profile={profile} onStart={onStart} />}
      {profile && <WorkoutCard workout={workout} locked={workoutLocked} />}
      {profile && <RewardCard points={points} onCommunity={onCommunity} />}
      {profile && <WeeklySwimCard training={training} onOpen={onGoals} />}
      {!profile && <StartCard profile={profile} onStart={onStart} />}
    </div>
  )
}

function StartCard({ profile, onStart }) {
  return <section className="start-card"><div><p className="eyebrow">{profile ? `${profile.emoji} ${profile.displayName}` : 'Din tur'}</p><h2>Hur är läget?</h2><p>Det tar mindre än 20 sekunder.</p></div><button className="primary-button" onClick={onStart}>Checka in <span>→</span></button></section>
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
  return training?.sessions?.filter((item) => item.type === 'swim' && new Date(item.completedAt) >= start && new Date(item.completedAt) < end).length || 0
}

function WeeklySwimCard({ training, onOpen }) {
  const goal = currentSeasonGoal(training)
  if (!goal) return <section className="weekly-card empty-weekly"><span>🎯</span><div><strong>Sätt ditt eget simmål</strong><small>Hur många pass vill du simma per vecka?</small></div><button onClick={onOpen}>Skapa mål →</button></section>
  const completed = currentWeekSwims(training)
  return <section className="weekly-card"><div><p className="eyebrow">Mitt simmål den här veckan</p><h3>{completed} av {goal.target} simpass</h3><div className="session-dots">{Array.from({ length: goal.target }, (_, index) => <i className={index < completed ? 'done' : ''} key={index} />)}</div><small>Du har själv valt {goal.target} pass per vecka</small></div><button onClick={onOpen}>Följ upp →</button></section>
}

function RewardCard({ points, onCommunity }) {
  if (!points?.current) return null
  const remaining = points.next ? points.next.minPoints - points.total : 0
  const range = points.next ? points.next.minPoints - points.current.minPoints : 1
  const progress = points.next ? ((points.total - points.current.minPoints) / range) * 100 : 100
  return <section className="reward-card"><span>{points.current.emoji}</span><div><p className="eyebrow">Din nivå</p><h3>{points.current.name} · {points.total} poäng</h3><div className="reward-progress"><i style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} /></div><small>{points.next ? `${remaining} poäng till ${points.next.name}` : 'Du har nått högsta nivån!'}</small></div><button onClick={onCommunity}>Ge pepp →</button></section>
}

function WorkoutCard({ workout, locked }) {
  return (
    <section className={`workout-card ${workout ? '' : 'workout-empty'}`}>
      <div className="workout-label"><span>🏊</span><div><p className="eyebrow">Endast för profiler</p><h2>Dagens pass</h2></div></div>
      {locked ? <div className="locked-workout"><span>🔒</span><div><strong>Checka in för att se passet</strong><small>Du kan fortfarande välja att svara anonymt.</small></div></div> : workout ? <div className="workout-body"><h3>{workout.title}</h3><p>{workout.content}</p>{workout.note && <aside><strong>Från tränaren</strong>{workout.note}</aside>}</div> : <p className="empty">Tränaren har inte lagt upp något pass idag.</p>}
    </section>
  )
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
      onSuccess(data.profile || null)
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setLoading(false)
    }
  }

  const title = mode === 'create' ? 'Skapa din profil' : mode === 'reset' ? 'Välj en ny PIN' : 'Välkommen tillbaka'
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
  const [profiles, setProfiles] = useState([])
  const [feedView, setFeedView] = useState('group')
  const [sendMode, setSendMode] = useState('private')
  const [recipientId, setRecipientId] = useState('')
  const [templateKey, setTemplateKey] = useState('great_job')
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(true)

  const load = async () => {
    const [feed, directory] = await Promise.all([apiRequest('/api/community', code), apiRequest('/api/profiles?directory=true', code)])
    setItems(feed.items); setPrivateKudos(feed.privateKudos || []); setProfiles(directory.profiles); setLoading(false)
  }
  useEffect(() => { load().catch((error) => { setStatus(error.message); setLoading(false) }) }, [])

  const sendKudos = async (event) => {
    event.preventDefault(); setStatus('Skickar…')
    try {
      await apiRequest('/api/community', code, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: sendMode, recipientId, templateKey }),
      })
      const nextPoints = await apiRequest('/api/points', code)
      onPointsChange(nextPoints); setStatus('Peppen är skickad! +1 poäng'); setRecipientId(''); await load()
    } catch (error) { setStatus(error.message) }
  }

  return <div className="community-page"><button className="back-button" onClick={onBack}>← Tillbaka</button><div className="community-layout">
    <section className="feed-column"><div className="community-heading"><div><p className="eyebrow">Sundsvalls Simsällskap</p><h1>Peppflödet</h1></div>{points?.current && <span>{points.current.emoji} {points.total} p</span>}</div>
      <nav className="feed-tabs"><button className={feedView === 'group' ? 'active' : ''} onClick={() => setFeedView('group')}>Öppna kanalen</button><button className={feedView === 'private' ? 'active' : ''} onClick={() => setFeedView('private')}>Min privata pepp</button></nav>
      {loading ? <p className="empty">Hämtar flödet…</p> : feedView === 'group' ? (items.length ? <div className="feed-list">{items.map((item) => item.type === 'coach' ? <article className="feed-item coach-post" key={`post-${item.id}`}><span>📣</span><div><strong>Tränarna</strong><p>{item.content}</p><small>{formatFeedDate(item.createdAt)}</small></div></article> : <article className="feed-item kudos-post" key={`group-${item.id}`}><span>{item.sender.emoji}</span><div><strong>{item.sender.displayName} <b>→</b> hela gruppen</strong><p>{item.content}</p><small>{formatFeedDate(item.createdAt)}</small></div></article>)}</div> : <p className="empty">Den öppna kanalen är tom än så länge.</p>) : (privateKudos.length ? <div className="feed-list">{privateKudos.map((item) => <article className="feed-item private-post" key={`private-${item.id}`}><span>{item.sender.emoji}</span><div><strong>{item.sender.id === profile.id ? `Du → ${item.recipient.emoji} ${item.recipient.displayName}` : `${item.sender.displayName} → dig`}</strong><p>{item.content}</p><small>🔒 Privat · {formatFeedDate(item.createdAt)}</small></div></article>)}</div> : <p className="empty">Du har ingen privat pepp ännu.</p>)}
    </section>
    <aside className="kudos-panel"><p className="eyebrow">Sprid bra energi</p><h2>Skicka pepp</h2><p>Privat till en kompis eller öppet till hela gruppen. Två pepp per dag ger poäng.</p>
      <div className="send-mode"><button className={sendMode === 'private' ? 'active' : ''} onClick={() => { setSendMode('private'); setTemplateKey('great_job') }}>Privat</button><button className={sendMode === 'group' ? 'active' : ''} onClick={() => { setSendMode('group'); setTemplateKey('group_energy') }}>Hela gruppen</button></div>
      <form onSubmit={sendKudos}>{sendMode === 'private' && <label>Till<select required value={recipientId} onChange={(event) => setRecipientId(event.target.value)}><option value="">Välj simmare…</option>{profiles.map((item) => <option key={item.id} value={item.id}>{item.emoji} {item.displayName}</option>)}</select></label>}<label>Hälsning<select value={templateKey} onChange={(event) => setTemplateKey(event.target.value)}>{(sendMode === 'private' ? KUDOS_OPTIONS : GROUP_PEP_OPTIONS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><button className="primary-button">Skicka pepp →</button>{status && <small className="kudos-status">{status}</small>}</form>
    </aside>
  </div></div>
}

function formatFeedDate(value) {
  const date = new Date(value)
  const isToday = dateKey(date) === todayKey()
  return isToday ? `Idag ${date.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}` : date.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })
}

const GOAL_STATUS = { planned: 'Planerat', active: 'Pågår', paused: 'Pausat', complete: 'Klart' }

function MyGoals({ code, onBack }) {
  const [goals, setGoals] = useState([])
  const [training, setTraining] = useState(null)
  const [loading, setLoading] = useState(true)
  const [reflection, setReflection] = useState({})
  const [seasonForm, setSeasonForm] = useState({ title: 'Mitt höstmål', target: 4, startDate: localDateValue(), endDate: `${new Date().getFullYear()}-12-20`, reflection: '' })
  const load = () => Promise.all([apiRequest('/api/goals', code), apiRequest('/api/training', code)]).then(([goalData, trainingData]) => { setGoals(goalData.goals); setTraining(trainingData) }).finally(() => setLoading(false))
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

function MyProfile({ profile, points, code, onBack, onProfileLogout }) {
  const [responses, setResponses] = useState([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    apiRequest('/api/responses?mine=true', code).then((data) => setResponses(data.responses)).finally(() => setLoading(false))
  }, [code])
  return (
    <div className="my-profile-page">
      <button className="back-button" onClick={onBack}>← Tillbaka</button>
      <section className="profile-summary"><span>{profile.emoji}</span><div><p className="eyebrow">Min profil</p><h1>{profile.displayName}</h1><small>@{profile.username}</small></div>{points?.current && <div className="profile-level"><b>{points.current.emoji} {points.current.name}</b><span>{points.total} poäng</span></div>}</section>
      <section className="my-history">
        <div><h2>Min historik</h2><small>Endast svar du valde att koppla till profilen</small></div>
        {loading ? <p className="empty">Hämtar…</p> : responses.length ? responses.map((item) => <article key={item.id}><span>{FEELINGS[item.feeling - 1]?.emoji}</span><div><strong>{new Date(item.createdAt).toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'short' })}</strong><small>{DAY_TYPES.find((type) => type.value === item.type)?.title}</small></div>{item.rpe && <b>RPE {item.rpe}</b>}</article>) : <p className="empty">Inga profilsvar ännu.</p>}
      </section>
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
            <button key={type.value} className="choice-card" onClick={() => { setForm((current) => ({ ...current, type: type.value, registerTraining: hasProfile && type.value === 'after' })); next() }}>
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
            {hasProfile && form.type === 'after' && <label className="training-toggle"><input type="checkbox" checked={form.registerTraining === true} onChange={(event) => update('registerTraining', event.target.checked)} /><span><strong>Registrera som simpass</strong><small>Läggs i din personliga veckoräknare. Feedbacken kan fortfarande vara anonym.</small></span></label>}
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
  return [
    { key: 'energy', title: 'Hur mycket energi har du?', hint: 'Gå på känslan just nu.', kind: 'scale', count: 5, left: 'Ingen energi', right: 'Full fart' },
    { key: 'body', title: 'Hur känns kroppen?', hint: '1 är tung eller öm. 5 är pigg och fräsch.', kind: 'scale', count: 5, left: 'Tung', right: 'Pigg' },
    { key: 'sleep', title: 'Hur sov du?', hint: 'Tänk på natten som helhet.', kind: 'scale', count: 5, left: 'Dåligt', right: 'Jättebra' },
    comment,
  ]
}

function Thanks({ responses, profile, identified, workout, onDone }) {
  const todayResponses = responses.filter((response) => dateKey(responseDate(response)) === todayKey())
  return (
    <div className="thanks-page">
      <div className="success-mark">✓</div>
      <p className="eyebrow">Klart</p>
      <h1>Tack för din check-in!</h1>
      <p>{identified ? 'Svaret har sparats i din profil.' : 'Svaret är anonymt och hjälper tränaren att göra passen bättre.'}</p>
      {profile && workout && <p className="unlock-message">🔓 Dagens pass är upplåst!</p>}
      <div className="mini-moods">{todayResponses.slice(-7).map((response) => <span key={response.id}>{FEELINGS[response.feeling - 1]?.emoji}</span>)}</div>
      <button className="primary-button" onClick={onDone}>{profile && workout ? 'Se dagens pass →' : 'Till dagens läge →'}</button>
    </div>
  )
}

function Coach({ responses, profiles, activeProfilesToday, code, loading, onLogout, onClear }) {
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
        <div className="coach-heading"><div><p className="eyebrow">Tränaröversikt</p><h1>Gruppens läge</h1></div><div className="usage-summary"><strong>{activeProfilesToday}</strong><span>aktiva profiler idag</span><b>·</b><strong>{todayResponses.length}</strong><span>incheckningar</span></div></div>
        <nav className="coach-tabs" aria-label="Välj tidsperiod">
          <button className={view === 'today' ? 'active' : ''} onClick={() => setView('today')}>Idag</button>
          <button className={view === 'week' ? 'active' : ''} onClick={() => setView('week')}>Förra veckan</button>
          <button className={view === 'history' ? 'active' : ''} onClick={() => setView('history')}>Historik</button>
          <button className={view === 'swimmers' ? 'active' : ''} onClick={() => setView('swimmers')}>Simmare</button>
          <button className={view === 'workout' ? 'active' : ''} onClick={() => setView('workout')}>Dagens pass</button>
          <button className={view === 'community' ? 'active' : ''} onClick={() => setView('community')}>Klubbflöde</button>
          <button className={view === 'goals' ? 'active' : ''} onClick={() => setView('goals')}>Utvecklingsmål</button>
          <button className={view === 'programs' ? 'active' : ''} onClick={() => setView('programs')}>Träningsprogram</button>
        </nav>

        {loading ? <section className="empty-period"><span>≈</span><h2>Hämtar svar…</h2></section> : view === 'programs' ? (
          <CoachPrograms code={code} profiles={profiles} />
        ) : view === 'goals' ? (
          <CoachGoals code={code} profiles={profiles} />
        ) : view === 'community' ? (
          <CoachCommunity code={code} />
        ) : view === 'workout' ? (
          <WorkoutEditor code={code} />
        ) : view === 'swimmers' ? (
          <Swimmers profiles={profiles} responses={responses} code={code} />
        ) : view === 'history' ? (
          <History responses={responses} />
        ) : (
          <PeriodOverview
            responses={scopedResponses}
            title={view === 'today' ? 'Idag' : 'Förra veckan'}
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

function CoachCommunity({ code }) {
  const [content, setContent] = useState('')
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const load = () => apiRequest('/api/community', code).then((data) => setItems(data.items)).finally(() => setLoading(false))
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
  return <section className="coach-community"><div className="period-heading"><div><p className="eyebrow">Syns för alla profiler</p><h2>Klubbflödet</h2></div></div><form onSubmit={publish}><textarea required maxLength="1000" placeholder="Skriv ett meddelande till gruppen…" value={content} onChange={(event) => setContent(event.target.value)} /><div><small>{content.length}/1000</small><button className="primary-button" disabled={loading}>Publicera →</button></div></form><div className="coach-feed">{items.map((item) => <article key={`${item.type}-${item.id}`}><span>{item.type === 'coach' ? '📣' : item.sender?.emoji}</span><div><strong>{item.type === 'coach' ? 'Tränarna' : `${item.sender?.displayName} → hela gruppen`}</strong><p>{item.content}</p><small>{formatFeedDate(item.createdAt)}</small></div>{item.type === 'coach' && <button onClick={() => remove(item.id)}>Ta bort</button>}</article>)}</div></section>
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

function Swimmers({ profiles, responses, code }) {
  const [reset, setReset] = useState(null)
  const createReset = async (profile) => {
    try {
      const data = await apiRequest('/api/profiles', code, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create-reset', profileId: profile.id }),
      })
      setReset({ profile, code: data.resetCode })
    } catch (error) { window.alert(error.message) }
  }

  return (
    <section className="swimmers-section">
      <div className="period-heading"><div><p className="eyebrow">Frivilliga profiler</p><h2>Simmare</h2></div><div className="big-count"><strong>{profiles.length}</strong><span>profiler</span></div></div>
      {reset && <div className="reset-banner"><span>{reset.profile.emoji}</span><div><small>Engångskod för {reset.profile.displayName} · giltig 30 minuter</small><strong>{reset.code}</strong></div><button onClick={() => setReset(null)}>×</button></div>}
      {profiles.length ? <div className="swimmer-grid">{profiles.map((profile) => {
        const items = responses.filter((item) => item.profileId === profile.id)
        const after = items.filter((item) => item.type === 'after')
        return <article key={profile.id} className="swimmer-card">
          <div className="swimmer-name"><span>{profile.emoji}</span><div><strong>{profile.displayName}</strong><small>@{profile.username}</small></div></div>
          <div className="swimmer-stats"><div><strong>{items.length}</strong><small>svar</small></div><div><strong>{average('feeling', items)}</strong><small>känsla</small></div><div><strong>{average('rpe', after)}</strong><small>RPE</small></div></div>
          {items.length > 0 && <details className="swimmer-details"><summary>Visa senaste svar</summary>{items.slice(0, 5).map((item) => <div key={item.id}><span>{FEELINGS[item.feeling - 1]?.emoji}</span><p><strong>{new Date(item.createdAt).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })}</strong><small>{item.rpe ? `RPE ${item.rpe}` : DAY_TYPES.find((type) => type.value === item.type)?.title}{item.comment ? ` · “${item.comment}”` : ''}</small></p></div>)}</details>}
          <button onClick={() => createReset(profile)}>Skapa återställningskod</button>
        </article>
      })}</div> : <EmptyPeriod title="Inga profiler ännu" periodLabel="Simmare" />}
    </section>
  )
}

function PeriodOverview({ responses, title, periodLabel, showDays }) {
  const after = responses.filter((item) => item.type === 'after')
  const distribution = useMemo(() => FEELINGS.map((feeling) => ({
    ...feeling,
    count: responses.filter((item) => item.feeling === feeling.value).length,
  })), [responses])

  if (!responses.length) {
    return <EmptyPeriod title={title} periodLabel={periodLabel} />
  }

  return (
    <>
      <div className="period-heading"><div><p className="eyebrow">{periodLabel}</p><h2>{title}</h2></div><div className="big-count"><strong>{responses.length}</strong><span>anonyma svar</span></div></div>
      <section className="stats-grid">
        <Stat title="Gruppens känsla" value={`${average('feeling', responses)} / 5`} note="Alla svar" />
        <Stat title="Upplevd ansträngning" value={`${average('rpe', after)} / 10`} note={`${after.length} efter passet`} />
        <Stat title="Passet" value={`${average('pass', after)} / 5`} note="Simmarnas betyg" />
        <Stat title="Upplägget" value={`${average('setup', after)} / 5`} note="Hur det fungerade" />
      </section>

      {showDays && <WeekDays responses={responses} />}

      <section className="coach-card">
        <div className="section-heading"><div><p className="eyebrow">Överblick</p><h2>Så känns det i gruppen</h2></div></div>
        <div className="distribution">
          {distribution.map((item) => (
            <div key={item.value}><span className="dist-emoji">{item.emoji}</span><div className="bar-track"><span style={{ height: `${Math.max(8, (item.count / responses.length) * 100)}%` }} /></div><strong>{item.count}</strong><small>{item.label}</small></div>
          ))}
        </div>
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

function Stat({ title, value, note }) {
  return <article className="stat"><span>{title}</span><strong>{value}</strong><small>{note}</small></article>
}

createRoot(document.getElementById('root')).render(<App />)
