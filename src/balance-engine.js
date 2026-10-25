// Fixed-step simulation shared by rendering and tests. Degrees make the
// control tuning readable; no randomness or frame-rate-dependent scoring.
export const BALANCE_STEP = 1 / 120
export const BALANCE_DURATION = 120
export const BALANCE_MAX_SCORE = 8000
export const BALANCE_ZONE = [38, 58]
export const BALANCE_START_SPEED = 16
export const BALANCE_TOP_SPEED = 32
export const BALANCE_SCENE_SCALE = 12
export const validBalanceScore = (score) => Number.isInteger(score) && score > 0 && score <= BALANCE_MAX_SCORE

// A shared, repeating course: art and physics use the very same hills.
// Heights/widths are course units; the first hill arrives after the warm-up.
const BUMP_SHAPES = [
  { offset: 0, height: 1.7, width: 10 },
  { offset: 46, height: 2.8, width: 13 },
  { offset: 84, height: 2.1, width: 9 },
  { offset: 138, height: 3.6, width: 16 },
  { offset: 180, height: 2.6, width: 12 },
  { offset: 230, height: 4.2, width: 18 },
]
const COURSE_LENGTH = 270
export function balanceBump(index) {
  const shape = BUMP_SHAPES[index % BUMP_SHAPES.length]
  return { ...shape, center: 70 + Math.floor(index / BUMP_SHAPES.length) * COURSE_LENGTH + shape.offset }
}
export function balanceBumpsBetween(from, to) {
  const first = Math.max(0, Math.floor((from - 80) / COURSE_LENGTH)) * BUMP_SHAPES.length
  const last = Math.max(0, Math.floor((to - 60) / COURSE_LENGTH)) * BUMP_SHAPES.length + BUMP_SHAPES.length
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
  return { elapsed: 0, remainder: 0, angle: 30, velocity: 0, distance: 0, bonus: 0, score: 0, speed: BALANCE_START_SPEED, bumps: 0, roadHeight: 0, roadSlope: 0, status: 'playing', reason: null }
}

export function advanceBalance(game, seconds, lifting) {
  if (game.status !== 'playing' || !Number.isFinite(seconds) || seconds <= 0) return game
  // A delayed frame never fast-forwards a player into a crash.
  game.remainder += Math.min(seconds, .1)
  while (game.remainder + 1e-9 >= BALANCE_STEP && game.status === 'playing') {
    game.remainder = Math.max(0, game.remainder - BALANCE_STEP)
    game.elapsed += BALANCE_STEP
    game.speed = Math.min(BALANCE_TOP_SPEED, BALANCE_START_SPEED + game.elapsed * .28)
    const travelled = game.speed * BALANCE_STEP
    game.distance += travelled
    const acceleration = (lifting ? 92 : -68) + (game.angle - 43) * .75 - game.velocity * 3.2
    game.velocity += acceleration * BALANCE_STEP
    // Following the uphill/downhill profile moves the rear wheel vertically
    // and disturbs balance continuously, rather than a barely visible nudge.
    const road = balanceRoadAt(game.distance)
    game.velocity -= (road.slope - game.roadSlope) * 85 * (game.speed / 20)
    game.roadHeight = road.height; game.roadSlope = road.slope
    while (game.distance >= balanceBump(game.bumps).center) game.bumps += 1
    game.angle += game.velocity * BALANCE_STEP
    if (game.elapsed < 3) {
      if (game.angle < 15) { game.angle = 15; game.velocity = Math.max(0, game.velocity) }
      if (game.angle > 65) { game.angle = 65; game.velocity = Math.min(0, game.velocity) }
    } else if (game.angle <= 6 || game.angle >= 80) {
      game.status = 'over'
      game.reason = game.angle <= 6 ? 'front' : 'tip'
    }
    if (game.angle >= BALANCE_ZONE[0] && game.angle <= BALANCE_ZONE[1]) game.bonus += travelled
    game.score = Math.min(BALANCE_MAX_SCORE, Math.floor(game.distance + game.bonus))
    if (game.elapsed + 1e-9 >= BALANCE_DURATION && game.status === 'playing') {
      game.status = 'over'
      game.reason = 'finish'
    }
  }
  return game
}
