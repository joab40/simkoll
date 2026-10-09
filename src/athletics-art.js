export function drawAthlete(ctx, x, y, phase, color, active, scale = 1) {
  ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale)
  ctx.fillStyle = '#251d3240'; ctx.beginPath(); ctx.ellipse(0, 3, 27, 7, 0, 0, Math.PI * 2); ctx.fill()
  const swing = active ? Math.sin(phase) : 0
  const bob = active ? Math.abs(Math.cos(phase)) * 3 : 0
  ctx.translate(0, -bob)
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  const limb = (points, color, width) => { ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath(); points.forEach(([a, b], i) => i ? ctx.lineTo(a, b) : ctx.moveTo(a, b)); ctx.stroke() }
  limb([[-2,-39],[-swing*19,-21],[-swing*27+6,-4]], '#8e5039', 9)
  limb([[-2,-39],[swing*18,-22],[swing*28-5,-5]], '#e5a679', 10)
  limb([[-swing*27+3,-4],[-swing*27+14,-4]], '#f6f1de', 7)
  limb([[swing*28-6,-5],[swing*28+5,-5]], '#fff7df', 7)
  limb([[1,-65],[-swing*19,-52],[-swing*14+10,-60]], '#8e5039', 8)
  ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(-8,-72); ctx.lineTo(13,-68); ctx.lineTo(7,-40); ctx.lineTo(-10,-40); ctx.closePath(); ctx.fill()
  ctx.fillStyle = '#152b40'; ctx.fillRect(-10,-43,19,9)
  limb([[7,-63],[swing*18+8,-53],[swing*14+18,-65]], '#e5a679', 8)
  ctx.fillStyle = '#e5a679'; ctx.beginPath(); ctx.arc(7,-84,12,0,Math.PI*2); ctx.fill()
  ctx.fillStyle = '#243247'; ctx.beginPath(); ctx.arc(5,-89,11,Math.PI,Math.PI*2); ctx.fill(); ctx.fillRect(-6,-90,11,9)
  ctx.fillStyle = '#fff4d7'; ctx.fillRect(-5,-91,24,3)
  ctx.fillStyle = '#243247'; ctx.fillRect(14,-85,2,3)
  ctx.fillStyle = '#fff9df'; ctx.fillRect(-3,-61,11,12); ctx.fillStyle = '#1e3443'; ctx.font = 'bold 10px monospace'; ctx.fillText('1',-1,-51)
  ctx.restore()
}
