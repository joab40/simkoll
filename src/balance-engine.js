// Fixed-step simulation shared by rendering and tests. Degrees make the
// control tuning readable; no randomness or frame-rate-dependent scoring.
export const BALANCE_STEP = 1 / 120
export const BALANCE_DURATION = 120
export const BALANCE_MAX_SCORE = 11000
export const BALANCE_ZONE = [38, 58]
export const BALANCE_START_SPEED = 24
export const BALANCE_TOP_SPEED = 44
export const BALANCE_SCENE_SCALE = 12
export const BALANCE_LAUNCH_TIME = 6
export const BALANCE_IMPACT_TIME = .28
export const validBalanceScore = (score) => Number.isInteger(score) && score > 0 && score <= BALANCE_MAX_SCORE

// A shared, repeating course: art and physics use the same hills and holes.
// Signed heights distinguish potholes; none arrive during the launch window.
const BUMP_SHAPES = [
  { offset: 0, height: 1.7, width: 10 },
  { offset: 65, height: -1.8, width: 6 },
  { offset: 112, height: 3.4, width: 14 },
  { offset: 155, height: 2.2, width: 9 },
  { offset: 218, height: -2.5, width: 7 },
  { offset: 270, height: 4.2, width: 18 },
]
const COURSE_START = 180
const COURSE_LENGTH = 340
const MAX_HALF_WIDTH = 10
export function balanceBump(index) {
  const shape = BUMP_SHAPES[index % BUMP_SHAPES.length]
  return { ...shape, index, kind: shape.height < 0 ? 'pothole' : 'hill', center: COURSE_START + Math.floor(index / BUMP_SHAPES.length) * COURSE_LENGTH + shape.offset }
}
export function balanceBumpsBetween(from, to) {
  const first = Math.max(0, Math.floor((from - COURSE_START - MAX_HALF_WIDTH) / COURSE_LENGTH)) * BUMP_SHAPES.length
  const last = Math.max(0, Math.floor((to - COURSE_START + MAX_HALF_WIDTH) / COURSE_LENGTH)) * BUMP_SHAPES.length + BUMP_SHAPES.length
  const bumps = []
  for (let index = first; index < last; index++) {
    const bump = balanceBump(index)
    if (bump.center + bump.width / 2 >= from && bump.center - bump.width / 2 <= to) bumps.push(bump)
  }
  return bumps
}
export function balanceRoadAt(distance, bumps = balanceBumpsBetween(distance, distance)) {
  const bump = bumps.find((item) => Math.abs(distance - item.center) < item.width / 2)
  if (!bump) return { height: 0, slope: 0 }
  const t = (distance - bump.center) / (bump.width / 2)
  return { height: bump.height * Math.cos(t * Math.PI / 2) ** 2, slope: -bump.height * Math.PI / bump.width * Math.sin(t * Math.PI) }
}

export function createBalanceGame() {
  return { elapsed: 0, remainder: 0, angle: 0, velocity: 0, distance: 0, wheelieDistance: 0, wheelieStarted: false, bonus: 0, score: 0, speed: BALANCE_START_SPEED, bumps: 0, potholeHits: 0, impactTimer: 0, impactStrength: 0, roadHeight: 0, roadSlope: 0, status: 'playing', reason: null }
}

export function advanceBalance(game, seconds, lifting) {
  if (game.status !== 'playing' || !Number.isFinite(seconds) || seconds <= 0) return game
  // A delayed frame never fast-forwards a player into a crash.
  game.remainder += Math.min(seconds, .1)
  while (game.remainder + 1e-9 >= BALANCE_STEP && game.status === 'playing') {
    game.remainder = Math.max(0, game.remainder - BALANCE_STEP)
    game.elapsed += BALANCE_STEP
    game.speed = Math.min(BALANCE_TOP_SPEED, BALANCE_START_SPEED + game.elapsed * .4)
    const travelled = game.speed * BALANCE_STEP
    const previousDistance = game.distance
    game.distance += travelled
    game.impactTimer = Math.max(0, game.impactTimer - BALANCE_STEP)
    const difficulty = 1 + Math.min(.6, game.elapsed / 75)
    const acceleration = ((lifting ? 115 : -95) + (game.angle - 44) * 1.3) * difficulty - game.velocity * 2.5
    game.velocity += acceleration * BALANCE_STEP
    // Following the uphill/downhill profile moves the rear wheel vertically
    // and disturbs balance continuously, rather than a barely visible nudge.
    const road = balanceRoadAt(game.distance)
    game.velocity -= (road.slope - game.roadSlope) * 70 * (game.speed / 24)
    game.roadHeight = road.height; game.roadSlope = road.slope
    for (const feature of balanceBumpsBetween(previousDistance, game.distance)) {
      const edge = feature.center - feature.width / 2
      if (feature.kind !== 'pothole' || previousDistance >= edge || game.distance < edge) continue
      game.velocity += (feature.index % 2 ? 1 : -1) * Math.abs(feature.height) * (6 + game.speed * .12)
      game.potholeHits += 1
      game.impactTimer = BALANCE_IMPACT_TIME
      game.impactStrength = Math.min(10, 4 + Math.abs(feature.height) * 1.3 + game.speed * .03)
    }
    while (game.distance >= balanceBump(game.bumps).center) game.bumps += 1
    game.angle += game.velocity * BALANCE_STEP
    if (!game.wheelieStarted) {
      if (game.angle < 0) { game.angle = 0; game.velocity = Math.max(0, game.velocity) }
      if (game.angle >= 8) game.wheelieStarted = true
      else if (game.elapsed >= BALANCE_LAUNCH_TIME) { game.status = 'over'; game.reason = 'launch' }
    }
    if (game.wheelieStarted && (game.angle <= 4 || game.angle >= 80)) {
      game.status = 'over'
      game.reason = game.angle <= 4 ? 'front' : 'tip'
    }
    if (game.wheelieStarted && game.status === 'playing') {
      game.wheelieDistance += travelled
      if (game.angle >= BALANCE_ZONE[0] && game.angle <= BALANCE_ZONE[1]) game.bonus += travelled
    }
    game.score = Math.min(BALANCE_MAX_SCORE, Math.floor(game.wheelieDistance + game.bonus))
    if (game.elapsed + 1e-9 >= BALANCE_DURATION && game.status === 'playing') {
      game.status = 'over'
      game.reason = 'finish'
    }
  }
  return game
}
