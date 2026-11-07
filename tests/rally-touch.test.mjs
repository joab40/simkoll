import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { guardRallyTouches } from '../src/rally-touch.js'

const types = ['touchstart', 'touchmove', 'touchend', 'touchcancel', 'gesturestart', 'gesturechange', 'gestureend', 'dblclick', 'contextmenu', 'selectstart', 'dragstart']
function pad() {
  const listeners = new Map()
  return {
    listeners,
    addEventListener(type,handler,options) { assert.equal(listeners.has(type),false);listeners.set(type,{handler,options}) },
    removeEventListener(type,handler,options) {
      const entry=listeners.get(type)
      assert.equal(entry.handler,handler);assert.equal(entry.options,options);listeners.delete(type)
    },
  }
}
function touch(type,count,cancelable=true) {
  const event=new Event(type,{cancelable})
  Object.defineProperty(event,'touches',{value:Array.from({length:count})})
  return event
}
test('cancels Safari gestures in capture/non-passive listeners only on steering pad and gaps',()=>{
  const steering=pad(),toolbar=pad(),canvas=pad(),sidebar=pad()
  const root={querySelectorAll(selector){assert.equal(selector,'.rally-controls');return[steering]}}
  const cleanup=guardRallyTouches(root)
  assert.equal(steering.listeners.size,types.length)
  for(const type of types){
    const {handler,options}=steering.listeners.get(type)
    assert.equal(options.capture,true);assert.equal(options.passive,false)
    const event=new Event(type,{cancelable:true});handler(event)
    assert.equal(event.defaultPrevented,true);assert.equal(event.cancelBubble,false)
    const uncancelable=new Event(type);handler(uncancelable);assert.equal(uncancelable.defaultPrevented,false)
  }
  for(const type of ['pointerdown','pointerup','pointercancel','lostpointercapture','keydown','click'])assert.equal(steering.listeners.has(type),false)
  for(const area of [toolbar,canvas,sidebar])assert.equal(area.listeners.size,0)
  cleanup();assert.equal(steering.listeners.size,0)
})
test('lifting one thumb preserves the other; final lift and cancellations release held controls',()=>{
  const steering=pad();let released=0
  const cleanup=guardRallyTouches({querySelectorAll:()=>[steering]},()=>released++)
  steering.listeners.get('touchend').handler(touch('touchend',1));assert.equal(released,0)
  steering.listeners.get('touchmove').handler(touch('touchmove',2));assert.equal(released,0)
  steering.listeners.get('touchend').handler(touch('touchend',0));assert.equal(released,1)
  steering.listeners.get('touchcancel').handler(touch('touchcancel',1,false));assert.equal(released,2)
  cleanup()
})
test('guard mounts/cleans repeatedly and needs no document or global gesture listeners',()=>{
  guardRallyTouches(null)()
  const steering=pad(),root={querySelectorAll:()=>[steering]}
  guardRallyTouches(root)();guardRallyTouches(root)();assert.equal(steering.listeners.size,0)
})
test('live game uses scoped gesture guard, keeps pointer/keyboard handling and does not disable page zoom',()=>{
  const component=readFileSync(new URL('../src/rally-game.jsx',import.meta.url),'utf8')
  const css=readFileSync(new URL('../src/rally-game.css',import.meta.url),'utf8')
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8')
  assert.match(component,/useEffect\(\(\)=>guardRallyTouches\(area.current,release\),\[release\]\)/)
  for(const handler of ['onPointerUp={lift}','onPointerCancel={lift}','onLostPointerCapture={lift}'])assert.ok(component.includes(handler))
  assert.match(component,/onKeyDown=\{event=>keyboard\(event,true\)\}/)
  assert.ok(css.includes('.rally-controls,.rally-controls *{touch-action:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;'))
  assert.ok(css.includes('.rally-drive>*{pointer-events:none}'))
  assert.doesNotMatch(html,/user-scalable\s*=\s*(?:no|0)|maximum-scale\s*=\s*1(?:[\s,;"']|$)/i)
})
