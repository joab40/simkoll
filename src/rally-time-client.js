import { validRallyReplay } from './rally-engine.js'

export async function submitRallyTime(request, code, replay, restore = false) {
  if (!validRallyReplay(replay)) throw new Error('Tidsinspelningen saknas eller är ogiltig.')
  const controller = new AbortController(), timer = setTimeout(()=>controller.abort(), 12000)
  try {
    return await request('/api/points',code,{method:'POST',signal:controller.signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({action:restore?'restore-rally-time':'submit-rally-time',replay})})
  } catch(error) {
    if (error.name === 'AbortError') throw new Error('Tiden kunde inte sparas inom tidsgränsen. Försök spara igen.')
    throw error
  } finally {clearTimeout(timer)}
}
