import { strengthPasses, strengthExercises } from './strength-program.js'

export function drylandLogInput(program, body, today) {
  const error = (text) => { throw Object.assign(new Error(text), { status: 400 }) }
  const date = body.sessionDate || today, number = body.passNumber
  if (body.completed !== true || typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(`${date}T12:00:00Z`)) || new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) !== date || date > today || !Number.isInteger(number)) error('Bekräfta genomfört pass och välj ett giltigt datum och pass.')
  const pass = strengthPasses({ ...program, type: 'dryland' }).find((p) => p.passNumber === number)
  if (!pass) error('Passet finns inte i ditt landträningsprogram. Öppna programmet igen.')
  if (pass.title.length > 100) error('Passrubriken är för lång. Be tränaren korta den till högst 100 tecken.')
  if (typeof body.notes !== 'string' || body.notes.length > 1000) error('Kommentaren får vara högst 1 000 tecken.')
  if (!body.results || typeof body.results !== 'object' || Array.isArray(body.results)) error('Kontrollera övningsresultaten.')
  const keys = new Set(strengthExercises(pass.content).map((exercise) => exercise.resultKey))
  const entries = Object.entries(body.results)
  if (entries.length > 40 || entries.some(([key, value]) => !keys.has(key) || !value || typeof value !== 'object' || Array.isArray(value) || typeof value.completed !== 'boolean' || typeof value.result !== 'string' || value.result.length > 100 || Object.keys(value).some((k) => !['completed', 'result'].includes(k)))) error('En övning har ändrats eller har ett ogiltigt resultat. Öppna programmet igen.')
  return { date, pass, results: Object.fromEntries(entries.map(([key, value]) => [key, { completed: value.completed, result: value.result.trim() }])), notes: body.notes.trim() }
}
export const mapDrylandLog = (row) => ({ id: row.id, assignmentId: row.assignment_id, profileId: row.profile_id, passNumber: row.pass_number, sessionDate: row.session_date, results: row.results || {}, notes: row.notes || '', completedAt: row.completed_at, programTitle: row.program_title, passTitle: row.pass_title, passContent: row.pass_content })
