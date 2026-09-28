import { supabaseRequest } from './supabase.js'

const DEFAULT_DAYS = 30
const MIN_DAYS = 1
const MAX_DAYS = 90

export async function getSessionDays(role) {
  try {
    const result = await supabaseRequest('app_settings?setting_key=eq.webapp&select=setting_value&limit=1')
    const settings = result.ok ? (await result.json())[0]?.setting_value || {} : {}
    const key = role === 'coach' ? 'coachSessionDays' : 'swimmerSessionDays'
    const value = Number(settings[key])
    return Number.isFinite(value) ? Math.min(MAX_DAYS, Math.max(MIN_DAYS, Math.round(value))) : DEFAULT_DAYS
  } catch {
    return DEFAULT_DAYS
  }
}

export const sessionDaysOptions = [1, 7, 14, 30, 60, 90]
