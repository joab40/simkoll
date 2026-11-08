import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {REWARD_LEVEL_TONES,rewardLevelTheme} from '../src/reward-level-theme.js'

test('level medal, not name or points, chooses bronze/silver/gold/diamond gradient',()=>{
  for(const [emoji,tone] of [['🥉','bronze'],['🥈','silver'],['🥇','gold'],['💎','diamond']]){
    const result=rewardLevelTheme(emoji)
    assert.equal(result.tone,tone)
    assert.equal(result.style['--level-start'],REWARD_LEVEL_TONES[tone].start)
    assert.equal(result.style['--level-end'],REWARD_LEVEL_TONES[tone].end)
    assert.notEqual(result.style['--level-start'],result.style['--level-end'])
  }
  assert.equal(new Set(['🥉','🥈','🥇','💎'].map(emoji=>rewardLevelTheme(emoji).style['--level-start'])).size,4)
})
test('common custom level symbols have matching soft tones; unknown/unsafe values get a controlled neutral fallback',()=>{
  for(const [emoji,tone] of [['🏆','gold'],['👑','gold'],['💚','green'],['🐬','diamond'],['🩷','rose'],['💜','purple'],[' 🥈️ ','silver']]) assert.equal(rewardLevelTheme(emoji).tone,tone)
  for(const emoji of [null,undefined,{},'','🦄','url(https://invalid.example)','red; background:url(x)']){
    const result=rewardLevelTheme(emoji)
    assert.equal(result.tone,'neutral')
    assert.deepEqual(Object.keys(result.style).sort(),['--level-border','--level-end','--level-glow','--level-start','--level-track'])
    assert.ok(Object.values(result.style).every(value=>/^#[0-9a-f]{6}$/.test(value)))
  }
})
const rgb=hex=>hex.slice(1).match(/../g).map(part=>parseInt(part,16)/255)
const luminance=values=>values.map(value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4).reduce((total,value,i)=>total+value*[.2126,.7152,.0722][i],0)
test('all text colours keep at least 4.5:1 contrast across each pastel gradient',()=>{
  for(const [tone,palette] of Object.entries(REWARD_LEVEL_TONES))for(const ink of ['#102d37','#3f565d','#235e64']){
    const colours=[palette.start,palette.end,palette.glow].map(rgb),foreground=luminance(rgb(ink))
    for(const a of colours)for(const b of colours)for(let i=0;i<=20;i++){
      const background=luminance(a.map((value,index)=>value*(1-i/20)+b[index]*(i/20)))
      assert.ok((background+.05)/(foreground+.05)>=4.5,`${tone}: ${ink}`)
    }
  }
})
test('real reward card uses theme in compact and hero variants and preserves progress, celebration and navigation',()=>{
  const component=readFileSync(new URL('../src/reward-level-card.jsx',import.meta.url),'utf8')
  const main=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8')
  const css=readFileSync(new URL('../src/styles.css',import.meta.url),'utf8')
  assert.match(component,/rewardLevelTheme\(points.current.emoji\)/)
  assert.match(component,/data-level-tone=\{theme.tone\} style=\{theme.style\}/)
  assert.match(component,/featured \? ' hero-level-card'/)
  assert.match(component,/onClick=\{onCommunity\}/)
  assert.match(component,/role="progressbar"/)
  assert.match(component,/\(\(points.total - points.current.minPoints\) \/ range\) \* 100/)
  assert.match(component,/Du har nått högsta nivån/)
  assert.match(main,/!featured && points.recentRewards\?\.length > 0 && <RewardCelebration/)
  assert.match(main,/<RewardLevelCard points=\{points\} onCommunity=\{onCommunity\} featured=\{featured\}/)
  assert.match(css,/background: radial-gradient\(circle at 85% 15%, var\(--level-glow\), transparent 60%\), linear-gradient\(135deg, var\(--level-start\), var\(--level-end\)\)/)
  assert.doesNotMatch(component,/fetch\(|localStorage|setInterval|useEffect/)
})
