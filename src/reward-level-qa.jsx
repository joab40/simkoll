import React, {useState} from 'react'
import {createRoot} from 'react-dom/client'
import RewardLevelCard from './reward-level-card.jsx'
import RewardArtStudio from './reward-art-studio.jsx'
import {rewardProgress,rewardDistribution} from '../shared/reward-levels.js'
import './styles.css'

const initial=[['Brons','🥉',0],['Silver','🥈',50],['Guld','🥇',150],['Platina','🏅',300],['Diamant','💎',500],['The Winston Red Diamant','♦️',600],['Argyle Phoenix Diamant','🐦‍🔥',700],['The Enigma Black Diamant','🪨',800],['Purple Crystal Diamant','🔮',1000]].map(([name,emoji,minPoints],index)=>({id:index+1,name,emoji,minPoints,artwork:{}}))
const picture=kind=>`data:image/svg+xml,${encodeURIComponent(kind==='background'?'<svg xmlns="http://www.w3.org/2000/svg" width="1536" height="1024"><defs><radialGradient id="g"><stop stop-color="#8151cd"/><stop offset="1" stop-color="#051f32"/></radialGradient></defs><rect width="1536" height="1024" fill="url(#g)"/><path d="M-100 700Q500-200 1600 150M-50 850Q700 100 1650 450" fill="none" stroke="#47e3cb" stroke-width="30" opacity=".4"/><circle cx="300" cy="180" r="4" fill="white"/><circle cx="1200" cy="300" r="5" fill="white"/></svg>':'<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="#d0edff"/><stop offset=".4" stop-color="#365b85"/><stop offset="1" stop-color="#142b47"/></linearGradient></defs><path d="M256 50 420 170 370 380 140 400 70 210Z" fill="url(#g)" stroke="#88dcfa" stroke-width="4"/><path d="M256 50 230 230 420 170M230 230 370 380M230 230 140 400M70 210 230 230" fill="none" stroke="#9ecbe6" stroke-width="3"/></svg>')}`
function Demo(){
  const [levels,setLevels]=useState(initial),[selected,setSelected]=useState(8),[notice,setNotice]=useState(''),[pending,setPending]=useState(null)
  const profileTotal=878,selectedLevel=levels.find(row=>row.id===selected)
  const points=selected===8?rewardProgress(profileTotal,levels):{total:selectedLevel.minPoints+25,current:selectedLevel,next:levels.find(row=>row.minPoints>selectedLevel.minPoints)||null}
  const counts=rewardDistribution([{total:878},{total:155},{total:80}],levels)
  const request=async(_url,_code,{body})=>{
    const data=JSON.parse(body)
    if(data.action==='generate-level-art'){
      const level=levels.find(row=>row.id===data.levelId),asset={id:'demo-art',levelId:level.id,kind:data.kind,url:picture(data.kind),emoji:level.emoji}
      setPending(asset);return{asset}
    }
    setLevels(current=>current.map(row=>row.id===data.levelId?{...row,artwork:{...row.artwork,[`${data.kind}Url`]:data.assetId?pending.url:null}}:row))
    setNotice('Fiktiv bild aktiverad i demots minne. Inga AI-anrop, kostnader eller databasändringar.');return{ok:true}
  }
  return <main style={{maxWidth:1100,margin:'24px auto',padding:20}}><h1>Nivåkort & nivåverkstad</h1><p>Fiktiv demo · 878 poäng ger svart diamant och 122 kvar till nästa nivå. AI-förslag i detta demo är enkla SVG-testbilder, inte AI-genererade bilder.</p><label>Visa nivå <select value={selected} onChange={event=>setSelected(Number(event.target.value))}>{levels.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label><div className="swimmer-hero-slide" style={{maxWidth:650,margin:'24px auto'}}><RewardLevelCard key={selected} points={points} featured onCommunity={()=>setNotice('Peppknappen fungerar i demot.')} /></div><div className="coach-card"><h3>Fördelning just nu · tre fiktiva profiler</h3><div className="level-distribution level-distribution-grid">{levels.map(level=><div key={level.id}><span>{level.emoji}</span><strong>{counts.get(level.id)}</strong><small>{level.name}</small></div>)}</div></div>{notice&&<p role="status">{notice}</p>}<RewardArtStudio levels={levels} code="demo" request={request} onSaved={async()=>{}} /></main>
}
if(new URLSearchParams(location.search).get('viewport')==='mobile')createRoot(document.getElementById('root')).render(<iframe title="Nivåkort i mobilbredd" src="/reward-level-qa.html" style={{width:390,height:'100vh',border:0,display:'block'}}/>);else createRoot(document.getElementById('root')).render(<Demo/> )
