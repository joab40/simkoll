import test from 'node:test'
import assert from 'node:assert/strict'
process.env.SUPABASE_URL='https://training-summary.invalid'
process.env.SUPABASE_SECRET_KEY='fixture'
process.env.SIMKOLL_SWIMMER_CODE='swimmer-fixture'
const {default:handler}=await import('../api/training.js')
const id='11111111-1111-4111-8111-111111111111',programId='22222222-2222-4222-8222-222222222222'
const storagePath=`${id}/${programId}.png`
test('home summary retains goals and program cards without fetching exercise content or signed images',async()=>{
  let storageCalls=0,summary=true
  globalThis.fetch=async(raw)=>{
    const url=new URL(raw);assert.equal(url.hostname,'training-summary.invalid')
    if(url.pathname.startsWith('/storage/')){storageCalls++;return new Response(JSON.stringify([{path:storagePath,signedURL:'/storage/v1/signed'}]))}
    const table=url.pathname.split('/').at(-1);let data=[]
    if(table==='profile_sessions')data=[{profile_id:id}]
    if(table==='profiles')data=[{id,training_group:'junior'}]
    if(table==='program_assignments')data=[{id:'assignment',profile_id:id,program_id:programId}]
    if(table==='training_programs'){
      if(summary){assert(!url.searchParams.get('select').includes('*'));assert(!url.searchParams.get('select').includes('exercise_images'))}
      const program={id:programId,program_type:'strength',title:'Mitt gympass',description:'Två gånger i veckan',active:true}
      data=[summary?program:{...program,content:'Bänkpress 3x8',exercise_images:[{storagePath}]}]
    }
    return new Response(JSON.stringify(data))
  }
  const call=async(query)=>{
    const response={setHeader(){},status(code){this.code=code;return this},json(data){this.data=data;return this}}
    await handler({method:'GET',headers:{'x-simkoll-code':'swimmer-fixture',cookie:'simkoll_session=fixture'},query},response)
    assert.equal(response.code,200);return response.data
  }
  const home=await call({summary:'true'})
  assert.equal(home.assignments[0].program.title,'Mitt gympass')
  assert.equal(home.assignments[0].program.description,'Två gånger i veckan')
  assert.deepEqual(home.assignments[0].program.exerciseImages,[])
  assert.equal(storageCalls,0)
  summary=false
  const full=await call({})
  assert.equal(full.assignments[0].program.content,'Bänkpress 3x8')
  assert.equal(storageCalls,1)
  assert(full.assignments[0].program.exerciseImages[0].imageUrl)
})
