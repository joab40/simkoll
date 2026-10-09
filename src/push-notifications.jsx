import React, { useEffect, useRef, useState } from 'react'

async function pushApi(code, body) {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 10000)
  try {
    const response = await fetch('/api/notifications?push=true', { signal: controller.signal, headers: { 'x-simkoll-code': code, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}) })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || 'Kunde inte uppdatera pushnotiser.')
    return data
  } finally { window.clearTimeout(timeout) }
}

const optInKey = (owner) => `simkoll-push-opt-in:${owner}`
const prefsKey = (owner) => `simkoll-push-preferences:${owner}`
const readLocal = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback } catch { return fallback } }
const writeLocal = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)) } catch {} }
const supported = () => window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
const needsHomeScreen = () => (/iPad|iPhone|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1)) && !window.matchMedia('(display-mode: standalone)').matches && !navigator.standalone
let workerPromise
let deviceOperation = Promise.resolve()
function withDeviceLock(operation) {
  const next = deviceOperation.then(operation)
  deviceOperation = next.catch(() => {})
  return next
}
function worker() {
  if (!workerPromise) workerPromise = navigator.serviceWorker.register('/sw.js').then(() => navigator.serviceWorker.ready).catch((error) => { workerPromise = null; throw error })
  return workerPromise
}
function applicationKey(value) {
  const bytes = atob(value.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(bytes, (char) => char.charCodeAt(0))
}

export async function stopDevicePush(code) {
  if (!('serviceWorker' in navigator)) return
  return withDeviceLock(async () => {
    const registration = await navigator.serviceWorker.getRegistration('/')
    const subscription = await registration?.pushManager?.getSubscription()
    if (!subscription) return
    // Invalidate at the browser even if a server session has expired.
    await subscription.unsubscribe()
    try { await pushApi(code, { action: 'push-unsubscribe', endpoint: subscription.endpoint }) } catch {}
  })
}

export function usePushSession(auth, profile, onOpen) {
  const latestOpen = useRef(onOpen)
  latestOpen.current = onOpen
  const [entry, setEntry] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    return params.has('push') ? { screen: params.get('push'), ownerKey: params.get('pushOwner') } : null
  })
  useEffect(() => {
    const handler = (event) => { if (event.data?.type === 'simkoll-push-open') setEntry(event.data) }
    navigator.serviceWorker?.addEventListener('message', handler)
    return () => navigator.serviceWorker?.removeEventListener('message', handler)
  }, [])
  useEffect(() => {
    if (!supported() || !auth || (auth.role === 'swimmer' && !profile?.termsAccepted)) return
    if (auth.role !== 'swimmer' && !auth.code?.startsWith('coach.')) return
    let cancelled = false
    async function sync() {
      const config = await pushApi(auth.code)
      if (cancelled) return
      if (entry && config.ownerKey === entry.ownerKey) {
        latestOpen.current(entry.screen)
        setEntry(null)
        const url = new URL(window.location.href)
        url.searchParams.delete('push'); url.searchParams.delete('pushOwner')
        history.replaceState(null, '', url)
      }
      await withDeviceLock(async () => {
        if (cancelled) return
        const registration = await worker()
        let subscription = await registration.pushManager.getSubscription()
        const optedIn = readLocal(optInKey(config.ownerKey), false)
        if (!optedIn) {
          // A different account using this browser must not receive the previous
          // account's private alerts. No permission prompt is shown automatically.
          if (subscription) await subscription.unsubscribe()
          return
        }
        if (!config.settings.enabled || !config.configured || !config.databaseReady || Notification.permission !== 'granted' || cancelled) return
        subscription ||= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: applicationKey(config.publicKey) })
        if (cancelled) return
        await pushApi(auth.code, { action: 'push-subscribe', subscription: subscription.toJSON(), preferences: readLocal(prefsKey(config.ownerKey), { coachMessages: true, privateMessages: true }) })
      })
    }
    sync().catch(() => {})
    return () => { cancelled = true }
  }, [auth?.code, profile?.id, profile?.termsAccepted, entry])
}

export function PushNotificationControl({ code, compact = false }) {
  const [config, setConfig] = useState(null)
  const [subscribed, setSubscribed] = useState(false)
  const [preferences, setPreferences] = useState({ coachMessages: true, privateMessages: true })
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const canPush = supported()
  const homeScreen = needsHomeScreen()
  useEffect(() => {
    let active = true
    async function load() {
      const next = await pushApi(code)
      if (!active) return
      setPreferences(readLocal(prefsKey(next.ownerKey), { coachMessages: true, privateMessages: true }))
      if (!canPush || !next.databaseReady) { setConfig(next); return }
      const registration = await worker()
      const subscription = await registration.pushManager.getSubscription()
      if (!subscription) { if (active) setConfig(next); return }
      const state = await pushApi(code, { action: 'push-status', endpoint: subscription.endpoint })
      if (active) { setConfig(next); setSubscribed(state.subscribed); if (state.preferences) setPreferences(state.preferences) }
    }
    load().catch((error) => { if (active) setStatus(error.message) })
    return () => { active = false }
  }, [code])
  const enable = async () => {
    if (!config || busy) return
    setBusy(true); setStatus('')
    // Request permission immediately from the click, before awaiting anything.
    try {
      const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission()
      if (permission !== 'granted') { setStatus('Notiser tilläts inte. Du kan ändra det i telefonens eller webbläsarens inställningar.'); return }
      await withDeviceLock(async () => {
        const registration = await worker()
        const subscription = await registration.pushManager.getSubscription() || await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: applicationKey(config.publicKey) })
        await pushApi(code, { action: 'push-subscribe', subscription: subscription.toJSON(), preferences })
        writeLocal(optInKey(config.ownerKey), true); writeLocal(prefsKey(config.ownerKey), preferences)
        setSubscribed(true); setStatus('Klart! Du får nu meddelanden som pushnotiser på den här enheten.')
      })
    } catch (error) { setStatus(error.message) } finally { setBusy(false) }
  }
  const disable = async () => {
    setBusy(true)
    try { await stopDevicePush(code); writeLocal(optInKey(config.ownerKey), false); setSubscribed(false); setStatus('Notiser är avstängda på den här enheten.') }
    catch (error) { setStatus(error.message) } finally { setBusy(false) }
  }
  const updatePreference = async (key, value) => {
    const next = { ...preferences, [key]: value }
    setBusy(true); setStatus('')
    try {
      const subscription = await (await worker()).pushManager.getSubscription()
      if (!subscription) throw new Error('Aktivera notiser igen för att uppdatera dina val.')
      await pushApi(code, { action: 'push-subscribe', subscription: subscription.toJSON(), preferences: next })
      writeLocal(prefsKey(config.ownerKey), next); setPreferences(next)
    } catch (error) { setStatus(error.message) } finally { setBusy(false) }
  }
  const test = async () => {
    setBusy(true); setStatus('')
    try { const subscription = await (await worker()).pushManager.getSubscription(); await pushApi(code, { action: 'push-test', endpoint: subscription?.endpoint }); setStatus('Testnotisen har skickats. Kontrollera telefonens notiser.') }
    catch (error) { setStatus(error.message) } finally { setBusy(false) }
  }
  if (compact && (!config?.settings.enabled || !config?.configured || !config.databaseReady || subscribed || (canPush && Notification.permission === 'denied'))) return null
  return <section className={`settings-card push-device-card${compact ? ' compact' : ''}`}>
    <div className="push-card-title"><span aria-hidden="true">🔔</span><div><h2>Notiser på din enhet</h2><p>Få besked när tränarna skriver eller när du får privata meddelanden.</p></div>{subscribed && <small className="push-status-badge">Aktiva</small>}</div>
    {homeScreen ? <p className="push-install-help">På iPhone och iPad: öppna Simkoll i Safari, tryck Dela → Lägg till på hemskärmen. Öppna sedan appen från den nya ikonen och aktivera notiser här. Kräver iOS/iPadOS 16.4 eller senare.</p> : !canPush ? <p>Den här webbläsaren stöder inte pushnotiser. Prova Simkoll i Chrome på Android eller via hemskärmen på iPhone.</p> : !config ? <p role="status">{status || 'Hämtar notisinställningar…'}</p> : !config.settings.enabled ? <p>Klubben har inte aktiverat pushnotiser ännu.</p> : !config.configured || !config.databaseReady ? <p>Pushnotiser förbereds av klubbens administratör.</p> : <>
      {subscribed && !compact && <div className="push-preferences">{[['coachMessages', 'Info från tränarna'], ['privateMessages', 'Privata meddelanden']].map(([key, label]) => <label className="settings-toggle-row" key={key}><span>{label}</span><input type="checkbox" checked={preferences[key]} disabled={busy} onChange={(event) => updatePreference(key, event.target.checked)} /></label>)}</div>}
      <div className="settings-actions">{subscribed ? <><button type="button" className="secondary-button" onClick={test} disabled={busy}>Skicka testnotis</button><button type="button" className="text-button" onClick={disable} disabled={busy}>Stäng av på enheten</button></> : <button type="button" className="primary-button" onClick={enable} disabled={busy || Notification.permission === 'denied'}>{busy ? 'Aktiverar…' : 'Aktivera notiser'}</button>}</div>
      {Notification.permission === 'denied' && <p>Tillåt notiser för Simkoll i enhetens eller webbläsarens inställningar för att aktivera dem igen.</p>}
    </>}
    {config && status && <p className="push-feedback" role="status">{status}</p>}
    {subscribed && config && !config.settings.enabled && <button type="button" className="text-button" onClick={disable} disabled={busy}>Stäng av på enheten</button>}
    {!compact && <small>Valet gäller den här enheten. Meddelandetext visas först när du öppnar Simkoll.</small>}
    {!compact && config?.canViewUsers && <PushUserList code={code} />}
  </section>
}

function PushUserList({ code }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const renderUsers = (title, users, emojiFor) => users.length > 0 && <><h3>{title}</h3><ul>{users.map((user, index) => <li key={`${user.name}-${user.role || user.group}-${index}`}><span>{emojiFor(user)} {user.name}{user.group && <small>{user.group}</small>}</span><small className={user.active ? 'push-user-enabled' : 'push-user-disabled'}>{user.active ? `Push aktiv · ${user.devices} ${user.devices === 1 ? 'enhet' : 'enheter'}` : 'Ingen aktiv enhet registrerad'}</small></li>)}</ul></>
  const load = async () => {
    setOpen(true)
    if (data || loading) return
    setLoading(true); setError('')
    try { setData(await pushApi(code, { action: 'push-users' })) }
    catch (reason) { setError(reason.message) }
    finally { setLoading(false) }
  }
  return <section className="push-users">
    <button type="button" className="push-users-toggle" aria-expanded={open} onClick={() => open ? setOpen(false) : load()}>
      <span><strong>Användare med aktiva pushnotiser</strong><small>Visa simmare och tränare som har minst en ansluten enhet</small></span><span aria-hidden="true">{open ? '−' : '+'}</span>
    </button>
    {open && <div className="push-users-content" aria-live="polite">{loading ? <p>Hämtar listan…</p> : error ? <p role="alert">{error} <button type="button" className="text-button" onClick={() => { setData(null); load() }}>Försök igen</button></p> : <>
      <p className="push-users-note">Listan omfattar aktiva konton. En användare kan ha flera enheter. ”Ingen aktiv enhet registrerad” betyder att Simkoll inte har en aktuell prenumeration för kontot; den kan också ha gått ut eller tagits bort.</p>
      {renderUsers(`Simmare · ${data?.swimmers?.filter((user) => user.active).length || 0} av ${data?.swimmers?.length || 0} med aktiv enhet`, data?.swimmers || [], (user) => user.emoji)}
      {renderUsers(`Tränare · ${data?.coaches?.filter((user) => user.active).length || 0} av ${data?.coaches?.length || 0} med aktiv enhet`, data?.coaches || [], () => '🧑‍🏫')}
      {!data?.swimmers?.length && !data?.coaches?.length && <p>Ingen har en aktiv enhet registrerad ännu.</p>}
    </>}</div>}
  </section>
}

export function PushAdminSettings({ code }) {
  const [config, setConfig] = useState(null)
  const [settings, setSettings] = useState({ enabled: false, coachMessages: true, privateMessages: true })
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { pushApi(code).then((data) => { setConfig(data); setSettings(data.settings) }).catch((error) => setStatus(error.message)) }, [code])
  const save = async () => {
    setBusy(true); setStatus('')
    try { const data = await pushApi(code, { action: 'push-settings', settings }); setSettings(data.settings); setStatus('Klubbens pushinställningar är sparade.') }
    catch (error) { setStatus(error.message) } finally { setBusy(false) }
  }
  return <section className="settings-card push-admin-card"><div className="push-card-title"><span aria-hidden="true">🔔</span><div><h2>Pushnotiser</h2><p>Skicka notiser till användare som själva har godkänt dem på sin telefon.</p></div></div>
    {config && <><p className="settings-note">{config.configured ? 'Pushnycklar: klara' : 'Pushnycklar: behöver konfigureras'} · {config.databaseReady ? `Databas: klar · ${config.deviceCount || 0} anslutna enheter` : 'Databas: uppdatering 078 behövs'}</p>
      {[['enabled', 'Aktivera push för klubben'], ['coachMessages', 'Meddelanden från tränarna'], ['privateMessages', 'Privata meddelanden och frågor till tränarna']].map(([key, label]) => <label className="settings-toggle-row" key={key}><span><strong>{label}</strong></span><input type="checkbox" checked={settings[key]} disabled={busy || (key === 'enabled' && (!config.configured || !config.databaseReady))} onChange={(event) => setSettings((current) => ({ ...current, [key]: event.target.checked }))} /></label>)}
      <p className="settings-help">iPhone: Simkoll måste öppnas som webbapp från hemskärmen. Android: fungerar i webbläsare med stöd för Web Push. Användaren aktiverar själv under sin profil eller Notiser på min enhet i tränarmenyn. Reaktioner och öppna peppinlägg ger inga pushnotiser.</p>
      <button type="button" className="primary-button" onClick={save} disabled={busy}>{busy ? 'Sparar…' : 'Spara pushinställningar'}</button></>}
    {status && <p className="push-feedback" role="status">{status}</p>}
    <small className="settings-note">Klubbens pushinställningar: endast superadmin</small>
    {config?.canViewUsers && <PushUserList code={code} />}
  </section>
}
