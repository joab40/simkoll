import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'

test('Postgres: saved combinations are persistent, idempotent and activation is atomic and conflict-safe', {skip:!process.env.SIMKOLL_PGLITE_MODULE},async t=>{
  const {PGlite}=await import(process.env.SIMKOLL_PGLITE_MODULE),db=new PGlite()
  const admin='11111111-1111-4111-8111-111111111111',ordinary='55555555-5555-4555-8555-555555555555'
  const bg='22222222-2222-4222-8222-222222222222',emblem='33333333-3333-4333-8333-333333333333',card='44444444-4444-4444-8444-444444444444',wrong='66666666-6666-4666-8666-666666666666'
  const configure=(options={})=>{
    const row={actor:admin,version:2,level:8,action:'save',emoji:'🪨',bg,emblem,name:'Kosmisk sten',id:card,expectedBg:null,expectedEmblem:null,...options}
    return db.query('select public.configure_reward_level_card($1::uuid,$2::integer,$3::bigint,$4::text,$5::text,$6::uuid,$7::uuid,$8::text,$9::uuid,$10::uuid,$11::uuid) as result',[row.actor,row.version,row.level,row.action,row.emoji,row.bg,row.emblem,row.name,row.id,row.expectedBg,row.expectedEmblem])
  }
  const current=async()=> (await db.query('select background_art_id,emblem_art_id from public.reward_levels where id=8')).rows[0]
  try{
    await db.exec(`create role anon;create role authenticated;create role service_role;
      create table public.coach_accounts(id uuid primary key,role text,status text,session_version integer);
      create table public.reward_levels(id bigint primary key,emoji text);
      create table public.point_events(profile_id uuid,points integer);
      create table public.audit_logs(id uuid default gen_random_uuid(),event_type text,role text,status text,details jsonb);
      create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      insert into public.coach_accounts values('${admin}','superadmin','active',2),('${ordinary}','coach','active',0);
      insert into public.reward_levels values(8,'🪨'),(9,'🔮');`)
    for(const file of ['124_reward_totals_and_art.sql','125_reward_card_library.sql'])await db.exec(await readFile(new URL(`../supabase/migrations/${file}`,import.meta.url),'utf8'))
    await db.exec(`insert into public.reward_level_art(id,level_id,kind,style,source_emoji,status,storage_path) values
      ('${bg}',8,'background','cosmic','🪨','ready','8/${bg}.webp'),
      ('${emblem}',8,'emblem','aurora','🪨','ready','8/${emblem}.webp'),
      ('${wrong}',9,'background','pool','🔮','ready','9/${wrong}.webp');`)
    await t.test('anonymous/client roles cannot read or write presets or execute configuration',async()=>{
      for(const role of ['anon','authenticated']){
        await db.exec(`set role ${role}`)
        await assert.rejects(db.query('select * from public.reward_level_cards'),/permission denied/)
        await assert.rejects(configure(),/permission denied/)
        await db.exec('reset role')
      }
    })
    await t.test('save persists both choices, creates one audit, never activates; retries are idempotent',async()=>{
      await db.exec('set role service_role')
      assert.equal((await configure()).rows[0].result.created,true)
      assert.equal((await configure()).rows[0].result.created,false)
      await db.exec('reset role')
      assert.deepEqual(await current(),{background_art_id:null,emblem_art_id:null})
      const rows=(await db.query('select * from public.reward_level_cards')).rows
      assert.equal(rows.length,1);assert.equal(rows[0].name,'Kosmisk sten');assert.equal(rows[0].background_art_id,bg);assert.equal(rows[0].emblem_art_id,emblem)
      assert.equal((await db.query('select * from public.audit_logs')).rows.length,1)
      await assert.rejects(configure({name:'Annat namn'}),/Request ID already used/)
    })
    await t.test('live auth, invalid type/level/status/path/emoji and empty name are rejected without changing the active pair',async()=>{
      for(const options of [{actor:ordinary,version:0},{version:1}])await assert.rejects(configure(options),/Privileged/)
      for(const options of [{bg:wrong},{bg:emblem},{emoji:'🥉'},{name:' '},{name:'x'.repeat(61)},{action:null}])await assert.rejects(configure(options))
      await db.exec(`update public.reward_level_art set status='pending' where id='${bg}'`)
      await assert.rejects(configure(),/not compatible/)
      await db.exec(`update public.reward_level_art set status='ready', storage_path='https://untrusted.invalid/x' where id='${bg}'`)
      await assert.rejects(configure(),/not compatible/)
      await db.exec(`update public.reward_level_art set storage_path='8/${bg}.webp' where id='${bg}'`)
      assert.deepEqual(await current(),{background_art_id:null,emblem_art_id:null})
    })
    await t.test('activates background and emblem together; stale editor cannot overwrite a newer combination',async()=>{
      assert.equal((await configure({action:'activate'})).rows[0].result.changed,true)
      assert.deepEqual(await current(),{background_art_id:bg,emblem_art_id:emblem})
      await assert.rejects(configure({action:'activate',bg:null,emblem:null}),/Active combination changed/)
      assert.deepEqual(await current(),{background_art_id:bg,emblem_art_id:emblem})
      assert.equal((await configure({action:'activate',expectedBg:bg,expectedEmblem:emblem})).rows[0].result.changed,false)
    })
    await t.test('audit failure rolls back the entire activation; original appearance can then be restored without deleting saved cards',async()=>{
      await db.exec(`create function public.reject_card_audit() returns trigger language plpgsql as $$ begin raise exception 'Audit unavailable'; end; $$;
        create trigger reject_card_audit before insert on public.audit_logs for each row execute function public.reject_card_audit();`)
      await assert.rejects(configure({action:'activate',bg:null,emblem:null,expectedBg:bg,expectedEmblem:emblem}),/Audit unavailable/)
      assert.deepEqual(await current(),{background_art_id:bg,emblem_art_id:emblem})
      await db.exec('drop trigger reject_card_audit on public.audit_logs')
      await configure({action:'activate',bg:null,emblem:null,expectedBg:bg,expectedEmblem:emblem})
      assert.deepEqual(await current(),{background_art_id:null,emblem_art_id:null})
      assert.equal((await db.query('select * from public.reward_level_cards')).rows.length,1)
      assert.equal((await db.query('select * from public.point_events')).rows.length,0)
      assert.equal((await db.query('select * from public.reward_level_art')).rows.length,3)
    })
    await t.test('SQL 126 shares existing backgrounds across levels without moving files or relaxing emblem/auth checks',async()=>{
      await db.exec(await readFile(new URL('../supabase/migrations/126_shared_reward_backgrounds.sql',import.meta.url),'utf8'))
      const sharedCard='77777777-7777-4777-8777-777777777777'
      await configure({level:9,emoji:'🔮',emblem:null,id:sharedCard,name:'Delad bakgrund'})
      await configure({level:9,emoji:'🔮',emblem:null,action:'activate'})
      await configure({bg:wrong,emblem:null,action:'activate'})
      const levels=(await db.query('select id,background_art_id,emblem_art_id from public.reward_levels order by id')).rows
      assert.equal(levels[0].background_art_id,wrong);assert.equal(levels[1].background_art_id,bg)
      for(const options of [{level:9,emoji:'🔮'},{level:9,emoji:'🔮',bg:emblem,emblem:null},{version:1},{actor:ordinary,version:0}])await assert.rejects(configure(options))
      await db.exec(`update public.reward_level_art set source_emoji='🥉' where id='${bg}'`)
      await configure({level:9,emoji:'🔮',emblem:null,id:sharedCard,name:'Delad bakgrund'})
      for(const update of ["status='pending'", "status='failed'", "storage_path='https://untrusted.invalid/x'", `storage_path='9/${bg}.webp'`]){
        await db.exec(`update public.reward_level_art set ${update} where id='${bg}'`)
        await assert.rejects(configure({level:9,emoji:'🔮',emblem:null,id:sharedCard,name:'Delad bakgrund'}),/not compatible/)
        await db.exec(`update public.reward_level_art set status='ready',storage_path='8/${bg}.webp' where id='${bg}'`)
      }
      for(const role of ['anon','authenticated']){
        await db.exec(`set role ${role}`);await assert.rejects(configure(),/permission denied/);await db.exec('reset role')
      }
    })
    await t.test('deleting the origin level preserves shared artwork, active references and other levels saved cards',async()=>{
      await db.exec('delete from public.reward_levels where id=8')
      const cards=(await db.query('select * from public.reward_level_cards')).rows
      assert.equal(cards.length,1);assert.equal(cards[0].level_id,9);assert.equal(cards[0].background_art_id,bg)
      const remaining=(await db.query('select * from public.reward_level_art')).rows
      assert.equal(remaining.length,3);assert.equal(remaining.find(row=>row.id===bg).level_id,null)
      assert.equal((await db.query('select background_art_id from public.reward_levels where id=9')).rows[0].background_art_id,bg)
      assert.equal((await configure({level:9,emoji:'🔮',emblem:null,action:'activate',expectedBg:bg})).rows[0].result.changed,false)
      assert.equal((await db.query('select * from public.point_events')).rows.length,0)
    })
  }finally{await db.close()}
})
