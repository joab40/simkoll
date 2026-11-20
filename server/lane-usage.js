import {randomUUID} from 'node:crypto'
import {coachFromRequest} from './coach-auth.js'
import {sendJson,supabaseRequest,supabaseStorageRequest,supabaseStorageUrl} from './supabase.js'
import {stockholmDate} from './profile-auth.js'
import {writeAuditLog} from './audit.js'
import {laneUsageDate,laneUsageId,validateLaneSettings,validateLaneMeasurement} from '../shared/lane-usage.js'

const BUCKET='lane-usage-evidence'
const fail=(message,status=400)=>Object.assign(new Error(message),{status})
const migration='Banfördelningen behöver databasuppdatering 133_lane_usage. Kör SQL-filen och hämta igen.'
const mapRecord=row=>({id:row.id,date:row.measurement_date,time:row.observed_time,location:row.location,entries:row.entries,hasPhoto:!!row.photo_path,createdAt:row.created_at})
export function decodeLanePhoto(value){
  if(typeof value!=='string'||value.length>2_666_750)throw fail('Fotot får vara högst 2 MB efter komprimering.')
  const match=value.match(/^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/)
  if(!match)throw fail('Fotot måste vara en JPEG-bild. Välj bilden igen.')
  const bytes=Buffer.from(match[1],'base64')
  if(bytes.length<4||bytes.length>2_000_000||bytes.toString('base64')!==match[1]||bytes.subarray(0,3).toString('hex')!=='ffd8ff'||bytes.subarray(-2).toString('hex')!=='ffd9')throw fail('Fotot har fel format eller är för stort.')
  return bytes
}
function dbFailure(detail,status){
  if(status===404||/PGRST202|PGRST205|does not exist/.test(detail))return fail(migration,503)
  if(/LANE_CONFLICT/.test(detail))return fail('Inställningarna har ändrats. Hämta dem igen och kontrollera dina val före sparande.',409)
  if(/LANE_DUPLICATE/.test(detail))return fail('Den här mätningen är redan sparad med andra uppgifter. Hämta historiken innan du gör en ny mätning.',409)
  if(/LANE_ACCESS/.test(detail))return fail('Behörigheten har ändrats. Logga in igen.',403)
  if(/LANE_DISABLED/.test(detail))return fail('Banfördelningen är avstängd i inställningarna.',409)
  if(/LANE_INVALID/.test(detail))return fail('Kontrollera datum, klockslag, klubbar och antal före sparande.')
  return fail('Banfördelningen kunde inte sparas eller hämtas. Försök igen.',503)
}
async function readSettings(db){
  const result=await db('lane_usage_settings?singleton=eq.true&select=enabled,title,participants,updated_at&limit=1')
  if(!result.ok)throw dbFailure(await result.text(),result.status)
  const [settings]=await result.json()
  if(!settings)throw fail(migration,503)
  return settings
}
async function findRecord(db,id){
  const result=await db(`lane_usage_measurements?id=eq.${id}&select=*&limit=1`)
  if(!result.ok)throw dbFailure(await result.text(),result.status)
  return (await result.json())[0]
}
export async function handleLaneUsage(request,response,deps={}){
  const db=deps.db||supabaseRequest,storage=deps.storage||supabaseStorageRequest,audit=deps.audit||writeAuditLog
  try{
    const actor=coachFromRequest(request)
    if(!actor||!laneUsageId(actor.sub))throw fail('Logga in med ett personligt tränarkonto.',403)
    const access=await db(`coach_accounts?id=eq.${actor.sub}&select=id,role,status&limit=1`)
    if(!access.ok)throw fail('Behörigheten kunde inte kontrolleras. Försök igen.',503)
    const [current]=await access.json()
    if(current?.status!=='active'||!['coach','head_coach','superadmin'].includes(current.role))throw fail('Ett aktivt tränarkonto krävs.',403)
    if(!['GET','POST'].includes(request.method))throw fail('Metoden stöds inte.',405)
    const action=request.body?.action,query=request.query||{}
    if(request.method==='POST'&&action==='save-lane-settings'){
      if(current.role!=='superadmin')throw fail('Endast superadmin kan ändra inställningarna.',403)
      const input=validateLaneSettings(request.body)
      if(typeof request.body.expectedUpdatedAt!=='string'||!Number.isFinite(Date.parse(request.body.expectedUpdatedAt)))throw fail('Hämta inställningarna innan du sparar.')
      const result=await db('rpc/save_lane_usage_settings',{method:'POST',body:JSON.stringify({p_actor:actor.sub,p_expected:request.body.expectedUpdatedAt,p_enabled:input.enabled,p_title:input.title,p_participants:input.participants})})
      if(!result.ok)throw dbFailure(await result.text(),result.status)
      const saved=await result.json()
      await audit(request,{eventType:'lane_usage_settings_saved',role:'coach',details:{coachAccountId:actor.sub,enabled:saved.enabled,participantCount:saved.participants.length}})
      return sendJson(response,200,{settings:saved})
    }
    const settings=await readSettings(db)
    if(request.method==='GET'&&query.laneUsage==='settings')return sendJson(response,200,{settings})
    // Existing history remains readable when new measurements are disabled.
    if(request.method==='GET'&&query.laneUsage==='photo'){
      if(!laneUsageId(query.id))throw fail('Ogiltig mätning.')
      const record=await findRecord(db,query.id)
      if(!record?.photo_path)throw fail('Mätningen har inget foto.',404)
      if(!new RegExp(`^[0-9a-f-]{36}/${record.id}/[0-9a-f-]{36}\\.jpg$`).test(record.photo_path))throw fail('Fotot kunde inte öppnas.',503)
      const signed=await storage(`object/sign/${BUCKET}/${record.photo_path}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({expiresIn:300})})
      if(!signed.ok)throw fail('Fotot kunde inte öppnas. Försök igen.',503)
      const payload=await signed.json(),url=payload.signedURL||payload.signedUrl
      if(!url)throw fail('Fotot kunde inte öppnas.',503)
      await audit(request,{eventType:'lane_usage_photo_viewed',role:'coach',details:{coachAccountId:actor.sub,measurementId:record.id}})
      return sendJson(response,200,{url:(deps.storageUrl||supabaseStorageUrl)(url)})
    }
    if(request.method==='GET'&&query.laneUsage==='measurements'){
      const {start,end}=query,today=(deps.today||stockholmDate)()
      if(!laneUsageDate(start)||!laneUsageDate(end)||start<'2000-01-01'||start>end||end>today||(Date.parse(end)-Date.parse(start))/86400000>365)throw fail('Välj en period på högst 366 dagar, till och med idag.')
      const rows=[]
      for(let offset=0;offset<=10000;offset+=500){
        const result=await db(`lane_usage_measurements?measurement_date=gte.${start}&measurement_date=lte.${end}&select=id,measurement_date,observed_time,location,entries,photo_path,created_at&order=measurement_date.desc,observed_time.desc,id.asc&limit=500&offset=${offset}`)
        if(!result.ok)throw dbFailure(await result.text(),result.status)
        const page=await result.json();rows.push(...page)
        if(rows.length>10000)throw fail('För många mätningar i perioden. Välj en kortare period.',422)
        if(page.length<500)break
      }
      return sendJson(response,200,{settings,measurements:rows.map(mapRecord)})
    }
    if(request.method!=='POST'||action!=='save-lane-measurement')throw fail('Välj en giltig åtgärd för banfördelningen.')
    const input=validateLaneMeasurement(request.body,settings,(deps.today||stockholmDate)())
    if(typeof request.body.expectedUpdatedAt!=='string'||request.body.expectedUpdatedAt!==settings.updated_at)throw fail('Inställningarna har ändrats. Hämta dem igen och kontrollera dina val.',409)
    const photo=request.body.photo==null?null:decodeLanePhoto(request.body.photo)
    if(photo&&request.body.photoConsent!==true)throw fail('Granska fotot och bekräfta att det ska sparas för tränarna.')
    const existing=await findRecord(db,input.id)
    const same=record=>record?.created_by===actor.sub&&record.measurement_date===input.date&&record.observed_time===input.time&&record.location===input.location&&JSON.stringify(record.entries)===JSON.stringify(input.entries)&&!!record.photo_path===!!photo
    // Compare fields, not object key order (jsonb reorders object properties).
    const sameRecord=record=>same(record&&{...record,entries:record.entries.map(({participantId,name,lanes,swimmers})=>({participantId,name,lanes,swimmers}))})
    if(existing){if(!sameRecord(existing))throw fail('Mätningen är redan sparad. Hämta historiken före en ny mätning.',409);return sendJson(response,200,{measurement:mapRecord(existing)})}
    let uploaded=null
    const cleanup=async()=>{if(uploaded)await storage(`object/${BUCKET}`,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({prefixes:[uploaded]})}).catch(()=>{})}
    if(photo){
      const bucket=await storage(`bucket/${BUCKET}`)
      if(!bucket.ok||(await bucket.json()).public!==false)throw fail('Privat fotolagring saknas. Kontrollera databasuppdatering 133.',503)
      uploaded=`${actor.sub}/${input.id}/${randomUUID()}.jpg`
      const upload=await storage(`object/${BUCKET}/${uploaded}`,{method:'POST',headers:{'Content-Type':'image/jpeg','x-upsert':'false'},body:photo})
      if(!upload.ok)throw fail('Fotot kunde inte sparas. Ingen ny mätning har sparats.',503)
    }
    let saved
    try{
      const result=await db('rpc/save_lane_usage_measurement',{method:'POST',body:JSON.stringify({p_actor:actor.sub,p_expected:settings.updated_at,p_id:input.id,p_date:input.date,p_time:input.time,p_location:input.location,p_entries:input.entries,p_photo_path:uploaded})})
      if(!result.ok){await cleanup();throw dbFailure(await result.text(),result.status)}
      saved=await result.json()
    }catch(error){
      if(error.status)throw error
      // A lost response can follow a committed insert. Never delete its photo
      // or manufacture a second observation; retry with the same client id.
      const recovered=await findRecord(db,input.id).catch(()=>null)
      if(sameRecord(recovered))saved=recovered
      else throw fail('Sparandet kunde inte bekräftas. Behåll formuläret och försök igen med samma mätning.',503)
    }
    if(uploaded&&saved.photo_path!==uploaded)await cleanup()
    await audit(request,{eventType:'lane_usage_measured',role:'coach',details:{coachAccountId:actor.sub,measurementId:saved.id,participantCount:input.entries.length,hasPhoto:!!saved.photo_path}})
    return sendJson(response,200,{measurement:mapRecord(saved)})
  }catch(error){const validation=['Ange','Välj','Varje','Samma','En klubb','Banfördelningen är avstängd','Ogiltig'].some(start=>error.message?.startsWith(start));return sendJson(response,error.status||(validation?400:503),{error:error.status||validation?error.message:'Banfördelningen kunde inte nås. Försök igen.'})}
}
