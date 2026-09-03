import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'

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
  const [identified, setIdentified] = useState(false)
  const [loading, setLoading] = useState(false)
  const [screen, setScreen] = useState('home')

  useEffect(() => {
    if (!auth) return
    setLoading(true)
    Promise.all([
      fetchResponses(auth.code),
      auth.role === 'coach' ? apiRequest('/api/profiles', auth.code).then((data) => data.profiles) : Promise.resolve([]),
    ])
      .then(([nextResponses, nextProfiles]) => { setResponses(nextResponses); setProfiles(nextProfiles) })
      .catch((error) => window.alert(error.message))
      .finally(() => setLoading(false))
  }, [auth])

  useEffect(() => {
    if (!auth || !profile) { setWorkout(null); return }
    apiRequest('/api/workouts', auth.code).then((data) => setWorkout(data.workout)).catch(() => setWorkout(null))
  }, [auth, profile])

  if (!auth) return <Login onLogin={(nextAuth) => { setAuth(nextAuth); setScreen(nextAuth.role === 'swimmer' ? 'account' : 'home') }} />

  const logout = () => {
    setAuth(null)
    setProfile(null)
    setResponses([])
    setProfiles([])
    setWorkout(null)
    setScreen('home')
  }

  if (auth.role === 'coach') {
    return <Coach responses={responses} profiles={profiles} code={auth.code} loading={loading} onLogout={logout} onClear={async () => {
      await apiRequest('/api/responses', auth.code, { method: 'DELETE' })
      setResponses([])
    }} />
  }

  return (
    <Shell profile={profile} onProfile={() => setScreen('profile')} onLogout={logout}>
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
        <Home responses={responses} profile={profile} workout={workout} onStart={() => {
          if (profile) setScreen('privacy-choice')
          else { setIdentified(false); setScreen('checkin') }
        }} />
      )}
      {screen === 'privacy-choice' && <PrivacyChoice profile={profile} onBack={() => setScreen('home')} onChoose={(value) => { setIdentified(value); setScreen('checkin') }} />}
      {screen === 'checkin' && (
        <CheckIn
          onBack={() => setScreen('home')}
          onSubmit={async (response) => {
            const result = await apiRequest('/api/responses', auth.code, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ...response, identified }),
            })
            setResponses((current) => [...current, result.response])
            setScreen('thanks')
          }}
        />
      )}
      {screen === 'thanks' && <Thanks responses={responses} onDone={() => setScreen('home')} />}
      {screen === 'profile' && <MyProfile profile={profile} code={auth.code} onBack={() => setScreen('home')} onProfileLogout={async () => {
        await apiRequest('/api/profiles', auth.code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'logout' }) })
        setProfile(null)
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
      onLogin({ role: data.role, code })
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

function Shell({ children, profile, onProfile, onLogout }) {
  return (
    <main className="app-shell">
      <header><ClubBrand /><div className="header-actions">{profile && <button className="profile-chip" onClick={onProfile}><span>{profile.emoji}</span>{profile.displayName}</button>}<button className="text-button" onClick={onLogout}>Logga ut</button></div></header>
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

function Home({ responses, profile, workout, onStart }) {
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
        <div className="response-count"><strong>{todayResponses.length}</strong> anonyma svar idag</div>
      </section>

      {profile && <WorkoutCard workout={workout} />}

      <section className="start-card">
        <div>
          <p className="eyebrow">{profile ? `${profile.emoji} ${profile.displayName}` : 'Din tur'}</p>
          <h2>Hur är läget?</h2>
          <p>Det tar mindre än 20 sekunder.</p>
        </div>
        <button className="primary-button" onClick={onStart}>Checka in <span>→</span></button>
      </section>
    </div>
  )
}

function WorkoutCard({ workout }) {
  return (
    <section className={`workout-card ${workout ? '' : 'workout-empty'}`}>
      <div className="workout-label"><span>🏊</span><div><p className="eyebrow">Endast för profiler</p><h2>Dagens pass</h2></div></div>
      {workout ? <div className="workout-body"><h3>{workout.title}</h3><p>{workout.content}</p>{workout.note && <aside><strong>Från tränaren</strong>{workout.note}</aside>}</div> : <p className="empty">Tränaren har inte lagt upp något pass idag.</p>}
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

function MyProfile({ profile, code, onBack, onProfileLogout }) {
  const [responses, setResponses] = useState([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    apiRequest('/api/responses?mine=true', code).then((data) => setResponses(data.responses)).finally(() => setLoading(false))
  }, [code])
  return (
    <div className="my-profile-page">
      <button className="back-button" onClick={onBack}>← Tillbaka</button>
      <section className="profile-summary"><span>{profile.emoji}</span><div><p className="eyebrow">Min profil</p><h1>{profile.displayName}</h1><small>@{profile.username}</small></div></section>
      <section className="my-history">
        <div><h2>Min historik</h2><small>Endast svar du valde att koppla till profilen</small></div>
        {loading ? <p className="empty">Hämtar…</p> : responses.length ? responses.map((item) => <article key={item.id}><span>{FEELINGS[item.feeling - 1]?.emoji}</span><div><strong>{new Date(item.createdAt).toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'short' })}</strong><small>{DAY_TYPES.find((type) => type.value === item.type)?.title}</small></div>{item.rpe && <b>RPE {item.rpe}</b>}</article>) : <p className="empty">Inga profilsvar ännu.</p>}
      </section>
      <button className="profile-logout" onClick={onProfileLogout}>Logga ut från profilen</button>
    </div>
  )
}

function CheckIn({ onBack, onSubmit }) {
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
            <button key={type.value} className="choice-card" onClick={() => { update('type', type.value); next() }}>
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

function Thanks({ responses, onDone }) {
  const todayResponses = responses.filter((response) => dateKey(responseDate(response)) === todayKey())
  return (
    <div className="thanks-page">
      <div className="success-mark">✓</div>
      <p className="eyebrow">Klart</p>
      <h1>Tack för din check-in!</h1>
      <p>Svaret är anonymt och hjälper tränaren att göra passen bättre.</p>
      <div className="mini-moods">{todayResponses.slice(-7).map((response) => <span key={response.id}>{FEELINGS[response.feeling - 1]?.emoji}</span>)}</div>
      <button className="primary-button" onClick={onDone}>Till dagens läge →</button>
    </div>
  )
}

function Coach({ responses, profiles, code, loading, onLogout, onClear }) {
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
        <div className="coach-heading"><div><p className="eyebrow">Tränaröversikt</p><h1>Gruppens läge</h1></div></div>
        <nav className="coach-tabs" aria-label="Välj tidsperiod">
          <button className={view === 'today' ? 'active' : ''} onClick={() => setView('today')}>Idag</button>
          <button className={view === 'week' ? 'active' : ''} onClick={() => setView('week')}>Förra veckan</button>
          <button className={view === 'history' ? 'active' : ''} onClick={() => setView('history')}>Historik</button>
          <button className={view === 'swimmers' ? 'active' : ''} onClick={() => setView('swimmers')}>Simmare</button>
          <button className={view === 'workout' ? 'active' : ''} onClick={() => setView('workout')}>Dagens pass</button>
        </nav>

        {loading ? <section className="empty-period"><span>≈</span><h2>Hämtar svar…</h2></section> : view === 'workout' ? (
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
          if (!window.confirm('Vill du radera alla svar permanent?')) return
          try { await onClear() } catch (error) { window.alert(error.message) }
        }}>Radera alla svar</button>
      </div>
    </main>
  )
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
    if (!window.confirm('Vill du ta bort passet för det här datumet?')) return
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
