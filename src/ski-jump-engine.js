export const SKI_LIP = 78
export const SKI_K_POINT = 105
export const SKI_APPROACH_TIME = 4.35
export const SKI_LANDING_LEAD = 1.65
export const SKI_MAX_SCORE = 1500
export const SKI_WIND = [-2, -1, 0, 1, 2]
export const SKI_CROSSWINDS = [-3, -2, 2, 3]
export const SKI_BALANCE_ZONE = .23
export const SKI_TAKEOFF_ZONE = [.78, 1]
export const SKI_LANDING_ZONE = [.45, .95]
export const SKI_ANGLE_MIN = 10
export const SKI_ANGLE_MAX = 26
export const SKI_ANGLE_ZONE = [15, 21]
const pushDuration = .85
const idealAngle = 18
const idealHold = (idealAngle - SKI_ANGLE_MIN) / (SKI_ANGLE_MAX - SKI_ANGLE_MIN) * pushDuration

const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value))
const gravity = 10.8
const runoutTime = 1.06
const hillGrade = -.48
const hillCurve = 108
const hillRunout = 147

export function skiRampHeight(distance) {
  const remaining = SKI_LIP - distance
  return remaining * (.17 + remaining * .005)
}

export function skiHillHeight(distance) {
  const beyond = distance - SKI_LIP
  if (beyond < 0) return skiRampHeight(distance) - 8
  const easing = clamp(beyond - hillCurve, 0, hillRunout - hillCurve)
  return -8 + hillGrade * Math.min(beyond, hillCurve) + hillGrade * easing * (1 - easing / (2 * (hillRunout - hillCurve)))
}

export function skiGrade(heightAt, distance) {
  return (heightAt(distance + .05) - heightAt(distance - .05)) / .1
}

export function createSkiJump(wind = 0, crosswind = 0) {
  return {
    phase: 'ready', elapsed: 0, wind: SKI_WIND.includes(wind) ? wind : 0,
    crosswind: SKI_CROSSWINDS.includes(crosswind) ? crosswind : 0, gust: 0,
    distance: 0, height: skiRampHeight(0), speed: 0, pitch: 0,
    bank: 0, drift: 0, instability: 0,
    launch: null, landing: null, result: null,
  }
}

function approach(progress) {
  return SKI_LIP * (.4 * progress + .6 * progress ** 2)
}

function airHeight(launch, time) {
  return launch.height + launch.lift * time - gravity * time ** 2 / 2
}

function findTouchdown(launch, elapsed, distance, speed) {
  let low = elapsed + Math.max(0, (SKI_LIP - distance) / speed)
  let high = 6
  for (let iteration = 0; iteration < 17; iteration++) {
    const time = (low + high) / 2
    const height = skiHillHeight(distance + speed * (time - elapsed))
    if (airHeight(launch, time) > height) low = time
    else high = time
  }
  return high
}

export function skiTiming(game) {
  if (game.phase === 'approach') return { position: clamp(game.elapsed / SKI_APPROACH_TIME), zone: SKI_TAKEOFF_ZONE }
  if (game.phase === 'air' && !game.landing) {
    const touchdown = findTouchdown(game.launch, game.elapsed, game.distance, game.speed)
    const shrink = Math.abs(game.bank) * .11
    return {
      position: clamp(1 - (touchdown - game.elapsed) / SKI_LANDING_LEAD),
      zone: [SKI_LANDING_ZONE[0] + shrink, SKI_LANDING_ZONE[1] - shrink],
    }
  }
  return null
}

export function skiPushAngle(seconds) {
  return SKI_ANGLE_MIN + (SKI_ANGLE_MAX - SKI_ANGLE_MIN) * clamp(seconds / pushDuration)
}

export function skiAction(game, hold = idealHold) {
  if (game.phase === 'ready') {
    game.phase = 'approach'
    return
  }
  if (game.phase === 'approach') {
    const progress = game.elapsed / SKI_APPROACH_TIME
    if (progress < .72) {
      game.result = { reason: 'För tidigt upphopp. Vänta tills markören närmar sig det gröna fältet.', distance: 0, style: 0, score: 0 }
      game.phase = 'finished'
      return
    }
    const timing = clamp(1 - Math.abs(progress - .95) / .24)
    const angle = skiPushAngle(Number.isFinite(hold) ? hold : 0)
    const angleQuality = clamp(1 - Math.abs(angle - idealAngle) / 14)
    const launch = {
      distance: game.distance,
      height: game.height,
      speed: 25.5 + timing * 6 + game.wind * .65 - (1 - angleQuality) * 3.8,
      lift: -.8 + timing * 3.2 - (1 - angleQuality) * 2.1,
      timing, angle, angleQuality, progress,
    }
    game.phase = 'air'
    game.elapsed = 0
    game.launch = launch
    game.speed = launch.speed
    return
  }
  if (game.phase === 'air' && !game.landing) {
    const { position, zone: [early, late] } = skiTiming(game)
    const quality = position >= early && position <= late
      ? clamp(1 - Math.abs(position - .72) / (late - early)) : 0
    game.landing = { quality, early: position < early }
  }
}

export function advanceSkiJump(game, delta, steer = 0) {
  if (!Number.isFinite(delta) || delta <= 0) return
  const time = game.elapsed + delta
  if (game.phase === 'approach') {
    const progress = Math.min(time / SKI_APPROACH_TIME, 1)
    game.elapsed = time
    game.distance = approach(progress)
    game.height = skiRampHeight(game.distance)
    game.speed = (SKI_LIP / SKI_APPROACH_TIME) * (.4 + 1.2 * progress)
    game.pitch = Math.atan(skiGrade(skiRampHeight, game.distance))
    if (time >= SKI_APPROACH_TIME) {
      game.result = { reason: 'Du missade hoppkanten. Tryck Hoppa precis innan spåret tar slut.', distance: 0, style: 0, score: 0 }
      game.phase = 'finished'
    }
    return
  }
  if (game.phase === 'air') {
    const input = Number.isFinite(steer) ? clamp(steer, -1, 1) : 0
    // Short steps keep the wind and touchdown consistent at different frame rates.
    let remaining = delta
    while (remaining > 0 && game.phase === 'air') {
      const step = Math.min(.02, remaining)
      advanceFlight(game, step, input)
      remaining -= step
    }
    return
  }
  if (game.phase === 'runout') {
    game.elapsed = Math.min(time, runoutTime)
    const progress = game.elapsed / runoutTime
    game.drift = game.touchdownDrift * (1 - progress * .35)
    game.bank = game.touchdownBank * (1 - progress)
    game.distance = game.touchdownDistance + (game.result.score ? 17 : 6) * (1 - (1 - progress) ** 2)
    game.height = skiHillHeight(game.distance)
    game.speed = (game.result.score ? 32 : 11) * (1 - progress)
    game.pitch = Math.atan(skiGrade(skiHillHeight, game.distance))
    if (progress === 1) game.phase = 'finished'
  }
}

function advanceFlight(game, step, steer) {
  const { launch, landing } = game
  const time = game.elapsed + step
  const gust = game.crosswind * (.66 + .34 * Math.sin(time * 2.5 - .2) + .17 * Math.sin(time * 5.4))
  const equilibrium = gust * .4 + steer * 1.85
  const bank = clamp(equilibrium + (game.bank - equilibrium) * Math.exp(-2.2 * step), -1, 1)
  const speed = launch.speed * (1 - .22 * bank ** 2)
  const distance = game.distance + speed * step
  const height = airHeight(launch, time)
  const landed = distance >= SKI_LIP && height <= skiHillHeight(distance)
  const contact = landed ? findTouchdown(launch, game.elapsed, game.distance, speed) : time
  const inAir = contact - game.elapsed

  game.elapsed = contact
  game.distance += speed * inAir
  game.height = airHeight(launch, contact)
  game.speed = speed
  game.bank = bank
  game.gust = gust
  game.drift = clamp(game.drift + bank * inAir * 1.6, -5.5, 5.5)
  game.instability += Math.abs(bank) * inAir
  const angle = Math.atan2(launch.lift - gravity * contact, speed)
  const groundAngle = Math.atan(skiGrade(skiHillHeight, game.distance))
  game.pitch = landing?.quality ? groundAngle : clamp(angle * .52 + .11, -.48, .28)
  if (!landed) return

  const jumpDistance = Math.round(10 * (game.distance - SKI_LIP)) / 10
  const stability = clamp(1 - game.instability / contact)
  const takeoff = Math.round(100 * launch.timing)
  const landingQuality = landing?.quality ? Math.round(100 * landing.quality * (.68 + .32 * stability)) : 0
  const style = landing?.quality
    ? Math.round(100 * (.28 * launch.timing + .07 * launch.angleQuality + .65 * landing.quality) * (.68 + .32 * stability)) : 0
  const score = landing?.quality ? Math.round(10 * (.9 * jumpDistance + .36 * style)) : 0
  const landingLabel = landing?.quality
    ? landingQuality >= 90 ? 'Telemark' : 'Godkänd landning'
    : landing?.early ? 'För tidig landning' : 'För sen landning'
  const reason = landing?.quality
    ? 'Längd, upphopp och landning räknas in i poängen.'
    : landing?.early ? 'Vänta tills markören kommer in i det gröna fältet.' : 'Tryck i grönt innan skidorna når snön.'
  game.result = { distance: jumpDistance, style, score, reason, angle: Math.round(launch.angle), takeoff, landingQuality, landingLabel }
  game.height = skiHillHeight(game.distance)
  game.phase = 'runout'
  game.elapsed = 0
  game.touchdownDistance = game.distance
  game.touchdownBank = game.bank
  game.touchdownDrift = game.drift
}

export function validSkiJumpScore(score) {
  return Number.isInteger(score) && score > 0 && score <= SKI_MAX_SCORE
}

export function formatSkiJumpScore(score) {
  return (score / 10).toLocaleString('sv-SE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}
