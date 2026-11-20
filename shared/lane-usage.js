export const laneUsageId = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
export const defaultLaneUsage = () => ({ enabled:false,title:'Banfördelning klubbar',participants:[{id:'00000000-0000-4000-8000-000000000001',name:'Sundsvall'},{id:'00000000-0000-4000-8000-000000000002',name:'Njurunda'}],updated_at:null })
const text = (value,max,label) => { if(typeof value!=='string'||!value.trim()||value.trim().length>max)throw new Error(`Ange ${label} (högst ${max} tecken).`);return value.trim() }
export function validateLaneSettings(input){
  if(typeof input.enabled!=='boolean')throw new Error('Välj om funktionen ska vara aktiv.')
  const title=text(input.title,80,'kortets namn')
  if(!Array.isArray(input.participants)||input.participants.length<1||input.participants.length>5)throw new Error('Ange 1–5 klubbar eller grupper.')
  const participants=input.participants.map(item=>{if(!item||!laneUsageId(item.id))throw new Error('Ogiltig gruppreferens. Hämta inställningarna igen.');return {id:item.id.toLowerCase(),name:text(item.name,60,'klubbens/gruppens namn')}})
  if(new Set(participants.map(item=>item.id)).size!==participants.length||new Set(participants.map(item=>item.name.toLocaleLowerCase('sv-SE'))).size!==participants.length)throw new Error('Varje klubb/grupp ska ha ett eget namn och id.')
  return {enabled:input.enabled,title,participants}
}
export const laneUsageDate = value => typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value
export function validateLaneMeasurement(input,settings,today){
  if(!settings.enabled)throw new Error('Banfördelningen är avstängd i inställningarna.')
  if(!laneUsageId(input.id))throw new Error('Ogiltig mätning. Öppna formuläret igen.')
  if(!laneUsageDate(input.date)||input.date<'2000-01-01'||input.date>today)throw new Error('Välj ett datum från år 2000 till och med idag.')
  if(typeof input.time!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(input.time))throw new Error('Ange klockslag för observationen.')
  if(typeof input.location!=='string'||input.location.trim().length>100)throw new Error('Platsen får vara högst 100 tecken.')
  if(!Array.isArray(input.entries)||!input.entries.length||input.entries.length>5)throw new Error('Välj minst en klubb/grupp, högst fem.')
  const entries=input.entries.map(item=>{
    const participant=settings.participants.find(p=>p.id===item?.participantId)
    if(!participant)throw new Error('En klubb/grupp har ändrats. Hämta inställningarna igen.')
    if(!Number.isInteger(item.lanes)||item.lanes<1||item.lanes>8)throw new Error('Välj 1–8 banor för varje vald klubb/grupp.')
    if(!Number.isInteger(item.swimmers)||item.swimmers<0||item.swimmers>500)throw new Error('Ange 0–500 simmare för varje vald klubb/grupp.')
    return {participantId:participant.id,name:participant.name,lanes:item.lanes,swimmers:item.swimmers}
  })
  if(new Set(entries.map(item=>item.participantId)).size!==entries.length)throw new Error('Samma klubb/grupp kan bara finnas en gång per mätning.')
  return {id:input.id.toLowerCase(),date:input.date,time:input.time,location:input.location.trim(),entries}
}
export function laneUsageStatistics(measurements){
  const groups=new Map(),days=new Map()
  for(const measurement of measurements)for(const item of measurement.entries){
    const key=item.participantId,dayKey=`${measurement.date}:${key}`
    for(const [map,id] of [[groups,key],[days,dayKey]]){
      const value=map.get(id)||{id:key,name:item.name,date:measurement.date,lanes:0,swimmers:0,observations:0}
      // Historical names are snapshots; a rename never merges different ids.
      if(measurement.date>=value.date){value.name=item.name;value.date=measurement.date}
      value.lanes+=item.lanes;value.swimmers+=item.swimmers;value.observations++;map.set(id,value)
    }
  }
  const ratio=value=>({...value,ratio:value.swimmers/value.lanes})
  return {groups:[...groups.values()].map(ratio),days:[...days.values()].map(ratio).sort((a,b)=>b.date.localeCompare(a.date)||a.name.localeCompare(b.name,'sv-SE'))}
}
