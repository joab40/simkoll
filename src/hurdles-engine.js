export const HURDLES = Array.from({ length: 10 }, (_, index) => 13 + index * 8.5)
export const HURDLE_BASE = 100000
export const HURDLE_MIN_MS = 10000
export const HURDLE_MAX_MS = 60000
const DRAG = 0.65, GRAVITY = 15, LIFT = 4.8
export const hurdleTime = (ms) => `${(ms / 1000).toFixed(2).replace('.', ',')} s`
export const validHurdleScore = (score) => Number.isInteger(score) && score >= HURDLE_BASE - HURDLE_MAX_MS && score <= HURDLE_BASE - HURDLE_MIN_MS
export const hurdleScore = (elapsed) => Number.isFinite(elapsed) && elapsed >= HURDLE_MIN_MS && elapsed <= HURDLE_MAX_MS ? HURDLE_BASE - Math.round(elapsed) : null
export const idleHurdles = () => ({ status: 'ready', distance: 0, speed: 0, y: 0, elapsed: 0, steps: 0, cleared: 0, hits: 0, results: [], feedback: '' })
export const createHurdles = (now) => ({ ...idleHurdles(), status: 'countdown', startAt: now + 3000, updatedAt: now + 3000, lastStep: -Infinity, jumpAt: null, feedbackAt: -Infinity })
const heightAt = (race, now) => {
  if (race.jumpAt === null) return 0
  const t = Math.max(0, (now - race.jumpAt) / 1000)
  return Math.max(0, LIFT * t - GRAVITY * t * t / 2)
}

export function advanceHurdles(race, now) {
  if (!['countdown', 'running'].includes(race.status) || now < race.startAt) return race
  race.status = 'running'
  // Fixed small steps keep hurdle crossings and penalties consistent at all FPS.
  while (race.updatedAt < now && race.status === 'running') {
    const end = Math.min(now, race.updatedAt + 5), dt = (end - race.updatedAt) / 1000
    const from = race.distance, travelled = race.speed * (1 - Math.exp(-DRAG * dt)) / DRAG
    race.distance += travelled
    race.speed *= Math.exp(-DRAG * dt)
    const next = HURDLES[race.results.length]
    if (next !== undefined && race.distance >= next) {
      const crossing = race.updatedAt + dt * 1000 * (next - from) / travelled
      const hit = heightAt(race, crossing) < 0.6
      race.results.push({ distance: next, hit })
      if (hit) { race.hits++; race.speed *= 0.48; race.feedback = 'Häckträff – bygg upp farten igen!' }
      else { race.cleared++; race.feedback = 'Rent över! Behåll rytmen.' }
      race.feedbackAt = crossing
    }
    race.y = heightAt(race, end)
    if (race.jumpAt !== null && end - race.jumpAt >= 2 * LIFT / GRAVITY * 1000) race.jumpAt = null
    if (race.distance >= 100) {
      const fraction = (100 - from) / travelled
      race.elapsed = race.updatedAt - race.startAt + dt * 1000 * fraction
      race.distance = 100; race.status = 'finished'
    } else {
      race.elapsed = end - race.startAt
      if (race.elapsed >= HURDLE_MAX_MS) race.status = 'timeout'
    }
    race.updatedAt = end
  }
  return race
}

export function hurdleInput(race, action, now) {
  if (!['run', 'jump'].includes(action)) return false
  advanceHurdles(race, now)
  if (race.status === 'countdown') { race.status = 'false-start'; return false }
  if (race.status !== 'running') return false
  if (action === 'run') {
    if (now - race.lastStep < 80) return false
    race.speed = Math.min(9.4, race.speed + 1.05)
    race.lastStep = now; race.steps++
  } else {
    if (race.jumpAt !== null) return false
    race.jumpAt = now
  }
  return true
}
