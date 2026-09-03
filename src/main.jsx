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
  const [responses, setResponses] = useState([])
  const [loading, setLoading] = useState(false)
  const [screen, setScreen] = useState('home')

  useEffect(() => {
    if (!auth) return
    setLoading(true)
    fetchResponses(auth.code)
      .then(setResponses)
      .catch((error) => window.alert(error.message))
      .finally(() => setLoading(false))
  }, [auth])

  if (!auth) return <Login onLogin={setAuth} />

  const logout = () => {
    setAuth(null)
    setResponses([])
    setScreen('home')
  }

  if (auth.role === 'coach') {
    return <Coach responses={responses} loading={loading} onLogout={logout} onClear={async () => {
      await apiRequest('/api/responses', auth.code, { method: 'DELETE' })
      setResponses([])
    }} />
  }

  return (
    <Shell onLogout={logout}>
      {screen === 'home' && (
        <Home responses={responses} onStart={() => setScreen('checkin')} />
      )}
      {screen === 'checkin' && (
        <CheckIn
          onBack={() => setScreen('home')}
          onSubmit={async (response) => {
            const result = await apiRequest('/api/responses', auth.code, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(response),
            })
            setResponses((current) => [...current, result.response])
            setScreen('thanks')
          }}
        />
      )}
      {screen === 'thanks' && <Thanks responses={responses} onDone={() => setScreen('home')} />}
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

function Shell({ children, onLogout }) {
  return (
    <main className="app-shell">
      <header><ClubBrand /><button className="text-button" onClick={onLogout}>Logga ut</button></header>
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

function Home({ responses, onStart }) {
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

      <section className="start-card">
        <div>
          <p className="eyebrow">Din tur</p>
          <h2>Hur är läget?</h2>
          <p>Det tar mindre än 20 sekunder.</p>
        </div>
        <button className="primary-button" onClick={onStart}>Checka in <span>→</span></button>
      </section>
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

function Coach({ responses, loading, onLogout, onClear }) {
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
        </nav>

        {loading ? <section className="empty-period"><span>≈</span><h2>Hämtar svar…</h2></section> : view === 'history' ? (
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
