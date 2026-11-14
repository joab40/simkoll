import { BOTTLE_FLOOR } from './bottle-flip-engine.js'
const round = (ctx, x, y, w, h, r, fill) => { ctx.fillStyle = fill; ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill() }
function bottle(ctx, game) {
  ctx.save(); ctx.translate(game.x, game.y - 28); ctx.rotate(game.angle)
  const squash = game.phase === 'charging' ? 1 - game.charge * .12 : 1
  // Narrow the silhouette in bottle-local coordinates; height and physics stay unchanged.
  ctx.scale(.84 / Math.sqrt(squash), squash)
  ctx.shadowColor = '#14484935'; ctx.shadowBlur = 12; ctx.shadowOffsetY = 4
  ctx.fillStyle = '#efffff'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(-8, -27); ctx.lineTo(8, -27); ctx.lineTo(8, -20); ctx.quadraticCurveTo(17, -13, 17, -8); ctx.lineTo(17, 21); ctx.quadraticCurveTo(17, 28, 10, 28); ctx.lineTo(-10, 28); ctx.quadraticCurveTo(-17, 28, -17, 21); ctx.lineTo(-17, -8); ctx.quadraticCurveTo(-17, -13, -8, -20); ctx.closePath(); ctx.fill(); ctx.stroke()
  ctx.shadowBlur = 0; ctx.shadowOffsetY = 0
  round(ctx, -13, 1, 26, 23, 5, '#4bc6ce')
  ctx.fillStyle = '#96edf0'; ctx.beginPath(); ctx.moveTo(-13, 4); ctx.quadraticCurveTo(0, -3, 13, 4); ctx.lineTo(13, 10); ctx.lineTo(-13, 10); ctx.fill()
  round(ctx, -11, -31, 22, 9, 3, '#176a72')
  round(ctx, -17, -6, 34, 16, 2, '#196e78')
  ctx.strokeStyle = '#cff9ed'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-9, 1); ctx.quadraticCurveTo(-4, -4, 0, 1); ctx.quadraticCurveTo(4, 6, 9, 1); ctx.stroke()
  round(ctx, -11, -17, 3, 12, 1, '#ffffffdd'); ctx.restore()
}
export function drawBottleStartingBlock(ctx, p) {
  const x = p.x, y = p.y, w = p.width, floor = BOTTLE_FLOOR, h = floor - y, cx = x + w / 2
  // Rear/deck view: broad numbered pedestal, blue anti-slip deck and kick plate.
  // The deck's centre and white aiming stripe still coincide with physics y.
  ctx.save()
  ctx.fillStyle = '#243a3930'; ctx.beginPath(); ctx.ellipse(p.x + p.width / 2 + 12, BOTTLE_FLOOR + 5, p.width / 2 + 15, 9, 0, 0, Math.PI * 2); ctx.fill()
  const white = ctx.createLinearGradient(x, y, x + w, floor)
  white.addColorStop(0, '#fffffc'); white.addColorStop(.65, '#ecf1ef'); white.addColorStop(1, '#c7d4d3')
  ctx.fillStyle = white; ctx.strokeStyle = '#aebfbe'; ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(x + 13, y + 9); ctx.lineTo(x + w - 13, y + 9); ctx.lineTo(x + w - 24, y + h * .52); ctx.lineTo(x + w - 9, floor - 8); ctx.lineTo(x + 9, floor - 8); ctx.lineTo(x + 23, y + h * .52); ctx.closePath(); ctx.fill(); ctx.stroke()
  ctx.fillStyle = '#bccbca'; ctx.beginPath(); ctx.moveTo(x + w - 13, y + 11); ctx.lineTo(x + w - 4, y + 17); ctx.lineTo(x + w - 16, y + h * .52); ctx.lineTo(x + w - 2, floor - 8); ctx.lineTo(x + w - 9, floor - 8); ctx.lineTo(x + w - 24, y + h * .52); ctx.closePath(); ctx.fill()
  round(ctx, x + 5, floor - 11, w - 10, 9, 3, '#e8eeeb')
  round(ctx, x + 9, floor - 4, w - 18, 3, 1, '#9eb2b0')
  // Blue sloping top, with the far edge toward the pool.
  round(ctx, x, y + 2, w, 13, 3, '#fcfefa')
  ctx.fillStyle = '#3997bd'; ctx.beginPath(); ctx.moveTo(x + 9, y - 15); ctx.lineTo(x + w - 9, y - 15); ctx.lineTo(x + w - 2, y + 3); ctx.lineTo(x + 2, y + 3); ctx.closePath(); ctx.fill()
  ctx.strokeStyle = '#91d6e3'; ctx.lineWidth = 1
  for (let line = 0; line < 3; line++) { ctx.beginPath(); ctx.moveTo(x + 10, y - 11 + line * 4); ctx.lineTo(x + w - 10, y - 11 + line * 4); ctx.stroke() }
  round(ctx, x + 2, y + 3, w - 4, 5, 1, '#226e95')
  // Rear kick plate and stainless supports; decorative, not extra obstacles.
  ctx.strokeStyle = '#8b9e9e'; ctx.lineWidth = 3
  for (const arm of [-1, 1]) { ctx.beginPath(); ctx.moveTo(cx + arm * w * .23, y - 5); ctx.lineTo(cx + arm * w * .23, y - 31); ctx.stroke() }
  round(ctx, cx - w * .27, y - 35, w * .54, 17, 3, '#aabdbf')
  round(ctx, cx - w * .25, y - 32, w * .5, 10, 2, '#2f819f')
  round(ctx, cx - w * .27, y - 35, w * .54, 3, 1, '#edf7f4')
  ctx.fillStyle = '#203b41'; ctx.font = `800 ${Math.min(36, w * .27, h * .27)}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText(String(p.index + 1), cx - 2, y + h * .51, w * .55)
  ctx.fillStyle = '#6d9297'; ctx.font = '700 6px system-ui, sans-serif'; ctx.fillText('SIMKOLL', cx - 2, floor - 21, w * .55)
  round(ctx, x + w * .35, y - 3, w * .3, 5, 2, '#fff9e8')
  ctx.restore()
}
export function drawBottleBackstrokeFlags(ctx, width) {
  ctx.save()
  const heightAt = fraction => 62 + 88 * fraction * (1 - fraction)
  ctx.strokeStyle = '#638f8c'; ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(0, heightAt(0)); ctx.quadraticCurveTo(width / 2, 106, width, heightAt(1)); ctx.stroke()
  const count = Math.max(6, Math.ceil(width / 70)), gap = width / (count + 1), flagWidth = Math.min(31, gap * .58)
  for (let index = 0; index < count; index++) {
    const fraction = (index + 1) / (count + 1), x = width * fraction, top = heightAt(fraction), half = flagWidth / 2
    // Swallow-tail flags, like a backstroke marker rope; no lamps or logos.
    ctx.fillStyle = index % 2 === 0 ? '#258c91' : '#fffef5'; ctx.strokeStyle = index % 2 === 0 ? '#21787e' : '#a7c7c1'; ctx.lineWidth = .7
    ctx.beginPath(); ctx.moveTo(x - half, top); ctx.lineTo(x + half, top); ctx.lineTo(x + half, top + 34); ctx.lineTo(x, top + 25); ctx.lineTo(x - half, top + 34); ctx.closePath(); ctx.fill(); ctx.stroke()
    ctx.strokeStyle = '#ffffff70'; ctx.beginPath(); ctx.moveTo(x - half + 2, top + 3); ctx.lineTo(x + half - 2, top + 3); ctx.stroke()
  }
  ctx.restore()
}
export function drawBottle(canvas, game, reducedMotion = false) {
  const rect = canvas.getBoundingClientRect(), ratio = Math.min(window.devicePixelRatio || 1, 2)
  if (!rect.width || !rect.height) return
  const pixelWidth = Math.round(rect.width * ratio), pixelHeight = Math.round(rect.height * ratio)
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) { canvas.width = pixelWidth; canvas.height = pixelHeight }
  const ctx = canvas.getContext('2d'), scale = pixelHeight / 540, width = pixelWidth / scale
  ctx.setTransform(scale, 0, 0, scale, 0, 0)
  const sky = ctx.createLinearGradient(0, 0, 0, 490); sky.addColorStop(0, '#f7e9d7'); sky.addColorStop(.53, '#fdf7e9'); sky.addColorStop(1, '#b1dbd2')
  ctx.fillStyle = sky; ctx.fillRect(0, 0, width, 540)
  ctx.fillStyle = '#f2bc733d'; ctx.beginPath(); ctx.arc(width * .78, 96, 65, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#edc87b'; ctx.beginPath(); ctx.arc(width * .78, 96, 37, 0, Math.PI * 2); ctx.fill()
  // Pool, lanes and terrace are deliberately original, not assets from the reference.
  ctx.fillStyle = '#86c9c4'; ctx.fillRect(0, 204, width, 134)
  for (let lane = 0; lane < 4; lane++) {
    ctx.strokeStyle = lane % 2 ? '#f7efd9' : '#439eaa'; ctx.lineWidth = 3; ctx.setLineDash([8, 8]); ctx.beginPath(); ctx.moveTo(-20, 229 + lane * 29); ctx.lineTo(width + 20, 215 + lane * 29); ctx.stroke()
  }
  ctx.setLineDash([]); ctx.fillStyle = '#e4d8bd'; ctx.fillRect(0, 333, width, 207)
  ctx.fillStyle = '#f2e8d3'; ctx.fillRect(0, 333, width, 16)
  ctx.strokeStyle = '#cdbd9c66'; ctx.lineWidth = 1
  for (let y = 370; y < 540; y += 42) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke() }
  for (let x = -(game.camera * .2 % 110); x < width; x += 110) { ctx.beginPath(); ctx.moveTo(x, 349); ctx.lineTo(x - 40, 540); ctx.stroke() }
  drawBottleBackstrokeFlags(ctx, width)
  ctx.save(); ctx.translate(-game.camera, 0)
  const visible = game.platforms.filter(p => p.x + p.width > game.camera - 50 && p.x < game.camera + width + 80)
  for (const p of visible) drawBottleStartingBlock(ctx, p)
  const next = game.platforms[game.current + 1]
  if (game.status === 'playing' && next) {
    ctx.fillStyle = '#237d82'; ctx.font = '700 11px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('NÄSTA', next.x + next.width / 2, next.y - 57)
    ctx.beginPath(); ctx.moveTo(next.x + next.width / 2 - 4, next.y - 51); ctx.lineTo(next.x + next.width / 2 + 4, next.y - 51); ctx.lineTo(next.x + next.width / 2, next.y - 45); ctx.fill()
  }
  const shadow = game.platforms[game.current]
  ctx.fillStyle = '#194b4a26'; ctx.beginPath(); ctx.ellipse(game.x, shadow.y + 8, 18, 5, 0, 0, Math.PI * 2); ctx.fill()
  bottle(ctx, game)
  if (game.feedbackFor > 0 && game.feedback.startsWith('Mitt') && !reducedMotion) {
    const age = 1.3 - game.feedbackFor
    for (let i = 0; i < 9; i++) { ctx.fillStyle = i % 2 ? '#d5a84f' : '#37aaa0'; const x = game.x + Math.cos(i * 2.4) * age * 70, y = game.y - 30 - Math.sin(i * 1.5) * age * 55 + age * age * 30; ctx.fillRect(x, y, 4, 4) }
  }
  ctx.restore()
}
