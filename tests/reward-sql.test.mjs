import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
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
  }finally{await db.close()}
})
