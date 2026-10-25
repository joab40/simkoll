import { BALANCE_SCENE_SCALE, BALANCE_ZONE, balanceBumpsBetween, balanceRoadAt } from './balance-engine.js'

const line = (ctx, points, color, width = 5) => {
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  ctx.beginPath(); points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke()
}
const circle = (ctx, x, y, r, color) => { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill() }

export function drawBalance(canvas, game) {
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, 960, 500)
  const sky = ctx.createLinearGradient(0, 0, 0, 350)
  sky.addColorStop(0, '#d8f0ed'); sky.addColorStop(1, '#fff9dc')
  ctx.fillStyle = sky; ctx.fillRect(0, 0, 960, 500)
  circle(ctx, 785, 85, 42, '#ffdf8e')
  ctx.fillStyle = '#b8d5c1'; ctx.beginPath(); ctx.moveTo(0, 235)
  for (let x = 0; x <= 960; x += 20) ctx.lineTo(x, 207 + Math.sin(x / 100) * 20 + Math.cos(x / 65) * 12)
  ctx.lineTo(960, 325); ctx.lineTo(0, 325); ctx.fill()
  ctx.fillStyle = '#89c7cb'; ctx.fillRect(0, 240, 960, 120)
  for (let row = 0; row < 5; row++) {
    const offset = (game.distance * (2 + row * .2)) % 170
    for (let x = -170; x < 1100; x += 170) line(ctx, [[x - offset, 259 + row * 19], [x + 65 - offset, 259 + row * 19]], '#c7e9e2', 2)
  }
  // Reeds along the water, parallax behind the cycle path.
  for (let i = 0; i < 7; i++) {
    const x = ((i * 185 - game.distance * 5) % 1295 + 1295) % 1295 - 160
    line(ctx, [[x - 12, 357], [x - 20, 318], [x - 4, 338], [x, 310], [x + 9, 357]], '#6d9c79', 4)
  }
  const bumps = balanceBumpsBetween(game.distance - 290 / BALANCE_SCENE_SCALE, game.distance + 670 / BALANCE_SCENE_SCALE)
  const surface = []
  for (let x = 0; x <= 960; x += 4) surface.push([x, 374 - balanceRoadAt(game.distance + (x - 290) / BALANCE_SCENE_SCALE, bumps).height * BALANCE_SCENE_SCALE])
  ctx.fillStyle = '#e9dfc5'; ctx.beginPath(); ctx.moveTo(0, 500)
  surface.forEach(([x, y]) => ctx.lineTo(x, y)); ctx.lineTo(960, 500); ctx.fill()
  line(ctx, surface.map(([x, y]) => [x, y - 6]), '#a9bc8a', 12)
  line(ctx, surface, '#839a71', 3)
  ctx.setLineDash([35, 40]); ctx.lineDashOffset = game.distance * BALANCE_SCENE_SCALE
  line(ctx, [[0, 442], [960, 442]], '#c6bca1', 3); ctx.setLineDash([])
  for (const bump of bumps) {
    const x = 290 + (bump.center - game.distance) * BALANCE_SCENE_SCALE
    const halfWidth = bump.width / 2 * BALANCE_SCENE_SCALE
    ctx.fillStyle = '#cfad76'; ctx.beginPath(); ctx.moveTo(x - halfWidth, 374)
    for (let px = -halfWidth; px <= halfWidth; px += 2) {
      const height = balanceRoadAt(bump.center + px / BALANCE_SCENE_SCALE, [bump]).height
      ctx.lineTo(x + px, 374 - height * BALANCE_SCENE_SCALE)
    }
    ctx.lineTo(x + halfWidth, 374); ctx.closePath(); ctx.fill()
    line(ctx, [[x - 10, 383 - bump.height * BALANCE_SCENE_SCALE], [x, 377 - bump.height * BALANCE_SCENE_SCALE], [x + 10, 383 - bump.height * BALANCE_SCENE_SCALE]], '#8b683d', 3)
  }
  const wheelClearance = 33 * Math.sqrt(1 + game.roadSlope ** 2)
  ctx.save(); ctx.translate(290, 374 - game.roadHeight * BALANCE_SCENE_SCALE - wheelClearance); ctx.rotate(-Math.max(0, Math.min(85, game.angle)) * Math.PI / 180)
  for (const x of [0, 132]) {
    circle(ctx, x, 0, 32, '#203f48'); circle(ctx, x, 0, 25, '#f6f7e9')
    ctx.save(); ctx.translate(x, 0); ctx.rotate(game.distance * .38)
    for (let j = 0; j < 6; j++) { const a = j * Math.PI / 3; line(ctx, [[0, 0], [Math.cos(a) * 24, Math.sin(a) * 24]], '#afc7bf', 2) }
    ctx.restore(); circle(ctx, x, 0, 5, '#14747a')
  }
  line(ctx, [[0, 0], [48, -53], [67, 0], [0, 0], [107, -53], [67, 0]], '#13777d', 6)
  line(ctx, [[48, -53], [107, -53], [132, 0]], '#13777d', 6)
  line(ctx, [[42, -60], [62, -60]], '#24454a', 7)
  line(ctx, [[107, -53], [102, -69], [115, -73]], '#24454a', 5)
  circle(ctx, 67, 0, 9, '#d2ed62')
  // Original helmeted rider, drawn as articulated shapes (no external assets).
  line(ctx, [[52, -65], [83, -37], [67, 0], [82, 2]], '#173f4c', 12)
  line(ctx, [[51, -63], [34, -31], [59, -12]], '#286171', 11)
  line(ctx, [[51, -70], [63, -110]], '#c8ed56', 25)
  line(ctx, [[67, -105], [90, -83], [108, -73]], '#b97d60', 9)
  circle(ctx, 70, -130, 17, '#dbab7d')
  ctx.fillStyle = '#176873'; ctx.beginPath(); ctx.arc(69, -136, 20, Math.PI, Math.PI * 2); ctx.lineTo(93, -135); ctx.lineTo(49, -135); ctx.fill()
  line(ctx, [[57, -147], [62, -149]], '#d2ed62', 3)
  circle(ctx, 81, -131, 2, '#203f48')
  ctx.restore()
  ctx.fillStyle = '#245a60'; ctx.font = '600 16px system-ui, sans-serif'; ctx.textAlign = 'left'
  ctx.fillText('STRANDPROMENADEN', 30, 38)
  ctx.textAlign = 'right'; ctx.fillText(game.elapsed < 3 ? 'Hitta balansen…' : `${Math.floor(game.distance)} m`, 930, 38)
  // Keep a gauge in the desktop scene. On phones the larger HTML gauge
  // below the scene is easier to read.
  if (canvas.clientWidth < 600) return
  const left = 530, top = 90, width = 360
  ctx.fillStyle = '#ffffffb8'; ctx.beginPath(); ctx.roundRect(left - 20, top - 28, width + 40, 87, 18); ctx.fill()
  line(ctx, [[left, top + 20], [left + width, top + 20]], '#c6d9d0', 14)
  line(ctx, [[left + BALANCE_ZONE[0] / 85 * width, top + 20], [left + BALANCE_ZONE[1] / 85 * width, top + 20]], '#bcea48', 14)
  circle(ctx, left + Math.max(0, Math.min(85, game.angle)) / 85 * width, top + 20, 12, '#136c72')
  circle(ctx, left + Math.max(0, Math.min(85, game.angle)) / 85 * width, top + 20, 5, '#ffffff')
  ctx.fillStyle = '#245a60'; ctx.textAlign = 'center'; ctx.font = '700 17px system-ui, sans-serif'
  ctx.fillText(game.angle >= BALANCE_ZONE[0] && game.angle <= BALANCE_ZONE[1] ? 'FIN BALANS · DUBBLA POÄNG' : 'SIKTA PÅ DET GRÖNA FÄLTET', left + width / 2, top - 5)
}
