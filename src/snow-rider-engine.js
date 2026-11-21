// Distances are game metres. Rendering and collision use the same course profile.
export const SNOW_SECONDS = 120
export const SNOW_MAX_SCORE = 10000
export const SNOW_STEP = 1 / 120
export const SNOW_MAX_SPEED = 48
export const SNOW_HALF_WIDTH = 5.1
export const SNOW_STEERING_LIMIT = 4.25

const START_SPEED = 34
const ACCELERATION = 1
const FIRST_CHALLENGE = 110
const CHALLENGE_SPACING = 48
const LOOKAHEAD = 210

const OPENING_CHALLENGES = ['jump', 'left', 'jump', 'right', 'middle']
const CHALLENGES = ['left', 'jump', 'right', 'jump', 'middle']
const OPENINGS = {left: [-SNOW_HALF_WIDTH, -1.45], right: [1.45, SNOW_HALF_WIDTH], middle: [-1.65, 1.65]}
const GEM_LANES = {left: -3.2, middle: 0, right: 3.2}
const COLLISION_REASONS = {
  rail: 'Pulkan tog i bommen. Hoppa strax före den.',
  bank: 'Pulkan träffade isvallen. Sikta på öppningen.',
}

export function snowTrackCentre(distance) {
  return Math.sin(distance * .043) * 7.4 + Math.sin(distance * .022) * 7
}

export function snowTrackHeight(distance) {
  return Math.sin(distance * .055) * 2.8 + Math.sin(distance * .027) * 2.6 - distance * .038
}

export function snowTrackGrade(distance) {
  return Math.cos(distance * .055) * .154 + Math.cos(distance * .027) * .0702 - .038
}

export function snowNoise(seed) {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453
  return value - Math.floor(value)
}

export function validSnowScore(score) {
  return Number.isInteger(score) && score > 0 && score <= SNOW_MAX_SCORE
}

export function snowScore(game) {
  return Math.min(SNOW_MAX_SCORE, Math.floor(game.distance) + game.gems * 25)
}

function spawnChallenges(game) {
  while (FIRST_CHALLENGE + game.row * CHALLENGE_SPACING < game.distance + LOOKAHEAD) {
    const row = game.row++
    const along = FIRST_CHALLENGE + row * CHALLENGE_SPACING
    const challenge = OPENING_CHALLENGES[row] ?? CHALLENGES[Math.floor(snowNoise(row + game.seed) * CHALLENGES.length)]
    const gemLane = (Math.floor(snowNoise(row + game.seed + 191) * 3) - 1) * 3.2

    if (challenge === 'jump') {
      game.objects.push({id: `rail${row}`, kind: 'rail', challenge, s: along, x: 0, radius: SNOW_HALF_WIDTH, height: .9, depth: 1.2})
      game.objects.push({id: `gem${row}`, kind: 'gem', s: along + 1.5, x: gemLane, radius: .8, height: 1.8, depth: 1})
      continue
    }

    const [openLeft, openRight] = OPENINGS[challenge]
    const addBank = (edge, start, end) => {
      if (end > start) {
        game.objects.push({id: `bank${row}-${edge}`, kind: 'bank', challenge, s: along, x: (start + end) / 2, radius: (end - start) / 2, height: 2.75, depth: 1.75})
      }
    }
    addBank('left', -SNOW_HALF_WIDTH, openLeft)
    addBank('right', openRight, SNOW_HALF_WIDTH)
    game.objects.push({id: `gem${row}`, kind: 'gem', s: along + 4, x: GEM_LANES[challenge], radius: .8, height: 1.1, depth: 1})
  }
}

export function snowUpcomingChallenge(game) {
  // Let a cleared obstacle pass behind the sled before showing the next cue.
  return game.objects.find(item => item.challenge && item.s + item.depth >= game.distance)
}

export function createSnowGame(seed = 137) {
  const game = {
    status: 'ready', seed: Number.isFinite(seed) ? Math.floor(seed) : 137,
    elapsed: 0, distance: 0, speed: START_SPEED, x: 0, vx: 0, y: 0, vy: 0,
    gems: 0, score: 0, row: 0, objects: [], accumulator: 0, reason: '', jumpQueued: false,
  }
  spawnChallenges(game)
  return game
}

export function startSnow(game) {
  if (game.status === 'ready') {
    game.status = 'playing'
    game.accumulator = 0
  }
  return game
}

export function pauseSnow(game) {
  if (game.status === 'playing') {
    game.status = 'paused'
    game.accumulator = 0
    game.jumpQueued = false
  }
  return game
}

export function resumeSnow(game) {
  if (game.status === 'paused') {
    game.status = 'playing'
    game.accumulator = 0
  }
  return game
}

export function jumpSnow(game) {
  if (game.status !== 'playing' || game.y > .001) return false
  game.jumpQueued = true
  return true
}

export function advanceSnow(game, delta, steer = 0) {
  if (game.status !== 'playing' || !Number.isFinite(delta) || delta <= 0) return game
  game.accumulator += Math.min(delta, .1)
  const direction = Number.isFinite(steer) ? Math.max(-1, Math.min(1, steer)) : 0

  while (game.accumulator + 1e-10 >= SNOW_STEP && game.status === 'playing') {
    game.accumulator -= SNOW_STEP
    const step = SNOW_STEP
    if (game.jumpQueued) {
      game.vy = 8.8
      game.jumpQueued = false
    }

    game.elapsed = Math.min(SNOW_SECONDS, game.elapsed + step)
    game.speed = Math.min(SNOW_MAX_SPEED, START_SPEED + game.elapsed * ACCELERATION)
    game.distance += game.speed * step
    game.vx += (direction * 11 - game.vx) * Math.min(1, step * 13)
    game.x = Math.max(-SNOW_STEERING_LIMIT, Math.min(SNOW_STEERING_LIMIT, game.x + game.vx * step))
    if (game.y > 0 || game.vy > 0) {
      game.vy -= 23 * step
      game.y += game.vy * step
      if (game.y <= 0) {
        game.y = 0
        game.vy = 0
      }
    }

    spawnChallenges(game)
    for (const item of game.objects) {
      if (item.taken || Math.abs(item.s - game.distance) > item.depth || Math.abs(item.x - game.x) > item.radius + .38) continue
      if (item.kind === 'gem') {
        if (Math.abs(game.y + .5 - item.height) < 1.2) {
          item.taken = true
          game.gems++
        }
      } else if (game.y < item.height) {
        game.status = 'over'
        game.reason = COLLISION_REASONS[item.kind]
        break
      }
    }
    // The pool is ordered along the course. Keep collected crystals hidden
    // until they leave the pool, avoiding an allocation at every physics step.
    while (game.objects[0]?.s < game.distance - 8) game.objects.shift()
    game.score = snowScore(game)
    if (game.status === 'playing' && game.elapsed >= SNOW_SECONDS) {
      game.status = 'complete'
      game.reason = 'Hela störtbacken avklarad!'
    }
  }
  return game
}
