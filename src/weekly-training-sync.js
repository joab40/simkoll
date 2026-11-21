export function applyWeeklySession(sessions=[],{date,slot,completed,profileId}){
  const matches=item=>item.date===date&&item.slot===slot
  if(!completed)return sessions.filter(item=>!matches(item))
  if(sessions.some(matches))return sessions
  // A confirmed registration is known, its quantities are not. Never guess
  // amounts from another workout while the canonical summary is reloaded.
  return [...sessions,{date,slot,type:slot.includes('swim')?'swim':slot,profileId,source:'manual'}]
}
export function pendingWeeklySessions(sessions,edits){
  return [...edits.values()].reduce((rows,edit)=>applyWeeklySession(rows,edit),sessions||[])
}

export function createWeeklyTrainingSync({request,code,profileId,onChange}){
  let active=true,revision=0,readSequence=0,appliedRead=0,queue=Promise.resolve(),generation=0
  const refresh=async()=>{
    const version=revision,scope=generation,id=++readSequence
    const data=await request('/api/training?summary=true',code)
    if(active&&scope===generation&&version===revision&&id>appliedRead){appliedRead=id;onChange(data)}
    return data
  }
  const saveSession=(date,slot,completed)=>{
    const scope=generation
    revision++ // Invalidate reads started before this write was requested.
    const work=async()=>{
      if(!active||scope!==generation)throw new Error('Profilen har ändrats. Öppna din aktuella profil igen.')
      const result=await request('/api/training',code,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'toggle-session',date,slot,completed,skipCheer:true}),retry:false})
      if(!active||scope!==generation)return result
      revision++ // Also discard background reads made while POST was pending.
      onChange(current=>({...current,sessions:applyWeeklySession(current?.sessions,{date,slot,completed,profileId})}))
      try{await refresh();return result}
      catch{return {...result,message:`${completed?'Passet är sparat':'Avmarkeringen är sparad'}, men mängderna kunde inte uppdateras. Ladda om sidan för aktuella meter och minuter.`}}
    }
    // Other slots may be tapped while saving. Keep writes/readbacks ordered,
    // and let a failed request release the queue for subsequent registrations.
    const saved=queue.then(work,work);queue=saved.catch(()=>{});return saved
  }
  return {refresh,saveSession,activate(){active=true},dispose(){active=false;generation++;revision++}}
}

export function weeklyTrainingVolume(sessions){
  const swim=sessions.filter(item=>item.type==='swim')
  const amount=(key,basis)=>{
    const known=swim.filter(item=>typeof item[key]==='number'&&Number.isFinite(item[key])&&item[key]>=0)
    return {value:known.length?known.reduce((sum,item)=>sum+item[key],0):null,missing:swim.length-known.length,estimated:known.some(item=>!item.personalSession&&item[basis]!=='reported')}
  }
  return {meters:amount('distanceMeters','distanceBasis'),minutes:amount('durationMinutes','durationBasis')}
}
