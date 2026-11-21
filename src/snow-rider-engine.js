// Original, deterministic downhill course. World units are game metres, not
// training distance. Fixed physics steps keep touch/keyboard and FPS equal.
export const SNOW_SECONDS=120, SNOW_MAX_SCORE=10000, SNOW_STEP=1/120
export const snowTrackCentre=s=>Math.sin(s*.008)*9+Math.sin(s*.019)*2
export const snowNoise=n=>{const x=Math.sin(n*127.1+311.7)*43758.5453;return x-Math.floor(x)}
export const validSnowScore=score=>Number.isInteger(score)&&score>0&&score<=SNOW_MAX_SCORE
export function snowScore(game){return Math.min(SNOW_MAX_SCORE,Math.floor(game.distance)+game.gems*25)}
function spawnRow(game){
  const row=game.row++,s=65+row*24,lane=Math.floor(snowNoise(row+game.seed)*3),kinds=['pine','rock','snowman','log']
  const kind=kinds[Math.floor(snowNoise(row+game.seed+83)*kinds.length)]
  game.objects.push({id:`o${row}`,s,x:(lane-1)*3,kind,radius:kind==='log'?1.1:kind==='rock'?.9:.7,height:kind==='pine'?4:kind==='snowman'?1.7:.65})
  const free=(lane+1+Math.floor(snowNoise(row+game.seed+191)*2))%3
  game.objects.push({id:`g${row}`,s:s+7,x:(free-1)*3,kind:'gem',radius:.75,height:1.1})
}
export function createSnowGame(seed=137){
  const game={status:'ready',seed:Number.isFinite(seed)?Math.floor(seed):137,elapsed:0,distance:0,speed:15,x:0,vx:0,y:0,vy:0,gems:0,score:0,row:0,objects:[],accumulator:0,reason:'',jumpQueued:false}
  while(65+game.row*24<210)spawnRow(game)
  return game
}
export function startSnow(game){if(game.status==='ready'){game.status='playing';game.accumulator=0}return game}
export function pauseSnow(game){if(game.status==='playing'){game.status='paused';game.accumulator=0;game.jumpQueued=false}return game}
export function resumeSnow(game){if(game.status==='paused'){game.status='playing';game.accumulator=0}return game}
export function jumpSnow(game){if(game.status==='playing'&&game.y<=.001){game.jumpQueued=true;return true}return false}
export function advanceSnow(game,delta,steer=0){
  if(game.status!=='playing'||!Number.isFinite(delta)||delta<=0)return game
  game.accumulator+=Math.min(delta,.1)
  const direction=Number.isFinite(steer)?Math.max(-1,Math.min(1,steer)):0
  while(game.accumulator+1e-10>=SNOW_STEP&&game.status==='playing'){
    game.accumulator-=SNOW_STEP;const dt=SNOW_STEP
    if(game.jumpQueued){if(game.y<=.001){game.vy=7;game.y=.002}game.jumpQueued=false}
    game.elapsed=Math.min(SNOW_SECONDS,game.elapsed+dt)
    game.speed=Math.min(32,15+game.elapsed*.11)
    game.distance+=game.speed*dt
    game.vx+=(direction*8.5-game.vx)*Math.min(1,dt*9)
    game.x=Math.max(-4.25,Math.min(4.25,game.x+game.vx*dt))
    if(game.y>0||game.vy>0){game.vy-=17*dt;game.y+=game.vy*dt;if(game.y<=0){game.y=0;game.vy=0}}
    while(65+game.row*24<game.distance+210)spawnRow(game)
    for(const item of game.objects){
      if(item.taken||Math.abs(item.s-game.distance)>1||Math.abs(item.x-game.x)>item.radius+.38)continue
      if(item.kind==='gem'){
        if(Math.abs(game.y+.5-item.height)<1.2){item.taken=true;game.gems++}
      }else if(game.y<item.height){game.status='over';game.reason=item.kind==='pine'?'Ett träd kom i vägen.':item.kind==='snowman'?'Snögubben vann den här gången.':'Nästan! Prova ett hopp över låga hinder.';break}
    }
    game.objects=game.objects.filter(item=>!item.taken&&item.s>game.distance-8)
    game.score=snowScore(game)
    if(game.status==='playing'&&game.elapsed>=SNOW_SECONDS){game.status='complete';game.reason='Hela vinterturen avklarad!'}
  }
  return game
}
