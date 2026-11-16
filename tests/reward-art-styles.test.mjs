import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {REWARD_ART_STYLES} from '../shared/reward-art-styles.js'
process.env.SUPABASE_URL='https://reward-style-fixture.invalid'
process.env.SUPABASE_SECRET_KEY='fixture'
process.env.COACH_SESSION_SECRET='reward-style-fixture-secret'
process.env.OPENAI_API_KEY='fixture-only'
const {ART_STYLES,generateRewardArt,handleRewardArt}=await import('../server/reward-art.js')
const {createCoachToken}=await import('../server/coach-auth.js')
const styles=Object.keys(REWARD_ART_STYLES),newStyles=['abyss','glacier','sunset','neon','champion','origami']
test('all nine styles have consistent UI labels, deliberate palettes, server instructions and SQL allow-list',async()=>{
  assert.equal(styles.length,9);assert.deepEqual(styles,Object.keys(ART_STYLES))
  const sql=await readFile(new URL('../supabase/migrations/127_reward_art_styles.sql',import.meta.url),'utf8')
  const allowed=[...sql.matchAll(/'([a-z]+)'/g)].map(match=>match[1]);assert.deepEqual(allowed,styles)
  for(const [id,metadata] of Object.entries(REWARD_ART_STYLES)){
    assert(metadata.label.length>3);assert(metadata.description.length>25);assert.equal(metadata.colours.length,3)
    assert(metadata.colours.every(colour=>/^#[0-9a-f]{6}$/.test(colour)));assert(ART_STYLES[id].length>30)
  }
  assert.equal(new Set(Object.values(REWARD_ART_STYLES).map(row=>row.colours.join())).size,9)
  const component=await readFile(new URL('../src/reward-art-studio.jsx',import.meta.url),'utf8')
  assert.match(component,/import \{ REWARD_ART_STYLES \}/);assert.match(component,/Stilens färgpalett – inte en genererad bild/)
  assert.match(component,/canGenerate=\{accountRole === 'superadmin'\}/)
  assert.match(component,/if \(!canGenerate \|\| !confirmed/)
  assert.match(component,/\{canGenerate \? <details/)
  assert.match(component,/Max 50 bildförsök per superadmin under rullande 24 timmar/)
  const pkg=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'))
  const lock=JSON.parse(await readFile(new URL('../package-lock.json',import.meta.url),'utf8'))
  assert.match(pkg.version,/^\d+\.\d+\.\d+$/);assert.equal(pkg.version,lock.version);assert.equal(pkg.version,lock.packages[''].version)
})
test('six new styles produce distinct background/emblem composition prompts, retain privacy/output controls and log usage',async()=>{
  const prompts=new Set(),image=Buffer.from('RIFF0000WEBPfixture').toString('base64')
  for(const style of newStyles)for(const kind of ['background','emblem']){
    const calls=[],logs=[]
    await generateRewardArt({}, {emoji:'🔮',style,kind}, {fetch:async(url,options)=>{
      calls.push({url,body:JSON.parse(options.body)})
      return new Response(JSON.stringify({data:[{b64_json:image}],usage:{input_tokens:10,output_tokens:20}}),{status:200})
    },log:async(_request,entry)=>logs.push(entry)})
    assert.equal(calls.length,1);assert.equal(logs.length,1);assert.equal(logs[0].status,'success')
    const body=calls[0].body;assert(body.prompt.includes(ART_STYLES[style]));assert(!body.prompt.includes('undefined'))
    assert.equal(body.background,kind==='emblem'?'transparent':'opaque');assert.equal(body.output_format,'webp');assert.equal(body.n,1)
    assert.equal(body.size,kind==='emblem'?'1024x1024':'1536x1024');assert.match(body.prompt,/No words, numbers, letters, logos, people, brands/)
    assert.match(body.prompt,kind==='emblem'?/no scenery, pedestal, border or text/:/calm dark centre/)
    prompts.add(body.prompt)
  }
  assert.equal(prompts.size,12)
})
test('new styles pass existing quota/consent path without changing saved cards; unknown style never reserves or calls AI',async()=>{
  const id='11111111-1111-4111-8111-111111111111',assetId='22222222-2222-4222-8222-222222222222'
  const json=value=>new Response(JSON.stringify(value),{status:200})
  for(const style of [...newStyles,'constructor','arbitrary']){
    const calls=[],response={setHeader(){},status(code){this.code=code;return this},json(data){this.data=data;return this}}
    await handleRewardArt({method:'POST',headers:{'x-simkoll-code':createCoachToken({id,role:'superadmin'})},body:{action:'generate-level-art',levelId:8,kind:'background',style,confirmed:true}},response,{
      read:async(path,options={})=>{calls.push({path,options});return json(path.startsWith('reward_levels?')?[{id:8,emoji:'🪨'}]:{id:assetId,emoji:'🪨'})},
      storage:async()=>json({public:true}),availability:async()=>({allowed:true}),generate:async(_request,selection)=>{calls.push({selection});return{bytes:Buffer.from('fixture'),mime:'image/webp',extension:'webp'}},
    })
    assert.equal(response.code,newStyles.includes(style)?200:400)
    if(newStyles.includes(style)){
      assert.equal(JSON.parse(calls.find(row=>row.path==='rpc/reserve_reward_art').options.body).p_style,style)
      assert.equal(calls.find(row=>row.selection).selection.style,style)
      assert(!calls.some(row=>row.path?.startsWith('reward_levels?')&&row.options.method))
    }else assert(!calls.some(row=>row.selection||row.path==='rpc/reserve_reward_art'))
  }
})
