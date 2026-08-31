begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_temp;
select plan(31);

insert into auth.users(id,email)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','phase32-a@example.test'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','phase32-b@example.test'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','phase32-c@example.test');

create function pg_temp.task_change(p_id uuid,p_focus_order integer default null)
returns jsonb language sql as $$ select jsonb_build_object(
  'entityType','task','entityId',p_id,'operation','create','baseServerRevision',null,
  'entitySnapshot',jsonb_build_object('id',p_id,'userId','local-user','title','Task','notes',null,'status','todo','priority','P2',
    'plannedDate','2026-08-31','dueAt',null,'projectId',null,
    'focusDate',case when p_focus_order is null then null else '2026-08-31' end,
    'focusOrder',p_focus_order,'completedAt',null,'version',1,'createdAt','2026-08-31T00:00:00.000Z',
    'updatedAt','2026-08-31T00:00:00.000Z','deletedAt',null)) $$;
create function pg_temp.routine_log_change(p_id uuid)
returns jsonb language sql as $$ select jsonb_build_object(
  'entityType','routine_log','entityId',p_id,'operation','create','baseServerRevision',null,
  'entitySnapshot',jsonb_build_object('id',p_id,'userId','local-user','routineId','40000000-0000-4000-8000-000000000001',
    'date','2026-08-31','completedAt','2026-08-31T00:00:00.000Z','version',1,
    'createdAt','2026-08-31T00:00:00.000Z','updatedAt','2026-08-31T00:00:00.000Z','deletedAt',null)) $$;
create function pg_temp.daily_log_change(p_id uuid,p_date text)
returns jsonb language sql as $$ select jsonb_build_object(
  'entityType','daily_log','entityId',p_id,'operation','create','baseServerRevision',null,
  'entitySnapshot',jsonb_build_object('id',p_id,'userId','local-user','date',p_date,'finalizeTimezone','Asia/Shanghai',
    'summary','Snapshot','snapshot','{}'::jsonb,'finalizedAt','2026-08-31T00:00:00.000Z','version',1,
    'createdAt','2026-08-31T00:00:00.000Z','updatedAt','2026-08-31T00:00:00.000Z','deletedAt',null)) $$;
create function pg_temp.activity_change(p_id uuid,p_entity_id uuid)
returns jsonb language sql as $$ select jsonb_build_object(
  'entityType','activity','entityId',p_id,'operation','create','baseServerRevision',null,
  'entitySnapshot',jsonb_build_object('id',p_id,'userId','local-user','eventType','daily_log_finalized','entityType','daily_log',
    'entityId',p_entity_id,'payload',jsonb_build_object('title','2026-08-31'),'deviceId',null,
    'occurredAt','2026-08-31T00:00:00.000Z','version',1,'createdAt','2026-08-31T00:00:00.000Z',
    'updatedAt','2026-08-31T00:00:00.000Z','deletedAt',null)) $$;

insert into public.activities(user_id,id,event_type,entity_type,entity_id,payload,occurred_at,version,server_revision,last_mutation_id,last_modified_by_device_id,created_at,updated_at)
values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','20000000-0000-4000-8000-000000000001','task_created','task','20000000-0000-4000-8000-000000000002','{}',now(),1,90,
  '20000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000004',now(),now());
insert into public.daily_logs(user_id,id,date,finalize_timezone,summary,snapshot,finalized_at,version,server_revision,last_mutation_id,last_modified_by_device_id,created_at,updated_at)
values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','20000000-0000-4000-8000-000000000010','2026-08-30','Asia/Shanghai','','{}',now(),1,91,
  '20000000-0000-4000-8000-000000000011','20000000-0000-4000-8000-000000000012',now(),now());

select has_table('public','tasks','tasks exists');
select has_table('public','sync_changes','sync_changes exists');
select has_table('public','sync_bootstrap_sessions','bootstrap staging exists');
select ok((select relrowsecurity from pg_class where oid='public.tasks'::regclass),'tasks RLS is active');
select ok((select relrowsecurity from pg_class where oid='public.sync_mutations'::regclass),'mutation receipts RLS is active');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);

select throws_ok(
  $$insert into public.memos(user_id,id,content,pinned,version,server_revision,last_mutation_id,last_modified_by_device_id,created_at,updated_at)
    values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','10000000-0000-4000-8000-000000000001','direct',false,1,1,
      '10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000003',now(),now())$$,
  '42501',null,'authenticated clients cannot directly insert entities');

select is(
  (public.apply_sync_mutation_v1($${
    "mutationId":"10000000-0000-4000-8000-000000000010",
    "deviceId":"10000000-0000-4000-8000-000000000011",
    "userId":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    "changes":[{"entityType":"task","entityId":"10000000-0000-4000-8000-000000000012","operation":"create","baseServerRevision":null,
      "entitySnapshot":{"id":"10000000-0000-4000-8000-000000000012","userId":"local-user","title":"Unicode 任务","notes":null,
      "status":"todo","priority":"P2","plannedDate":"2026-08-31","dueAt":null,"projectId":null,"focusDate":null,"focusOrder":null,
      "completedAt":null,"version":1,"createdAt":"2026-08-31T00:00:00.000Z","updatedAt":"2026-08-31T00:00:00.000Z","deletedAt":null}}]}$$::jsonb))->>'highWatermark',
  '1','first entity receives revision one');

select is(
  (public.apply_sync_mutation_v1($${
    "mutationId":"10000000-0000-4000-8000-000000000010",
    "deviceId":"10000000-0000-4000-8000-000000000011",
    "userId":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    "changes":[{"entityType":"task","entityId":"10000000-0000-4000-8000-000000000012","operation":"create","baseServerRevision":null,
      "entitySnapshot":{"id":"10000000-0000-4000-8000-000000000012","userId":"local-user","title":"Unicode 任务","notes":null,
      "status":"todo","priority":"P2","plannedDate":"2026-08-31","dueAt":null,"projectId":null,"focusDate":null,"focusOrder":null,
      "completedAt":null,"version":1,"createdAt":"2026-08-31T00:00:00.000Z","updatedAt":"2026-08-31T00:00:00.000Z","deletedAt":null}}]}$$::jsonb))->>'highWatermark',
  '1','same mutation and payload is idempotent');

select throws_ok(
  $$select public.apply_sync_mutation_v1('{"mutationId":"10000000-0000-4000-8000-000000000010","deviceId":"10000000-0000-4000-8000-000000000011","changes":[{"different":true}]}'::jsonb)$$,
  '22023','MutationIdReuse','mutation id reuse with another payload is rejected');

select throws_ok(
  $$select public.apply_sync_mutation_v1('{"mutationId":"10000000-0000-4000-8000-000000000020","deviceId":"10000000-0000-4000-8000-000000000011","userId":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","changes":[{}]}'::jsonb)$$,
  '42501','OwnershipConflict','RPC ignores forged ownership');

select throws_ok(
  $$select public.apply_sync_mutation_v1(jsonb_build_object(
    'mutationId','30000000-0000-4000-8000-000000000001','deviceId','10000000-0000-4000-8000-000000000011',
    'changes',jsonb_build_array(
      jsonb_build_object('entityType','memo','entityId','30000000-0000-4000-8000-000000000002','operation','create','baseServerRevision',null,
        'entitySnapshot',jsonb_build_object('id','30000000-0000-4000-8000-000000000002','content','rollback','pinned',false,'projectId',null,
          'createdAt','2026-08-31T00:00:00.000Z','updatedAt','2026-08-31T00:00:00.000Z','deletedAt',null)),
      jsonb_build_object('entityType','unsupported','entityId','30000000-0000-4000-8000-000000000003','operation','create','entitySnapshot','{}'::jsonb))))$$,
  '22023','Unsupported mutation change','failed multi-entity mutation is rejected');
select is((select count(*)::integer from public.memos where content='rollback'),0,'failed mutation rolls back earlier entity');
select is((select last_revision from public.sync_user_state where user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),1::bigint,'failed mutation rolls back revision allocation');

select throws_ok(
  $$select public.apply_sync_mutation_v1(jsonb_build_object(
    'mutationId','30000000-0000-4000-8000-000000000010','deviceId','10000000-0000-4000-8000-000000000011',
    'changes',jsonb_build_array(
      pg_temp.task_change('30000000-0000-4000-8000-000000000011',1),pg_temp.task_change('30000000-0000-4000-8000-000000000012',2),
      pg_temp.task_change('30000000-0000-4000-8000-000000000013',3),pg_temp.task_change('30000000-0000-4000-8000-000000000014',1))))$$,
  '23505',null,'a fourth Focus slot assignment fails atomically');
select is((select count(*)::integer from public.tasks where id::text like '30000000%'),0,'Focus failure leaves no partial tasks');

select throws_ok(
  $$select public.apply_sync_mutation_v1(jsonb_build_object(
    'mutationId','40000000-0000-4000-8000-000000000010','deviceId','10000000-0000-4000-8000-000000000011',
    'changes',jsonb_build_array(pg_temp.routine_log_change('40000000-0000-4000-8000-000000000011'),
      pg_temp.routine_log_change('40000000-0000-4000-8000-000000000012'))))$$,
  '23505',null,'duplicate active RoutineLog is rejected');
select is((select count(*)::integer from public.routine_logs),0,'RoutineLog invariant failure is atomic');

select throws_ok(
  $$select public.apply_sync_mutation_v1(jsonb_build_object(
    'mutationId','50000000-0000-4000-8000-000000000010','deviceId','10000000-0000-4000-8000-000000000011',
    'changes',jsonb_build_array(pg_temp.daily_log_change('50000000-0000-4000-8000-000000000011','2026-09-01'),
      pg_temp.daily_log_change('50000000-0000-4000-8000-000000000012','2026-09-01'))))$$,
  '23505',null,'duplicate DailyLog date is rejected');
select is((select count(*)::integer from public.daily_logs where date='2026-09-01'),0,'DailyLog invariant failure is atomic');

select is(
  jsonb_array_length(public.apply_sync_mutation_v1(jsonb_build_object(
    'mutationId','60000000-0000-4000-8000-000000000001','deviceId','10000000-0000-4000-8000-000000000011',
    'changes',jsonb_build_array(pg_temp.task_change('60000000-0000-4000-8000-000000000002'),
      pg_temp.daily_log_change('60000000-0000-4000-8000-000000000003','2026-08-31'),
      pg_temp.activity_change('60000000-0000-4000-8000-000000000004','60000000-0000-4000-8000-000000000003'))))->'entityResults'),
  3,'End Day commits Task, DailyLog, and Activity as one mutation');
select is((select count(*)::integer from public.sync_changes where mutation_id='60000000-0000-4000-8000-000000000001'),3,'End Day writes one ordered change per entity');

select is((select count(*)::integer from public.tasks),2,'owner can read only own tasks');

select set_config('request.jwt.claims','{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}',true);
select is((select count(*)::integer from public.tasks),0,'user B cannot see user A task');

reset role;
select throws_ok(
  $$update public.activities set payload='{}'::jsonb where true$$,
  'P0001','activities is immutable','Activity is append-only');
select throws_ok(
  $$update public.daily_logs set summary='changed' where true$$,
  'P0001','daily_logs is immutable','DailyLog is immutable');

set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
select throws_ok(
  $$select public.inspect_cloud_workspace_v1()$$,
  '42501',null,'anonymous users cannot call cloud workspace RPC');
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","role":"authenticated"}',true);
select is(public.begin_sync_bootstrap_v1('70000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000002','manifest',1)->>'status','staging','bootstrap begins in staging');
select is(public.upload_sync_bootstrap_chunk_v1('70000000-0000-4000-8000-000000000001',0,'70000000-0000-4000-8000-000000000003',
  jsonb_build_object('changes',jsonb_build_array(pg_temp.task_change('70000000-0000-4000-8000-000000000004'))))->>'status','accepted','bootstrap chunk accepted');
select is(public.upload_sync_bootstrap_chunk_v1('70000000-0000-4000-8000-000000000001',0,'70000000-0000-4000-8000-000000000003',
  jsonb_build_object('changes',jsonb_build_array(pg_temp.task_change('70000000-0000-4000-8000-000000000004'))))->>'status','accepted','bootstrap chunk replay is idempotent');
select is(public.commit_sync_bootstrap_v1('70000000-0000-4000-8000-000000000001')->>'status','committed','bootstrap final commit succeeds atomically');
select is(public.commit_sync_bootstrap_v1('70000000-0000-4000-8000-000000000001')->>'status','committed','lost bootstrap acknowledgement can be replayed');
reset role;

do $$
declare v_diagnostic text;
begin
  for v_diagnostic in select * from finish() loop
    raise exception 'pgTAP failure: %', v_diagnostic;
  end loop;
end;
$$;
rollback;
