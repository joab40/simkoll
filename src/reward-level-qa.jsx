import React, {useRef,useState} from 'react'
import {createRoot} from 'react-dom/client'
import RewardLevelCard from './reward-level-card.jsx'
import RewardArtStudio from './reward-art-studio.jsx'
import {rewardProgress,rewardDistribution} from '../shared/reward-levels.js'
import {rewardSelectionArtwork} from '../shared/reward-card-library.js'
import './styles.css'

const initial=[['Brons','🥉',0],['Silver','🥈',50],['Guld','🥇',150],['Platina','🏅',300],['Diamant','💎',500],['The Winston Red Diamant','♦️',600],['Argyle Phoenix Diamant','🐦‍🔥',700],['The Enigma Black Diamant','🪨',800],['Purple Crystal Diamant','🔮',1000]].map(([name,emoji,minPoints],index)=>({id:index+1,name,emoji,minPoints}))
const picture=(kind,variant=0)=>'data:image/svg+xml,'+encodeURIComponent((kind==='background'?'<svg xmlns="http://www.w3.org/2000/svg" width="1536" height="1024"><defs><radialGradient id="g"><stop stop-color="#8151cd"/><stop offset="1" stop-color="#051f32"/></radialGradient></defs><rect width="1536" height="1024" fill="url(#g)"/><path d="M-100 700Q500-200 1600 150M-50 850Q700 100 1650 450" fill="none" stroke="#47e3cb" stroke-width="30" opacity=".4"/><circle cx="300" cy="180" r="4" fill="white"/><circle cx="1200" cy="300" r="5" fill="white"/></svg>':'<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="#d0edff"/><stop offset=".4" stop-color="#365b85"/><stop offset="1" stop-color="#142b47"/></linearGradient></defs><path d="M256 50 420 170 370 380 140 400 70 210Z" fill="url(#g)" stroke="#88dcfa" stroke-width="4"/><path d="M256 50 230 230 420 170M230 230 370 380M230 230 140 400M70 210 230 230" fill="none" stroke="#9ecbe6" stroke-width="3"/></svg>').replaceAll('#8151cd',variant?'#1d7973':'#8151cd').replaceAll('#365b85',variant?'#ae7d37':'#365b85'))
const fixtureId = number => '00000000-0000-4000-8000-'+number.toString(16).padStart(12,'0')
function makeLibrary(level){
  const assets=[0,1,2,3].map((slot)=>({id:fixtureId((slot<2?1:level.id)*10+slot),kind:slot<2?'background':'emblem',style:slot%2?'aurora':'cosmic',emoji:slot<2?'🥉':level.emoji,createdAt:'2026-11-'+(14+slot%2)+'T12:00:00Z',url:picture(slot<2?'background':'emblem',slot%2),compatible:true}))
  return {level:{id:level.id,name:level.name,emoji:level.emoji},assets,cards:[{id:fixtureId(level.id*100),name:'Kosmisk favorit',emoji:level.emoji,createdAt:'2026-11-15T12:00:00Z',backgroundId:assets[0].id,emblemId:assets[3].id,compatible:true}],active:{backgroundId:assets[1].id,emblemId:assets[2].id}}
}
function Demo(){
  const store=useRef(Object.fromEntries(initial.map(level=>[level.id,makeLibrary(level)])))
  const currentLevels=()=>initial.map(level=>({...level,artwork:rewardSelectionArtwork(store.current[level.id].assets,store.current[level.id].active)}))
  const [levels,setLevels]=useState(currentLevels),[selected,setSelected]=useState(8),[notice,setNotice]=useState(''),[open,setOpen]=useState(true),[generations,setGenerations]=useState(0)
  const selectedLevel=levels.find(row=>row.id===selected),points=selected===8?rewardProgress(878,levels):{total:selectedLevel.minPoints+25,current:selectedLevel,next:levels.find(row=>row.minPoints>selectedLevel.minPoints)||null}
  const counts=rewardDistribution([{total:878},{total:155},{total:80}],levels)
  const request=async(url,_code,options={})=>{
    if(!options.method){const levelId=Number(new URL(url,'http://fixture.invalid').searchParams.get('levelId'));return structuredClone(store.current[levelId])}
    const data=JSON.parse(options.body),library=store.current[data.levelId]
    if(data.action==='generate-level-art'){
      const asset={id:crypto.randomUUID(),kind:data.kind,style:data.style,url:picture(data.kind,1),emoji:library.level.emoji,createdAt:'2026-11-16T12:00:00Z',compatible:true}
      if(data.kind==='background')Object.values(store.current).forEach(row=>row.assets.unshift(asset));else library.assets.unshift(asset)
      setGenerations(current=>current+1);return{asset}
    }
    if(data.action==='save-level-card'){
      if(!library.cards.some(card=>card.id===data.cardId))library.cards.unshift({id:data.cardId,name:data.name,backgroundId:data.backgroundId,emblemId:data.emblemId,emoji:library.level.emoji,createdAt:'2026-11-16T12:00:00Z',compatible:true})
      return{saved:true,message:'Fiktiv kombination sparad i demots minne. Ingenting har aktiverats.'}
    }
    if(data.action==='publish-level-card'){
      library.active={backgroundId:data.backgroundId,emblemId:data.emblemId}
      setLevels(currentLevels());setNotice('Fiktiv kombination aktiverad. Inga riktiga data ändrade.');return{activated:true,message:'Fiktiv kombination aktiverad för nivån.'}
    }
    throw Error('Okänd demoåtgärd')
  }
  const studioOnly=new URLSearchParams(location.search).get('view')==='studio'
  return <main style={{maxWidth:1100,margin:'24px auto',padding:20}}><h1>Nivåbibliotek · fiktiv demo</h1><p>SVG-testbilder, inte AI-genererade. Inga API-anrop, kostnader eller databasändringar. Simulerade genereringar: <strong>{generations}</strong>.</p>{!studioOnly&&<><label>Visa nivå <select value={selected} onChange={event=>setSelected(Number(event.target.value))}>{levels.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label><div className="swimmer-hero-slide" style={{maxWidth:650,margin:'24px auto'}}><RewardLevelCard points={points} featured onCommunity={()=>setNotice('Peppknappen fungerar i demot.')} /></div><div className="coach-card"><h3>Fördelning just nu · tre fiktiva profiler</h3><div className="level-distribution level-distribution-grid">{levels.map(level=><div key={level.id}><span>{level.emoji}</span><strong>{counts.get(level.id)}</strong><small>{level.name}</small></div>)}</div></div></>}{notice&&<p role="status">{notice}</p>}<button type="button" onClick={()=>setOpen(current=>!current)}>{open?'Stäng verkstaden (demo)':'Öppna verkstaden (demo)'}</button>{open&&<RewardArtStudio levels={levels} code="demo" request={request} onSaved={async()=>{}} accountRole={new URLSearchParams(location.search).get('role') === 'head_coach' ? 'head_coach' : 'superadmin'} />}</main>
}
function NextUnlockDemo(){
  const [mode,setMode]=useState('active')
  const purple='data:image/svg+xml,'+encodeURIComponent(decodeURIComponent(picture('emblem').split(',')[1]).replaceAll('#365b85','#a23dcc').replaceAll('#d0edff','#f2d8ff').replaceAll('#142b47','#39244f'))
  const emblemUrl=mode==='missing'?null:mode==='broken'?'data:image/webp;base64,ZmFrZQ==':mode==='updated'?picture('emblem',1):purple
  const current={...initial[7],artwork:{emblemUrl:picture('emblem'),backgroundUrl:picture('background')}}
  const next={...initial[8],artwork:{emblemUrl}}
  const points=mode==='top'?{total:1000,current:next,next:null}:{total:879,current,next}
  return <main style={{maxWidth:700,margin:'24px auto',padding:20}}><h1>Nästa upplåsning · fiktiv demo</h1><p>SVG-testbilder. Inga AI-anrop, riktiga filer eller databasändringar.</p><div style={{display:'flex',flexWrap:'wrap',gap:8,marginBottom:20}}>{[['active','Aktiverat emblem'],['missing','Ingen bild'],['broken','Trasig bild'],['updated','Nytt aktiverat emblem'],['top','Högsta nivån']].map(([id,label])=><button key={id} type="button" aria-pressed={mode===id} onClick={()=>setMode(id)}>{label}</button>)}</div><div className="swimmer-hero-slide"><RewardLevelCard points={points} featured onCommunity={()=>{}}/></div></main>
}
function TapDemo(){
  const [used,setUsed]=useState(0),[total,setTotal]=useState(878),[fail,setFail]=useState(false),[calls,setCalls]=useState(0)
  const attempts=useRef(new Set()),usedRef=useRef(0),totalRef=useRef(878)
  const date=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Stockholm'}).format(new Date())
  const levels=initial.map(level=>({...level,artwork:{emblemUrl:picture('emblem'),backgroundUrl:picture('background')}}))
  const onTap=async requestId=>{
    setCalls(value=>value+1)
    await new Promise(resolve=>setTimeout(resolve,250))
    const replayed=attempts.current.has(requestId),awarded=!replayed&&usedRef.current<5?1:0
    if(awarded){attempts.current.add(requestId);usedRef.current++;totalRef.current++}
    if(fail){setFail(false);throw Error('Simulerat tappat svar efter sparad poäng')}
    setUsed(usedRef.current);setTotal(totalRef.current)
    return {...rewardProgress(totalRef.current,levels),emblemBonus:{available:true,date,used:usedRef.current,limit:5,awarded,replayed}}
  }
  return <main style={{maxWidth:680,margin:'24px auto',padding:20}}><h1>Klappbonus · fiktiv demo</h1><p>Inga API-anrop eller riktiga poäng. Simulerade anrop: <b>{calls}</b>.</p><label><input type="checkbox" checked={fail} onChange={event=>setFail(event.target.checked)}/> Tappa nästa svar efter sparad poäng (testa säkert återförsök)</label><div className="swimmer-hero-slide" style={{marginTop:24}}><RewardLevelCard points={{...rewardProgress(total,levels),emblemBonus:{available:true,date,used,limit:5}}} featured onEmblemTap={onTap} onCommunity={()=>{}}/></div></main>
}
const qaParams=new URLSearchParams(location.search),nextUnlock=qaParams.get('view')==='next-unlock',tapDemo=qaParams.get('view')==='tap'
if(qaParams.get('viewport')==='mobile')createRoot(document.getElementById('root')).render(<iframe title="Nivåbibliotek i mobilbredd" src={tapDemo?'/reward-level-qa.html?view=tap':nextUnlock?'/reward-level-qa.html?view=next-unlock':'/reward-level-qa.html?view=studio'} style={{width:390,height:'100vh',border:0,display:'block'}}/>);else createRoot(document.getElementById('root')).render(tapDemo?<TapDemo/>:nextUnlock?<NextUnlockDemo/>:<Demo/>)
