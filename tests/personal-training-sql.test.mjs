import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { normalizePersonalDetails, personalSlot } from '../shared/personal-training.js'
import { planningAddDays } from '../shared/weekly-planning.js'
import { toDatabase } from '../api/responses.js'

test('SQL 131 keeps personal planning, check-in and completion atomic, owned and idempotent',{skip:!process.env.SIMKOLL_PGLITE_MODULE},async t=>{
  const {PGlite}=await import(process.env.SIMKOLL_PGLITE_MODULE),db=new PGlite()
  const owner=randomUUID(),other=randomUUID(),id=randomUUID(),second=randomUUID(),details=normalizePersonalDetails({activityType:'swim',origin:'niu',distanceMeters:3000,durationMinutes:60,focus:'f2_spec',timeOfDay:'morning'})
  const today=(await db.query("select (now() at time zone 'Europe/Stockholm')::date::text as day")).rows[0].day
  const body=(uuid,phase='after',patch={})=>toDatabase({type:phase,feeling:4,rpe:phase==='after'?6:null,personalSessionId:uuid,activityType:'swim',trainingOrigin:'niu',activityFocus:'f2_spec',activityDistanceMeters:3000,activityMinutes:60,registerTraining:phase==='after',...patch},owner,today)
  const call=async(action,uuid=id,options={})=>(await db.query('select public.personal_training_action($1,$2::uuid,$3::uuid,$4::date,$5::jsonb,$6::jsonb) as data',[action,options.owner||owner,uuid,options.date||today,options.details||details,options.response||null])).rows[0].data
  try{
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
      create table profiles(id uuid primary key,active boolean default true,approval_status text default 'approved');
      create table planned_training_sessions(id uuid primary key default gen_random_uuid(),profile_id uuid references profiles(id),week_start date not null,planned_date date not null,session_slot text not null check(session_slot in('morning_swim','afternoon_swim','strength','dryland')),created_at timestamptz default now(),unique(profile_id,planned_date,session_slot));
      create table personal_training_sessions(id uuid primary key default gen_random_uuid(),profile_id uuid references profiles(id),session_date date not null,session_slot text not null,activity_type text not null,source text not null,completed_at timestamptz not null default now(),created_at timestamptz default now());
      create unique index personal_training_session_slot_idx on personal_training_sessions(profile_id,session_date,session_slot) where session_slot<>'legacy';
      create table responses(id uuid primary key default gen_random_uuid(),created_at timestamptz not null default now(),profile_id uuid references profiles(id),activity_date date,late_entry boolean not null default false,late_entry_key text unique,day_type text,feeling integer not null check(feeling between 1 and 5),energy integer,body integer,motivation integer,sleep integer,rpe integer,speed_feeling integer,temperature integer,pass_rating integer,setup_rating integer,comment text,race_concern text,competition boolean not null default false,activity_type text,activity_minutes numeric,activity_distance_meters numeric,planned_completion text,session_slot text check(session_slot in('morning_swim','afternoon_swim')),training_registered boolean,workout_reference text);
      insert into profiles(id)values('${owner}'),('${other}');`)
    await db.exec(await readFile(new URL('../supabase/migrations/131_personal_training_sessions.sql',import.meta.url),'utf8'))
    await t.test('save and edit a plan preserve ID and do not create completed sessions or responses',async()=>{
      assert.equal((await call('save')).plan.id,id)
      assert.equal((await call('save',id,{details:{...details,distanceMeters:4000}})).plan.personal_details.distanceMeters,4000)
      assert.equal((await db.query('select count(*)::integer n from personal_training_sessions')).rows[0].n,0)
      assert.equal((await db.query('select count(*)::integer n from responses')).rows[0].n,0)
    })
    await t.test('before and after share the planned identity; actual amounts never rewrite planned amounts',async()=>{
      await call('report',id,{response:body(id,'before')})
      assert.equal((await db.query('select count(*)::integer n from personal_training_sessions')).rows[0].n,0)
      const saved=await call('report',id,{response:body(id)})
      assert.equal(saved.created,true);assert.equal(saved.response.personal_session_id,id)
      assert.equal((await call('report',id,{response:body(id)})).created,false)
      assert.equal((await db.query('select count(*)::integer n from personal_training_sessions')).rows[0].n,1)
      assert.equal((await db.query('select personal_details from planned_training_sessions where id=$1',[id])).rows[0].personal_details.distanceMeters,4000)
      assert.equal((await db.query('select personal_details from personal_training_sessions')).rows[0].personal_details.distanceMeters,3000)
      await assert.rejects(call('report',id,{response:body(id,'after',{rpe:9})}),/already saved/)
      await assert.rejects(call('save'),/locked/)
      await assert.rejects(call('delete'),/cannot be deleted/)
    })
    await t.test('a second same-morning pass is distinct and unplanned reporting cannot earn planning credit',async()=>{
      await call('report',second,{response:body(second)})
      assert.equal((await db.query('select count(*)::integer n from personal_training_sessions')).rows[0].n,2)
      assert.equal((await db.query('select personal_details from planned_training_sessions where id=$1',[second])).rows[0].personal_details.wasPlanned,false)
      assert((await db.query('select session_slot from personal_training_sessions')).rows.every(row=>row.session_slot.startsWith('extra_')))
    })
    await t.test('foreign ownership, unapproved profiles, identity mismatch, invalid data and client roles fail closed',async()=>{
      for(const action of ['save','delete','report'])await assert.rejects(call(action,id,{owner:other,response:body(id)}),/not found/)
      await assert.rejects(call('save',randomUUID(),{details:{...details,origin:'club'}}),/Invalid/)
      await assert.rejects(call('save',randomUUID(),{details:{...details,durationMinutes:0}}),/Invalid/)
      await assert.rejects(call('report',randomUUID(),{details:{...details,activityType:'strength'},response:body(id)}),/Invalid/)
      await db.query('update profiles set active=false where id=$1',[other]);await assert.rejects(call('save',randomUUID(),{owner:other}),/denied/)
      for(const role of ['anon','authenticated']){
        await db.exec(`set role ${role}`);await assert.rejects(call('save',randomUUID()),/permission denied/)
        await assert.rejects(db.query('select * from planned_training_sessions'),/permission denied/);await db.exec('reset role')
      }
    })
    await t.test('failed check-in rolls back even a newly created plan; unused plans can be deleted',async()=>{
      const bad=randomUUID();await assert.rejects(call('report',bad,{response:body(bad,'after',{feeling:10})}),/check constraint/)
      assert.equal((await db.query('select count(*)::integer n from planned_training_sessions where id=$1',[bad])).rows[0].n,0)
      const future=randomUUID();await call('save',future);await call('delete',future)
      assert.equal((await db.query('select count(*)::integer n from planned_training_sessions where id=$1',[future])).rows[0].n,0)
      await db.exec('set role service_role');assert.equal((await call('report',second,{response:body(second)})).created,false);await db.exec('reset role')
    })
    await t.test('other sports persist without swim meters; migration can be safely repeated',async()=>{
      const running=randomUUID(),run=normalizePersonalDetails({activityType:'other',origin:'self',sport:'running',durationMinutes:30,timeOfDay:'afternoon'})
      await call('save',running,{details:run})
      const saved=await call('report',running,{details:run,response:body(running,'after',{activityType:'other',trainingOrigin:'self',activityFocus:null,activitySport:'running',activityDistanceMeters:null,activityMinutes:30})})
      assert.equal(saved.response.activity_type,'other');assert.equal(saved.response.activity_sport,'running');assert.equal(saved.response.activity_distance_meters,null)
      await db.exec(await readFile(new URL('../supabase/migrations/131_personal_training_sessions.sql',import.meta.url),'utf8'))
      assert.equal((await call('report',id,{response:body(id)})).created,false)
    })
    await t.test('SQL 151 supports dated past completions without reopening older plans',async()=>{
      const migration=await readFile(new URL('../supabase/migrations/151_historical_personal_checkins.sql',import.meta.url),'utf8')
      await db.exec(migration)
      const historical=randomUUID(),date=planningAddDays(today,-5)
      const response={...body(historical),activity_date:date,late_entry:true}
      await assert.rejects(call('save',historical,{date}),/date out of range/)
      await assert.rejects(call('report',historical,{date,response:{...response,day_type:'before'}}),/date out of range/)
      await assert.rejects(call('report',historical,{date,response:{...response,late_entry:false}}),/date out of range/)
      const saved=await call('report',historical,{date,response})
      assert.equal(saved.created,true)
      assert.equal(saved.response.activity_date,date)
      assert.equal(saved.response.late_entry,true)
      assert.equal((await call('report',historical,{date,response})).created,false)
    })
  }finally{await db.close()}
})
