import { projectRally, rallyTrackAt, rallyGhostAt, RALLY_LAPS } from './rally-engine.js'

const scenes = new WeakMap()
const palettes = {
  coast: { ground: '#7b9f68', deep: '#658c5b', road: '#343e46', water: '#66b8c0', tree: '#355c4c', leaf: '#4e7b55', curb: '#e9a178' },
  forest: { ground: '#6b8860', deep: '#597650', road: '#394248', water: '#698f93', tree: '#244b41', leaf: '#3e6750', curb: '#dd9b72' },
  dusk: { ground: '#555e6b', deep: '#4b5261', road: '#2c3444', water: '#5c7d98', tree: '#313e55', leaf: '#48536c', curb: '#ca8e87' },
}
function route(ctx, track, width, color, dash = []) {
  ctx.beginPath(); track.points.forEach((p,i) => i ? ctx.lineTo(p.x,p.y) : ctx.moveTo(p.x,p.y)); ctx.closePath()
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineJoin = 'round'; ctx.setLineDash(dash); ctx.stroke(); ctx.setLineDash([])
}
function createScene(track) {
  const scene = document.createElement('canvas'); scene.width = 1500; scene.height = 1000
  const ctx = scene.getContext('2d'), colors = palettes[track.theme]
  ctx.fillStyle = colors.ground; ctx.fillRect(0,0,1500,1000)
  const shade = ctx.createLinearGradient(0,0,1400,1000); shade.addColorStop(0,'#ffffff0d'); shade.addColorStop(1,'#162e2c25'); ctx.fillStyle=shade; ctx.fillRect(0,0,1500,1000)
  // A hand-drawn coastline and small infield pond, not downloaded artwork.
  ctx.fillStyle = '#d0c294'; ctx.beginPath(); ctx.moveTo(0,0);ctx.lineTo(110,0);ctx.bezierCurveTo(55,300,140,540,70,1000);ctx.lineTo(0,1000);ctx.fill()
  ctx.fillStyle = colors.water; ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(70,0);ctx.bezierCurveTo(25,300,90,600,30,1000);ctx.lineTo(0,1000);ctx.fill()
  ctx.strokeStyle='#e4f2e24d';ctx.lineWidth=2
  for(let i=0;i<17;i++){const y=i*65+20;ctx.beginPath();ctx.moveTo(0,y);ctx.quadraticCurveTo(35,y-9,48,y+2);ctx.stroke()}
  ctx.fillStyle=colors.deep;ctx.beginPath();ctx.ellipse(660,450,170,70,-.18,0,Math.PI*2);ctx.fill()
  ctx.fillStyle=colors.water;ctx.beginPath();ctx.ellipse(660,450,148,51,-.18,0,Math.PI*2);ctx.fill()
  ctx.strokeStyle='#e3efe02b';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(660,450,135,39,-.18,0,Math.PI*2);ctx.stroke()
  route(ctx,track,track.width+30,'#203e352a'); route(ctx,track,track.width+12,'#dce0ca')
  for(let s=0;s<track.length;s+=25) for(const side of [-1,1]){
    const p=rallyTrackAt(track,s,side*(track.width/2+2)), q=rallyTrackAt(track,s+13,side*(track.width/2+2))
    ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);ctx.strokeStyle=colors.curb;ctx.lineWidth=9;ctx.stroke()
  }
  route(ctx,track,track.width,colors.road);route(ctx,track,2,'#cad8cb36',[18,22])
  for(let i=0;i<190;i++){
    const x=100+((i*367)%1330), y=35+((i*239)%920)
    if(projectRally(track,x,y).distance<track.width/2+38 || ((x-660)/170)**2+((y-450)/80)**2<1)continue
    const radius=12+(i%5)*3
    ctx.fillStyle='#183b352a';ctx.beginPath();ctx.ellipse(x+9,y+11,radius*1.2,radius*.85,.4,0,Math.PI*2);ctx.fill()
    ctx.fillStyle=colors.tree;ctx.beginPath();ctx.arc(x,y,radius,0,Math.PI*2);ctx.fill()
    ctx.fillStyle=colors.leaf;ctx.beginPath();ctx.arc(x-4,y-5,radius*.79,0,Math.PI*2);ctx.fill()
    ctx.fillStyle='#ffffff0a';ctx.beginPath();ctx.arc(x-7,y-8,radius*.44,0,Math.PI*2);ctx.fill()
  }
  const start=rallyTrackAt(track,0);ctx.save();ctx.translate(start.x,start.y);ctx.rotate(start.angle)
  for(let i=0;i<2;i++)for(let j=0;j<10;j++){ctx.fillStyle=(i+j)%2?'#e9eedb':'#172b32';ctx.fillRect(i*8-8,-track.width/2+j*track.width/10,8,track.width/10)}
  ctx.fillStyle='#dce4d1';ctx.font='bold 13px sans-serif';ctx.textAlign='center';ctx.rotate(-Math.PI/2);ctx.fillText('SIMKOLL',0,39);ctx.restore()
  ctx.save();ctx.translate(690,640);ctx.rotate(-.08);ctx.fillStyle='#e0ead278';ctx.font='900 44px sans-serif';ctx.textAlign='center';ctx.fillText('KUST RALLY',0,0);ctx.font='bold 12px sans-serif';ctx.letterSpacing='3px';ctx.fillText('HITTA DIN RYTM',0,26);ctx.restore()
  scenes.set(track,scene); return scene
}
function boostPad(ctx, point, time, reduced) {
  ctx.save();ctx.translate(point.x,point.y);ctx.rotate(point.angle)
  ctx.fillStyle='#52d8f329';ctx.fillRect(-24,-32,48,64);ctx.strokeStyle='#89eaf0a3';ctx.lineWidth=2;ctx.strokeRect(-24,-32,48,64)
  ctx.strokeStyle='#b0fbff';ctx.lineWidth=4
  for(let i=0;i<3;i++){const x=-12+i*12;ctx.globalAlpha=reduced ? .9 : .65+.3*Math.sin(time*5-i);ctx.beginPath();ctx.moveTo(x-5,-14);ctx.lineTo(x+4,0);ctx.lineTo(x-5,14);ctx.stroke()}
  ctx.restore()
}
function drawCar(ctx, car, time, reduced) {
  ctx.save();ctx.translate(car.x,car.y);ctx.rotate(car.heading)
  ctx.fillStyle='#102a384a';ctx.beginPath();ctx.roundRect(-14, -6, 34, 21, 6);ctx.fill()
  if(car.boost>0){ctx.fillStyle='#8ceff4';ctx.beginPath();ctx.moveTo(-16,-5);ctx.lineTo(-30-(reduced?0:Math.sin(time*40)*7),0);ctx.lineTo(-16,5);ctx.fill()}
  ctx.fillStyle='#15242e';for(const x of [-10,9])for(const y of [-12,8])ctx.fillRect(x-4,y,9,5)
  const paint=ctx.createLinearGradient(-16,-9,16,9);paint.addColorStop(0,car.color);paint.addColorStop(1,car.id===0?'#98b72e':car.color)
  ctx.fillStyle=paint;ctx.beginPath();ctx.roundRect(-17,-9,35,18,5);ctx.fill()
  ctx.fillStyle='#f4ffe296';ctx.fillRect(6,-5,10,3);ctx.fillRect(6,2,10,3)
  ctx.fillStyle='#223e4b';ctx.beginPath();ctx.roundRect(-6,-6,12,12,3);ctx.fill()
  ctx.fillStyle='#a9dce2';ctx.fillRect(1,-5,4,10);ctx.fillStyle='#1c2c36';ctx.fillRect(-16,-11,4,22)
  ctx.fillStyle='#f6f9db';ctx.fillRect(15,-7,3,4);ctx.fillRect(15,3,3,4)
  ctx.fillStyle='#f48f75';ctx.fillRect(-18,-6,2,4);ctx.fillRect(-18,2,2,4)
  ctx.restore()
  if(car.id===0){ctx.fillStyle='#edffd5';ctx.font='bold 10px sans-serif';ctx.textAlign='center';ctx.fillText('DU',car.x,car.y-24)}
}
function minimap(ctx, game, width, ghosts) {
  const w=132,h=92,x=width-w-14,y=14
  ctx.save();ctx.fillStyle='#112b38cc';ctx.beginPath();ctx.roundRect(x,y,w,h,12);ctx.fill()
  ctx.translate(x+8,y+6);ctx.scale((w-16)/1500,(h-12)/1000)
  route(ctx,game.track,24,'#d8e7d05c')
  for(const ghost of ghosts){ctx.strokeStyle=ghost.color;ctx.lineWidth=15;ctx.beginPath();ctx.arc(ghost.x,ghost.y,40,0,Math.PI*2);ctx.stroke()}
  game.cars.forEach(car=>{ctx.fillStyle=car.color;ctx.beginPath();ctx.arc(car.x,car.y,car.id===0?36:27,0,Math.PI*2);ctx.fill()})
  ctx.restore()
}
export function drawRally(canvas, game, { reducedMotion = false, ghost = null, weeklyGhost = null } = {}) {
  if(!canvas)return
  const rect=canvas.getBoundingClientRect(), width=rect.width||880, height=rect.height||560, dpr=Math.min(window.devicePixelRatio||1,2)
  if(canvas.width!==Math.round(width*dpr)||canvas.height!==Math.round(height*dpr)){canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr)}
  const ctx=canvas.getContext('2d');if(!ctx)return
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height)
  const car=game.cars[0],scale=width/(width<600?540:940), colors=palettes[game.track.theme]
  const lead=reducedMotion?0:58, cx=car.x+Math.cos(car.heading)*lead, cy=car.y+Math.sin(car.heading)*lead
  ctx.fillStyle=colors.ground;ctx.fillRect(0,0,width,height)
  ctx.save();ctx.translate(width/2-cx*scale,height/2-cy*scale);ctx.scale(scale,scale)
  ctx.fillStyle=colors.water;ctx.fillRect(-3000,-3000,3000,7000)
  ctx.drawImage(scenes.get(game.track)||createScene(game.track),0,0)
  game.track.boosts.forEach(s=>boostPad(ctx,rallyTrackAt(game.track,s),game.elapsed,reducedMotion))
  for(const other of game.cars){ctx.fillStyle='#10232c35';for(const mark of other.marks){ctx.save();ctx.translate(mark.x,mark.y);ctx.rotate(mark.heading);ctx.fillRect(-8,-11,9,2);ctx.fillRect(-8,9,9,2);ctx.restore()}}
  const ghosts = [
    { replay:ghost, color:'#b7f5ff', label:'EGEN GHOST' },
    { replay:weeklyGhost?.replay, color:'#ffcf6b', label:`VECKANS · ${(weeklyGhost?.displayName||'Ledaren').slice(0,18)}` },
  ].filter(item=>item.replay).map(item=>({...rallyGhostAt(item.replay,game.elapsed),color:item.color,label:item.label}))
  for(const ghostCar of ghosts){
    ctx.save();ctx.globalAlpha=.45;drawCar(ctx,ghostCar,game.elapsed,true);ctx.restore()
    ctx.strokeStyle=ghostCar.color;ctx.lineWidth=2;ctx.save();ctx.translate(ghostCar.x,ghostCar.y);ctx.rotate(ghostCar.heading);ctx.beginPath();ctx.roundRect(-20,-13,41,26,6);ctx.stroke();ctx.restore()
    ctx.fillStyle=ghostCar.color;ctx.font='bold 10px sans-serif';ctx.textAlign='center';ctx.fillText(ghostCar.label,ghostCar.x,ghostCar.y-25)
  }
  for(const other of [...game.cars].sort((a,b)=>a.id===0?1:b.id===0?-1:0))drawCar(ctx,other,game.elapsed,reducedMotion)
  ctx.restore();minimap(ctx,game,width,ghosts)
  ctx.fillStyle='#112b38b8';ctx.beginPath();ctx.roundRect(14,14,86,60,12);ctx.fill();ctx.fillStyle='#d6e8df';ctx.font='bold 10px sans-serif';ctx.textAlign='left';ctx.fillText('VARV',26,34);ctx.fillStyle='#fff';ctx.font='bold 21px sans-serif';ctx.fillText(`${Math.min(RALLY_LAPS,car.laps+1)} / ${RALLY_LAPS}`,26,59)
  if(game.status==='countdown'){ctx.fillStyle='#15323d99';ctx.fillRect(0,0,width,height);ctx.fillStyle='#e3f66d';ctx.textAlign='center';ctx.font=`900 ${Math.min(width*.22,100)}px sans-serif`;ctx.fillText(Math.max(1,Math.ceil(game.countdown)),width/2,height/2+30)}
}
