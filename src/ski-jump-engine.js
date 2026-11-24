export const SKI_LIP = 78
export const SKI_K_POINT = 105
export const SKI_APPROACH_TIME = 3.35
export const SKI_LANDING_LEAD = .9
export const SKI_MAX_SCORE = 1500
export const SKI_WIND = [-2, -1, 0, 1, 2]
export const SKI_TAKEOFF_ZONE = [.86, 1]
export const SKI_LANDING_ZONE = [.48, .95]

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

export function createSkiJump(wind = 0) {
  return {
    phase: 'ready', elapsed: 0, wind: SKI_WIND.includes(wind) ? wind : 0,
    distance: 0, height: skiRampHeight(0), speed: 0, pitch: 0,
    launch: null, landing: null, result: null,
  }
}

function approach(progress) {
  return SKI_LIP * (.4 * progress + .6 * progress ** 2)
}

function airHeight(launch, time) {
  return launch.height + launch.lift * time - gravity * time ** 2 / 2
}

function findTouchdown(launch) {
  let low = (SKI_LIP - launch.distance) / launch.speed
  let high = 6
  for (let iteration = 0; iteration < 24; iteration++) {
    const time = (low + high) / 2
    const height = skiHillHeight(launch.distance + launch.speed * time)
    if (airHeight(launch, time) > height) low = time
    else high = time
  }
  return high
}

export function skiTiming(game) {
  if (game.phase === 'approach') return { position: clamp(game.elapsed / SKI_APPROACH_TIME), zone: SKI_TAKEOFF_ZONE }
  if (game.phase === 'air' && !game.landing) {
    return { position: clamp(1 - (game.launch.touchdown - game.elapsed) / SKI_LANDING_LEAD), zone: SKI_LANDING_ZONE }
  }
  return null
}

export function skiAction(game) {
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
    const timing = clamp(1 - Math.abs(progress - .975) / .22)
    const launch = {
      distance: game.distance,
      height: game.height,
      speed: 25.5 + timing * 6 + game.wind * .65,
      lift: -.8 + timing * 3.2,
      timing,
    }
    launch.touchdown = findTouchdown(launch)
    game.phase = 'air'
    game.elapsed = 0
    game.launch = launch
    game.speed = launch.speed
    return
  }
  if (game.phase === 'air' && !game.landing) {
    const position = 1 - (game.launch.touchdown - game.elapsed) / SKI_LANDING_LEAD
    const quality = position >= SKI_LANDING_ZONE[0] && position <= SKI_LANDING_ZONE[1]
      ? clamp(1 - Math.abs(position - .72) / .46) : 0
    game.landing = { quality, early: position < SKI_LANDING_ZONE[0] }
  }
}

export function advanceSkiJump(game, delta) {
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
    const { launch, landing } = game
    game.elapsed = Math.min(time, launch.touchdown)
    game.distance = launch.distance + launch.speed * game.elapsed
    game.height = airHeight(launch, game.elapsed)
    const angle = Math.atan2(launch.lift - gravity * game.elapsed, launch.speed)
    const groundAngle = Math.atan(skiGrade(skiHillHeight, game.distance))
    const landingProgress = landing?.quality ? clamp(1 - (launch.touchdown - time) / .26) : 0
    game.pitch = clamp(angle * .52 + .11, -.48, .28) * (1 - landingProgress) + groundAngle * landingProgress
    if (time < launch.touchdown) return

    const distance = Math.round(10 * (game.distance - SKI_LIP)) / 10
    const style = Math.round(100 * (.35 * launch.timing + .65 * (landing?.quality ?? 0)))
    const score = landing?.quality ? Math.round(10 * (.9 * distance + .36 * style)) : 0
    const reason = landing?.quality
      ? style >= 90 ? 'Snyggt! Du satte en telemarklandning.' : 'Stabilt! Nästa meter finns i tajmingen.'
      : landing?.early ? 'Landningen kom för tidigt. Vänta på det gröna fältet.' : 'Landningen kom för sent. Tryck innan skidorna når snön.'
    game.result = { distance, style, score, reason }
    game.height = skiHillHeight(game.distance)
    game.phase = 'runout'
    game.elapsed = 0
    game.touchdownDistance = game.distance
    return
  }
  if (game.phase === 'runout') {
    game.elapsed = Math.min(time, runoutTime)
    const progress = game.elapsed / runoutTime
    game.distance = game.touchdownDistance + (game.result.score ? 17 : 6) * (1 - (1 - progress) ** 2)
    game.height = skiHillHeight(game.distance)
    game.speed = (game.result.score ? 32 : 11) * (1 - progress)
    game.pitch = Math.atan(skiGrade(skiHillHeight, game.distance))
    if (progress === 1) game.phase = 'finished'
  }
}

export function validSkiJumpScore(score) {
  return Number.isInteger(score) && score > 0 && score <= SKI_MAX_SCORE
}

export function formatSkiJumpScore(score) {
  return (score / 10).toLocaleString('sv-SE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}
