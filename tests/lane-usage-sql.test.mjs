import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {readFile} from 'node:fs/promises'

test('SQL 133 gates settings and atomic measurements, preserves snapshots, deduplicates retries and protects photos',{skip:!process.env.SIMKOLL_PGLITE_MODULE},async()=>{
  const {PGlite}=await import(process.env.SIMKOLL_PGLITE_MODULE),db=new PGlite(),admin=randomUUID(),coach=randomUUID(),record=randomUUID()
  try{
    await db.exec(`create role anon;create role authenticated;create role service_role;create table coach_accounts(id uuid primary key,role text,status text);create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);insert into coach_accounts values('${admin}','superadmin','active'),('${coach}','coach','active');`)
    const sql=await readFile(new URL('../supabase/migrations/133_lane_usage.sql',import.meta.url),'utf8');await db.exec(sql);await db.exec(sql)
    const get=async()=>(await db.query('select to_jsonb(s) value from lane_usage_settings s')).rows[0].value
    let settings=await get();assert.equal(settings.enabled,false)
    const change=(actor=admin,expected=settings.updated_at,participants=settings.participants)=>db.query('select save_lane_usage_settings($1,$2,true,$3,$4) data',[actor,expected,'Test clubs',JSON.stringify(participants)])
    await assert.rejects(change(coach),/LANE_ACCESS/)
    await assert.rejects(change(admin,settings.updated_at,[]),/LANE_INVALID/)
    await assert.rejects(change(admin,settings.updated_at,[settings.participants[0],settings.participants[0]]),/LANE_INVALID/)
    const oldVersion=settings.updated_at;await change();settings=await get();await assert.rejects(change(admin,oldVersion),/LANE_CONFLICT/)
    const entries=settings.participants.map((p,i)=>({participantId:p.id,name:p.name,lanes:i+1,swimmers:12})),photo=coach+'/'+record+'/'+randomUUID()+'.jpg'
    const save=(entry=entries,actor=coach,id=record,version=settings.updated_at,path=photo)=>db.query("select save_lane_usage_measurement($1,$2,$3,current_date-1,'19:00','Pool',$4,$5) data",[actor,version,id,JSON.stringify(entry),path])
    await assert.rejects(save([{...entries[0],lanes:9}]),/LANE_INVALID/)
    await assert.rejects(save([{...entries[0],swimmers:1.5}]),/LANE_INVALID/)
    await assert.rejects(save([{...entries[0],name:'spoof'}]),/LANE_INVALID/)
    await assert.rejects(save(entries,coach,record,settings.updated_at,'other/path.jpg'),/LANE_INVALID/)
    assert.equal((await save()).rows[0].data.entries.length,2)
    assert.equal((await save()).rows[0].data.id,record)
    await assert.rejects(save([{...entries[0],swimmers:7}]),/LANE_DUPLICATE/)
    assert.equal((await db.query('select count(*)::int n from lane_usage_measurements')).rows[0].n,1)
    const renamed=settings.participants.map(p=>({...p,name:p.name+' new'}));await change(admin,settings.updated_at,renamed)
    assert.equal((await db.query('select entries from lane_usage_measurements')).rows[0].entries[0].name,entries[0].name)
    await assert.rejects(save(entries,coach,randomUUID(),settings.updated_at,null),/LANE_CONFLICT/)
    for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(db.query('select * from lane_usage_measurements'),/permission denied/);await assert.rejects(change(),/permission denied/);await db.exec('reset role')}
    assert.equal((await db.query('select public from storage.buckets')).rows[0].public,false)
    await db.query("update coach_accounts set status='suspended' where id=$1",[coach]);await assert.rejects(save(),/LANE_ACCESS/)
  }finally{await db.close()}
})
