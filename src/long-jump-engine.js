export const JUMP_BOARD = 20
export const JUMP_ZONE = 12
export const JUMP_MAX_SCORE = 1000
const DRAG = 0.55, MAX_SPEED = 9.8, HOLD_MS = 180, GRAVITY = 10
export const jumpMetres = (score) => `${(score / 100).toFixed(2).replace('.', ',')} m`
export const validJumpScore = (score) => Number.isInteger(score) && score > 0 && score <= JUMP_MAX_SCORE

export function createJump(now) {
  return { status:'run', x:0, y:0, speed:0, updatedAt:now, startedAt:now, heldAt:null, angle:0, lastTap:-Infinity, result:0, reason:'' }
}
export function advanceJump(jump, now) {
  if (jump.status === 'flight') {
    const t = Math.min((now-jump.launchAt)/1000, jump.flightTime)
    jump.x = jump.launchX + jump.vx*t
    jump.y = Math.max(0,jump.vy*t-GRAVITY*t*t/2)
    if (t >= jump.flightTime) {
      jump.result = Math.max(0,Math.round((jump.x-JUMP_BOARD)*100))
      jump.status = jump.result>0 ? 'landed' : 'foul'
      if (!jump.result) jump.reason='För tidigt upphopp – du nådde inte sandgropen.'
    }
    return jump
  }
  if (!['run','charge'].includes(jump.status)) return jump
  // Small fixed subdivisions make hold detection consistent across frame rates.
  while(jump.updatedAt < now) {
    const end=Math.min(now,jump.updatedAt+5), dt=(end-jump.updatedAt)/1000
    if(jump.status==='charge') jump.x += jump.speed*dt
    else {jump.x += jump.speed*(1-Math.exp(-DRAG*dt))/DRAG; jump.speed *= Math.exp(-DRAG*dt)}
    jump.updatedAt=end
    if(jump.heldAt!==null && end-jump.heldAt>=HOLD_MS && jump.x>=JUMP_ZONE && jump.status==='run') {jump.status='charge';jump.chargeAt=end}
    if(jump.status==='charge') jump.angle=Math.min(90,(end-jump.chargeAt)*0.09)
    if(jump.x>JUMP_BOARD) {jump.status='foul';jump.reason='Övertramp! Släpp innan den vita plankan.';break}
    if(end-jump.startedAt>=30000) {jump.status='foul';jump.reason='Ansatsen tog för lång tid. Försök igen.';break}
  }
  return jump
}
export function pressJump(jump,now) {
  advanceJump(jump,now)
  if(jump.status!=='run' || jump.heldAt!==null)return false
  jump.heldAt=now
  if(now-jump.lastTap>=65){jump.speed=Math.min(MAX_SPEED,jump.speed+1.55);jump.lastTap=now}
  return true
}
export function releaseJump(jump,now) {
  advanceJump(jump,now)
  if(jump.status==='charge') {
    const radians=jump.angle*Math.PI/180
    jump.launchAt=now;jump.launchX=jump.x
    jump.vx=jump.speed*Math.cos(radians);jump.vy=jump.speed*Math.sin(radians)
    jump.flightTime=2*jump.vy/GRAVITY;jump.status='flight'
  }
  jump.heldAt=null
  return jump
}
