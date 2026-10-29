import test from 'node:test'
import assert from 'node:assert/strict'
import { HURDLES, HURDLE_BASE, createHurdles, advanceHurdles, hurdleInput, hurdleScore, validHurdleScore } from '../src/hurdles-engine.js'

function run({ jump = true, rhythm = 100 } = {}) {
  const race = createHurdles(0)
  for (let now=3000;now<=63000 && ['countdown','running'].includes(race.status);now+=5) {
    advanceHurdles(race,now)
    if ((now-3000)%rhythm===0) hurdleInput(race,'run',now)
    const next=HURDLES[race.results.length]
    if(jump && race.jumpAt===null && next-race.distance <= race.speed*.25) hurdleInput(race,'jump',now)
  }
  return race
}

test('a well timed race clears ten hurdles, finishes and produces a valid time',()=>{
  const race=run()
  assert.equal(race.status,'finished')
  assert.equal(race.distance,100)
  assert.equal(race.cleared,10)
  assert.equal(race.hits,0)
  assert(validHurdleScore(hurdleScore(race.elapsed)))
})
test('missing hurdles slows the runner but still allows finishing',()=>{
  const clean=run(),hits=run({jump:false})
  assert.equal(hits.status,'finished')
  assert.equal(hits.hits,10)
  assert(hits.elapsed > clean.elapsed)
  const result=hits.elapsed
  hurdleInput(hits,'run',100000)
  assert.equal(hits.elapsed,result)
})
test('countdown rejects false starts; a held button cannot auto accelerate or jump twice',()=>{
  const early=createHurdles(0)
  assert.equal(hurdleInput(early,'jump',2500),false)
  assert.equal(early.status,'false-start')
  const race=createHurdles(0)
  assert(hurdleInput(race,'run',3000))
  assert.equal(hurdleInput(race,'run',3001),false)
  assert(hurdleInput(race,'jump',3005))
  assert.equal(hurdleInput(race,'jump',3010),false)
  const idle=createHurdles(0);advanceHurdles(idle,63000)
  assert.equal(idle.status,'timeout')
})
test('same input timing gives the same result at different rendering frame rates',()=>{
  const play=(frame)=>{
    const race=createHurdles(0)
    const events=Array.from({length:450},(_,i)=>({at:3000+i*100,action:'run'})).concat(Array.from({length:20},(_,i)=>({at:4400+i*950,action:'jump'}))).sort((a,b)=>a.at-b.at)
    let index=0
    for(let now=3000;now<63000 && ['countdown','running'].includes(race.status);now+=frame){
      while(events[index]?.at<=now){const event=events[index++];hurdleInput(race,event.action,event.at)}
      advanceHurdles(race,now)
    }
    return race
  }
  const fast=play(16),slow=play(47)
  assert.equal(fast.status,'finished');assert.equal(slow.status,'finished')
  assert.equal(fast.hits,slow.hits)
  assert(Math.abs(fast.elapsed-slow.elapsed)<5)
})
test('invalid and impossible times never produce a record',()=>{
  for(const ms of [NaN,Infinity,9999,60001])assert.equal(hurdleScore(ms),null)
  for(const score of [0,100000,90001,39999,80000.5])assert.equal(validHurdleScore(score),false)
  assert.equal(hurdleScore(12345),HURDLE_BASE-12345)
})
