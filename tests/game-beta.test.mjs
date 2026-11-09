import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
process.env.SUPABASE_URL='https://game-beta-fixture.invalid'
process.env.SUPABASE_SECRET_KEY='fixture'
process.env.SIMKOLL_SWIMMER_CODE='beta-swimmer'
process.env.SIMKOLL_COACH_CODE='beta-coach'
const {default:handler}=await import('../api/points.js')
const {removeGameBeta}=await import('../server/game-beta.js')
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222',REV='33333333-3333-4333-8333-333333333333'
async function call({body,query={},code='beta-coach',session=true}={}){
  const response={setHeader(){},status(code){this.code=code;return this},json(data){this.data=data;return this}}
  await handler({method:body?'POST':'GET',headers:{'x-simkoll-code':code,...(session?{cookie:'simkoll_session=fixture'}:{})},body,query},response)
  return response
}
function fixture({profile=A,disabled=false,fail=false,race=false}={}){
  const settings=new Map(),writes=[],reads=[]
  settings.set('game_schedule',{schedule:[{gameKey:'rally',startDate:'2999-01-01',endDate:'2999-01-02',published:false}]})
  globalThis.fetch=async(raw,options={})=>{
    const url=new URL(raw),path=url.pathname.split('/rest/v1/')[1],params=url.searchParams;let data=[]
    const key=(params.get('setting_key')||'').replace(/^eq\./,'')
    if(options.method)writes.push({path,method:options.method,body:JSON.parse(options.body||'{}'),key})
    else reads.push({path,key})
    if(path==='profile_sessions')data=[{profile_id:profile}]
    if(path==='profiles'){const id=(params.get('id')||'').replace(/^eq\./,'');data=!disabled&&[A,B].includes(id)?[{id}]:[]}
    if(path==='app_settings'){
      if(fail&&key.startsWith('game_beta:'))return{ok:false,status:500,json:async()=>[]}
      if(!options.method)data=settings.has(key)?[{setting_value:settings.get(key)}]:[]
      else if(options.method==='POST'){
        const value=JSON.parse(options.body),exists=settings.has(value.setting_key)
        if(!exists){settings.set(value.setting_key,value.setting_value);data=[value]}
      }else if(options.method==='PATCH'){
        if(race){settings.set(key,{games:['dino'],revision:REV});race=false}
        const revision=(params.get('setting_value->>revision')||'').replace(/^eq\./,'')
        if(settings.get(key)?.revision===revision){const value=JSON.parse(options.body);settings.set(key,value.setting_value);data=[value]}
      }else if(options.method==='DELETE'){settings.delete(key)}
    }
    return{ok:true,status:200,json:async()=>data,text:async()=>''}
  }
  return{settings,writes,reads}
}
const save=(games,revision=null,profileId=A)=>({action:'save-game-beta',profileId,games,revision})

test('coach assigns/revokes beta per swimmer without changing public schedule or test-profile status',async()=>{
  const original=fetch
  try{
    const db=fixture(),schedule=structuredClone(db.settings.get('game_schedule'))
    const info=await call({query:{gameBetaProfileId:A}})
    assert.equal(info.code,200);assert.ok(info.data.catalog.some(game=>game.key==='rally'));assert.deepEqual(info.data.games,[])
    const granted=await call({body:save(['rally','balance'])});assert.equal(granted.code,200)
    assert.deepEqual(granted.data.games,['rally','balance']);assert.ok(granted.data.revision)
    const loaded=await call({query:{gameBetaProfileId:A}});assert.deepEqual(loaded.data.games,['rally','balance'])
    const cleared=await call({body:save([],granted.data.revision)});assert.equal(cleared.code,200);assert.deepEqual(cleared.data.games,[])
    assert.deepEqual(db.settings.get('game_schedule'),schedule)
    assert.ok(db.writes.every(write=>write.path==='app_settings'))
    assert.equal(db.settings.has(`game_beta:${B}`),false)
  }finally{globalThis.fetch=original}
})
test('only assigned session profile sees unpublished beta, never another client-selected profile',async()=>{
  const original=fetch
  try{
    let db=fixture();db.settings.set(`game_beta:${A}`,{games:['rally'],revision:REV})
    const own=await call({query:{games:'true',profileId:B},code:'beta-swimmer'})
    assert.deepEqual(own.data.betaGames.map(game=>game.key),['rally']);assert.deepEqual(own.data.catalog,[]);assert.deepEqual(own.data.schedule,[])
    assert.ok(!JSON.stringify(own.data).includes(A));assert.ok(!JSON.stringify(own.data).includes(REV))
    db=fixture({profile:B});db.settings.set(`game_beta:${A}`,{games:['rally'],revision:REV})
    assert.deepEqual((await call({query:{games:'true',profileId:A},code:'beta-swimmer'})).data.betaGames,[])
    assert.deepEqual((await call({query:{games:'true'},code:'beta-swimmer',session:false})).data.betaGames,[])
    db=fixture({disabled:true});db.settings.set(`game_beta:${A}`,{games:['rally'],revision:REV})
    assert.deepEqual((await call({query:{games:'true'},code:'beta-swimmer'})).data.betaGames,[])
  }finally{globalThis.fetch=original}
})
test('swimmers and anonymous callers cannot inspect or change beta assignments',async()=>{
  const original=fetch
  try{const db=fixture();for(const code of['beta-swimmer','wrong-code']){
    assert.equal((await call({query:{gameBetaProfileId:A},code})).code,403)
    assert.equal((await call({body:save(['rally']),code})).code,403)
  }assert.equal(db.writes.length,0)}finally{globalThis.fetch=original}
})
test('invalid input, unknown/suspended profiles and missing revision never write',async()=>{
  const original=fetch
  try{
    const db=fixture()
    for(const body of[save(['unknown']),save('rally'),save(['rally'],null,'bad&filter=all'),{...save(['rally']),revision:undefined}])assert.equal((await call({body})).code,400)
    assert.equal((await call({body:save(['rally'],null,'44444444-4444-4444-8444-444444444444')})).code,404)
    assert.equal(db.writes.length,0)
    const disabled=fixture({disabled:true});assert.equal((await call({body:save(['rally'])})).code,404);assert.equal(disabled.writes.length,0)
  }finally{globalThis.fetch=original}
})
test('stale and racing writes are rejected rather than losing a second coach change',async()=>{
  const original=fetch
  try{
    let db=fixture();const first=await call({body:save(['rally'])})
    assert.equal((await call({body:save(['balance'])})).code,409)
    assert.deepEqual(db.settings.get(`game_beta:${A}`).games,['rally'])
    db=fixture({race:true});db.settings.set(`game_beta:${A}`,{games:['rally'],revision:first.data.revision})
    const raced=await call({body:save(['balance'],first.data.revision)})
    assert.equal(raced.code,409);assert.deepEqual(db.settings.get(`game_beta:${A}`).games,['dino'])
  }finally{globalThis.fetch=original}
})
test('DB failures do not report success and profile cleanup only removes its own beta row',async()=>{
  const original=fetch
  try{
    let db=fixture({fail:true});assert.equal((await call({body:save(['rally'])})).code,500);assert.equal(db.writes.length,0)
    db=fixture();db.settings.set(`game_beta:${A}`,{games:['rally']});db.settings.set(`game_beta:${B}`,{games:['balance']})
    await removeGameBeta(A);assert.equal(db.settings.has(`game_beta:${A}`),false);assert.ok(db.settings.has(`game_beta:${B}`));assert.ok(db.settings.has('game_schedule'))
  }finally{globalThis.fetch=original}
})
test('simultaneous first assignments cannot overwrite the winning insert',async()=>{
  const original=fetch
  try{
    const db=fixture(),results=await Promise.all([call({body:save(['rally'])}),call({body:save(['balance'])})])
    assert.deepEqual(results.map(result=>result.code).sort(),[200,409])
    assert.deepEqual(db.settings.get(`game_beta:${A}`).games,results.find(result=>result.code===200).data.games)
  }finally{globalThis.fetch=original}
})
test('real swimmer/card wiring uses independent beta route, lazy settings fetch and preview-only games',()=>{
  const main=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8'),ui=readFileSync(new URL('../src/game-beta-settings.jsx',import.meta.url),'utf8')
  assert.match(main,/<GameBetaSettings key=\{`game-beta-\$\{profile.id\}`\} profile=\{profile\} code=\{code\}/)
  assert.match(main,/<GameBetaList games=\{betaGames\} onPlay=\{onBetaGame\}/)
  assert.match(main,/screen === 'beta-game'/)
  assert.match(main,/<Game code=\{code\} onBack=\{onBack\} preview request=\{apiRequest\}/)
  assert.match(main,/data.betaGames\?\.some/)
  assert.match(ui,/if\(!open\)return/);assert.match(ui,/revision:data.revision/)
  assert.match(ui,/Hämta aktuella val/)
  const profiles=readFileSync(new URL('../api/profiles.js',import.meta.url),'utf8')
  assert.match(profiles,/await removeGameBeta\(profileId\)/)
})
