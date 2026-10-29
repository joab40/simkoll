import test from 'node:test'
import assert from 'node:assert/strict'
import { statSync } from 'node:fs'
import { chatBackgroundUrl } from '../src/chat-background.js'

test('existing saved themes use smaller files while custom and already optimized URLs remain valid',()=>{
  for(const theme of ['open-chat-bg','open-chat-bg-teal','open-chat-bg-navy']){
    const legacy=`/assets/${theme}.png`,optimized=chatBackgroundUrl(legacy)
    assert.equal(optimized,`/assets/${theme}.jpg`)
    assert(statSync(new URL(`../public${optimized}`,import.meta.url)).size < statSync(new URL(`../public${legacy}`,import.meta.url)).size * .2)
    assert.equal(chatBackgroundUrl(optimized),optimized)
  }
  for(const custom of ['https://example.invalid/my-image.png','data:image/png;base64,abc',undefined])assert.equal(chatBackgroundUrl(custom),custom)
})
