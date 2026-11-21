import React from 'react'
import {createRoot} from 'react-dom/client'
import SnowRiderGame from './snow-rider-game.jsx'
import './styles.css'
const width=Number(new URLSearchParams(location.search).get('width'))
createRoot(document.getElementById('qa-root')).render([390,320].includes(width)?<iframe title="Snow Rider i mobilbredd" src="/snow-rider-qa.html" style={{width,height:'100vh',border:0,display:'block'}}/>:<><p style={{padding:'8px 24px',fontSize:12,color:'#67818a'}}>Lokal förhandsvisning · inga serveranrop eller sparade resultat</p><SnowRiderGame code="fixture" preview onBack={()=>{}} request={async()=>{throw new Error('Preview must never call API')}}/></>)
