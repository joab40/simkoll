import React, { useEffect, useState } from 'react'
import { apiRequest } from './api-request.js'
import './drive-settings.css'

export default function DriveSettings({ code }) {
  const [config, setConfig] = useState(null), [form, setForm] = useState(null)
  const [verified, setVerified] = useState({}), [busy, setBusy] = useState('load'), [error, setError] = useState(''), [saved, setSaved] = useState(false), [retry, setRetry] = useState(0)
  useEffect(() => {
    let active = true
    setBusy('load'); setError('')
    apiRequest('/api/workouts?driveSettings=true', code).then(data => { if (active) { setConfig(data); setForm(data.settings); setVerified({}); setSaved(false) } }).catch(error => { if (active) setError(error.message) }).finally(() => { if (active) setBusy('') })
    return () => { active = false }
  }, [code, retry])
  const change = patch => { setForm(current => ({ ...current, ...patch })); setVerified({}); setSaved(false); setError('') }
  const folderFor = purpose => purpose === 'workout' || form.useWorkoutFolder ? form.workoutFolderId || config.fallbackWorkoutFolder.id : form.planningFolderId
  const post = (action, body) => apiRequest('/api/workouts', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...body }) })
  const test = async purpose => {
    setBusy(purpose); setError(''); setSaved(false)
    setVerified(current => ({ ...current, [purpose]: null }))
    try {
      const data = await post('test-drive-folder', { purpose, folder: folderFor(purpose) })
      setVerified(current => ({ ...current, [purpose]: data.verified }))
    } catch (error) { setError(error.message) } finally { setBusy('') }
  }
  const save = async () => {
    setBusy('save'); setError(''); setSaved(false); setVerified({})
    try {
      const data = await post('save-drive-settings', { settings: form })
      setForm(data.settings); setVerified(data.verified); setSaved(true)
    } catch (error) { setError(error.message) } finally { setBusy('') }
  }
  const status = purpose => verified[purpose] ? <p className="drive-settings-ok" role="status">✓ Mappen nås: <strong>{verified[purpose].name}</strong><small>{verified[purpose].hasItems ? 'Innehållet kan listas.' : 'Ansluten – mappen är tom.'} Kontrollerad {new Date(verified[purpose].checkedAt).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}.</small></p> : <small className="drive-settings-untested">Mappen är inte kontrollerad för detta värde ännu.</small>
  return <section className="settings-card drive-settings" aria-busy={Boolean(busy)}>
    <h2>Google Drive</h2><p className="settings-help">Välj startmapp för träningspass och veckoplanering. Inställningen gäller alla tränare; bara superadmin kan ändra den.</p>
    {error && <p className="form-error" role="alert">{error}</p>}
    {busy === 'load' ? <p role="status">Läser Drive-inställningar…</p> : !config ? <button className="secondary-button" onClick={() => setRetry(value => value + 1)}>Försök hämta igen</button> : <>
      <div className={`drive-settings-api${config.apiKeyConfigured ? ' is-configured' : ''}`}><strong>{config.apiKeyConfigured ? '✓ API-nyckel konfigurerad' : 'API-nyckel saknas'}</strong><small>GOOGLE_DRIVE_API_KEY {config.apiKeyConfigured ? 'finns på servern. Nyckeln visas aldrig här.' : 'behöver sättas som miljövariabel i Vercel.'}</small><small>{config.environmentFolderConfigured ? 'GOOGLE_DRIVE_FOLDER_ID finns som reserv för passmappen.' : 'Ingen miljövariabel för passmapp är satt; befintlig standardmapp används som reserv.'} En konfigurerad nyckel är inte i sig ett bevis på att en mapp nås.</small></div>
      <fieldset disabled={Boolean(busy)} className="drive-settings-fields"><legend className="sr-only">Drive-mappar</legend>
        <div><h3>Träningspass</h3><label htmlFor="drive-workout-folder">Mapp för träningspass</label><input id="drive-workout-folder" type="text" value={form.workoutFolderId} placeholder={`Reserv: ${config.fallbackWorkoutFolder.id}`} onChange={event => change({ workoutFolderId: event.target.value })} autoComplete="off" spellCheck={false} /><small>Klistra in en mapplänk eller ett mapp-ID. Tomt fält använder {config.fallbackWorkoutFolder.source === 'environment' ? 'miljövariabeln' : 'befintlig standardmapp'}.</small><button type="button" className="secondary-button" disabled={!config.apiKeyConfigured} onClick={() => test('workout')}>{busy === 'workout' ? 'Kontrollerar…' : 'Testa anslutning · pass'}</button>{status('workout')}</div>
        <div><h3>Veckoplanering</h3><label className="drive-settings-same"><input type="checkbox" checked={form.useWorkoutFolder} onChange={event => change({ useWorkoutFolder: event.target.checked })} />Använd samma mapp för veckoplanering</label>{!form.useWorkoutFolder && <><label htmlFor="drive-planning-folder">Mapp för veckoplanering</label><input id="drive-planning-folder" type="text" value={form.planningFolderId} placeholder="https://drive.google.com/drive/folders/…" onChange={event => change({ planningFolderId: event.target.value })} autoComplete="off" spellCheck={false} /></>}<small>{form.useWorkoutFolder ? 'Planeringsimporten öppnar samma startmapp som passimporten.' : 'Planeringsimporten öppnar den här mappen, separat från träningspassen.'}</small><button type="button" className="secondary-button" disabled={!config.apiKeyConfigured || (!form.useWorkoutFolder && !form.planningFolderId.trim())} onClick={() => test('planning')}>{busy === 'planning' ? 'Kontrollerar…' : 'Testa anslutning · planering'}</button>{status('planning')}</div>
        <div className="drive-settings-save"><button type="button" className="primary-button" disabled={!config.apiKeyConfigured} onClick={save}>{busy === 'save' ? 'Kontrollerar och sparar…' : 'Spara Drive-inställning'}</button>{saved && <span className="settings-saved" role="status">Sparat ✓ Båda mapparna är kontrollerade.</span>}</div>
      </fieldset>
      <p className="settings-note">Kopplingen använder en API-nyckel och läser länkdelade mappar. Den ger inte åtkomst till privata mappar. Ändra inte delningen av känsligt material för att få kopplingen att fungera. Att ange en mapp här ändrar inte dess delning. Mapparna kontrolleras på nytt vid sparning.</p>
    </>}
  </section>
}
