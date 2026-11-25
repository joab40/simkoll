import { BOB_LENGTH, BOB_START_LIMIT, bobIdealLine, bobTrack, clamp } from './bobsled-engine.js'

function shape(ctx, fill, points) {
  ctx.fillStyle = fill
  ctx.beginPath()
  ctx.moveTo(points[0][0], points[0][1])
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1])
  ctx.closePath()
  ctx.fill()
}
function oval(ctx, color, x, y, rx, ry) {
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2)
  ctx.fill()
}
const wave = n => Math.sin(n * 17.937 + 2.9) * 0.5 + 0.5

function paintSky(ctx, w, h) {
  const sky = ctx.createLinearGradient(0, 0, 0, h * 0.67)
  sky.addColorStop(0, '#2f7389')
  sky.addColorStop(.56, '#9ed2dd')
  sky.addColorStop(1, '#f4e7ca')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, w, h)
  const sunX = w * .76, sunY = h * .23, radius = Math.min(w, h) * .16
  const glow = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, radius)
  glow.addColorStop(0, '#fff6ce')
  glow.addColorStop(.21, '#fff6ce')
  glow.addColorStop(.23, '#f5eacdb0')
  glow.addColorStop(1, '#fff2bc00')
  ctx.fillStyle = glow
  ctx.fillRect(sunX - radius, sunY - radius, radius * 2, radius * 2)
  for (let ridge = 0; ridge < 3; ridge++) {
    const base = .58 + ridge * .058
    const peaks = Array.from({ length: 16 }, (_, i) => [
      w * (i / 13 - .08),
      h * (base - (i % 2 ? .03 + wave(i + ridge * 3) * .12 : 0)),
    ])
    shape(ctx, ['#779fb4', '#81abb9', '#acc9cf'][ridge], [...peaks, [w * 1.2, h], [0, h]])
    for (let i = 1; i < peaks.length - 1; i += 2) {
      const [x, y] = peaks[i], [rightX, rightY] = peaks[i + 1]
      shape(ctx, ['#dceced', '#cce5e9', '#d9e9e8'][ridge], [
        [x, y], [rightX, rightY], [x + (rightX - x) * .25, rightY - h * .025],
      ])
    }
  }
}
function fir(ctx, [x, y], size, seed) {
  if (size < 2) return
  const w = size * (.42 + wave(seed) * .15)
  ctx.fillStyle = '#4a6262'
  ctx.fillRect(x - w * .075, y - size * .19, w * .15, size * .22)
  for (let tier = 0; tier < 3; tier++) {
    const level = y - size * (.11 + tier * .23), width = w * (1 - tier * .17), top = level - size * .52
    shape(ctx, tier === 1 ? '#285c5e' : '#225450', [[x, top], [x - width, level], [x + width, level]])
    shape(ctx, '#deeff0', [[x, top], [x - width * .67, level - size * .17], [x + width * .56, level - size * .21]])
  }
}
function sled(ctx, x, y, unit, race) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(race.turn * .13 + race.lateral * .024)
  ctx.scale(unit, unit)
  oval(ctx, '#25485353', 0, 13, 46, 12)
  for (const side of [-1, 1]) {
    const runner = side * 24
    shape(ctx, '#17353d', [[runner - 4, 1], [runner + 4, 1], [runner + 6, 21], [runner - 5, 20]])
    shape(ctx, '#91b2bf', [[runner - 5, 16], [runner + 6, 17], [runner + 6, 21], [runner - 5, 20]])
  }
  shape(ctx, '#083a42', [[-38, 3], [-33, -18], [-20, -40], [19, -40], [33, -18], [38, 3], [28, 15], [-28, 15]])
  shape(ctx, '#087884', [[-38, 3], [-33, -18], [-20, -40], [13, -39], [26, -14], [15, 7], [-27, 13]])
  shape(ctx, '#48bdc5', [[-31, -14], [-18, -39], [19, -39], [30, -15], [22, -11], [-25, -10]])
  oval(ctx, '#152f36', 0, -25, 18, 10)
  shape(ctx, '#badf51', [[-33, 1], [-6, -2], [29, -14], [32, -8], [-7, 5], [-31, 6]])
  shape(ctx, '#e3f9e5', [[-26, 9], [27, 8], [27, 11], [-24, 12]])
  const running = race.phase === 'push'
  const dive = clamp(race.elapsed / .4, 0, 1)
  const bodyY = running ? 5 + Math.sin(race.pushTime * 22) * (race.pushes ? 2 : 0)
    : race.phase === 'racing' && dive < 1 ? 5 - 40 * dive - 24 * Math.sin(Math.PI * dive) : -35
  if (running) {
    const stride = Math.sin(race.pushTime * 22) * (race.pushes ? 12 : 0)
    shape(ctx, '#163842', [[-11, bodyY + 13], [-1, bodyY + 12], [-8 + stride, 41], [-17 + stride, 41]])
    shape(ctx, '#264957', [[1, bodyY + 12], [10, bodyY + 13], [15 - stride, 41], [6 - stride, 41]])
  }
  oval(ctx, '#123b44', 0, bodyY + 2, 15, 13)
  oval(ctx, '#f1f5c0', 0, bodyY - 8, 12, 11)
  oval(ctx, '#bedc52', 2, bodyY - 10, 10, 9)
  shape(ctx, '#173c51', [[-4, bodyY - 14], [12, bodyY - 12], [11, bodyY - 7], [-3, bodyY - 8]])
  ctx.restore()
}

export function createBobScene(canvas) {
  const ctx = canvas.getContext('2d', { alpha: false })
  const sky = document.createElement('canvas')
  let width = 0, height = 0
  return function draw(race, effects) {
    if (canvas.width !== width || canvas.height !== height) {
      width = sky.width = canvas.width
      height = sky.height = canvas.height
      paintSky(sky.getContext('2d'), width, height)
    }
    const w = width, h = height
    if (!w || !h) return
    ctx.drawImage(sky, 0, 0)
    const z = race.phase === 'push' ? -17 + race.pushTime / BOB_START_LIMIT * 11 + race.pushes * .5 : race.phase === 'ready' ? -17 : race.distance
    const origin = bobTrack(z)
    const heading = bobTrack(z + 10).heading * .86
    const focal = Math.min(w * .92, h * 1.06)
    const road = 3.25, step = 4
    const camY = 4.45 + Math.max(0, Math.sin(race.elapsed * 5)) * Math.abs(race.turn) * .18
    const section = (at) => {
      const track = bobTrack(at)
      const depth = at - z + 9
      const s = focal / depth
      const base = (track.x - origin.x - heading * (at - z) - race.lateral * .74) * s + w / 2
      const level = h * .52 + (origin.y + camY - track.y) * s
      const bank = track.force * .25
      const point = (x, y = 0) => [base + s * x, level - (y - x * bank) * s]
      return { at, s, point, force: track.force }
    }
    let far = section(Math.floor(z / step) * step + 160)
    for (let i = 0; i < 40; i++) {
      const at = far.at - step
      const near = section(at)
      const stripe = (Math.round(at / step) % 2 + 2) % 2
      const quad = (color, left, right, nearLeft = left, nearRight = right, farY = 0, nearY = farY) =>
        shape(ctx, color, [far.point(left, farY), far.point(right, farY), near.point(nearRight, nearY), near.point(nearLeft, nearY)])
      quad(stripe ? '#e5f1f1' : '#e8f4f4', -55, 55)
      quad(stripe ? '#c5e3e8' : '#cbe8ed', -road, road)
      quad('#d8edf1', -.07, .07)
      if (Math.abs(near.force) > .25 && at >= 0 && at < BOB_LENGTH) {
        const first = bobIdealLine(far.force), last = bobIdealLine(near.force)
        quad(stripe ? '#92c99a' : '#b1dca9', first - .16, first + .16, last - .16, last + .16)
      }
      for (const side of [-1, 1]) {
        const inner = side * road, outer = side * (road + .42)
        const top = 1.5 + Math.max(0, -side * near.force) * 1.7
        const farTop = 1.5 + Math.max(0, -side * far.force) * 1.7
        shape(ctx, side > 0 ? '#89b5c0' : '#a2cbd4', [far.point(inner), far.point(inner, farTop), near.point(inner, top), near.point(inner)])
        quad('#f5faf4', inner, outer, inner, outer, farTop, top)
        shape(ctx, stripe ? '#146170' : '#2b8190', [far.point(inner, farTop - .18), far.point(inner, farTop - .31), near.point(inner, top - .31), near.point(inner, top - .18)])
      }
      if (at % 12 === 0) {
        const seed = at / 12
        for (const side of [-1, 1]) {
          const spot = side * (8 + wave(seed + side) * 10)
          fir(ctx, near.point(spot), near.s * (6.5 + wave(seed + side * 3) * 4.8), seed + side)
        }
      }
      if (at === 0 || at === BOB_LENGTH) {
        const left = near.point(-road, 2.8), right = near.point(road, 2.8)
        const marker = at === 0 ? '#c5e96b' : '#133a4b'
        const ink = at === 0 ? '#173e3c' : '#f1f9f3'
        const banner = near.s * .68
        for (const side of [-1, 1]) {
          const x = side * road
          shape(ctx, marker, [near.point(x - .13), near.point(x + .13), near.point(x + .13, 3.45), near.point(x - .13, 3.45)])
        }
        ctx.fillStyle = marker
        ctx.fillRect(left[0], Math.min(left[1],right[1]) - banner, right[0] - left[0], Math.abs(left[1]-right[1]) + banner)
        if (banner > 8) {
          ctx.fillStyle = ink
          ctx.font = `800 ${banner * .66}px system-ui`
          ctx.textAlign = 'center'
          ctx.fillText(at === 0 ? 'FROSTFJÄLL' : 'MÅL', (left[0] + right[0]) / 2, Math.min(left[1],right[1]) - banner * .23)
        }
      }
      far = near
    }
    if (effects && race.phase === 'racing') {
      const flow = clamp((race.speed - 18) / 28, 0, 1)
      for (let i = 0; i < 24; i++) {
        const p = (wave(i) + race.elapsed * (.31 + wave(i + 100)) * flow) % 1
        const side = i % 2 ? 1 : -1
        const x = w * (.5 + side * (.22 + wave(i + 55) * .34) * p)
        const y = h * (.53 + p * .51)
        ctx.fillStyle = `rgba(255,255,255,${p * flow * .64})`
        ctx.fillRect(x, y, w * .0022, 2 + p * h * .024)
      }
    }
    sled(ctx, w * .5 + race.lateral * focal * .063, h * .82, Math.min(w / 380, h / 420), race)
    if (effects && race.phase === 'racing' && race.elapsed - race.lastHit < .18) {
      ctx.fillStyle = '#e7845255'
      ctx.fillRect(race.lateral < 0 ? 0 : w * .96, 0, w * .04, h)
    }
  }
}
