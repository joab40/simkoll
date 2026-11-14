import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import WinterHeroDecor, { WinterTrainingBuddy } from './winter-theme.jsx'
import './styles.css'

function WinterPreview() {
  const [enabled, setEnabled] = useState(true), [motion, setMotion] = useState(true), [theme, setTheme] = useState('snow'), [notice, setNotice] = useState('')
  const winter = enabled && theme === 'snow'
  return <><header style={{ maxWidth: 1060, margin: '20px auto 0', padding: '0 16px' }}><p>Fiktiv förhandsvisning · inga riktiga svar eller databasändringar.</p><div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', fontSize: 12 }}><label><input type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)} /> Säsongsteman</label><label><input type="checkbox" checked={motion} onChange={event => setMotion(event.target.checked)} /> Visuella effekter</label><label>Tema <select value={theme} onChange={event => setTheme(event.target.value)}><option value="snow">Vinter · Snö</option><option value="halloween">Halloween</option><option value="christmas">Jul</option><option value="none">Standard</option></select></label></div></header>
    <main className={`page-content home${enabled && theme !== 'none' ? ` theme-${theme}` : ''}`}>
      <section className="mood-hero">
        {winter && <WinterHeroDecor animate={motion} />}
        {enabled && theme === 'halloween' && <div className="halloween-decor" aria-hidden="true"><span className="halloween-web">🕸️</span><span className="halloween-spider">🕷️</span><span className="halloween-pumpkin pumpkin-left">🎃</span></div>}
        <p className="eyebrow light">Idag i gruppen</p><h1>Så här känns det</h1>
        <div className="emoji-cloud" aria-label="8 fiktiva svar idag">{['🙂', '😌', '🤩', '🙂', '😕', '🙂', '😌', '🤩'].map((emoji, index) => <span key={index}>{emoji}</span>)}</div>
        <div className="response-count"><span><strong>8</strong> svar idag</span><span className="active-count"><strong>12</strong> profiler inne idag</span></div>
      </section>
      <section className="start-card"><div><p className="eyebrow">Din stund</p><h2>Hur känns det idag?</h2><p>Ta en stund och känn efter.</p></div><div className="start-card-actions"><button type="button" className="primary-button" onClick={() => setNotice('Incheckningsknappen fungerar. Det här är bara en förhandsvisning, inget sparas.')}>Checka in →</button></div></section>
      {notice && <p role="status" style={{ padding: 12 }}>{notice}</p>}
      <section className="weekly-training-card">{winter && <WinterTrainingBuddy />}<div className="weekly-summary"><div><p className="eyebrow">Min träning den här veckan</p><h3>2 av 4 simpass · 50 %</h3><div className="session-dots"><i className="done" /><i className="done" /><i /><i /></div><small>2 simpass kvar enligt din överenskommelse</small></div><button type="button" onClick={() => setNotice('Målknappen fungerar. Inga riktiga mål läses eller ändras i förhandsvisningen.')}>Mina mål →</button></div></section>
    </main></>
}

createRoot(document.getElementById('root')).render(new URLSearchParams(window.location.search).get('viewport') === 'mobile'
  ? <main style={{ padding: 16 }}><h1>Vintertema · mobilförhandsvisning</h1><iframe title="Vintertema i 390 px, fiktivt demo" src="/winter-qa.html" style={{ width: 390, maxWidth: '100%', height: 1050, border: '1px solid #c6dfe9', borderRadius: 20 }} /></main>
  : <WinterPreview />)
