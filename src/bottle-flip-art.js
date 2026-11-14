import { BOTTLE_FLOOR } from './bottle-flip-engine.js'
const round = (ctx, x, y, w, h, r, fill) => { ctx.fillStyle = fill; ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill() }
function bottle(ctx, game) {
  ctx.save(); ctx.translate(game.x, game.y - 28); ctx.rotate(game.angle)
  const squash = game.phase === 'charging' ? 1 - game.charge * .12 : 1
  ctx.scale(1 / Math.sqrt(squash), squash)
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
function platform(ctx, p) {
  const colors = ['#dca477', '#e9bc67', '#7cabb0', '#cba49d'], color = colors[p.kind]
  ctx.fillStyle = '#243a3930'; ctx.beginPath(); ctx.ellipse(p.x + p.width / 2 + 12, BOTTLE_FLOOR + 5, p.width / 2 + 15, 9, 0, 0, Math.PI * 2); ctx.fill()
  if (p.kind === 0 || p.kind === 1) {
    round(ctx, p.x + 12, p.y, 12, BOTTLE_FLOOR - p.y, 3, '#9a6f54')
    round(ctx, p.x + p.width - 24, p.y, 12, BOTTLE_FLOOR - p.y, 3, '#9a6f54')
    round(ctx, p.x + 16, p.y + (BOTTLE_FLOOR - p.y) * .66, p.width - 32, 8, 2, '#be8f6a')
    round(ctx, p.x, p.y, p.width, 19, 5, color)
    round(ctx, p.x + 3, p.y + 2, p.width - 6, 4, 2, '#ffe1b3')
  } else {
    round(ctx, p.x + 4, p.y + 4, p.width - 8, BOTTLE_FLOOR - p.y - 4, 8, color)
    round(ctx, p.x, p.y, p.width, 17, 5, p.kind === 2 ? '#abd6cf' : '#eec8b8')
    round(ctx, p.x + 14, p.y + 38, p.width - 28, 3, 1, '#ffffff44')
    round(ctx, p.x + p.width / 2 - 12, p.y + 28, 24, 7, 2, '#284a4b66')
    if (p.kind === 3) { ctx.strokeStyle = '#a17d77'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(p.x + p.width / 2, p.y + 46); ctx.lineTo(p.x + p.width / 2, BOTTLE_FLOOR - 14); ctx.stroke() }
  }
  round(ctx, p.x + p.width * .35, p.y - 3, p.width * .3, 5, 2, '#fff9e8')
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
  ctx.strokeStyle = '#447d7266'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, 62); ctx.quadraticCurveTo(width * .5, 130, width, 60); ctx.stroke()
  for (let i = 1; i < 9; i++) { const x = width * i / 9, y = 62 + 125 * (i / 9) * (1 - i / 9); ctx.fillStyle = i % 2 ? '#edb972' : '#faf8df'; ctx.beginPath(); ctx.arc(x, y + 7, 5, 0, Math.PI * 2); ctx.fill() }
  ctx.save(); ctx.translate(-game.camera, 0)
  const visible = game.platforms.filter(p => p.x + p.width > game.camera - 50 && p.x < game.camera + width + 80)
  for (const p of visible) platform(ctx, p)
  const next = game.platforms[game.current + 1]
  if (game.status === 'playing' && next && game.phase !== 'respawn') {
    ctx.fillStyle = '#237d82'; ctx.font = '700 11px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('NÄSTA', next.x + next.width / 2, next.y - 21)
    ctx.beginPath(); ctx.moveTo(next.x + next.width / 2 - 4, next.y - 15); ctx.lineTo(next.x + next.width / 2 + 4, next.y - 15); ctx.lineTo(next.x + next.width / 2, next.y - 9); ctx.fill()
  }
  const shadow = game.platforms[game.current]
  ctx.fillStyle = '#194b4a26'; ctx.beginPath(); ctx.ellipse(game.x, shadow.y + 8, 21, 5, 0, 0, Math.PI * 2); ctx.fill()
  if (game.phase !== 'respawn' || game.respawn > .3) bottle(ctx, game)
  if (game.feedbackFor > 0 && game.feedback.startsWith('Mitt') && !reducedMotion) {
    const age = 1.3 - game.feedbackFor
    for (let i = 0; i < 9; i++) { ctx.fillStyle = i % 2 ? '#d5a84f' : '#37aaa0'; const x = game.x + Math.cos(i * 2.4) * age * 70, y = game.y - 30 - Math.sin(i * 1.5) * age * 55 + age * age * 30; ctx.fillRect(x, y, 4, 4) }
  }
  ctx.restore()
}
