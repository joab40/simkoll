// Fixed-step simulation shared by rendering and tests. Degrees make the
// control tuning readable; no randomness or frame-rate-dependent scoring.
export const BALANCE_STEP = 1 / 120
export const BALANCE_DURATION = 120
export const BALANCE_MAX_SCORE = 6000
export const BALANCE_ZONE = [38, 58]
export const validBalanceScore = (score) => Number.isInteger(score) && score > 0 && score <= BALANCE_MAX_SCORE

export function createBalanceGame() {
  return { elapsed: 0, remainder: 0, angle: 30, velocity: 0, distance: 0, bonus: 0, score: 0, speed: 8, bumps: 0, status: 'playing', reason: null }
}

export function advanceBalance(game, seconds, lifting) {
  if (game.status !== 'playing' || !Number.isFinite(seconds) || seconds <= 0) return game
  // A delayed frame never fast-forwards a player into a crash.
  game.remainder += Math.min(seconds, .1)
  while (game.remainder + 1e-9 >= BALANCE_STEP && game.status === 'playing') {
    game.remainder = Math.max(0, game.remainder - BALANCE_STEP)
    game.elapsed += BALANCE_STEP
    game.speed = Math.min(22, 8 + game.elapsed * .18)
    const travelled = game.speed * BALANCE_STEP
    game.distance += travelled
    const acceleration = (lifting ? 92 : -68) + (game.angle - 43) * .75 - game.velocity * 3.2
    game.velocity += acceleration * BALANCE_STEP
    // Small, visible bumps; the same course and conditions for everybody.
    if (game.distance >= 100 + game.bumps * 80) {
      game.velocity += [1, -1, 1, 1, -1][game.bumps % 5] * (10 + Math.min(14, game.elapsed * .2))
      game.bumps += 1
    }
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
