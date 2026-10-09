import test from 'node:test'
import assert from 'node:assert/strict'
import {createJump,advanceJump,pressJump,releaseJump,validJumpScore,jumpMetres} from '../src/long-jump-engine.js'

function launch(angle,x=19.9,speed=9) {
  const jump={...createJump(0),status:'charge',x,speed,angle,chargeAt:-angle/.09,heldAt:-1000}
  releaseJump(jump,0)
  return advanceJump(jump,3000)
}
test('45° produces the longest jump at identical takeoff position and speed',()=>{
  const ideal=launch(45),low=launch(30),high=launch(60)
  assert.equal(ideal.status,'landed')
  assert.ok(ideal.result>low.result && ideal.result>high.result)
  assert.equal(ideal.result,800)
  assert.equal(jumpMetres(ideal.result),'8,00 m')
})
test('early takeoff loses distance, and crossing the board invalidates the attempt',()=>{
  assert.ok(launch(45,18).result<launch(45,19.9).result)
  const jump={...createJump(0),x:19.95,speed:9}
  advanceJump(jump,20)
  assert.equal(jump.status,'foul')
  releaseJump(jump,500)
  assert.equal(jump.result,0)
})
test('rapid taps build speed while holding near the board charges the angle',()=>{
  const jump=createJump(0)
  for(let now=0;now<1800;now+=120){pressJump(jump,now);releaseJump(jump,now+20)}
  assert.ok(jump.speed>7)
  assert.ok(jump.x>=12 && jump.x<18)
  pressJump(jump,1800)
  advanceJump(jump,1980)
  assert.equal(jump.status,'charge')
  advanceJump(jump,2480)
  assert.equal(jump.angle,45)
  releaseJump(jump,2480)
  assert.equal(jump.status,'flight')
  advanceJump(jump,5000)
  assert.equal(jump.status,'landed')
  assert.ok(validJumpScore(jump.result))
})
test('automatic key repeats / second fingers do not accelerate a held button',()=>{
  const jump=createJump(0)
  pressJump(jump,0)
  assert.equal(pressJump(jump,10),false)
  assert.ok(jump.speed<=1.55)
})
test('holding outside the takeoff zone does not trigger a jump',()=>{
  const jump=createJump(0)
  pressJump(jump,0);releaseJump(jump,700)
  assert.equal(jump.status,'run')
  assert.equal(jump.angle,0)
})
test('flight distance is independent of render frequency and cannot change after landing',()=>{
  const simulate=step=>{const jump={...createJump(0),status:'charge',x:19.9,speed:9,angle:45,chargeAt:-500,heldAt:-1000};releaseJump(jump,0);for(let t=0;t<3000;t+=step)advanceJump(jump,t);return jump}
  assert.equal(simulate(1000/120).result,simulate(100).result)
  const jump=simulate(16),result=jump.result;pressJump(jump,9000);advanceJump(jump,10000)
  assert.equal(jump.result,result)
})
test('zero-length, impossible and fractional scores are rejected',()=>{
  for(const score of [0,-1,1001,7.5,NaN])assert.equal(validJumpScore(score),false)
  assert.equal(validJumpScore(850),true)
  const jump=createJump(0);advanceJump(jump,30000)
  assert.equal(jump.status,'foul')
})
