import { BALANCE_IMPACT_TIME, BALANCE_SCENE_SCALE, BALANCE_ZONE, balanceBumpsBetween, balanceRoadAt, balanceWheelGeometry } from './balance-engine.js'
import { BALANCE_BIKE, balanceRiderPose } from './balance-rider.js'

const line = (ctx, points, color, width = 5) => {
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  ctx.beginPath(); points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke()
}
const circle = (ctx, x, y, r, color) => { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill() }

export function drawBalance(canvas, game, { reducedMotion = false } = {}) {
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, 960, 500)
  ctx.save()
  if (game.impactTimer > 0 && !reducedMotion) {
    const strength = game.impactStrength * (game.impactTimer / BALANCE_IMPACT_TIME)
    ctx.translate(480 + Math.sin(game.elapsed * 43) * strength, 250 + Math.cos(game.elapsed * 57) * strength * .6)
    ctx.scale(1.03, 1.03); ctx.translate(-480, -250)
  }
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
  const largeAhead = bumps.find((bump) => bump.large && bump.center - bump.width / 2 > game.distance && bump.center - bump.width / 2 - game.distance <= 45)
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
    const hole = bump.kind === 'pothole'
    ctx.fillStyle = hole ? '#705e49' : bump.rolling ? '#b48c52' : bump.large ? '#ce984e' : '#cfad76'; ctx.beginPath(); ctx.moveTo(x - halfWidth, 374)
    for (let px = -halfWidth; px <= halfWidth; px += 2) {
      const height = balanceRoadAt(bump.center + px / BALANCE_SCENE_SCALE, [bump]).height
      ctx.lineTo(x + px, 374 - height * BALANCE_SCENE_SCALE)
    }
    ctx.lineTo(x + halfWidth, 374); ctx.closePath(); ctx.fill()
    if (hole) {
      line(ctx, [[x - halfWidth + 4, 379], [x - halfWidth + 12, 384]], '#ecd8ad', 3)
      line(ctx, [[x + halfWidth - 4, 379], [x + halfWidth - 12, 384]], '#ecd8ad', 3)
    } else {
      const markers = bump.large ? [-14, 14] : [0]
      for (const marker of markers) line(ctx, [[x + marker - 8, 383 - bump.height * BALANCE_SCENE_SCALE], [x + marker, 377 - bump.height * BALANCE_SCENE_SCALE], [x + marker + 8, 383 - bump.height * BALANCE_SCENE_SCALE]], '#8b683d', 3)
    }
  }
  const geometry = balanceWheelGeometry(game)
  ctx.save(); ctx.translate(290, 374 - geometry.rearHeight); ctx.rotate(-geometry.angle)
  for (const x of [BALANCE_BIKE.rear[0], BALANCE_BIKE.front[0]]) {
    circle(ctx, x, 0, geometry.radius, x > 0 && game.reason === 'terrain' ? '#bc4838' : '#203f48'); circle(ctx, x, 0, 25, '#f6f7e9')
    ctx.save(); ctx.translate(x, 0); ctx.rotate(game.distance * .38)
    for (let j = 0; j < 6; j++) { const a = j * Math.PI / 3; line(ctx, [[0, 0], [Math.cos(a) * 24, Math.sin(a) * 24]], '#afc7bf', 2) }
    ctx.restore(); circle(ctx, x, 0, 5, '#14747a')
  }
  const bike = BALANCE_BIKE, pose = balanceRiderPose(game)
  const shoe = (foot, color) => {
    line(ctx, [[foot[0] - 4, foot[1] - 2], [foot[0] + 10, foot[1] - 2]], color, 7)
    line(ctx, [[foot[0] - 4, foot[1] + 2], [foot[0] + 10, foot[1] + 2]], '#b9d857', 2)
  }
  // Far leg sits behind the frame; both knees bend towards the handlebars.
  line(ctx, [pose.hip, pose.far.knee, pose.far.foot], '#376170', 10)
  shoe(pose.far.foot, '#31525e')
  line(ctx, [bike.crank, pose.far.foot], '#6e9697', 4)
  line(ctx, [bike.rear, bike.seat, bike.crank, bike.rear], '#13777d', 5)
  line(ctx, [bike.seat, bike.headTop, bike.headBottom, bike.crank, bike.seat], '#13777d', 6)
  line(ctx, [bike.headBottom, bike.front], '#175f69', 5)
  line(ctx, [bike.seat, [40, -74]], '#24454a', 4)
  line(ctx, [[30, -74], [53, -74]], '#24454a', 6)
  line(ctx, [bike.headTop, [94, -80], [110, -85], [117, -81]], '#24454a', 5)
  line(ctx, [[2, 3], [58, 2]], '#507b7c', 2)
  circle(ctx, bike.crank[0], bike.crank[1], 9, '#d2ed62')
  circle(ctx, bike.crank[0], bike.crank[1], 4, '#24555c')
  line(ctx, [bike.crank, pose.near.foot], '#24454a', 4)
  line(ctx, [pose.hip, pose.near.knee, pose.near.foot], '#173f4c', 11)
  shoe(pose.near.foot, '#173f4c')
  line(ctx, [[43, -79], [63, -116]], '#c8ed56', 25)
  line(ctx, [[69, -112], [90, -94], [112, -83]], '#b97d60', 9)
  circle(ctx, 75, -140, 17, '#dbab7d')
  ctx.fillStyle = '#176873'; ctx.beginPath(); ctx.arc(74, -146, 20, Math.PI, Math.PI * 2); ctx.lineTo(98, -145); ctx.lineTo(54, -145); ctx.fill()
  line(ctx, [[62, -157], [67, -159]], '#d2ed62', 3)
  circle(ctx, 86, -141, 2, '#203f48')
  ctx.restore()
  ctx.restore() // Only the world shakes, never the controls or gauge.
  ctx.fillStyle = '#245a60'; ctx.font = '600 16px system-ui, sans-serif'; ctx.textAlign = 'left'
  ctx.fillText('STRANDPROMENADEN', 30, 38)
  ctx.textAlign = 'right'; ctx.fillText(game.impactTimer > 0 ? 'GROP! HÅLL BALANSEN' : !game.wheelieStarted ? 'Håll för att lyfta framhjulet' : largeAhead ? largeAhead.rolling ? 'KULLE FRAMFÖR DIG' : 'STORT GUPP FRAMFÖR DIG' : `${Math.floor(game.distance)} m`, 930, 38)
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
