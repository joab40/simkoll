import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { REWARD_ART_STYLES } from '../shared/reward-art-styles.js'
test('Postgres reward totals ignore REST caps and art reservations enforce role, quota and preview boundaries', {skip:!process.env.SIMKOLL_PGLITE_MODULE}, async t=>{
  const {PGlite}=await import(process.env.SIMKOLL_PGLITE_MODULE), db=new PGlite()
  const profile='11111111-1111-4111-8111-111111111111', admin='22222222-2222-4222-8222-222222222222', coach='33333333-3333-4333-8333-333333333333', other='44444444-4444-4444-8444-444444444444'
  try{
    await db.exec(`create role anon;create role authenticated;create role service_role;
      create table public.coach_accounts(id uuid primary key,role text,status text,session_version integer);
      create table public.reward_levels(id bigint primary key,emoji text);
      create table public.point_events(profile_id uuid,points integer);
      create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      insert into public.coach_accounts values('${admin}','superadmin','active',2),('${coach}','coach','active',0);
      insert into public.reward_levels values(8,'🪨'),(9,'🔮');
      insert into public.point_events select '${profile}'::uuid,1 from generate_series(1,12500);
      insert into public.point_events select '${other}'::uuid,3 from generate_series(1,1500);
      grant select on public.point_events to service_role;`)
    await db.exec(await readFile(new URL('../supabase/migrations/124_reward_totals_and_art.sql',import.meta.url),'utf8'))
    await t.test('SUM uses every event, filters requested IDs, no destructive rewrite',async()=>{
      await db.exec('set role service_role')
      const totals=await db.query('select public.reward_point_totals($1::uuid[]) as totals',[[profile,other]])
      assert.deepEqual(totals.rows[0].totals,{[profile]:12500,[other]:4500})
      assert.deepEqual((await db.query('select public.reward_point_totals($1::uuid[]) as totals',[[profile]])).rows[0].totals,{[profile]:12500})
      await db.exec('reset role')
      assert.equal(Number((await db.query('select count(*) as n from public.point_events')).rows[0].n),14000)
    })
    await t.test('client roles cannot read art drafts, totals or call reservation',async()=>{
      for(const role of ['anon','authenticated']){
        await db.exec(`set role ${role}`)
        await assert.rejects(db.query('select * from public.reward_level_art'),/permission denied/)
        await assert.rejects(db.query('select public.reward_point_totals($1::uuid[])',[[profile]]),/permission denied/)
        await assert.rejects(db.query('select public.reserve_reward_art($1,2,8,\'emblem\',\'cosmic\')',[admin]),/permission denied/)
        await db.exec('reset role')
      }
    })
    await t.test('reservation checks live role/version, blocks parallel requests and never publishes a draft',async()=>{
      await assert.rejects(db.query('select public.reserve_reward_art($1,0,8,\'emblem\',\'cosmic\')',[coach]),/Privileged/)
      await assert.rejects(db.query('select public.reserve_reward_art($1,1,8,\'emblem\',\'cosmic\')',[admin]),/Privileged/)
      const row=(await db.query('select public.reserve_reward_art($1,2,8,\'emblem\',\'cosmic\') as draft',[admin])).rows[0].draft
      assert.equal(row.emoji,'🪨');assert.match(row.id,/^[a-f0-9-]{36}$/)
      await assert.rejects(db.query('select public.reserve_reward_art($1,2,8,\'background\',\'pool\')',[admin]),/already running/)
      assert.equal((await db.query('select emblem_art_id from public.reward_levels where id=8')).rows[0].emblem_art_id,null)
      await db.exec(`update public.reward_level_art set status='failed';insert into public.reward_level_art(level_id,coach_id,kind,style,source_emoji,status)
        select 8,'${admin}'::uuid,'emblem','cosmic','🪨','failed' from generate_series(1,11);`)
      await assert.rejects(db.query('select public.reserve_reward_art($1,2,9,\'emblem\',\'cosmic\')',[admin]),/Daily image limit/)
    })
    await t.test('SQL 127 allows all nine styles for both kinds, retains quota/auth and rejects unknown styles',async()=>{
      await db.exec(await readFile(new URL('../supabase/migrations/127_reward_art_styles.sql',import.meta.url),'utf8'))
      // Age only local fixtures so the quota test above remains independent.
      for(const style of Object.keys(REWARD_ART_STYLES))for(const kind of ['background','emblem']){
        await db.exec("update public.reward_level_art set status='failed',created_at=now()-interval '2 days'")
        const row=(await db.query('select public.reserve_reward_art($1,2,8,$2,$3) as draft',[admin,kind,style])).rows[0].draft
        assert.equal(row.emoji,'🪨')
        const saved=(await db.query('select style,kind from public.reward_level_art where id=$1',[row.id])).rows[0]
        assert.deepEqual(saved,{style,kind})
      }
      await db.exec("update public.reward_level_art set status='failed',created_at=now()-interval '2 days'")
      await assert.rejects(db.query("select public.reserve_reward_art($1,2,8,'background','arbitrary')",[admin]),/style_check/)
      await assert.rejects(db.query("select public.reserve_reward_art($1,0,8,'background','abyss')",[coach]),/Privileged/)
      assert.equal((await db.query('select background_art_id,emblem_art_id from public.reward_levels where id=8')).rows[0].background_art_id,null)
      assert.equal(Number((await db.query('select count(*) as n from public.point_events')).rows[0].n),14000)
    })
    await t.test('SQL 128 restricts generation to live superadmin, allows exactly 50 rolling attempts and retains concurrency/history',async()=>{
      const sql=await readFile(new URL('../supabase/migrations/128_reward_art_superadmin_quota.sql',import.meta.url),'utf8')
      const before=Number((await db.query('select count(*) as n from public.reward_level_art')).rows[0].n)
      await db.exec(sql);await db.exec(sql)
      assert.equal(Number((await db.query('select count(*) as n from public.reward_level_art')).rows[0].n),before)
      await db.exec(`update public.coach_accounts set role='head_coach' where id='${coach}';
        insert into public.coach_accounts values('${other}','superadmin','active',0);`)
      for(const actor of [coach])await assert.rejects(db.query("select public.reserve_reward_art($1,0,8,'emblem','cosmic')",[actor]),/superadmin/)
      await assert.rejects(db.query("select public.reserve_reward_art($1,1,8,'emblem','cosmic')",[admin]),/superadmin/)
      await db.exec(`update public.coach_accounts set status='disabled' where id='${admin}'`)
      await assert.rejects(db.query("select public.reserve_reward_art($1,2,8,'emblem','cosmic')",[admin]),/superadmin/)
      await db.exec(`update public.coach_accounts set status='active' where id='${admin}';
        insert into public.reward_level_art(level_id,coach_id,kind,style,source_emoji,status,created_at)
        select 8,'${admin}'::uuid,'emblem','cosmic','🪨',case when n%2=0 then 'failed' else 'ready' end,now()-interval '1 hour' from generate_series(1,49) as n;
        insert into public.reward_level_art(level_id,coach_id,kind,style,source_emoji,status)
        values(9,'${other}','background','pool','🔮','failed');`)
      await db.exec('set role service_role')
      const fiftieth=(await db.query("select public.reserve_reward_art($1,2,8,'emblem','cosmic') as draft",[admin])).rows[0].draft
      await db.exec('reset role')
      assert(fiftieth.id)
      const count=async actor=>Number((await db.query("select count(*) as n from public.reward_level_art where coach_id=$1 and created_at>now()-interval '24 hours'",[actor])).rows[0].n)
      assert.equal(await count(admin),50)
      await assert.rejects(db.query("select public.reserve_reward_art($1,2,9,'background','pool')",[admin]),/Daily image limit/)
      assert.equal(await count(admin),50)
      await assert.rejects(db.query("select public.reserve_reward_art($1,0,8,'background','pool')",[other]),/already running/)
      await db.query("select public.reserve_reward_art($1,0,9,'background','pool')",[other])
      assert.equal(await count(other),2)
      // A failed provider/upload still consumes an attempt. Only aging beyond
      // the rolling window frees a slot; no attempt records are removed.
      await db.query("update public.reward_level_art set status='failed' where id=$1",[fiftieth.id])
      await assert.rejects(db.query("select public.reserve_reward_art($1,2,8,'emblem','cosmic')",[admin]),/Daily image limit/)
      await db.query("update public.reward_level_art set created_at=now()-interval '25 hours' where id=(select id from public.reward_level_art where coach_id=$1 and created_at>now()-interval '24 hours' and id<>$2 order by created_at,id limit 1)",[admin,fiftieth.id])
      assert.equal(await count(admin),49)
      await db.query("select public.reserve_reward_art($1,2,8,'emblem','cosmic')",[admin])
      assert.equal(await count(admin),50)
      for(const role of ['anon','authenticated']){
        await db.exec(`set role ${role}`);await assert.rejects(db.query("select public.reserve_reward_art($1,2,8,'emblem','cosmic')",[admin]),/permission denied/);await db.exec('reset role')
      }
      const level=(await db.query('select background_art_id,emblem_art_id from public.reward_levels where id=8')).rows[0]
      assert.deepEqual(level,{background_art_id:null,emblem_art_id:null})
      assert.equal(Number((await db.query('select count(*) as n from public.point_events')).rows[0].n),14000)
    })
  }finally{await db.close()}
})
