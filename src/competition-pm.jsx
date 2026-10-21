import React, { useRef, useState } from 'react'

export function readCompetitionPm(file) {
  if (file.size > 3 * 1024 * 1024) return Promise.reject(new Error('Välj ett PM på högst 3 MB.'))
  const type = file.type || (/\.pdf$/i.test(file.name) ? 'application/pdf' : /\.png$/i.test(file.name) ? 'image/png' : /\.jpe?g$/i.test(file.name) ? 'image/jpeg' : /\.webp$/i.test(file.name) ? 'image/webp' : '')
  if (!['application/pdf', 'image/png', 'image/jpeg', 'image/webp'].includes(type)) return Promise.reject(new Error('Välj PDF, JPG, PNG eller WebP. Exportera Word till PDF först.'))
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('PM-filen kunde inte läsas. Välj filen igen.'))
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^;]*;/, `data:${type};`))
    reader.readAsDataURL(file)
  })
}

export async function uploadCompetitionPm(file, competitionId, code, request) {
  const fileData = await readCompetitionPm(file)
  return request('/api/workouts', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'upload-competition-pm', competitionId, fileName: file.name, fileData }) })
}

export default function CompetitionPm({ competition, code, request, canManage = false, onChanged, onBusyChange, disabled = false }) {
  const [busy, setBusy] = useState(''), [error, setError] = useState(''), [message, setMessage] = useState(''), [link, setLink] = useState(null)
  const busyRef = useRef(false)
  const fileInput = useRef(null)
  const operation = (value) => { setBusy(value); onBusyChange?.(Boolean(value)) }
  const open = async () => {
    if (busyRef.current) return
    busyRef.current = true; operation('open'); setError('')
    const tab = window.open('about:blank', '_blank')
    if (tab) tab.opener = null
    try {
      const result = await request(`/api/workouts?competitionPm=true&id=${encodeURIComponent(competition.id)}`, code)
      setLink(result.document.url)
      if (tab) tab.location.replace(result.document.url)
    } catch (error) { tab?.close(); setError(error.message) }
    finally { busyRef.current = false; operation('') }
  }
  const upload = async (event) => {
    const file = event.target.files?.[0]; event.target.value = ''
    if (!file || busyRef.current) return
    busyRef.current = true; operation('upload'); setError(''); setMessage('')
    try {
      const result = await uploadCompetitionPm(file, competition.id, code, request)
      onChanged(result.competition); setLink(null); setMessage('✓ PM är bifogat och kan läsas av tränare och simmare i berörda grupper.')
    } catch (error) { setError(error.message) }
    finally { busyRef.current = false; operation('') }
  }
  const remove = async () => {
    if (busyRef.current || !window.confirm('Ta bort det bifogade PM:et? Grenprogram och anmälningar finns kvar.')) return
    busyRef.current = true; operation('remove'); setError(''); setMessage('')
    try {
      const result = await request('/api/workouts', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'remove-competition-pm', competitionId: competition.id }) })
      onChanged(result.competition); setLink(null); setMessage('PM är borttaget från tävlingen.')
    } catch (error) { setError(error.message) }
    finally { busyRef.current = false; operation('') }
  }
  if (!canManage && !competition.pmDocument) return null
  return <section className="competition-pm" aria-label="Tävlings-PM">
    <div><strong>📎 Original-PM</strong><small>{competition.pmDocument?.name || 'Bifoga underlaget med klasser, tider och tävlingsinformation.'}</small></div>
    <div className="competition-pm-actions">
      {competition.pmDocument && <button type="button" className="secondary-button" disabled={disabled || !!busy} onClick={open}>{busy === 'open' ? 'Öppnar PM…' : 'Öppna PM ↗'}</button>}
      {canManage && <><input ref={fileInput} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" hidden onChange={upload} disabled={disabled || !!busy} /><button type="button" className="secondary-button" disabled={disabled || !!busy} onClick={() => fileInput.current?.click()}>{busy === 'upload' ? 'Bifogar PM…' : competition.pmDocument ? 'Byt PM' : 'Bifoga PM'}</button>{competition.pmDocument && <button type="button" className="text-button" disabled={disabled || !!busy} onClick={remove}>{busy === 'remove' ? 'Tar bort…' : 'Ta bort PM'}</button>}</>}
    </div>
    {canManage && <small>PDF eller bild, högst 3 MB. Bilagan visas för berörda grupper. AI-tolkning av grenprogrammet görs separat nedan.</small>}
    {link && <a href={link} target="_blank" rel="noreferrer">Öppna PM om ingen ny flik visades ↗</a>}
    {error && <p role="alert" className="form-error">{error}</p>}{message && <p role="status">{message}</p>}
  </section>
}
