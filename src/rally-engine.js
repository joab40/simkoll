// Original fixed-step circuit racer. No third-party game code or assets.
export const RALLY_STEP = 1 / 120
export const RALLY_LAPS = 3
export const RALLY_LIMIT = 180
export const RALLY_MAX_SCORE = 33999
export const RALLY_REPLAY_VERSION = 'kustslingan-3'
const TAU = Math.PI * 2
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
const wrap = (v, length) => ((v % length) + length) % length
export const rallyAngle = value => wrap(value + Math.PI, TAU) - Math.PI
export const RALLY_TRACKS = [
  { name: 'Kustslingan', theme: 'coast', width: 120, anchors: [[430,260],[750,245],[1030,300],[1160,460],[1080,650],[860,735],[660,660],[460,730],[290,630],[250,440],[320,320]] },
]
export const validRallyScore = score => Number.isInteger(score) && score >= 10000 && score <= RALLY_MAX_SCORE && score % 10000 < 4000
export function rallyScore(stage, rank, elapsed) {
  // Keep the original score format readable for already saved results.
  if (!Number.isInteger(stage) || stage < 0 || stage > 2 || !Number.isInteger(rank) || rank < 1 || rank > 4 || !Number.isFinite(elapsed) || elapsed <= 0 || elapsed > RALLY_LIMIT) return 0
  return (stage + 1) * 10000 + (4 - rank) * 1000 + clamp(Math.round(999 * (1 - elapsed / RALLY_LIMIT)), 0, 999)
}
const mix = (a, b, t) => a + (b - a) * t
// Periodic cubic B-spline: continuous curvature, without sharp anchor corners.
function smoothCurve(a, b, c, d, t) {
  return ((1-t)**3*a + (3*t**3-6*t*t+4)*b + (-3*t**3+3*t*t+3*t+1)*c + t**3*d) / 6
}
export function createRallyTrack(stage = 0) {
  if (!Number.isInteger(stage) || !RALLY_TRACKS[stage]) throw new Error('Ogiltig rallybana.')
  const config = RALLY_TRACKS[stage], anchors = config.anchors, points = []
  for (let i = 0; i < anchors.length; i++) for (let j = 0; j < 48; j++) {
    const p = [anchors[wrap(i - 1, anchors.length)], anchors[i], anchors[(i + 1) % anchors.length], anchors[(i + 2) % anchors.length]]
    points.push({ x: smoothCurve(...p.map(v => v[0]), j / 48), y: smoothCurve(...p.map(v => v[1]), j / 48) })
  }
  let length = 0
  const segments = points.map((p, i) => {
    const q = points[(i + 1) % points.length], size = Math.hypot(q.x - p.x, q.y - p.y)
    const segment = { ...p, dx: q.x - p.x, dy: q.y - p.y, size, s: length }; length += size
    return segment
  })
  segments.forEach((part,i) => {
    const previous = segments[wrap(i-1,segments.length)]
    part.angle = Math.atan2(previous.dy/previous.size+part.dy/part.size,previous.dx/previous.size+part.dx/part.size)
  })
  segments.forEach((part,i) => { part.turn = rallyAngle(segments[(i+1)%segments.length].angle-part.angle) })
  return { ...config, stage, points, segments, length, boosts: [.19 * length, .64 * length], obstacles: [] }
}
export function rallyTrackAt(track, distance, offset = 0) {
  const s = wrap(distance, track.length), part = track.segments.find(p => s < p.s + p.size) || track.segments.at(-1)
  const t = (s - part.s) / part.size, angle = rallyAngle(part.angle+part.turn*t)
  return { x: part.x + part.dx * t - Math.sin(angle) * offset, y: part.y + part.dy * t + Math.cos(angle) * offset, angle, s }
}
export function projectRally(track, x, y) {
  let best = { distance: Infinity, s: 0 }
  for (const p of track.segments) {
    const t = clamp(((x - p.x) * p.dx + (y - p.y) * p.dy) / (p.size * p.size), 0, 1)
    const px = p.x + t * p.dx, py = p.y + t * p.dy, distance = Math.hypot(x - px, y - py)
    if (distance < best.distance) best = { x: px, y: py, distance, s: wrap(p.s + p.size * t, track.length), angle: rallyAngle(p.angle+p.turn*t) }
  }
  return best
}
export function createRallyGame(stage = 0) {
  const track = createRallyTrack(stage)
  const cars = ['#d8f453', '#ed805c', '#67c6df', '#d5a5e9'].map((color, i) => {
    const startS = -32 - Math.floor(i / 2) * 47, p = rallyTrackAt(track, startS, i % 2 ? 22 : -22)
    return { id: i, color, x: p.x, y: p.y, heading: p.angle, vx: 0, vy: 0, speed: 0, s: p.s, gates: 0, started: false, missedGate: false, progress: startS, laps: 0, lapStart: 0, bestLap: null, finishedAt: null, boost: 0, boostCooldown: 0, offroad: false, skid: 0, marks: [], lastSafe: { x: p.x, y: p.y, angle: p.angle } }
  })
  const game = { track, stage, cars, status: 'countdown', countdown: 3, elapsed: 0, accumulator: 0, rank: 1, score: 0, recoveries: 0, replayFrames: [] }
  recordRallyFrame(game, true)
  return game
}
function recordRallyFrame(game, force = false, snap = false) {
  const frames = game.replayFrames, t = Math.round(game.elapsed * 1000), previous = frames.at(-1)
  if (!force && previous && t - previous[0] < 50) return
  const car = game.cars[0], frame = [t, Math.round(car.x * 10) / 10, Math.round(car.y * 10) / 10, Math.round(car.heading * 1000) / 1000, snap ? 1 : 0]
  if (previous && previous[0] === t) frames[frames.length - 1] = frame
  else if (frames.length < 4000) frames.push(frame)
}
export function finishRallyReplay(game) {
  if (game.status !== 'finished' || game.cars[0].gates < RALLY_LAPS * 12) return null
  return { version: RALLY_REPLAY_VERSION, duration: Math.round(game.elapsed * 1000), frames: game.replayFrames.map(frame => [...frame]) }
}
export function validRallyReplay(replay) {
  if (!replay || replay.version !== RALLY_REPLAY_VERSION || !Number.isInteger(replay.duration) || replay.duration <= 0 || replay.duration > RALLY_LIMIT * 1000 || !Array.isArray(replay.frames) || replay.frames.length < 2 || replay.frames.length > 4000) return false
  let previous = -1
  for (const frame of replay.frames) {
    if (!Array.isArray(frame) || frame.length !== 5 || !frame.every(Number.isFinite)) return false
    const [t, x, y, angle, snap] = frame
    if (!Number.isInteger(t) || t <= previous || t > replay.duration || x < 0 || x > 1500 || y < 0 || y > 1000 || Math.abs(angle) > 3.143 || ![0, 1].includes(snap)) return false
    previous = t
  }
  return replay.frames[0][0] === 0 && previous === replay.duration
}
// Read a validated replay at race time, never wall-clock time (pause stays exact).
export function rallyGhostAt(replay, seconds) {
  if (!replay?.frames?.length || !Number.isFinite(seconds)) return null
  const frames = replay.frames, t = clamp(Math.round(seconds * 1000), 0, replay.duration)
  let lo = 0, hi = frames.length - 1
  while (lo < hi) { const mid = Math.ceil((lo + hi) / 2); if (frames[mid][0] <= t) lo = mid; else hi = mid - 1 }
  const a = frames[lo], b = frames[Math.min(lo + 1, frames.length - 1)]
  const fraction = b[0] === a[0] || b[4] ? 0 : (t - a[0]) / (b[0] - a[0])
  return { x: mix(a[1], b[1], fraction), y: mix(a[2], b[2], fraction), heading: rallyAngle(a[3] + rallyAngle(b[3] - a[3]) * fraction), id: -1, color: '#b7f5ff', boost: 0 }
}
// Ordered gates: a finish-line crossing or reverse lap cannot award a lap.
export function advanceRallyGates(car, previousS, nextS, track, withinCourse, dt) {
  const delta = rallyAngle((nextS - previousS) / track.length * TAU) / TAU * track.length
  const target = ((car.gates + 1) % 12) / 12 * track.length
  const crossing = delta > 0 && delta >= wrap(target - previousS, track.length)
  if (car.started && crossing && (!withinCourse || delta >= Math.max(12, car.speed * dt * 2))) car.missedGate = true
  if (delta > 0 && delta < Math.max(12, car.speed * dt * 2) && withinCourse) {
    const finishDistance = wrap(-previousS, track.length)
    if (!car.started && delta >= finishDistance) { car.started = true; car.lapStart = 0 }
    if (car.started && crossing) { car.gates++; car.laps = Math.floor(car.gates / 12); car.missedGate = false }
  }
  const gateS = (car.gates % 12) / 12 * track.length
  car.progress = car.started ? car.gates / 12 * track.length + Math.min(track.length / 12, wrap(nextS - gateS, track.length)) : -wrap(-nextS, track.length)
}
export function rallyAiInput(game, car) {
  const look = rallyTrackAt(game.track, car.s + 54 + car.speed * .20, (car.id - 2) * 10)
  const error = rallyAngle(Math.atan2(look.y - car.y, look.x - car.x) - car.heading)
  const bend = Math.abs(rallyAngle(rallyTrackAt(game.track, car.s + 150).angle - look.angle))
  const target = [205, 174, 200, 192][car.id]
  return { steer: clamp(error * 1.8, -1, 1), targetSpeed: Math.min(target, bend > .65 ? 155 : target) }
}
function carStep(game, car, input, dt) {
  if (car.finishedAt !== null) return
  const track = game.track, previousS = car.s, beforeLaps = car.laps
  car.boost = Math.max(0, car.boost - dt); car.boostCooldown = Math.max(0, car.boostCooldown - dt)
  const road = projectRally(track, car.x, car.y)
  car.offroad = road.distance > track.width / 2 - 5
  const target = car.offroad ? 78 : car.boost ? 280 : car.id === 0 ? 205 : clamp(input.targetSpeed || 192, 155, 205)
  car.speed += (target - car.speed) * (1 - Math.exp(-(car.offroad ? 4.5 : 1.25) * dt))
  const steer = clamp(Number(input.steer) || 0, -1, 1)
  car.heading = rallyAngle(car.heading + steer * (1.2 + Math.min(car.speed, 180) / 180 * 1.5) * dt)
  const grip = car.offroad ? 4.5 : 7.5
  car.vx = mix(car.vx, Math.cos(car.heading) * car.speed, 1 - Math.exp(-grip * dt))
  car.vy = mix(car.vy, Math.sin(car.heading) * car.speed, 1 - Math.exp(-grip * dt))
  car.x = clamp(car.x + car.vx * dt, 12, 1488); car.y = clamp(car.y + car.vy * dt, 12, 988)
  const next = projectRally(track, car.x, car.y); car.s = next.s
  const onRoad = next.distance <= track.width / 2 + 12
  // Grass already costs speed; a wide corner must not silently lose a lap.
  advanceRallyGates(car, previousS, car.s, track, next.distance <= track.width/2+100, dt)
  if (onRoad) car.lastSafe = { x: next.x, y: next.y, angle: next.angle }
  if (car.boostCooldown <= 0 && onRoad && track.boosts.some(s => Math.abs(rallyAngle((car.s - s) / track.length * TAU) / TAU * track.length) < 20)) { car.boost = .9; car.boostCooldown = 2 }
  car.skid = Math.abs(rallyAngle(Math.atan2(car.vy, car.vx) - car.heading)) * car.speed
  if (car.skid > 30 && Math.floor(game.elapsed * 24) !== car.lastMark) {
    car.lastMark = Math.floor(game.elapsed * 24); car.marks.push({ x: car.x, y: car.y, heading: car.heading }); if (car.marks.length > 110) car.marks.shift()
  }
  if (car.laps > beforeLaps) {
    const lap = game.elapsed - car.lapStart; car.bestLap = Math.min(car.bestLap || Infinity, lap); car.lapStart = game.elapsed
    if (car.laps >= RALLY_LAPS) car.finishedAt = game.elapsed
  }
}
export function recoverRallyCar(game) {
  if (game.status !== 'racing') return
  recordRallyFrame(game, true)
  const car = game.cars[0], p = car.missedGate ? rallyTrackAt(game.track, ((car.gates+1)%12)/12*game.track.length-24) : car.lastSafe
  car.x = p.x; car.y = p.y; car.heading = p.angle; car.speed = 40; car.vx = 0; car.vy = 0; car.boost = 0
  car.s = projectRally(game.track, car.x, car.y).s; car.missedGate = false; game.recoveries++
  // Fixed time penalty, including for lap records. Does not skip any gates.
  game.elapsed += 3
  recordRallyFrame(game, true, true)
}
export function advanceRally(game, elapsed, input = {}) {
  if (!['countdown', 'racing'].includes(game.status) || !Number.isFinite(elapsed) || elapsed <= 0) return game
  game.accumulator += Math.min(elapsed, .12)
  while (game.accumulator >= RALLY_STEP && ['countdown', 'racing'].includes(game.status)) {
    game.accumulator -= RALLY_STEP
    if (game.status === 'countdown') { game.countdown = Math.max(0, game.countdown - RALLY_STEP); if (game.countdown <= 1e-8) game.status = 'racing'; continue }
    game.elapsed += RALLY_STEP
    for (const car of game.cars) carStep(game, car, car.id === 0 ? input : rallyAiInput(game, car), RALLY_STEP)
    const order = [...game.cars].sort((a,b) => a.finishedAt !== null && b.finishedAt !== null ? a.finishedAt - b.finishedAt : a.finishedAt !== null ? -1 : b.finishedAt !== null ? 1 : b.progress - a.progress)
    game.rank = order.findIndex(car => car.id === 0) + 1
    if (game.elapsed >= RALLY_LIMIT) { game.elapsed = RALLY_LIMIT; game.status = 'timeout'; game.score = 0 }
    else if (game.cars[0].finishedAt !== null) { game.status = 'finished'; game.score = rallyScore(game.stage, game.rank, game.elapsed) }
    recordRallyFrame(game, game.status === 'finished')
  }
  return game
}
