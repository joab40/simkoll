import React, { useCallback, useState } from 'react'
import { createRoot } from 'react-dom/client'
import BottleFlipGame from './bottle-flip-game.jsx'
import './styles.css'

function Demo() {
  const [calls, setCalls] = useState([]), [back, setBack] = useState(false)
  const scenario = new URLSearchParams(window.location.search).get('scenario'), preview = scenario !== 'save-error'
  const [fail, setFail] = useState(true)
  const request = useCallback(async (path, code, options) => {
    setCalls(previous => [...previous, options?.method || 'GET'])
    if (preview) throw new Error('Testläge får inte anropa API:t')
    if (options?.method && fail) throw new Error('Fiktivt nätfel')
    return { ownBest: options?.body ? JSON.parse(options.body).score : 15, leaderboard: [] }
  }, [preview, fail])
  return <main style={{ maxWidth: 1280, padding: 20, margin: '0 auto' }}><p>Fiktivt test · inga riktiga API-anrop eller databasändringar. Lokala anrop: {calls.join(', ') || '0'}.</p>{!preview && <button onClick={() => setFail(value => !value)}>Växla fiktivt nätfel: {fail ? 'på' : 'av'}</button>}{back ? <button onClick={() => setBack(false)}>Öppna spelet igen</button> : <BottleFlipGame code="fixture-only" preview={preview} request={request} onBack={() => setBack(true)} />}</main>
}
createRoot(document.getElementById('root')).render(new URLSearchParams(window.location.search).get('viewport') === 'mobile' ? <main style={{ padding: 10 }}><h1>Mobiltest · 390 px</h1><iframe title="Bottle Flip mobiltest" src="/bottle-flip-qa.html" style={{ width: 390, height: 1100, maxWidth: '100%', border: '1px solid #bed5d0' }} /></main> : <Demo />)
