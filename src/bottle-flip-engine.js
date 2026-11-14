// Original Simkoll game logic. Fixed course seed gives every player the same course.
export const BOTTLE_CHARGE_SECONDS = 1.2
export const BOTTLE_ROUND_SECONDS = 120
export const BOTTLE_MAX_LANDINGS = 80
export const BOTTLE_MAX_SCORE = BOTTLE_MAX_LANDINGS * 40
export const BOTTLE_FLOOR = 490
const GRAVITY = 1450, LIFT = 640, HALF_BASE = 10
const clamp = (n, min, max) => Math.max(min, Math.min(max, n))
const random = (index, salt = 0) => {
  let n = Math.imul((index + 1) ^ (salt + 20261114), 1597334677)
  n = Math.imul(n ^ (n >>> 16), 2246822519)
  return ((n ^ (n >>> 13)) >>> 0) / 4294967296
}
export function bottlePlatform(previous, index) {
  if (!previous) return { index: 0, x: 65, y: 355, width: 150, kind: 0 }
  const difficulty = Math.min(1, index / 48)
  const width = Math.round(132 - difficulty * 55 + random(index) * 24)
  const gap = Math.round(64 + random(index, 7) * 64 + difficulty * 45)
  const y = clamp(previous.y + Math.round((random(index, 19) - .5) * 100), 290, 395)
  return { index, x: previous.x + previous.width + gap, y, width, kind: index % 4 }
}
function ensurePlatforms(game) {
  while (game.platforms.length < game.current + 6) game.platforms.push(bottlePlatform(game.platforms.at(-1), game.platforms.length))
}
export function createBottleGame() {
  const first = bottlePlatform(null, 0)
  const game = { status: 'ready', phase: 'resting', score: 0, lives: 3, elapsed: 0, landings: 0, streak: 0, bestStreak: 0, current: 0, platforms: [first], charge: 0, camera: 0, x: first.x + first.width / 2, y: first.y, angle: 0, flight: null, feedback: '', feedbackFor: 0, respawn: 0 }
  ensurePlatforms(game)
  return game
}
export function startBottle(game) {
  if (game.status === 'ready') game.status = 'playing'
  return game
}
export function pressBottle(game) {
  if (game.status !== 'playing' || game.phase !== 'resting') return false
  game.phase = 'charging'; game.charge = 0
  return true
}
export function cancelBottleCharge(game) {
  if (game.phase === 'charging') { game.phase = 'resting'; game.charge = 0 }
}
export function releaseBottle(game) {
  if (game.status !== 'playing' || game.phase !== 'charging') return false
  const vx = 120 + game.charge * 510
  game.flight = { x: game.x, y: game.y, vx, elapsed: 0, blockedX: null }
  game.phase = 'flying'; game.charge = 0
  return true
}
export function pauseBottle(game) {
  if (game.status !== 'playing') return
  cancelBottleCharge(game); game.status = 'paused'
}
export function resumeBottle(game) { if (game.status === 'paused') game.status = 'playing' }
const flightY = (flight, t) => flight.y - LIFT * t + GRAVITY * t * t / 2
export function bottleLandingTime(fromY, toY) {
  const discriminant = LIFT * LIFT + 2 * GRAVITY * (toY - fromY)
  return discriminant < 0 ? null : (LIFT + Math.sqrt(discriminant)) / GRAVITY
}
function land(game, platform, x) {
  const skip = platform.index - game.current === 2
  const perfect = Math.abs(x - platform.x - platform.width / 2) <= platform.width * .15
  game.streak = perfect ? game.streak + 1 : 0
  game.bestStreak = Math.max(game.bestStreak, game.streak)
  const points = 10 + (perfect ? Math.min(game.streak, 4) * 5 : 0) + (skip ? 10 : 0)
  game.score += points; game.landings += 1; game.current = platform.index
  game.x = x; game.y = platform.y; game.angle = 0; game.phase = 'resting'; game.flight = null
  game.feedback = `${perfect ? 'Mitt i prick!' : 'Snygg landning!'} +${points}${skip ? ' · genväg' : ''}`; game.feedbackFor = 1.3
  ensurePlatforms(game)
  if (game.landings >= BOTTLE_MAX_LANDINGS) game.status = 'complete'
}
function miss(game) {
  game.lives -= 1; game.streak = 0; game.phase = 'respawn'; game.respawn = .65; game.flight = null
  game.feedback = game.lives ? 'En flaska mindre. Prova igen!' : 'Sista flaskan landade på golvet.'; game.feedbackFor = 1.3
  if (!game.lives) game.status = 'over'
}
function tick(game, dt) {
  game.elapsed = Math.min(BOTTLE_ROUND_SECONDS, game.elapsed + dt)
  game.feedbackFor = Math.max(0, game.feedbackFor - dt)
  if (game.elapsed >= BOTTLE_ROUND_SECONDS) { cancelBottleCharge(game); game.status = 'complete'; game.feedback = 'Två minuter – bra jobbat!'; return }
  if (game.phase === 'charging') game.charge = Math.min(1, game.charge + dt / BOTTLE_CHARGE_SECONDS)
  if (game.phase === 'respawn') {
    game.respawn -= dt
    if (game.respawn <= 0) { const platform = game.platforms[game.current]; game.x = platform.x + platform.width / 2; game.y = platform.y; game.angle = 0; game.phase = 'resting' }
  }
  if (game.phase === 'flying') {
    const flight = game.flight, before = flight.elapsed, after = before + dt
    const obstacles = game.platforms.slice(game.current + 1, game.current + 4)
    // Exact crossing times avoid frame-rate-dependent landings or tunnelling.
    const collisions = []
    if (flight.blockedX === null) for (const platform of obstacles) {
      const time = bottleLandingTime(flight.y, platform.y), x = time === null ? NaN : flight.x + flight.vx * time
      if (time > before && time <= after && x >= platform.x + HALF_BASE && x <= platform.x + platform.width - HALF_BASE && platform.index <= game.current + 2) collisions.push({ time, platform, x, top: true })
      const edgeTime = (platform.x - HALF_BASE - flight.x) / flight.vx
      if (edgeTime > before && edgeTime <= after && flightY(flight, edgeTime) > platform.y && flightY(flight, edgeTime) < BOTTLE_FLOOR) collisions.push({ time: edgeTime, x: platform.x - HALF_BASE })
    }
    collisions.sort((a, b) => a.time - b.time)
    const first = collisions[0]
    if (first?.top) { land(game, first.platform, first.x); return }
    if (first) flight.blockedX = first.x
    flight.elapsed = after
    game.x = flight.blockedX ?? flight.x + flight.vx * after
    game.y = flightY(flight, after)
    const next = game.platforms[game.current + 1], landingTime = bottleLandingTime(flight.y, next.y)
    game.angle = after / landingTime * Math.PI * 2
    if (game.y >= BOTTLE_FLOOR) { game.y = BOTTLE_FLOOR; miss(game) }
  }
}
export function advanceBottle(game, seconds) {
  if (game.status !== 'playing' || !Number.isFinite(seconds) || seconds <= 0) return game
  let remaining = Math.min(seconds, .25)
  while (remaining > 1e-9 && game.status === 'playing') {
    const dt = Math.min(remaining, 1 / 120)
    tick(game, dt); remaining -= dt
  }
  game.camera += (Math.max(0, game.x - 145) - game.camera) * (1 - Math.exp(-Math.min(seconds, .25) * 7))
  return game
}
export const validBottleScore = score => Number.isInteger(score) && score > 0 && score <= BOTTLE_MAX_SCORE
