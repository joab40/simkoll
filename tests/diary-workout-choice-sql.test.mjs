import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {readFile} from 'node:fs/promises'

test('SQL 132 links an existing attendance atomically without rewriting answers or adding sessions',{skip:!process.env.SIMKOLL_PGLITE_MODULE},async()=>{
  const {PGlite}=await import(process.env.SIMKOLL_PGLITE_MODULE),db=new PGlite()
  const owner=randomUUID(),other=randomUUID(),ref='workout:'+randomUUID(),second='workout:'+randomUUID()
  const call=async(profile=owner,reference=ref,slot='afternoon_swim')=>(await db.query('select save_diary_workout_choice($1::uuid,current_date-1,$2,$3) as data',[profile,slot,reference])).rows[0].data
  try{
    await db.exec(`create role anon;create role authenticated;create role service_role;
      create table profiles(id uuid primary key,active boolean default true,approval_status text default 'approved');
      create table personal_training_sessions(id uuid primary key default gen_random_uuid(),profile_id uuid references profiles(id),session_date date not null,session_slot text not null,activity_type text not null,source text not null,completed_at timestamptz default now());
      create unique index personal_training_session_slot_idx on personal_training_sessions(profile_id,session_date,session_slot) where session_slot<>'legacy';
      create table session_attendance(profile_id uuid,attendance_date date,session_slot text,present boolean);
      create table responses(profile_id uuid,activity_date date,session_slot text,day_type text,competition boolean,activity_type text,workout_reference text,rpe integer,feeling integer);
      insert into profiles(id)values('${owner}'),('${other}');
      insert into session_attendance values('${owner}',current_date-1,'afternoon_swim',true);
      insert into responses values('${owner}',current_date-1,'afternoon_swim','before',false,'swim',null,null,3);`)
    const sql=await readFile(new URL('../supabase/migrations/132_diary_workout_choice.sql',import.meta.url),'utf8')
    await db.exec(sql);await db.exec(sql)
    await assert.rejects(call(other),/not found/)
    await assert.rejects(call(owner,ref,'morning_swim'),/not found/)
    const saved=await call();assert.equal(saved.workout_reference,ref);assert(saved.workout_choice_at)
    assert.equal((await call()).id,saved.id)
    assert.equal((await db.query('select count(*)::int n from personal_training_sessions')).rows[0].n,1)
    assert.deepEqual((await db.query('select day_type,rpe,feeling from responses')).rows,[{day_type:'before',rpe:null,feeling:3}])
    await assert.rejects(call(owner,second),/already selected/)
    await db.query("insert into responses values($1,current_date-1,'afternoon_swim','after',false,'swim',$2,7,4)",[owner,second])
    await assert.rejects(call(),/after-check-in/)
    assert.equal((await db.query('select workout_reference from personal_training_sessions')).rows[0].workout_reference,ref)
    await db.query("insert into personal_training_sessions(profile_id,session_date,session_slot,activity_type,source,completed_at)values($1,current_date-1,'morning_swim','swim','checkin','2026-01-01T08:00:00Z')",[other])
    const corrected=await call(other,ref,'morning_swim');assert.equal(corrected.source,'checkin');assert.match(corrected.completed_at,/2026-01-01/)
    for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(call(),/permission denied/);await db.exec('reset role')}
    await db.query('update profiles set active=false where id=$1',[other]);await assert.rejects(call(other),/denied/)
  }finally{await db.close()}
})
