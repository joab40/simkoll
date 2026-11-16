import test from 'node:test'
import assert from 'node:assert/strict'
import { rewardProgress, rewardDistribution } from '../shared/reward-levels.js'
import { coachRewardOverview, rewardTotals, rewardLevels } from '../server/reward-points.js'
const id = '11111111-1111-4111-8111-111111111111'
const levels = [0,50,150,300,500,600,700,800,1000].map((minPoints, index) => ({id:index+1,name:`Nivå ${index+1}`,emoji:'💎',minPoints}))
const json = (data, status = 200) => new Response(JSON.stringify(data), {status})
test('878 points consistently selects the 800 level and 122 remaining; boundaries and top are exact', () => {
  const value = rewardProgress(878, [...levels].reverse())
  assert.equal(value.current.id,8); assert.equal(value.next.remaining,122)
  assert.equal(rewardProgress(800,levels).current.id,8)
  assert.equal(rewardProgress(799,levels).current.id,7)
  assert.equal(rewardProgress(1000,levels).next,null)
  assert.equal(rewardProgress(0,[]).current,null)
  const counts = rewardDistribution([{total:878},{total:150},{total:0}],levels)
  assert.equal(counts.get(8),1); assert.equal([...counts.values()].reduce((a,b)=>a+b,0),3)
  const duplicateNames = levels.map(level=>({...level,name:'Samma namn'}))
  assert.equal(rewardDistribution([{total:878}],duplicateNames).get(8),1)
})
test('coach totals use SQL SUM, not a capped global event list, and are identical to an own-profile request', async () => {
  const calls = []
  const read = async (path, options = {}) => {
    calls.push(path)
    if(path.startsWith('profiles?')) return json([{id}])
    if(path.startsWith('reward_levels?')) return json(levels.map(level=>({...level,min_points:level.minPoints})))
    assert.equal(path,'rpc/reward_point_totals')
    assert.equal(options.method,'POST'); assert.deepEqual(JSON.parse(options.body),{p_profile_ids:[id]})
    return json({[id]:878})
  }
  const coach = await coachRewardOverview(read), own = await rewardTotals([id],read)
  assert.equal(coach.profiles[0].total,own[id]); assert.equal(coach.profiles[0].level.id,8)
  assert.equal(coach.profiles[0].next.remaining,122)
  assert(!calls.some(path=>path.startsWith('point_events?')))
  assert(calls.some(path=>path.includes('approval_status=eq.approved&is_test_profile=eq.false')))
})
test('missing aggregate or truncated profile history fails closed, never silently reports low/zero scores', async () => {
  await assert.rejects(rewardTotals([id],async()=>json({},404)),/SQL 124/)
  await assert.rejects(rewardTotals([id],async()=>json({[id]:'oops'})),/Invalid/)
  await assert.rejects(rewardTotals([id],async()=>json(null)),/Invalid/)
  assert.deepEqual(await rewardTotals([],()=>assert.fail('no call')), {})
  assert.equal((await rewardTotals([id],async()=>json({})))[id],0)
  await assert.rejects(coachRewardOverview(async path => path.startsWith('profiles?') ? json(Array.from({length:500},()=>({id}))) : json([])),/incomplete/)
})
test('next unlock receives its own activated emblem through level loading and threshold selection, not a draft or current image',async()=>{
  const currentId='22222222-2222-4222-8222-222222222222',nextId='33333333-3333-4333-8333-333333333333'
  const calls=[]
  const loaded=await rewardLevels(async path=>{
    calls.push(path)
    if(path.startsWith('reward_levels?'))return json([
      {id:8,name:'Nuvarande',emoji:'🪨',min_points:800,emblem_art_id:currentId},
      {id:9,name:'Nästa',emoji:'🔮',min_points:1000,emblem_art_id:nextId},
    ])
    assert(path.includes('status=eq.ready'))
    assert(path.includes(currentId)&&path.includes(nextId))
    return json([
      {id:currentId,level_id:8,kind:'emblem',source_emoji:'🪨',storage_path:`8/${currentId}.webp`},
      {id:nextId,level_id:9,kind:'emblem',source_emoji:'🔮',storage_path:`9/${nextId}.webp`},
    ])
  })
  const points=rewardProgress(879,loaded)
  assert(points.next.artwork.emblemUrl.endsWith(`9/${nextId}.webp`))
  assert.notEqual(points.next.artwork.emblemUrl,points.current.artwork.emblemUrl)
  assert.equal(points.next.remaining,121);assert.equal(points.total,879)
  assert.equal(rewardProgress(1000,loaded).next,null);assert.equal(calls.length,2)
})
