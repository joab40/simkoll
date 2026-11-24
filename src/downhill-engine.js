import { winterSteer } from './winter-steering.js'

export const DOWNHILL_PREVIOUS_LENGTH = 1480
export const DOWNHILL_LENGTH = 1720
export const DOWNHILL_HALF_WIDTH = 8.8
export const DOWNHILL_COURSE = 'crest'
export const DOWNHILL_GREEN_AT = 3
export const DOWNHILL_START_WINDOW = .19
export const DOWNHILL_SCORE_BASE = 100000
export const DOWNHILL_MAX_MS = 90000

const maxSpeed = 51.5
const step = 1 / 120
const missedGatePenalty = 1.25
const falseStartPenalty = .8
const baseGrade = -.29
const gradeWaves = [[.163, .016], [.108, .033], [-.038, .006]]
const tuckSpeed = 3.65
const normalCrest = { radius: 16, height: 1.8, lift: 5.8, gravity: 17 }
const smallCrest = { radius: 8, height: .85, lift: 3.15, gravity: 18 }
const finalStraightStart = 1560
const finalStraightTransition = 34
const jumpLead = 17
const jumpLateWindow = .22
export const DOWNHILL_MIN_MS = Math.floor(DOWNHILL_LENGTH * 1000 / maxSpeed)
export const DOWNHILL_PREVIOUS_MIN_MS = Math.floor(DOWNHILL_PREVIOUS_LENGTH * 1000 / maxSpeed)

const clamp = (value, min, max) => Math.max(min, Math.min(max, value))
const mix = (a, b, amount) => a + (b - a) * amount
const smooth = value => value * value * (3 - 2 * value)

export const DOWNHILL_SECTORS = [
  { name: 'Iskammen', start: 0 },
  { name: 'Gransvängen', start: 494 },
  { name: 'Gupprakan', start: 700 },
  { name: 'Slutbranten', start: 1030 },
  { name: 'Fjällrakan', start: 1450 },
]

export const DOWNHILL_CRESTS = [
  ...[301, 595, 818, 1118, 1434].map(distance => ({ distance, ...normalCrest })),
  ...[734, 775, 885].map(distance => ({ distance, ...smallCrest })),
  { distance: 1606, radius: 25, height: 4.7, lift: 11.45, gravity: 14, final: true },
].sort((a, b) => a.distance - b.distance)

export const DOWNHILL_GATES = [
  [114, -2.7], [187, 3.8], [257, -3.4], [337, -2.7], [419, 3.4], [486, -3.5],
  [568, 3.8], [633, -4], [709, 1.6], [787, -1.8], [863, 2.2], [929, -4],
  [998, 3.8], [1082, -3.3], [1163, 3.5], [1236, -4], [1303, 3.8], [1386, -3.6],
  [1487, 4.2], [1532, -3.9], [1575, 2.6],
].map(([distance, x], index) => ({
  id: index + 1, distance, x, halfWidth: index < 3 ? 4.8 : 4.4,
  color: index % 2 ? '#1d86ba' : '#f46f59',
}))

const windingCentre = s => 17 * Math.sin(s * .024) + 13 * Math.sin(s * .041) + 22 * Math.sin(s * .009)
const straightCentre = windingCentre(672)
const straightBlend = s => smooth(clamp((s - 642) / 58, 0, 1)) * smooth(clamp((951 - s) / 49, 0, 1))

export function downhillCentre(distance) {
  const s = clamp(distance, 0, DOWNHILL_LENGTH)
  const bend = smooth(Math.min(1, s / 51))
  const exit = Math.max(0, s - finalStraightStart)
  const easing = Math.min(exit, finalStraightTransition)
  const curve = s - exit + easing * (1 - easing / (2 * finalStraightTransition))
  return bend * mix(windingCentre(curve), straightCentre, straightBlend(s))
}

export function downhillGrade(distance) {
  const s = clamp(distance, 0, DOWNHILL_LENGTH)
  let grade = baseGrade
  for (const [amplitude, frequency] of gradeWaves) grade += amplitude * Math.cos(s * frequency)
  for (const crest of DOWNHILL_CRESTS) {
    const offset = s - crest.distance
    if (Math.abs(offset) < crest.radius) grade -= crest.height * Math.PI / (2 * crest.radius) * Math.sin(offset * Math.PI / crest.radius)
  }
  return distance > DOWNHILL_LENGTH ? grade * Math.max(0, 1 - (distance - DOWNHILL_LENGTH) / 52) : grade
}

export function downhillHeight(distance) {
  const s = clamp(distance, 0, DOWNHILL_LENGTH)
  let height = baseGrade * s
  for (const [amplitude, frequency] of gradeWaves) height += amplitude / frequency * Math.sin(s * frequency)
  for (const crest of DOWNHILL_CRESTS) {
    const offset = s - crest.distance
    if (Math.abs(offset) < crest.radius) height += crest.height / 2 * (1 + Math.cos(offset * Math.PI / crest.radius))
  }
  const outrun = clamp(distance - DOWNHILL_LENGTH, 0, 52)
  if (distance < 0) return distance * downhillGrade(0)
  return height + downhillGrade(s) * outrun * (1 - outrun / 104)
}

export function downhillBank(distance) {
  const s = clamp(distance, 0, DOWNHILL_LENGTH)
  const exit = clamp(1 - (s - finalStraightStart) / finalStraightTransition, 0, 1)
  return exit * (1 - straightBlend(s)) * (.12 * Math.sin(s * .024) + .15 * Math.sin(s * .041))
}

export function downhillSurface(distance, x) {
  return downhillHeight(distance) + clamp(x, -DOWNHILL_HALF_WIDTH, DOWNHILL_HALF_WIDTH) * downhillBank(distance)
}

export function createDownhillRace() {
  return {
    phase: 'ready', countdown: 0, early: false, launch: '', track: 0, elapsed: 0,
    speed: 0, x: 0, vx: 0, accumulator: 0, penalty: 0, gateIndex: 0,
    cleared: 0, streak: 0, boost: 0, boostUntil: 0, feedback: null, result: null,
    crestIndex: 0, jump: null, jumpQueued: false, finalJumpDistance: 0, jumpBoostUntil: 0,
  }
}

function launchDownhill(race, precision) {
  race.launch = race.early ? 'early' : precision ? 'perfect' : 'normal'
  race.speed = precision && !race.early ? 27 : 16
  race.penalty = race.early ? falseStartPenalty : 0
  race.phase = 'racing'
}

export function downhillStartAction(race) {
  if (race.phase === 'ready') race.phase = 'countdown'
  else if (race.phase === 'countdown') {
    if (race.countdown < DOWNHILL_GREEN_AT) race.early = true
    else launchDownhill(race, race.countdown <= DOWNHILL_GREEN_AT + DOWNHILL_START_WINDOW)
  }
}

function passGate(race, gate, x) {
  const offset = Math.abs(x - gate.x)
  if (offset > gate.halfWidth) {
    race.penalty += missedGatePenalty
    race.streak = 0
    race.boostUntil = race.elapsed
    race.speed *= .94
    race.feedback = { text: 'Missad port · +1,25 s', tone: 'miss', at: race.elapsed }
    return
  }
  race.cleared++
  const clean = offset <= gate.halfWidth * .54
  race.streak = clean ? race.streak + 1 : 0
  if (clean) {
    const boost = race.streak % 3 === 0
    race.boost = boost ? 4.4 : 1.65
    race.boostUntil = race.elapsed + (boost ? 1.65 : .68)
    race.feedback = {
      text: boost ? 'Tre rena portar · fartboost' : 'Ren sväng · bättre glid',
      tone: boost ? 'boost' : 'clear',
      at: race.elapsed,
    }
  } else race.feedback = { text: 'Port klar', tone: 'clear', at: race.elapsed }
}

function readyToExtend(jump) {
  return Boolean(jump?.crest && !jump.extended && jump.age <= jumpLateWindow)
}

export function canTimeDownhillJump(race) {
  if (race.jump) return readyToExtend(race.jump)
  return !race.jumpQueued && (DOWNHILL_CRESTS[race.crestIndex]?.distance ?? Infinity) - race.track <= jumpLead
}

function extendJump(race) {
  const { crest } = race.jump
  race.jump.extended = true
  race.jump.velocity += crest.lift < normalCrest.lift ? 2.75 : 3.6
  race.speed = Math.min(maxSpeed, race.speed + 1.2)
  race.jumpBoostUntil = race.elapsed + 1.15
  race.feedback = { text: crest.final ? 'Finalhopp · fartboost' : 'Tajmat hopp · fartboost', tone: 'boost', at: race.elapsed }
}

export function downhillJumpAction(race) {
  if (race.phase !== 'racing') return
  if (race.jump) {
    if (readyToExtend(race.jump)) extendJump(race)
  } else if ((DOWNHILL_CRESTS[race.crestIndex]?.distance ?? Infinity) - race.track <= jumpLead) {
    race.jumpQueued = true
  } else {
    race.jump = { crest: null, age: 0, height: 0, velocity: 3.5, extended: false }
  }
}

function updateJump(race) {
  const crest = DOWNHILL_CRESTS[race.crestIndex]
  if (crest && race.track >= crest.distance) {
    race.crestIndex++
    if (!race.jump || crest.final || race.jumpQueued) {
      race.jump = { crest, age: 0, height: race.jump?.height || 0, velocity: crest.lift, extended: false }
      if (race.jumpQueued) extendJump(race)
      else if (crest.final) race.feedback = { text: 'Finalhopp!', tone: 'clear', at: race.elapsed }
    }
    race.jumpQueued = false
  }
  const jump = race.jump
  if (!jump) return
  jump.age += step
  jump.velocity -= (jump.crest?.gravity ?? smallCrest.gravity) * step
  jump.height += jump.velocity * step
  if (jump.height <= 0) {
    if (jump.crest?.final) {
      race.finalJumpDistance = Math.round(race.track - jump.crest.distance)
      race.feedback = { text: `Finalhopp · ${race.finalJumpDistance} m`, tone: 'clear', at: race.elapsed }
    }
    race.jump = null
  }
}

function racingStep(race, direction) {
  const oldTrack = race.track
  const oldX = race.x
  const banking = downhillBank(oldTrack)
  const edge = clamp((Math.abs(oldX) - DOWNHILL_HALF_WIDTH + 1.15) / 1.15, 0, 1)
  const boost = race.elapsed < race.boostUntil ? race.boost : 0
  const jumpBoost = race.elapsed < race.jumpBoostUntil ? 3.9 : 0
  const turnDrag = (Math.abs(direction) * 2.4 + Math.abs(race.vx) * .11) * (race.jump ? .38 : 1)
  const target = 40.4 + clamp(-downhillGrade(oldTrack) + baseGrade, -.29, .3) * 22
    + tuckSpeed + boost + jumpBoost - edge * 7 - turnDrag
  race.speed = clamp(race.speed + (target - race.speed) * step * 1.15, 0, maxSpeed)
  const groundTurn = clamp(direction - banking * .28, -1, 1)
  race.vx = race.jump ? winterSteer(race.vx, direction * .6, step * .55) : winterSteer(race.vx, groundTurn, step)
  race.x = clamp(oldX + race.vx * step, -DOWNHILL_HALF_WIDTH, DOWNHILL_HALF_WIDTH)
  const travel = race.speed * step
  race.track = Math.min(DOWNHILL_LENGTH, oldTrack + travel)
  race.elapsed += step * Math.min(1, (race.track - oldTrack) / travel)

  const gate = DOWNHILL_GATES[race.gateIndex]
  if (gate && race.track >= gate.distance) {
    const crossing = (gate.distance - oldTrack) / travel
    passGate(race, gate, mix(oldX, race.x, crossing))
    race.gateIndex++
  }
  updateJump(race)
  if (race.track === DOWNHILL_LENGTH) {
    const raceMs = Math.round(race.elapsed * 1000)
    const penaltyMs = Math.round(race.penalty * 1000)
    race.result = { raceMs, penaltyMs, timeMs: raceMs + penaltyMs, gates: race.cleared, finalJumpDistance: race.finalJumpDistance }
    race.phase = 'finished'
  }
}

export function advanceDownhill(race, delta, steer = 0) {
  if (!Number.isFinite(delta) || delta <= 0 || !['countdown', 'racing'].includes(race.phase)) return
  const direction = Number.isFinite(steer) ? clamp(steer, -1, 1) : 0
  race.accumulator += Math.min(.1, delta)
  while (race.accumulator >= step - 1e-9) {
    race.accumulator -= step
    if (race.phase === 'countdown') {
      race.countdown += step
      if (race.countdown >= DOWNHILL_GREEN_AT + (race.early ? 0 : .64)) launchDownhill(race, false)
    } else if (race.phase === 'racing') racingStep(race, direction)
    else break
  }
}

export function validDownhillScore(score, minMs = DOWNHILL_MIN_MS) {
  return Number.isInteger(score) && score >= DOWNHILL_SCORE_BASE - DOWNHILL_MAX_MS
    && score <= DOWNHILL_SCORE_BASE - minMs
}

export function downhillTime(ms, decimals = 2) {
  const digits = Math.trunc(ms / 10 ** (3 - decimals))
  const scale = 10 ** decimals
  const seconds = Math.floor(digits / scale)
  const fraction = String(digits % scale).padStart(decimals, '0')
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')},${fraction}`
}
