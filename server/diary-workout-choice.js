import { supabaseRequest } from './supabase.js'
import { stockholmDate } from './profile-auth.js'
import { validDiaryDate } from '../shared/training-diary.js'
import { validWorkoutOption } from '../shared/swim-workout-options.js'
import { loadWorkoutChoices } from './workout-choice.js'

const fail = (status, message) => { throw Object.assign(new Error(message), { status }) }
async function eligible(profile, date, slot, reference) {
  if (!validDiaryDate(date) || date > stockholmDate() || !['morning_swim','afternoon_swim'].includes(slot)) fail(400,'Välj ett registrerat simpass till och med idag.')
  const owner = `profile_id=eq.${encodeURIComponent(profile.id)}`, scoped = `session_slot=eq.${slot}`
  const results = await Promise.all([
    supabaseRequest(`personal_training_sessions?${owner}&session_date=eq.${date}&${scoped}&select=*&limit=2`),
    supabaseRequest(`session_attendance?${owner}&attendance_date=eq.${date}&${scoped}&present=eq.true&select=id&limit=1`),
    supabaseRequest(`responses?${owner}&activity_date=eq.${date}&${scoped}&day_type=eq.after&competition=not.is.true&select=activity_type,workout_reference&order=created_at.desc&limit=1000`),
  ])
  if (results.some(result=>!result.ok)) fail(503,'Registreringen kunde inte kontrolleras. Inget passval har sparats.')
  const [sessions,attendance,responses] = await Promise.all(results.map(result=>result.json()))
  if (responses.length===1000) fail(422,'För många svar för att säkert kontrollera passvalet.')
  if ((!sessions.length && !attendance.length) || sessions.some(row=>row.activity_type!=='swim')) fail(404,'Ingen registrerad simnärvaro hittades för det här passet.')
  if (responses.some(row=>(!row.activity_type||row.activity_type==='swim')&&row.workout_reference)) fail(409,'Passet är redan valt i en efter-check-in. Hämta dagboken igen.')
  if (sessions.some(row=>row.workout_reference && row.workout_reference!==reference)) fail(409,'Ett pass har redan valts. Hämta dagboken igen.')
}

export async function diaryWorkoutChoices(profile, date, slot) {
  await eligible(profile,date,slot)
  const options = (await loadWorkoutChoices(date,profile.training_group)).filter(option=>validWorkoutOption(option,{date,slot,trainingGroup:profile.training_group}))
  return { options: options.map(({workoutReference,title,time,location,focus,distanceMeters,durationMinutes})=>({workoutReference,title,time:time||'',location:location||'',focus,distanceMeters,durationMinutes})) }
}

export async function saveDiaryWorkoutChoice(profile, body) {
  const {date,slot,workoutReference} = body
  if (typeof workoutReference!=='string' || !/^(workout|plan):[0-9a-f-]{36}$/i.test(workoutReference)) fail(400,'Välj ett giltigt pass från listan.')
  await eligible(profile,date,slot,workoutReference)
  const options = await loadWorkoutChoices(date,profile.training_group)
  if (!options.some(option=>option.workoutReference===workoutReference && validWorkoutOption(option,{date,slot,trainingGroup:profile.training_group}))) fail(400,'Passvalet stämmer inte med datum, grupp eller morgon/kväll. Hämta alternativen igen.')
  const result = await supabaseRequest('rpc/save_diary_workout_choice',{method:'POST',body:JSON.stringify({p_profile_id:profile.id,p_date:date,p_slot:slot,p_reference:workoutReference})})
  if (!result.ok) {
    const error=await result.json().catch(()=>({}))
    if (['PGRST202','PGRST204','42883','42703'].includes(error.code)) fail(503,'Passval i efterhand behöver SQL 132. Inget har sparats.')
    if (error.code==='23505') fail(409,'Ett passval har redan sparats. Hämta dagboken igen; inget tidigare svar har skrivits över.')
    if (error.code==='P0002') fail(404,'Registreringen finns inte kvar. Hämta dagboken igen.')
    fail(502,'Passvalet kunde inte sparas. Försök igen.')
  }
  await result.json()
  return { saved:true }
}
