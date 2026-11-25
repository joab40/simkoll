export const BOB_LENGTH = 840
export const BOB_START_LIMIT = 4.2
export const BOB_DIVE_START = 3.05
export const BOB_DIVE_END = 3.7
export const BOB_SCORE_BASE = 100000
export const BOB_MIN_MS = 18000
export const BOB_MAX_MS = 60000
export const BOB_LANE = 2.63
export const clamp = (value, min, max) => Math.max(min, Math.min(max, value))
export const bobTime = ms => (ms / 1000).toFixed(3).replace('.', ',') + ' s'
export const validBobScore = score => Number.isInteger(score) && score >= BOB_SCORE_BASE - BOB_MAX_MS && score <= BOB_SCORE_BASE - BOB_MIN_MS

const turns = [
  [97, 108, 1], [210, 93, -1], [312, 90, 0.8], [412, 115, -1.1],
  [537, 87, 1.08], [631, 72, -1.12], [713, 106, 1.15],
]
export function bobTrack(z) {
  let x = 0, force = 0, heading = 0
  for (const [start, length, direction] of turns) {
    if (z <= start) break
    const t = clamp((z - start) / length, 0, 1)
    const wave = Math.sin(Math.PI * t)
    x += direction * (length / 42) * 22 * (t - Math.sin(2 * Math.PI * t) / (2 * Math.PI))
    if (t < 1) {
      force = direction * wave ** 2
      heading = direction * 22 / 42 * (1 - Math.cos(2 * Math.PI * t))
    }
  }
  const drop = -6.5 * Math.sin(z * 0.012) - 2.6 * Math.sin(z * 0.039) - z * 0.085
  return { x, y: drop, force, heading }
}

export function createBobRace() {
  return {
    phase: 'ready', distance: 0, elapsed: 0, pushTime: 0, pushes: 0, lastPush: -1,
    speed: 0, lateral: 0, drift: 0, turn: 0, hits: 0, lastHit: -1,
    cleanTime: 0, maxSpeed: 0, launch: '', result: null,
  }
}
export function bobAction(race) {
  if (race.phase === 'ready' || race.phase === 'finished') {
    Object.assign(race, createBobRace(), { phase: 'push' })
    return
  }
  if (race.phase !== 'push') return
  if (race.pushTime >= BOB_DIVE_START) {
    dive(race, race.pushTime <= BOB_DIVE_END)
  } else if (race.pushTime - race.lastPush >= 0.15) {
    race.pushes = Math.min(12, race.pushes + 1)
    race.lastPush = race.pushTime
  }
}
function dive(race, onTime) {
  race.phase = 'racing'
  race.launch = onTime && race.pushes >= 10 ? 'Perfekt start' : onTime ? 'Bra inhopp' : 'Sent inhopp'
  race.speed = 13 + race.pushes * 0.82 + (onTime ? 3 : 0)
}
export function bobIdealLine(force) { return force * 1.4 }

export function advanceBob(race, elapsed, steer = 0) {
  if (race.phase === 'push') {
    race.pushTime += elapsed
    if (race.pushTime >= BOB_START_LIMIT) dive(race, false)
    return
  }
  if (race.phase !== 'racing') return
  let remaining = Math.min(elapsed, 0.075)
  while (remaining > 0 && race.phase === 'racing') {
    const dt = Math.min(remaining, 1 / 90)
    remaining -= dt
    const curve = bobTrack(race.distance).force
    const line = bobIdealLine(curve)
    race.turn += (clamp(steer, -1, 1) - race.turn) * Math.min(1, dt * 8)
    race.drift += (race.turn * 19 - curve * (6.3 + race.speed * 0.105) - race.lateral * 1.3 - race.drift * 3) * dt
    race.lateral += race.drift * dt
    const clean = Math.abs(curve) > 0.25 && Math.abs(race.lateral - line) < 0.78
    if (clean) race.cleanTime += dt
    race.speed += (44.8 + (clean ? 3.4 : 0) - 3.5 * Math.abs(race.turn) - race.speed) * Math.min(1, dt * 0.35)
    if (Math.abs(race.lateral) > BOB_LANE) {
      race.lateral = Math.sign(race.lateral) * BOB_LANE
      race.drift *= -0.25
      if (race.elapsed - race.lastHit > 0.55) {
        race.speed = Math.max(16, race.speed - 5.8)
        race.hits += 1
        race.lastHit = race.elapsed
      }
    }
    race.maxSpeed = Math.max(race.speed, race.maxSpeed)
    const travel = race.speed * dt
    race.elapsed += Math.min(dt, (BOB_LENGTH - race.distance) / race.speed)
    race.distance = Math.min(BOB_LENGTH, race.distance + travel)
    if (race.distance >= BOB_LENGTH) {
      race.phase = 'finished'
      race.result = Math.round((race.pushTime + race.elapsed) * 1000)
    }
  }
}
