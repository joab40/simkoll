// Original fixed-step circuit racer. No third-party game code or assets.
export const RALLY_STEP = 1 / 120
export const RALLY_LAPS = 3
export const RALLY_LIMIT = 180
export const RALLY_MAX_SCORE = 33999
const TAU = Math.PI * 2
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
const wrap = (v, length) => ((v % length) + length) % length
export const rallyAngle = value => wrap(value + Math.PI, TAU) - Math.PI
export const RALLY_TRACKS = [
  { name: 'Kustslingan', theme: 'coast', width: 120, anchors: [[300,230],[700,180],[1150,250],[1320,480],[1130,780],[720,830],[280,720],[160,470]] },
  { name: 'Tallkurvan', theme: 'forest', width: 110, anchors: [[260,220],[650,160],[1110,200],[1300,420],[1080,540],[1170,790],[720,830],[360,730],[170,460]] },
  { name: 'Midnattsrundan', theme: 'dusk', width: 104, anchors: [[280,200],[700,180],[1220,230],[1300,470],[1060,700],[800,550],[560,820],[200,750],[150,440]] },
]
export const validRallyScore = score => Number.isInteger(score) && score >= 10000 && score <= RALLY_MAX_SCORE && score % 10000 < 4000
export function rallyScore(stage, rank, elapsed) {
  if (!Number.isInteger(stage) || stage < 0 || stage >= RALLY_TRACKS.length || !Number.isInteger(rank) || rank < 1 || rank > 4 || !Number.isFinite(elapsed) || elapsed <= 0 || elapsed > RALLY_LIMIT) return 0
  return (stage + 1) * 10000 + (4 - rank) * 1000 + clamp(Math.round(999 * (1 - elapsed / RALLY_LIMIT)), 0, 999)
}
export function rallyUnlocked(score) {
  if (!validRallyScore(score)) return 0
  const stage = Math.floor(score / 10000) - 1, rank = 4 - Math.floor(score % 10000 / 1000)
  return Math.min(RALLY_TRACKS.length - 1, stage + (rank <= 2 ? 1 : 0))
}
const mix = (a, b, t) => a + (b - a) * t
function catmull(a, b, c, d, t) {
  return .5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t)
}
export function createRallyTrack(stage = 0) {
  if (!Number.isInteger(stage) || !RALLY_TRACKS[stage]) throw new Error('Ogiltig rallybana.')
  const config = RALLY_TRACKS[stage], anchors = config.anchors, points = []
  for (let i = 0; i < anchors.length; i++) for (let j = 0; j < 24; j++) {
    const p = [anchors[wrap(i - 1, anchors.length)], anchors[i], anchors[(i + 1) % anchors.length], anchors[(i + 2) % anchors.length]]
    points.push({ x: catmull(...p.map(v => v[0]), j / 24), y: catmull(...p.map(v => v[1]), j / 24) })
  }
  let length = 0
  const segments = points.map((p, i) => {
    const q = points[(i + 1) % points.length], size = Math.hypot(q.x - p.x, q.y - p.y)
    const segment = { ...p, dx: q.x - p.x, dy: q.y - p.y, size, s: length }; length += size
    return segment
  })
  return { ...config, stage, points, segments, length, boosts: [.19 * length, .64 * length] }
}
export function rallyTrackAt(track, distance, offset = 0) {
  const s = wrap(distance, track.length), part = track.segments.find(p => s < p.s + p.size) || track.segments.at(-1)
  const t = (s - part.s) / part.size, angle = Math.atan2(part.dy, part.dx)
  return { x: part.x + part.dx * t - Math.sin(angle) * offset, y: part.y + part.dy * t + Math.cos(angle) * offset, angle, s }
}
export function projectRally(track, x, y) {
  let best = { distance: Infinity, s: 0 }
  for (const p of track.segments) {
    const t = clamp(((x - p.x) * p.dx + (y - p.y) * p.dy) / (p.size * p.size), 0, 1)
    const px = p.x + t * p.dx, py = p.y + t * p.dy, distance = Math.hypot(x - px, y - py)
    if (distance < best.distance) best = { x: px, y: py, distance, s: wrap(p.s + p.size * t, track.length), angle: Math.atan2(p.dy, p.dx) }
  }
  return best
}
export function createRallyGame(stage = 0) {
  const track = createRallyTrack(stage)
  const cars = ['#d8f453', '#ed805c', '#67c6df', '#d5a5e9'].map((color, i) => {
    const startS = -32 - Math.floor(i / 2) * 47, p = rallyTrackAt(track, startS, i % 2 ? 22 : -22)
    return { id: i, color, x: p.x, y: p.y, heading: p.angle, vx: 0, vy: 0, speed: 0, s: p.s, gates: 0, started: false, progress: startS, laps: 0, lapStart: 0, bestLap: null, finishedAt: null, boost: 0, boostCooldown: 0, offroad: false, skid: 0, marks: [], lastSafe: { x: p.x, y: p.y, angle: p.angle } }
  })
  return { track, stage, cars, status: 'countdown', countdown: 3, elapsed: 0, accumulator: 0, rank: 1, score: 0, recoveries: 0 }
}
// Ordered gates: a finish-line crossing or reverse lap cannot award a lap.
export function advanceRallyGates(car, previousS, nextS, track, onRoad, dt) {
  const delta = rallyAngle((nextS - previousS) / track.length * TAU) / TAU * track.length
  if (delta > 0 && delta < Math.max(12, car.speed * dt * 2) && onRoad) {
    const finishDistance = wrap(-previousS, track.length)
    if (!car.started && delta >= finishDistance) { car.started = true; car.lapStart = 0 }
    const target = ((car.gates + 1) % 12) / 12 * track.length
    if (car.started && delta >= wrap(target - previousS, track.length)) { car.gates++; car.laps = Math.floor(car.gates / 12) }
  }
  const gateS = (car.gates % 12) / 12 * track.length
  car.progress = car.started ? car.gates / 12 * track.length + Math.min(track.length / 12, wrap(nextS - gateS, track.length)) : -wrap(-nextS, track.length)
}
export function rallyAiInput(game, car) {
  const look = rallyTrackAt(game.track, car.s + 66 + car.speed * .22, (car.id - 2) * 10)
  const error = rallyAngle(Math.atan2(look.y - car.y, look.x - car.x) - car.heading)
  const bend = Math.abs(rallyAngle(rallyTrackAt(game.track, car.s + 150).angle - look.angle))
  const target = [240, 174, 210, 192][car.id] + game.stage * 7
  return { steer: clamp(error * 1.8, -1, 1), brake: car.speed > target || (bend > .65 && car.speed > 155) }
}
function carStep(game, car, input, dt) {
  if (car.finishedAt !== null) return
  const track = game.track, previousS = car.s, beforeLaps = car.laps
  car.boost = Math.max(0, car.boost - dt); car.boostCooldown = Math.max(0, car.boostCooldown - dt)
  const road = projectRally(track, car.x, car.y)
  car.offroad = road.distance > track.width / 2 - 5
  const target = car.offroad ? 78 : input.brake ? 100 : car.boost ? 320 : 240
  car.speed += (target - car.speed) * (1 - Math.exp(-(input.brake || car.offroad ? 4.5 : 1.25) * dt))
  const steer = clamp(Number(input.steer) || 0, -1, 1)
  car.heading = rallyAngle(car.heading + steer * (1.05 + Math.min(car.speed, 180) / 180 * 1.3) * dt)
  const grip = car.offroad ? 4.5 : input.brake ? 7 : 5.5
  car.vx = mix(car.vx, Math.cos(car.heading) * car.speed, 1 - Math.exp(-grip * dt))
  car.vy = mix(car.vy, Math.sin(car.heading) * car.speed, 1 - Math.exp(-grip * dt))
  car.x = clamp(car.x + car.vx * dt, 12, 1488); car.y = clamp(car.y + car.vy * dt, 12, 988)
  const next = projectRally(track, car.x, car.y); car.s = next.s
  const onRoad = next.distance <= track.width / 2 + 12
  advanceRallyGates(car, previousS, car.s, track, onRoad, dt)
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
  const car = game.cars[0], p = car.lastSafe
  car.x = p.x; car.y = p.y; car.heading = p.angle; car.speed = 40; car.vx = 0; car.vy = 0; car.boost = 0
  car.s = projectRally(game.track, car.x, car.y).s; game.recoveries++
  // Fixed time penalty, including for lap records. Does not skip any gates.
  game.elapsed += 3
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
  }
  return game
}
