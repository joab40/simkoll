import { HURDLES } from './hurdles-engine.js'

const TAU = Math.PI * 2
const clamp = (value) => Math.max(0, Math.min(1, value))
const mix = (from, to, amount) => from + (to - from) * amount
const ease = (from, to, value) => { const t = clamp((value - from) / (to - from)); return t * t * (3 - 2 * t) }
const angleMix = (from, to, amount) => from + Math.atan2(Math.sin(to - from), Math.cos(to - from)) * amount
const point = (origin, angle, length) => [origin[0] + Math.cos(angle) * length, origin[1] + Math.sin(angle) * length]

// The knee always bends forward in the side view. Both bones keep their
// length, even while the foot travels from ground contact to heel recovery.
function runningLeg(hip, cycle) {
  const phase = ((cycle % 1) + 1) % 1, contact = 0.38
  const swing = clamp((phase - contact) / (1 - contact))
  const ankle = phase < contact
    ? [mix(23, -23, phase / contact), -4]
    : [mix(-23, 23, ease(0, 1, swing)), -4 - Math.sin(Math.PI * swing) * 31]
  const dx = ankle[0] - hip[0], dy = ankle[1] - hip[1]
  const distance = Math.min(49.5, Math.hypot(dx, dy)), direction = Math.atan2(dy, dx)
  const thigh = direction - Math.acos(distance / 50)
  const knee = point(hip, thigh, 25)
  return [thigh, Math.atan2(ankle[1] - knee[1], ankle[0] - knee[0])]
}

function stroke(ctx, points, color, width) {
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  ctx.beginPath(); points.forEach(([x, y], index) => index ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke()
}

function shoe(ctx, ankle, angle, near) {
  ctx.save(); ctx.translate(...ankle); ctx.rotate(angle)
  ctx.fillStyle = near ? '#fff7df' : '#c7d6ce'
  ctx.beginPath(); ctx.moveTo(-6, -5); ctx.lineTo(2, -5); ctx.lineTo(8, -1); ctx.lineTo(13, 0); ctx.lineTo(13, 4); ctx.lineTo(-6, 4); ctx.closePath(); ctx.fill()
  stroke(ctx, [[-6, 4], [13, 4]], near ? '#ed8f62' : '#6a8889', 2)
  ctx.restore()
}

export function drawHurdleAthlete(ctx, x, ground, race, now) {
  if (!['running', 'countdown'].includes(race.status)) now = race.updatedAt ?? now
  const moving = race.speed > 0.4, jumping = race.jumpAt != null
  const progress = jumping ? clamp((now - race.jumpAt) / 640) : 0
  const flight = jumping ? ease(0, 0.22, progress) * (1 - ease(0.58, 1, progress)) : 0
  const cycle = race.distance / 4.4
  const bob = moving ? Math.sin(cycle * TAU * 2) * 1.8 * (1 - flight) : 0
  const recentHit = race.hits && race.feedback?.startsWith('Häckträff') ? 1 - ease(0, 380, now - race.feedbackAt) : 0
  const hip = [0, -47 + bob], lean = 5 + clamp(race.speed / 9.4) * 4 + flight * 8 + recentHit * 5
  const shoulder = [lean, hip[1] - 29], head = [lean + 5, shoulder[1] - 18]
  ctx.save(); ctx.translate(x, ground - race.y * 55)
  const leg = (near) => {
    const base = moving ? runningLeg(hip, cycle + (near ? 0 : 0.5)) : [near ? 1.25 : 1.8, near ? 1.8 : 1.35]
    const target = near ? [-0.23, 0.22] : [2.72, 1.05]
    const knee = point(hip, angleMix(base[0], target[0], flight), 25)
    const ankle = point(knee, angleMix(base[1], target[1], flight), 25)
    stroke(ctx, [hip, knee, ankle], near ? '#e9ae80' : '#a7684d', near ? 9 : 8)
    stroke(ctx, [mixPoint(knee, ankle, 0.72), ankle], near ? '#f8ebce' : '#b4c5bc', 7)
    shoe(ctx, ankle, near ? -flight * 0.12 : -flight * 0.8, near)
    stroke(ctx, [hip, point(hip, angleMix(base[0], target[0], flight), 10)], near ? '#20394c' : '#162e40', 12)
  }
  const arm = (near) => {
    const swing = moving ? Math.sin(cycle * TAU + (near ? Math.PI : 0)) : (near ? 0.2 : -0.2)
    const elbow = [shoulder[0] + swing * 17, shoulder[1] + 17]
    const hand = [elbow[0] + 15, elbow[1] - 14]
    const targetElbow = near ? [lean - 16, shoulder[1] + 15] : [lean + 19, shoulder[1] + 9]
    const targetHand = near ? [lean - 7, shoulder[1] + 29] : [lean + 34, shoulder[1] + 20]
    stroke(ctx, [shoulder, mixPoint(elbow, targetElbow, flight), mixPoint(hand, targetHand, flight)], near ? '#e9ae80' : '#a7684d', 7)
  }
  arm(false); leg(false)
  ctx.fillStyle = '#ffe194'; ctx.beginPath(); ctx.moveTo(shoulder[0] - 9, shoulder[1] - 3); ctx.lineTo(shoulder[0] + 8, shoulder[1]); ctx.lineTo(8, hip[1] + 4); ctx.lineTo(-9, hip[1] + 3); ctx.closePath(); ctx.fill()
  stroke(ctx, [[shoulder[0] - 7, shoulder[1] + 5], [-7, hip[1] - 2]], '#e8b75c', 3)
  ctx.fillStyle = '#fff9df'; ctx.fillRect(shoulder[0] - 6, shoulder[1] + 9, 12, 12)
  ctx.fillStyle = '#233d4b'; ctx.font = 'bold 10px monospace'; ctx.fillText('1', shoulder[0] - 3, shoulder[1] + 19)
  leg(true); arm(true)
  stroke(ctx, [[head[0] - 3, head[1] + 7], [shoulder[0], shoulder[1] + 1]], '#e9ae80', 9)
  ctx.fillStyle = '#e9ae80'; ctx.beginPath(); ctx.ellipse(head[0], head[1], 10, 12, -0.12, 0, TAU); ctx.fill()
  ctx.beginPath(); ctx.moveTo(head[0] + 8, head[1] - 3); ctx.lineTo(head[0] + 13, head[1] + 1); ctx.lineTo(head[0] + 8, head[1] + 3); ctx.fill()
  ctx.fillStyle = '#243247'; ctx.beginPath(); ctx.arc(head[0] - 1, head[1] - 4, 10, Math.PI * 0.9, TAU); ctx.fill()
  stroke(ctx, [[head[0] - 10, head[1] - 6], [head[0] + 8, head[1] - 6]], '#fff4d7', 3)
  ctx.fillStyle = '#243247'; ctx.fillRect(head[0] + 6, head[1] - 2, 2, 2)
  ctx.restore()
}

const mixPoint = (from, to, amount) => [mix(from[0], to[0], amount), mix(from[1], to[1], amount)]

function drawStadium(ctx, distance, now) {
  const sky = ctx.createLinearGradient(0, 0, 0, 300)
  sky.addColorStop(0, '#163a55'); sky.addColorStop(1, '#a3cdc0'); ctx.fillStyle = sky; ctx.fillRect(0, 0, 960, 500)
  ctx.fillStyle = '#ffe2a3'; ctx.beginPath(); ctx.arc(825 - distance * 0.25, 65, 28, 0, TAU); ctx.fill()
  ctx.fillStyle = '#d7e9da26'
  for (let index = 0; index < 4; index++) {
    const x = ((index * 287 + 60 - distance * 0.8) % 1150 + 1150) % 1150 - 90
    ctx.beginPath(); ctx.ellipse(x, 52 + index % 2 * 28, 61, 10, 0, 0, TAU); ctx.fill()
  }
  ctx.fillStyle = '#254b60'; ctx.beginPath(); ctx.moveTo(0, 166); ctx.lineTo(0, 128); ctx.lineTo(170, 100); ctx.lineTo(790, 100); ctx.lineTo(960, 128); ctx.lineTo(960, 240); ctx.lineTo(0, 240); ctx.fill()
  ctx.fillStyle = '#183d52'; ctx.fillRect(0, 128, 960, 15)
  stroke(ctx, [[0, 129], [170, 101], [790, 101], [960, 129]], '#739b9d', 3)
  const crowdOffset = distance * 2.2, firstPerson = Math.floor(crowdOffset / 13)
  for (let row = 0; row < 5; row++) {
    ctx.fillStyle = '#17394b'; ctx.fillRect(0, 154 + row * 17, 960, 4)
    for (let col = firstPerson - 1; col < firstPerson + 82; col++) {
      const x = col * 13 + row % 2 * 6 - crowdOffset, y = 149 + row * 17
      if ((col + row * 3) % 11 === 0) continue
      ctx.fillStyle = ['#e6b78d', '#98c6ba', '#ae9dbb', '#dbcfa3'][((col + row * 7) % 4 + 4) % 4]
      ctx.beginPath(); ctx.arc(x + 2, y, 2.5, 0, TAU); ctx.fill(); ctx.fillRect(x - 1, y + 3, 6, 5)
    }
  }
  const firstFlag = Math.floor(crowdOffset / 165)
  for (let index = firstFlag - 1; index < firstFlag + 8; index++) {
    const x = index * 165 - crowdOffset
    ctx.fillStyle = '#c7dcd2'; ctx.fillRect(x, 115, 3, 22)
    ctx.fillStyle = index % 2 ? '#ffe194' : '#85c6bb'
    ctx.beginPath(); ctx.moveTo(x + 3, 115); ctx.lineTo(x + 24, 119 + Math.sin(now / 350 + index) * 2); ctx.lineTo(x + 3, 125); ctx.fill()
  }
  ctx.fillStyle = '#eff1da'; ctx.fillRect(0, 239, 960, 40)
  ctx.fillStyle = '#25505a'; ctx.font = 'bold 18px monospace'
  for (let index = -1; index < 3; index++) ctx.fillText('SIMKOLL ARENA / 100 M HÄCK', 35 + index * 480 - distance * 5 % 480, 265)
  stroke(ctx, [[0, 238], [960, 238]], '#aec8bf', 3)
  ctx.fillStyle = '#719b76'; ctx.fillRect(0, 279, 960, 24)
  ctx.fillStyle = '#90b28a'; ctx.fillRect(0, 280, 960, 6)
  for (let index = -1; index < 30; index++) { const x = index * 39 - distance * 14 % 39; stroke(ctx, [[x, 298], [x + 5, 293]], '#496f6555', 2) }
}

function drawHurdle(ctx, x, ground, fallen, distancePast) {
  ctx.fillStyle = '#173b4a2b'; ctx.beginPath(); ctx.ellipse(x + 7, ground + 4, fallen ? 35 : 22, 5, 0, 0, TAU); ctx.fill()
  ctx.save(); ctx.translate(x, ground)
  if (fallen) ctx.rotate(ease(0, 1.1, distancePast) * 1.43)
  stroke(ctx, [[-15, 1], [19, 1]], '#9dbab9', 5)
  stroke(ctx, [[-10, 0], [-10, -45]], '#a7c2c2', 4)
  stroke(ctx, [[13, 0], [13, -45]], '#d7e7df', 4)
  ctx.fillStyle = '#173d5140'; ctx.fillRect(-17, -47, 37, 9)
  ctx.fillStyle = fallen ? '#df9a7c' : '#fff2d4'; ctx.fillRect(-17, -51, 37, 8)
  ctx.fillStyle = '#27869a'; ctx.fillRect(-10, -51, 8, 8); ctx.fillRect(9, -51, 8, 8)
  ctx.restore()
}

export function paintHurdles(canvas, race, now) {
  const ctx = canvas.getContext('2d'), width = 960, ground = 438, runnerX = 310, scale = 48
  if (!ctx) return
  drawStadium(ctx, race.distance, now)
  for (let lane = 0; lane < 4; lane++) {
    const y = 303 + lane * 49
    ctx.fillStyle = lane === 2 ? '#d7815b' : lane % 2 ? '#b85b49' : '#c56b51'; ctx.fillRect(0, y, width, 49)
    stroke(ctx, [[0, y], [width, y]], '#ffedc3b0', 2)
    ctx.fillStyle = '#5e34341c'; ctx.fillRect(0, y + 46, width, 3)
  }
  const project = (distance) => runnerX + (distance - race.distance) * scale
  for (let meter = 0; meter <= 100; meter += 5) {
    const x = project(meter)
    if (x < -70 || x > width) continue
    ctx.fillStyle = '#fff0cc44'; ctx.fillRect(x, 303, 2, 197)
    ctx.fillStyle = '#ffeac4'; ctx.font = 'bold 15px monospace'; ctx.fillText(`${meter}m`, x + 7, 484)
  }
  const start = project(0)
  if (start > -60) for (let lane = 0; lane < 4; lane++) { ctx.fillStyle = '#ffedc3'; ctx.font = 'bold 25px monospace'; ctx.fillText(String(lane + 1), start - 37, 337 + lane * 49) }
  const finish = project(100)
  if (finish < width + 20) for (let row = 0; row < 12; row++) for (let col = 0; col < 2; col++) { ctx.fillStyle = (row + col) % 2 ? '#fff4d7' : '#25404b'; ctx.fillRect(finish + col * 9, 303 + row * 17, 9, 17) }
  HURDLES.forEach((distance, index) => {
    const x = project(distance), result = race.results[index]
    if (x < -90 || x > width + 90) return
    if (!result) { ctx.fillStyle = '#ffe19432'; ctx.fillRect(x - 130, ground + 6, 90, 5); ctx.fillStyle = '#ffe1948c'; ctx.fillRect(x - 41, ground + 4, 2, 9) }
    drawHurdle(ctx, x, ground, result?.hit, race.distance - distance)
  })
  ctx.fillStyle = '#173b4a45'; ctx.beginPath(); ctx.ellipse(runnerX + race.y * 5, ground + 4, 28 - race.y * 7, 6 - race.y * 2, 0, 0, TAU); ctx.fill()
  drawHurdleAthlete(ctx, runnerX, ground, race, now)
  if (race.status === 'finished') for (let index = 0; index < 35; index++) { ctx.fillStyle = ['#ffe194', '#b9e585', '#ed9481'][index % 3]; ctx.fillRect((index * 137) % width, 20 + ((now / 1000 + index * 0.4) % 3) * 130, 5, 8) }
}
