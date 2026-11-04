import React, { useState } from 'react'
import { apiRequest } from './api-request.js'
import { PLANNING_GROUPS, planningGroupChoices, defaultPlanningCalendars, isoWeek, planningDriveId, planningImportMondays } from '../shared/planning-import.js'
import { planningAddDays, planningMonday } from '../shared/weekly-planning.js'
import { SWIM_WORKBOOK_TYPES } from '../shared/swim-workbook.js'
import './planning-import.css'

const label = date => new Date(`${date}T12:00:00Z`).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })
const unresolvedRow = row => Object.values(row.calendarByGroup || {}).includes('unresolved')
const linkedRow = row => Object.values(row.calendarByGroup || {}).some(key => !['none', 'unresolved'].includes(key))

export default function PlanningImport({ code, selectedGroups = [], availableGroups = Object.entries(PLANNING_GROUPS), initialMonday, onClose, onSaved }) {
  const groupLabels = Object.fromEntries(availableGroups)
  const todayMonday = planningMonday(new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm' }))
  const viewMonday = initialMonday || todayMonday, initialWeek = isoWeek(viewMonday)
  const [source, setSource] = useState(null), [inspection, setInspection] = useState(null), [sheets, setSheets] = useState([])
  const [year, setYear] = useState(initialWeek.year), [weekNumber, setWeekNumber] = useState(initialWeek.week), [weekCount, setWeekCount] = useState(1)
  const [weekPreset, setWeekPreset] = useState('view'), [useAi, setUseAi] = useState(true), [analysisFailed, setAnalysisFailed] = useState(false)
  const [drive, setDrive] = useState(null), [link, setLink] = useState('')
  const [draft, setDraft] = useState(null), [weeks, setWeeks] = useState([]), [preview, setPreview] = useState(null)
  const [confirmReplace, setConfirmReplace] = useState(false), [reviewed, setReviewed] = useState(false)
  const [busy, setBusy] = useState(''), [error, setError] = useState(''), [success, setSuccess] = useState(null)
  const [importId] = useState(() => crypto.randomUUID())
  let requestedMondays = [], selectionError = ''
  try { requestedMondays = planningImportMondays(Number(year), Number(weekNumber), Number(weekCount)) } catch (error) { selectionError = error.message }
  const selectWeek = (preset, monday) => {
    setWeekPreset(preset)
    if (monday) { const week = isoWeek(monday); setYear(week.year); setWeekNumber(week.week); setWeekCount(1) }
    setAnalysisFailed(false); setError('')
  }
  const post = (action, payload = {}) => apiRequest('/api/workouts', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...payload }) })
  const run = async (message, task) => { setError(''); setBusy(message); try { await task() } catch (error) { setError(error.message || 'Det gick inte att fortsätta. Inget har sparats.') } finally { setBusy('') } }
  const inspect = payload => run('Läser filens flikar…', async () => {
    const data = await post('planning-import-inspect', payload)
    setSource(payload); setInspection(data); setSheets(data.sheets.filter(sheet => sheet.suggested).slice(0, 5).map(sheet => sheet.name)); setDraft(null); setPreview(null); setDrive(null); setAnalysisFailed(false)
  })
  const readLocal = event => {
    const file = event.target.files?.[0]; event.target.value = ''
    if (!file) return
    if (!/\.(xlsx|xls)$/i.test(file.name) || file.size > 3 * 1024 * 1024) { setError('Välj en XLS/XLSX-fil under 3 MB.'); return }
    const reader = new FileReader()
    reader.onload = () => inspect({ fileName: file.name, fileData: reader.result })
    reader.onerror = () => setError('Filen kunde inte läsas.')
    reader.readAsDataURL(file)
  }
  const browse = (folderId = '') => run('Öppnar Google Drive…', async () => setDrive(await apiRequest(`/api/workouts?drive=true&purpose=planning${folderId ? `&folderId=${encodeURIComponent(folderId)}` : ''}`, code)))
  const analyze = (withAi = useAi) => run(withAi ? `GPT-6.1 läser ${requestedMondays.length} valda veckor för ${selectedGroups.map(group => groupLabels[group] || group).join(' och ')}… Det kan ta några minuter.` : 'Läser valda veckor och grupper direkt från Excel…', async () => {
    setAnalysisFailed(false)
    let data
    try { data = await post('planning-import-analyze', { ...source, sheets, groups: selectedGroups, mondays: requestedMondays, useAi: withAi }) }
    catch (error) { setAnalysisFailed(withAi); throw error }
    setDraft(data); setReviewed(false); setConfirmReplace(false); setPreview(null)
    setWeeks(data.weeks.map(week => {
      return { ...week, selected: !week.dateConflict, mode: 'add', sessions: week.sessions.map(row => ({ ...row, calendarByGroup: defaultPlanningCalendars(row, week.groups, data.calendarChoices), separate: false })) }
    }))
  })
  const change = (index, patch) => {
    setPreview(null); setReviewed(false); setConfirmReplace(false)
    setWeeks(current => current.map((week, wi) => wi === index ? { ...week, ...patch } : week))
  }
  const changeRow = (wi, ri, patch) => {
    const week = weeks[wi]
    change(wi, { sessions: week.sessions.map((row, index) => index === ri ? { ...row, ...patch, ...(['date', 'timeOfDay', 'activityType'].some(key => key in patch) ? { calendarByGroup: defaultPlanningCalendars({ ...row, ...patch }, week.groups, draft.calendarChoices) } : {}) } : row) })
  }
  const chosen = weeks.filter(week => week.selected)
  const needsReplace = chosen.some(week => week.mode === 'replace')
  const unresolved = chosen.reduce((sum, week) => sum + week.sessions.filter(row => unresolvedRow(row)).length, 0)
  const inspectChanges = () => run('Kontrollerar kalender och befintlig planering…', async () => { setPreview(await post('planning-import-preview', { weeks: chosen, importId })); setReviewed(false); setConfirmReplace(false) })
  const save = () => run('Sparar veckoplaneringen…', async () => {
    const result = await post('planning-import-apply', { weeks: chosen, importId, previewToken: preview.previewToken, confirmReplace })
    setSuccess(result.summary); onSaved?.(chosen.map(week => week.monday).sort()[0])
  })
  return <section className="planning-import" aria-labelledby="planning-import-title" aria-busy={Boolean(busy)}>
    <header><div><p className="eyebrow">Excel → veckoplanering</p><h2 id="planning-import-title">Importera veckoplanering</h2><p>Välj fil, granska veckor och koppla till träningstider. Inget sparas innan du godkänner.</p></div><button type="button" className="text-button" onClick={onClose} disabled={Boolean(busy)}>Stäng</button></header>
    {busy && <p className="planning-import-status" role="status"><span className="planning-import-spinner" aria-hidden="true" />{busy}</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {success ? <div className="planning-import-success" role="status"><h3>✓ Veckoplaneringen är sparad</h3><p>{success.weeks} veckoblock · {success.added} nya rader · {success.replaced} ersatta grundplansrader.</p><p>Publicerade pass och simmarnas registreringar har inte ändrats.</p><button className="primary-button" onClick={onClose}>Visa planeringen</button></div> : <fieldset disabled={Boolean(busy)} className="planning-import-body">
      {!draft && <><div className="planning-import-sources"><label className="secondary-button planning-import-file">📄 Välj Excel-fil<input type="file" accept=".xls,.xlsx" onChange={readLocal} /></label><button className="secondary-button" onClick={() => browse()}>📁 Välj från delad Drive-mapp</button></div>
        <form className="planning-import-link" onSubmit={event => { event.preventDefault(); try { inspect({ driveId: planningDriveId(link) }) } catch (error) { setError(error.message) } }}><label>Google Kalkylark- eller Drive-länk<input type="url" value={link} onChange={event => setLink(event.target.value)} placeholder="https://docs.google.com/spreadsheets/d/…" /></label><button className="secondary-button" disabled={!link}>Läs länk</button></form>
        {drive && <div className="planning-import-drive"><div><strong>Delad Drive-mapp för veckoplanering</strong><button className="text-button" onClick={() => browse()}>Till huvudmappen</button></div>{drive.items.map(item => <button className="drive-item" key={item.id} disabled={!item.folder && !Object.hasOwn(SWIM_WORKBOOK_TYPES, item.mimeType)} onClick={() => item.folder ? browse(item.id) : inspect({ driveId: item.id })}><span>{item.folder ? '📁' : '📊'}</span><span>{item.name}</span><span>→</span></button>)}{drive.hasMore && <p>Visar de första 100 objekten. Välj en mer avgränsad undermapp om filen inte syns.</p>}{!drive.items.length && <p>Mappen är tom.</p>}</div>}
        {inspection && <div className="planning-import-file-options"><h3>{inspection.fileName}</h3>
          <fieldset className="planning-import-selection"><legend>Vad ska hämtas?</legend>
            <p>Grupper från planeringsvyn: <strong>{selectedGroups.map(group => groupLabels[group] || group).join(' och ') || 'Inga grupper valda'}</strong></p><small>Ändra grupper i toppmenyn om du vill hämta en annan grupp. Gemensam planering behålls som ett block.</small>
            <div className="planning-import-presets" role="group" aria-label="Välj veckor att läsa">
              <button type="button" className="secondary-button" aria-pressed={weekPreset === 'view'} onClick={() => selectWeek('view', viewMonday)}>Visad vecka · v{isoWeek(viewMonday).week}</button>
              <button type="button" className="secondary-button" aria-pressed={weekPreset === 'current'} onClick={() => selectWeek('current', todayMonday)}>Denna vecka · v{isoWeek(todayMonday).week}</button>
              <button type="button" className="secondary-button" aria-pressed={weekPreset === 'next'} onClick={() => selectWeek('next', planningAddDays(todayMonday, 7))}>Nästa vecka · v{isoWeek(planningAddDays(todayMonday, 7)).week}</button>
              <button type="button" className="secondary-button" aria-pressed={weekPreset === 'custom'} onClick={() => selectWeek('custom')}>Välj flera veckor…</button>
            </div>
            {weekPreset === 'custom' && <div className="planning-import-range"><label>ISO-år<input type="number" min="2000" max="2100" value={year} onChange={event => { setYear(event.target.value); setAnalysisFailed(false) }} /></label><label>Från vecka<input type="number" min="1" max="53" value={weekNumber} onChange={event => { setWeekNumber(event.target.value); setAnalysisFailed(false) }} /></label><label>Antal veckor<select value={weekCount} onChange={event => { setWeekCount(event.target.value); setAnalysisFailed(false) }}>{[1, 2, 3, 4].map(count => <option key={count} value={count}>{count} {count === 1 ? 'vecka' : 'veckor'}</option>)}</select></label></div>}
            {selectionError ? <p className="form-error" role="alert">{selectionError}</p> : <ul className="planning-import-selected-weeks">{requestedMondays.map(monday => <li key={monday}>v{isoWeek(monday).week} · {isoWeek(monday).year} · {label(monday)}–{label(planningAddDays(monday, 6))}</li>)}</ul>}
            {!selectedGroups.length && <p className="form-error">Välj minst en grupp i toppmenyn innan du analyserar.</p>}
          </fieldset>
          <details className="planning-import-tab-options"><summary>Flikar som läses ({sheets.length})</summary><p>Välj relevanta flikar. Arkiv och tillfälliga planer är inte förvalda.</p><div className="planning-import-sheets">{inspection.sheets.map(sheet => <label key={sheet.name}><input type="checkbox" checked={sheets.includes(sheet.name)} onChange={event => { setSheets(current => event.target.checked ? [...current, sheet.name] : current.filter(name => name !== sheet.name)); setAnalysisFailed(false) }} />{sheet.name}<small>{sheet.range}</small></label>)}</div></details>
          <label className="planning-import-check"><input type="checkbox" checked={useAi} onChange={event => setUseAi(event.target.checked)} /><span>Analysera med GPT-6.1<small>Excel-innehåll från valda flikar skickas till OpenAI, avgränsat till veckor och grupper när tabellstrukturen känns igen. Modellen söker bara efter ditt urval. Ingen simmardagbok eller hälsodata hämtas. Avmarkera för tabelläsning.</small></span></label>
          <div className="planning-import-sources"><button className="primary-button" disabled={!sheets.length || sheets.length > 5 || !selectedGroups.length || Boolean(selectionError)} onClick={() => analyze()}>Hämta valda veckor →</button>{analysisFailed && <button className="secondary-button" disabled={!sheets.length || sheets.length > 5 || !selectedGroups.length || Boolean(selectionError)} onClick={() => analyze(false)}>Läs samma urval utan AI</button>}</div>
        </div>}
      </>}
      {draft && <><div className="planning-import-draft-heading"><div><strong>{draft.fileName}</strong><p>{draft.weeks.length} veckoblock hittade · {draft.usedAi ? 'AI-tolkning att granska' : 'Tabelläsning'}</p></div><button className="text-button" onClick={() => { setDraft(null); setPreview(null) }}>← Ändra fil eller flikar</button></div>
        {!!draft.warnings?.length && <ul className="planning-import-warnings">{draft.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>}
        {!weeks.length && <p role="status">Ingen planering hittades för urvalet. Ändra veckor, grupper eller flikar och försök igen. Inget har sparats.</p>}
        <p>Komplettera lägger till utan att skriva över. Ersätt gäller endast grundplanen för valda grupper. Pass på samma halvdag räknas som alternativ om du inte väljer separata tillfällen.</p>
        {weeks.map((week, wi) => {
          const existing = draft.existing.filter(row => row.date >= week.monday && row.date <= planningAddDays(week.monday, 6) && row.targetGroups.some(group => week.groups.includes(group)))
          return <article className={`planning-import-week${week.selected ? ' is-selected' : ''}`} key={wi}><header><label><input type="checkbox" checked={week.selected} onChange={event => change(wi, { selected: event.target.checked })} /><span><strong>Vecka {isoWeek(week.monday).week} · {isoWeek(week.monday).year}</strong><small>{label(week.monday)}–{label(planningAddDays(week.monday, 6))} · {week.groups.map(group => (draft.groupLabels || groupLabels)[group] || group).join(' / ')}</small></span></label><span>{existing.length ? `${existing.length} befintliga rader` : 'Ny vecka för grupperna'}</span></header>
            {week.dateConflict && <p className="form-error">⚠ Källans datum ”{week.sourceDateLabel}” stämmer inte med denna vecka. Kontrollera år och flik.</p>}
            <small className="planning-import-scroll-hint">Svep tabellen i sidled för att se hela dagen.</small><div className="planning-import-overview" role="region" aria-label={`Veckotabell vecka ${isoWeek(week.monday).week}`} tabIndex={0}><table><caption>Planering att granska · flera upplägg är alternativ, inte extra meter</caption><thead><tr><th scope="col">Dag</th><th scope="col">Morgon</th><th scope="col">Eftermiddag / kväll</th></tr></thead><tbody>{Array.from({ length: 7 }, (_, day) => {
              const date = planningAddDays(week.monday, day)
              return <tr key={date}><th scope="row">{new Date(`${date}T12:00:00Z`).toLocaleDateString('sv-SE', { weekday: 'short', day: 'numeric', month: 'numeric' })}</th>{['morning', 'afternoon'].map(slot => { const rows = week.sessions.filter(row => row.date === date && row.timeOfDay === slot); return <td key={slot}>{rows.length ? rows.map((row, index) => <div key={index}><strong>{row.title}</strong>{row.distanceMeters && <span> · {Number(row.distanceMeters).toLocaleString('sv-SE')} m</span>}<small>{week.groups.map(group => { const key = row.calendarByGroup?.[group], choice = draft.calendarChoices.find(item => item.key === key); return `${(draft.groupLabels || groupLabels)[group] || group}: ${choice ? choice.time : key === 'unresolved' ? 'välj träningstid' : 'utan kalender'}` }).join(' · ')}</small>{row.notes && <small>{row.notes}</small>}</div>) : <span className="planning-import-empty">Inget pass angivet</span>}</td> })}</tr>
            })}</tbody></table></div>
            {week.selected && <details className="planning-import-week-content" open={wi === 0}><summary>Granska {week.sessions.length} rader · {week.mode === 'replace' ? 'Ersätt grundplan' : 'Komplettera'}{week.sessions.some(row => unresolvedRow(row)) && ' · ⚠ Välj träningstider'}</summary><div className="planning-import-week-settings"><div className="planning-import-groups">{Object.entries(draft.groupLabels || groupLabels).map(([group, title]) => <label key={group}><input type="checkbox" checked={week.groups.includes(group)} onChange={event => { const groups = event.target.checked ? [...week.groups, group] : week.groups.filter(value => value !== group); change(wi, { groups, sessions: week.sessions.map(row => ({ ...row, calendarByGroup: defaultPlanningCalendars(row, groups, draft.calendarChoices) })) }) }} />{title}</label>)}</div><label>Hur ska veckan läggas in?<select value={week.mode} onChange={event => change(wi, { mode: event.target.value })}><option value="add">Komplettera — behåll befintligt</option><option value="replace">Ersätt grundplan för valda grupper</option></select></label></div>
              <details className="planning-import-source"><summary>Källa och anmärkningar</summary><p>{week.sourceSheet}!{week.sourceRange} · {week.sourceDateLabel}</p><ul>{week.warnings?.map((warning, index) => <li key={index}>{warning}</li>)}</ul></details>
              <div className="planning-import-rows">{week.sessions.map((row, ri) => {
                const labels = draft.groupLabels || groupLabels
                return <details className="planning-import-row" key={ri}><summary><span><strong>{label(row.date)} · {row.timeOfDay === 'morning' ? 'Morgon' : 'Eftermiddag'}</strong><span>{row.title}</span></span><small>{row.distanceMeters ? `${Number(row.distanceMeters).toLocaleString('sv-SE')} m · ` : ''}{unresolvedRow(row) ? '⚠ Välj träningstid' : linkedRow(row) ? '✓ Kalenderkopplad per grupp' : 'Utan kalender'}</small></summary><div className="planning-import-row-fields"><label>Datum<input type="date" min={week.monday} max={planningAddDays(week.monday, 6)} value={row.date} onChange={event => changeRow(wi, ri, { date: event.target.value })} /></label><label>Tid på dagen<select value={row.timeOfDay} onChange={event => changeRow(wi, ri, { timeOfDay: event.target.value })}><option value="morning">Morgon</option><option value="afternoon">Eftermiddag / kväll</option></select></label><label>Aktivitet<select value={row.activityType} onChange={event => changeRow(wi, ri, { activityType: event.target.value })}><option value="swim">Simning</option><option value="strength">Styrka</option><option value="dryland">Landträning</option><option value="competition">Tävling</option></select></label><label>Rubrik<input value={row.title} maxLength={100} onChange={event => changeRow(wi, ri, { title: event.target.value })} /></label><label>Huvudinriktning<input value={row.focus} maxLength={80} onChange={event => changeRow(wi, ri, { focus: event.target.value })} /></label><label>Distans (m)<input type="number" min="1" max="30000" value={row.distanceMeters ?? ''} onChange={event => changeRow(wi, ri, { distanceMeters: event.target.value })} /></label><label>Tidsåtgång (min)<input type="number" min="1" max="600" value={row.durationMinutes || ''} placeholder="Inte angiven" onChange={event => changeRow(wi, ri, { durationMinutes: event.target.value })} /></label><fieldset className="planning-import-wide planning-import-calendar-groups"><legend>SportAdmin-träning per grupp</legend><p>Samma upplägg kan kopplas till olika träningstider. Varje simmare får bara sin grupps pass. Kalenderns minuter används om tidsåtgång saknas ovan.</p>{week.groups.map(group => {
                  const options = planningGroupChoices(row, group, draft.calendarChoices)
                  return <label key={group}>{labels[group] || group}<select value={row.calendarByGroup[group]} onChange={event => changeRow(wi, ri, { calendarByGroup: { ...row.calendarByGroup, [group]: event.target.value } })}><option value="unresolved">Välj träningstid eller utan kalender…</option>{options.map(choice => <option key={choice.key} value={choice.key}>{choice.time} · {choice.title} · {choice.location}{choice.durationMinutes ? ' · ' + choice.durationMinutes + ' min' : ''}</option>)}<option value="none">Utan kalender — grundplanens halvdag</option></select>{!options.length && <small>Ingen matchande kalenderträning för denna grupp och halvdag. Kontrollera datum och tid på dagen.</small>}</label>
                })}</fieldset><label className="planning-import-wide">Anteckningar<textarea rows={2} maxLength={500} value={row.notes} onChange={event => changeRow(wi, ri, { notes: event.target.value })} /></label>{!linkedRow(row) && row.activityType === 'swim' && <label className="planning-import-check planning-import-wide"><input type="checkbox" checked={row.separate} onChange={event => changeRow(wi, ri, { separate: event.target.checked })} />Eget träningstillfälle — inte ett passalternativ</label>}<small>Källa: {week.sourceSheet}!{row.sourceCells}</small><button className="text-button" onClick={() => change(wi, { sessions: week.sessions.filter((_, index) => index !== ri) })}>Ta bort rad från importen</button></div></details>
              })}</div>
            </details>}
          </article>
        })}
        {unresolved > 0 && <p className="planning-import-warnings">Välj kalenderträning eller ”Utan kalender” för {unresolved} rader innan du granskar ändringarna.</p>}
        <button className="secondary-button" disabled={!chosen.length || unresolved > 0} onClick={inspectChanges}>Granska ändringarna ({chosen.length} veckoblock)</button>
        {preview && <section className="planning-import-confirm"><h3>Det här kommer att ändras</h3><p><strong>{preview.summary.added}</strong> nya rader · <strong>{preview.summary.replaced}</strong> grundplansrader ersätts · {preview.summary.duplicates} identiska rader hoppas över · {preview.summary.protected} rader hoppas över vid publicerade pass.</p><p>Publicerade pass, kalenderhändelser och simmarnas registreringar ändras inte. Överskriven grundplan säkerhetskopieras i importloggen.</p><label className="planning-import-check"><input type="checkbox" checked={reviewed} onChange={event => setReviewed(event.target.checked)} />Jag har granskat datum, grupper, innehåll och kalenderkopplingar.</label>{needsReplace && <label className="planning-import-check"><input type="checkbox" checked={confirmReplace} onChange={event => setConfirmReplace(event.target.checked)} />Jag godkänner att grundplanen ersätts för de valda veckorna och grupperna.</label>}<button className="primary-button" disabled={!reviewed || needsReplace && !confirmReplace} onClick={save}>Spara {chosen.length} veckoblock</button></section>}
      </>}
    </fieldset>}
  </section>
}
