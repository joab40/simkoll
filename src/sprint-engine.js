export const SPRINT_BASE = 100000
export const SPRINT_MIN_MS = 8500
export const SPRINT_MAX_MS = 60000
const DRAG = 0.85
const MAX_SPEED = 11.5

export function createSprint(now) {
  return { status: 'countdown', startAt: now + 3000, updatedAt: now + 3000, distance: 0, speed: 0, lastSide: null, lastPress: -Infinity, steps: 0, elapsed: 0 }
}

// Integrate exponential drag analytically: time and distance do not depend on FPS.
export function advanceSprint(race, now) {
  if (!['running', 'countdown'].includes(race.status) || now < race.startAt) return race
  race.status = 'running'
  const dt = Math.max(0, (now - race.updatedAt) / 1000)
  const travelled = race.speed * (1 - Math.exp(-DRAG * dt)) / DRAG
  if (race.distance + travelled >= 100) {
    const remaining = 100 - race.distance
    const crossing = -Math.log(1 - remaining * DRAG / race.speed) / DRAG
    race.elapsed = race.updatedAt - race.startAt + crossing * 1000
    race.distance = 100
    race.status = 'finished'
  } else {
    race.distance += travelled
    race.speed *= Math.exp(-DRAG * dt)
    race.elapsed = now - race.startAt
    if (race.elapsed >= SPRINT_MAX_MS) race.status = 'timeout'
  }
  race.updatedAt = Math.max(race.updatedAt, now)
  return race
}

export function sprintStep(race, side, now) {
  if (side !== 'left' && side !== 'right') return false
  advanceSprint(race, now)
  if (race.status === 'countdown') { race.status = 'false-start'; return false }
  if (race.status !== 'running' || race.lastSide === side || now - race.lastPress < 65) return false
  race.speed = Math.min(MAX_SPEED, race.speed + 1.65)
  race.lastSide = side
  race.lastPress = now
  race.steps += 1
  return true
}

export function sprintScore(elapsed) {
  if (!Number.isFinite(elapsed) || elapsed < SPRINT_MIN_MS || elapsed > SPRINT_MAX_MS) return null
  return SPRINT_BASE - Math.round(elapsed)
}
export function validSprintScore(score) {
  return Number.isInteger(score) && score >= SPRINT_BASE - SPRINT_MAX_MS && score <= SPRINT_BASE - SPRINT_MIN_MS
}
export const sprintTime = (ms) => `${(ms / 1000).toFixed(2).replace('.', ',')} s`
