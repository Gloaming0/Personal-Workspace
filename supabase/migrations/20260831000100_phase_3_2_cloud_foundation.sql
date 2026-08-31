-- Phase 3.2: cloud schema, RLS, idempotent mutation RPC, and bootstrap staging.
-- Canonical writes are RPC-only. Browser clients receive SELECT access only.

create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.tasks (
  user_id uuid not null references auth.users(id) on delete cascade,
  id uuid not null,
  title text not null check (length(btrim(title)) > 0),
  notes text,
  status text not null check (status in ('todo','doing','done','later','archived')),
  priority text not null check (priority in ('P1','P2','P3')),
  planned_date date,
  due_at timestamptz,
  project_id uuid,
  focus_date date,
  focus_order smallint,
  completed_at timestamptz,
  version bigint not null check (version >= 1),
  server_revision bigint not null check (server_revision >= 1),
  last_mutation_id uuid not null,
  last_modified_by_device_id uuid not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_changed_at timestamptz not null default clock_timestamp(),
  primary key (user_id, id),
  unique (user_id, server_revision),
  check ((focus_date is null and focus_order is null) or
    (focus_date is not null and focus_order between 1 and 3 and status in ('todo','doing') and deleted_at is null))
);
create unique index tasks_active_focus_slot_uq
  on public.tasks (user_id, focus_date, focus_order)
  where deleted_at is null and focus_order is not null;

create table public.confirmations (
  user_id uuid not null references auth.users(id) on delete cascade,
  id uuid not null,
  title text not null check (length(btrim(title)) > 0),
  notes text,
  status text not null check (status in ('waiting','confirmed','closed')),
  person text,
  project_id uuid,
  source_task_id uuid,
  sent_at timestamptz not null,
  follow_up_date date,
  confirmed_at timestamptz,
  closed_at timestamptz,
  version bigint not null check (version >= 1),
  server_revision bigint not null check (server_revision >= 1),
  last_mutation_id uuid not null,
  last_modified_by_device_id uuid not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_changed_at timestamptz not null default clock_timestamp(),
  primary key (user_id, id),
  unique (user_id, server_revision)
);

create table public.memos (
  user_id uuid not null references auth.users(id) on delete cascade,
  id uuid not null,
  content text not null,
  pinned boolean not null,
  project_id uuid,
  version bigint not null check (version >= 1),
  server_revision bigint not null check (server_revision >= 1),
  last_mutation_id uuid not null,
  last_modified_by_device_id uuid not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_changed_at timestamptz not null default clock_timestamp(),
  primary key (user_id, id),
  unique (user_id, server_revision)
);

create table public.routines (
  user_id uuid not null references auth.users(id) on delete cascade,
  id uuid not null,
  title text not null check (length(btrim(title)) > 0),
  status text not null check (status in ('active','paused','archived')),
  schedule jsonb not null check (
    schedule ? 'frequency' and schedule->>'frequency' in ('daily','weekdays','weekly') and
    (schedule->>'frequency' <> 'weekly' or jsonb_typeof(schedule->'daysOfWeek') = 'array')
  ),
  timezone text not null check (length(timezone) > 0),
  sort_order integer not null,
  version bigint not null check (version >= 1),
  server_revision bigint not null check (server_revision >= 1),
  last_mutation_id uuid not null,
  last_modified_by_device_id uuid not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_changed_at timestamptz not null default clock_timestamp(),
  primary key (user_id, id),
  unique (user_id, server_revision)
);

create table public.routine_logs (
  user_id uuid not null references auth.users(id) on delete cascade,
  id uuid not null,
  routine_id uuid not null,
  date date not null,
  completed_at timestamptz not null,
  version bigint not null check (version >= 1),
  server_revision bigint not null check (server_revision >= 1),
  last_mutation_id uuid not null,
  last_modified_by_device_id uuid not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_changed_at timestamptz not null default clock_timestamp(),
  primary key (user_id, id),
  unique (user_id, server_revision)
);
create unique index routine_logs_active_day_uq
  on public.routine_logs (user_id, routine_id, date)
  where deleted_at is null;

create table public.activities (
  user_id uuid not null references auth.users(id) on delete cascade,
  id uuid not null,
  event_type text not null,
  entity_type text not null,
  entity_id uuid not null,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  device_id uuid,
  occurred_at timestamptz not null,
  version bigint not null check (version = 1),
  server_revision bigint not null check (server_revision >= 1),
  last_mutation_id uuid not null,
  last_modified_by_device_id uuid not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_changed_at timestamptz not null default clock_timestamp(),
  primary key (user_id, id),
  unique (user_id, server_revision)
);

create table public.daily_logs (
  user_id uuid not null references auth.users(id) on delete cascade,
  id uuid not null,
  date date not null,
  finalize_timezone text not null check (length(finalize_timezone) > 0),
  summary text not null,
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  finalized_at timestamptz not null,
  version bigint not null check (version = 1),
  server_revision bigint not null check (server_revision >= 1),
  last_mutation_id uuid not null,
  last_modified_by_device_id uuid not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_changed_at timestamptz not null default clock_timestamp(),
  primary key (user_id, id),
  unique (user_id, server_revision)
);
create unique index daily_logs_active_day_uq
  on public.daily_logs (user_id, date) where deleted_at is null;

create table public.sync_user_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_revision bigint not null default 0 check (last_revision >= 0),
  updated_at timestamptz not null default clock_timestamp()
);

create table public.sync_mutations (
  user_id uuid not null references auth.users(id) on delete cascade,
  mutation_id uuid not null,
  device_id uuid not null,
  protocol_version integer not null default 1 check (protocol_version = 1),
  request_hash text not null,
  status text not null check (status in ('applying','applied','conflicted','rejected')),
  result jsonb,
  created_at timestamptz not null default clock_timestamp(),
  committed_at timestamptz,
  primary key (user_id, mutation_id)
);

create table public.sync_mutation_results (
  user_id uuid not null,
  mutation_id uuid not null,
  sequence integer not null check (sequence >= 0),
  entity_type text not null,
  entity_id uuid not null,
  server_revision bigint not null,
  server_version bigint not null,
  primary key (user_id, mutation_id, sequence),
  foreign key (user_id, mutation_id) references public.sync_mutations(user_id, mutation_id) on delete cascade
);

create table public.sync_changes (
  user_id uuid not null references auth.users(id) on delete cascade,
  server_revision bigint not null,
  entity_type text not null,
  entity_id uuid not null,
  operation text not null check (operation in ('create','update','delete')),
  mutation_id uuid not null,
  device_id uuid not null,
  record jsonb not null,
  server_changed_at timestamptz not null default clock_timestamp(),
  primary key (user_id, server_revision)
);
create index sync_changes_entity_idx on public.sync_changes (user_id, entity_type, entity_id, server_revision);

create table public.sync_device_cursors (
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id uuid not null,
  last_pulled_revision bigint not null default 0 check (last_pulled_revision >= 0),
  updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, device_id)
);

create table public.sync_conflicts (
  user_id uuid not null references auth.users(id) on delete cascade,
  id uuid not null,
  mutation_id uuid,
  conflict_type text not null,
  entity_type text not null,
  entity_id uuid not null,
  details jsonb not null default '{}'::jsonb,
  status text not null default 'open' check (status in ('open','resolved')),
  created_at timestamptz not null default clock_timestamp(),
  resolved_at timestamptz,
  primary key (user_id, id)
);

create table public.sync_bootstrap_sessions (
  user_id uuid not null references auth.users(id) on delete cascade,
  bootstrap_id uuid not null,
  device_id uuid not null,
  manifest_hash text not null,
  total_chunks integer not null check (total_chunks >= 0),
  status text not null check (status in ('staging','committed')),
  result jsonb,
  created_at timestamptz not null default clock_timestamp(),
  committed_at timestamptz,
  primary key (user_id, bootstrap_id)
);

create table public.sync_bootstrap_chunks (
  user_id uuid not null,
  bootstrap_id uuid not null,
  chunk_index integer not null check (chunk_index >= 0),
  idempotency_key uuid not null,
  payload_hash text not null,
  payload jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key (user_id, bootstrap_id, chunk_index),
  unique (user_id, bootstrap_id, idempotency_key),
  foreign key (user_id, bootstrap_id) references public.sync_bootstrap_sessions(user_id, bootstrap_id) on delete cascade
);

create index confirmations_revision_idx on public.confirmations (user_id, server_revision);
create index memos_revision_idx on public.memos (user_id, server_revision);
create index routines_revision_idx on public.routines (user_id, server_revision);
create index routine_logs_revision_idx on public.routine_logs (user_id, server_revision);
create index activities_revision_idx on public.activities (user_id, server_revision);
create index daily_logs_revision_idx on public.daily_logs (user_id, server_revision);

create or replace function private.reject_immutable_change()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception using errcode = 'P0001', message = tg_table_name || ' is immutable';
end;
$$;
create trigger activities_append_only before update or delete on public.activities
  for each row execute function private.reject_immutable_change();
create trigger daily_logs_immutable before update or delete on public.daily_logs
  for each row execute function private.reject_immutable_change();

create or replace function private.apply_entity_change_v1(
  p_user_id uuid, p_mutation_id uuid, p_device_id uuid, p_change jsonb, p_revision bigint
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_type text := p_change->>'entityType';
  v_operation text := p_change->>'operation';
  v_snapshot jsonb := p_change->'entitySnapshot';
  v_entity_id uuid := (p_change->>'entityId')::uuid;
  v_base_revision bigint := nullif(p_change->>'baseServerRevision','')::bigint;
  v_table text;
  v_current_revision bigint;
  v_current_version bigint;
  v_server_version bigint;
  v_record jsonb;
begin
  v_table := case v_type
    when 'task' then 'tasks' when 'waiting' then 'confirmations'
    when 'memo' then 'memos' when 'routine' then 'routines'
    when 'routine_log' then 'routine_logs' when 'activity' then 'activities'
    when 'daily_log' then 'daily_logs' else null end;
  if v_table is null or v_operation not in ('create','update','delete') then
    raise exception using errcode = '22023', message = 'Unsupported mutation change';
  end if;
  if v_snapshot is null or (v_snapshot->>'id')::uuid <> v_entity_id then
    raise exception using errcode = '22023', message = 'Entity snapshot identity mismatch';
  end if;

  execute format('select server_revision, version from public.%I where user_id=$1 and id=$2 for update', v_table)
    into v_current_revision, v_current_version using p_user_id, v_entity_id;
  if v_operation = 'create' then
    if found or v_base_revision is not null then
      raise exception using errcode = '40001', message = 'BaseServerRevisionConflict';
    end if;
    v_server_version := 1;
  else
    if not found or v_base_revision is null or v_current_revision <> v_base_revision then
      raise exception using errcode = '40001', message = 'BaseServerRevisionConflict';
    end if;
    if v_type in ('activity','daily_log') then
      raise exception using errcode = 'P0001', message = 'ImmutableEntityConflict';
    end if;
    v_server_version := v_current_version + 1;
  end if;
  if v_operation = 'delete' and nullif(v_snapshot->>'deletedAt','') is null then
    raise exception using errcode = '22023', message = 'Delete requires a tombstone snapshot';
  end if;

  if v_type = 'task' then
    insert into public.tasks values (
      p_user_id,v_entity_id,v_snapshot->>'title',v_snapshot->>'notes',v_snapshot->>'status',v_snapshot->>'priority',
      nullif(v_snapshot->>'plannedDate','')::date,nullif(v_snapshot->>'dueAt','')::timestamptz,
      nullif(v_snapshot->>'projectId','')::uuid,nullif(v_snapshot->>'focusDate','')::date,
      nullif(v_snapshot->>'focusOrder','')::smallint,nullif(v_snapshot->>'completedAt','')::timestamptz,
      v_server_version,p_revision,p_mutation_id,p_device_id,(v_snapshot->>'createdAt')::timestamptz,
      (v_snapshot->>'updatedAt')::timestamptz,nullif(v_snapshot->>'deletedAt','')::timestamptz,clock_timestamp())
    on conflict (user_id,id) do update set title=excluded.title,notes=excluded.notes,status=excluded.status,
      priority=excluded.priority,planned_date=excluded.planned_date,due_at=excluded.due_at,project_id=excluded.project_id,
      focus_date=excluded.focus_date,focus_order=excluded.focus_order,completed_at=excluded.completed_at,
      version=excluded.version,server_revision=excluded.server_revision,last_mutation_id=excluded.last_mutation_id,
      last_modified_by_device_id=excluded.last_modified_by_device_id,updated_at=excluded.updated_at,
      deleted_at=excluded.deleted_at,server_changed_at=excluded.server_changed_at;
  elsif v_type = 'waiting' then
    insert into public.confirmations values (
      p_user_id,v_entity_id,v_snapshot->>'title',v_snapshot->>'notes',v_snapshot->>'status',v_snapshot->>'person',
      nullif(v_snapshot->>'projectId','')::uuid,nullif(v_snapshot->>'sourceTaskId','')::uuid,
      (v_snapshot->>'sentAt')::timestamptz,nullif(v_snapshot->>'followUpDate','')::date,
      nullif(v_snapshot->>'confirmedAt','')::timestamptz,nullif(v_snapshot->>'closedAt','')::timestamptz,
      v_server_version,p_revision,p_mutation_id,p_device_id,(v_snapshot->>'createdAt')::timestamptz,
      (v_snapshot->>'updatedAt')::timestamptz,nullif(v_snapshot->>'deletedAt','')::timestamptz,clock_timestamp())
    on conflict (user_id,id) do update set title=excluded.title,notes=excluded.notes,status=excluded.status,
      person=excluded.person,project_id=excluded.project_id,source_task_id=excluded.source_task_id,sent_at=excluded.sent_at,
      follow_up_date=excluded.follow_up_date,confirmed_at=excluded.confirmed_at,closed_at=excluded.closed_at,
      version=excluded.version,server_revision=excluded.server_revision,last_mutation_id=excluded.last_mutation_id,
      last_modified_by_device_id=excluded.last_modified_by_device_id,updated_at=excluded.updated_at,
      deleted_at=excluded.deleted_at,server_changed_at=excluded.server_changed_at;
  elsif v_type = 'memo' then
    insert into public.memos values (
      p_user_id,v_entity_id,v_snapshot->>'content',coalesce((v_snapshot->>'pinned')::boolean,false),
      nullif(v_snapshot->>'projectId','')::uuid,v_server_version,p_revision,p_mutation_id,p_device_id,
      (v_snapshot->>'createdAt')::timestamptz,(v_snapshot->>'updatedAt')::timestamptz,
      nullif(v_snapshot->>'deletedAt','')::timestamptz,clock_timestamp())
    on conflict (user_id,id) do update set content=excluded.content,pinned=excluded.pinned,project_id=excluded.project_id,
      version=excluded.version,server_revision=excluded.server_revision,last_mutation_id=excluded.last_mutation_id,
      last_modified_by_device_id=excluded.last_modified_by_device_id,updated_at=excluded.updated_at,
      deleted_at=excluded.deleted_at,server_changed_at=excluded.server_changed_at;
  elsif v_type = 'routine' then
    insert into public.routines values (
      p_user_id,v_entity_id,v_snapshot->>'title',v_snapshot->>'status',v_snapshot->'schedule',v_snapshot->>'timezone',
      (v_snapshot->>'sortOrder')::integer,v_server_version,p_revision,p_mutation_id,p_device_id,
      (v_snapshot->>'createdAt')::timestamptz,(v_snapshot->>'updatedAt')::timestamptz,
      nullif(v_snapshot->>'deletedAt','')::timestamptz,clock_timestamp())
    on conflict (user_id,id) do update set title=excluded.title,status=excluded.status,schedule=excluded.schedule,
      timezone=excluded.timezone,sort_order=excluded.sort_order,version=excluded.version,server_revision=excluded.server_revision,
      last_mutation_id=excluded.last_mutation_id,last_modified_by_device_id=excluded.last_modified_by_device_id,
      updated_at=excluded.updated_at,deleted_at=excluded.deleted_at,server_changed_at=excluded.server_changed_at;
  elsif v_type = 'routine_log' then
    insert into public.routine_logs values (
      p_user_id,v_entity_id,(v_snapshot->>'routineId')::uuid,(v_snapshot->>'date')::date,
      (v_snapshot->>'completedAt')::timestamptz,v_server_version,p_revision,p_mutation_id,p_device_id,
      (v_snapshot->>'createdAt')::timestamptz,(v_snapshot->>'updatedAt')::timestamptz,
      nullif(v_snapshot->>'deletedAt','')::timestamptz,clock_timestamp())
    on conflict (user_id,id) do update set routine_id=excluded.routine_id,date=excluded.date,
      completed_at=excluded.completed_at,version=excluded.version,server_revision=excluded.server_revision,
      last_mutation_id=excluded.last_mutation_id,last_modified_by_device_id=excluded.last_modified_by_device_id,
      updated_at=excluded.updated_at,deleted_at=excluded.deleted_at,server_changed_at=excluded.server_changed_at;
  elsif v_type = 'activity' then
    if v_operation <> 'create' then raise exception 'ImmutableEntityConflict'; end if;
    insert into public.activities values (
      p_user_id,v_entity_id,v_snapshot->>'eventType',v_snapshot->>'entityType',(v_snapshot->>'entityId')::uuid,
      v_snapshot->'payload',nullif(v_snapshot->>'deviceId','')::uuid,(v_snapshot->>'occurredAt')::timestamptz,
      1,p_revision,p_mutation_id,p_device_id,(v_snapshot->>'createdAt')::timestamptz,
      (v_snapshot->>'updatedAt')::timestamptz,nullif(v_snapshot->>'deletedAt','')::timestamptz,clock_timestamp());
  elsif v_type = 'daily_log' then
    if v_operation <> 'create' then raise exception 'ImmutableEntityConflict'; end if;
    insert into public.daily_logs values (
      p_user_id,v_entity_id,(v_snapshot->>'date')::date,v_snapshot->>'finalizeTimezone',
      coalesce(v_snapshot->>'summary',''),v_snapshot->'snapshot',(v_snapshot->>'finalizedAt')::timestamptz,
      1,p_revision,p_mutation_id,p_device_id,(v_snapshot->>'createdAt')::timestamptz,
      (v_snapshot->>'updatedAt')::timestamptz,nullif(v_snapshot->>'deletedAt','')::timestamptz,clock_timestamp());
  end if;

  execute format('select to_jsonb(t) from public.%I t where user_id=$1 and id=$2', v_table)
    into v_record using p_user_id,v_entity_id;
  insert into public.sync_changes(user_id,server_revision,entity_type,entity_id,operation,mutation_id,device_id,record)
    values (p_user_id,p_revision,v_type,v_entity_id,v_operation,p_mutation_id,p_device_id,v_record);
  return jsonb_build_object('entityType',v_type,'entityId',v_entity_id,'serverRevision',p_revision,'serverVersion',v_server_version);
end;
$$;

create or replace function public.apply_sync_mutation_v1(p_request jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_mutation uuid := (p_request->>'mutationId')::uuid;
  v_device uuid := (p_request->>'deviceId')::uuid;
  v_hash text := encode(extensions.digest(convert_to(p_request::text,'UTF8'),'sha256'),'hex');
  v_receipt public.sync_mutations%rowtype;
  v_change jsonb;
  v_result jsonb;
  v_results jsonb := '[]'::jsonb;
  v_revision bigint;
  v_sequence integer := 0;
begin
  if v_user is null then raise exception using errcode='42501',message='AuthenticationRequired'; end if;
  if p_request ? 'userId' and p_request->>'userId' <> v_user::text then
    raise exception using errcode='42501',message='OwnershipConflict';
  end if;
  if jsonb_typeof(p_request->'changes') <> 'array' or jsonb_array_length(p_request->'changes') = 0 then
    raise exception using errcode='22023',message='MutationChangesRequired';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user::text||v_mutation::text,0));
  select * into v_receipt from public.sync_mutations where user_id=v_user and mutation_id=v_mutation;
  if found then
    if v_receipt.request_hash <> v_hash then raise exception using errcode='22023',message='MutationIdReuse'; end if;
    if v_receipt.status = 'applied' then return v_receipt.result; end if;
  end if;
  insert into public.sync_mutations(user_id,mutation_id,device_id,request_hash,status)
    values(v_user,v_mutation,v_device,v_hash,'applying');
  insert into public.sync_user_state(user_id) values(v_user) on conflict do nothing;
  perform 1 from public.sync_user_state where user_id=v_user for update;
  for v_change in select value from jsonb_array_elements(p_request->'changes') loop
    update public.sync_user_state set last_revision=last_revision+1,updated_at=clock_timestamp()
      where user_id=v_user returning last_revision into v_revision;
    v_result := private.apply_entity_change_v1(v_user,v_mutation,v_device,v_change,v_revision);
    v_results := v_results || jsonb_build_array(v_result);
    insert into public.sync_mutation_results values (
      v_user,v_mutation,v_sequence,v_result->>'entityType',(v_result->>'entityId')::uuid,
      (v_result->>'serverRevision')::bigint,(v_result->>'serverVersion')::bigint);
    v_sequence := v_sequence + 1;
  end loop;
  v_result := jsonb_build_object('mutationId',v_mutation,'status','applied','entityResults',v_results,'highWatermark',v_revision);
  update public.sync_mutations set status='applied',result=v_result,committed_at=clock_timestamp()
    where user_id=v_user and mutation_id=v_mutation;
  return v_result;
end;
$$;

create or replace function public.query_sync_mutation_result_v1(p_mutation_id uuid)
returns jsonb language sql security definer set search_path = '' stable as $$
  select result from public.sync_mutations where user_id=auth.uid() and mutation_id=p_mutation_id and status='applied';
$$;

create or replace function public.inspect_cloud_workspace_v1()
returns jsonb language sql security definer set search_path = '' stable as $$
  select case when auth.uid() is null then null else jsonb_build_object(
    'hasData', ((select count(*) from public.tasks where user_id=auth.uid()) +
      (select count(*) from public.confirmations where user_id=auth.uid()) +
      (select count(*) from public.memos where user_id=auth.uid()) +
      (select count(*) from public.routines where user_id=auth.uid()) +
      (select count(*) from public.routine_logs where user_id=auth.uid()) +
      (select count(*) from public.activities where user_id=auth.uid()) +
      (select count(*) from public.daily_logs where user_id=auth.uid())) > 0,
    'highWatermark', coalesce((select last_revision from public.sync_user_state where user_id=auth.uid()),0)
  ) end;
$$;

create or replace function public.pull_sync_changes_v1(p_after_revision bigint,p_limit integer default 100)
returns jsonb language sql security definer set search_path = '' stable as $$
  select case when auth.uid() is null then null else jsonb_build_object(
    'changes',coalesce((select jsonb_agg(to_jsonb(c) order by c.server_revision)
      from (select * from public.sync_changes where user_id=auth.uid() and server_revision>p_after_revision
        order by server_revision limit least(greatest(p_limit,1),500)) c),'[]'::jsonb),
    'highWatermark',coalesce((select last_revision from public.sync_user_state where user_id=auth.uid()),0)
  ) end;
$$;

create or replace function public.begin_sync_bootstrap_v1(
  p_bootstrap_id uuid,p_device_id uuid,p_manifest_hash text,p_total_chunks integer
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_row public.sync_bootstrap_sessions%rowtype;
begin
  if v_user is null then raise exception 'AuthenticationRequired'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user::text||p_bootstrap_id::text,0));
  select * into v_row from public.sync_bootstrap_sessions where user_id=v_user and bootstrap_id=p_bootstrap_id;
  if found then
    if v_row.manifest_hash<>p_manifest_hash or v_row.total_chunks<>p_total_chunks or v_row.device_id<>p_device_id then
      raise exception 'BootstrapIdReuse';
    end if;
    return jsonb_build_object('bootstrapId',p_bootstrap_id,'status',v_row.status);
  end if;
  insert into public.sync_bootstrap_sessions values(v_user,p_bootstrap_id,p_device_id,p_manifest_hash,p_total_chunks,'staging',null,clock_timestamp(),null);
  return jsonb_build_object('bootstrapId',p_bootstrap_id,'status','staging');
end; $$;

create or replace function public.upload_sync_bootstrap_chunk_v1(
  p_bootstrap_id uuid,p_chunk_index integer,p_idempotency_key uuid,p_payload jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_hash text:=encode(extensions.digest(convert_to(p_payload::text,'UTF8'),'sha256'),'hex'); v_existing public.sync_bootstrap_chunks%rowtype;
begin
  if v_user is null then raise exception 'AuthenticationRequired'; end if;
  perform 1 from public.sync_bootstrap_sessions where user_id=v_user and bootstrap_id=p_bootstrap_id and status='staging' for update;
  if not found then raise exception 'BootstrapNotStaging'; end if;
  select * into v_existing from public.sync_bootstrap_chunks where user_id=v_user and bootstrap_id=p_bootstrap_id and chunk_index=p_chunk_index;
  if found then
    if v_existing.idempotency_key<>p_idempotency_key or v_existing.payload_hash<>v_hash then raise exception 'BootstrapChunkReuse'; end if;
    return jsonb_build_object('chunkIndex',p_chunk_index,'status','accepted');
  end if;
  insert into public.sync_bootstrap_chunks values(v_user,p_bootstrap_id,p_chunk_index,p_idempotency_key,v_hash,p_payload,clock_timestamp());
  return jsonb_build_object('chunkIndex',p_chunk_index,'status','accepted');
end; $$;

create or replace function public.commit_sync_bootstrap_v1(p_bootstrap_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_session public.sync_bootstrap_sessions%rowtype; v_chunk record; v_change jsonb;
  v_revision bigint; v_result jsonb; v_results jsonb:='[]'::jsonb; v_count integer:=0;
begin
  if v_user is null then raise exception 'AuthenticationRequired'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user::text||p_bootstrap_id::text,0));
  select * into v_session from public.sync_bootstrap_sessions where user_id=v_user and bootstrap_id=p_bootstrap_id for update;
  if not found then raise exception 'BootstrapNotFound'; end if;
  if v_session.status='committed' then return v_session.result; end if;
  if (select count(*) from public.sync_bootstrap_chunks where user_id=v_user and bootstrap_id=p_bootstrap_id)<>v_session.total_chunks then
    raise exception 'BootstrapChunksIncomplete';
  end if;
  if exists(select 1 from public.sync_changes where user_id=v_user) then raise exception 'CloudWorkspaceNotEmpty'; end if;
  insert into public.sync_user_state(user_id) values(v_user) on conflict do nothing;
  perform 1 from public.sync_user_state where user_id=v_user for update;
  for v_chunk in select payload from public.sync_bootstrap_chunks where user_id=v_user and bootstrap_id=p_bootstrap_id order by chunk_index loop
    if jsonb_typeof(v_chunk.payload->'changes')<>'array' then raise exception 'InvalidBootstrapChunk'; end if;
    for v_change in select value from jsonb_array_elements(v_chunk.payload->'changes') loop
      update public.sync_user_state set last_revision=last_revision+1,updated_at=clock_timestamp() where user_id=v_user returning last_revision into v_revision;
      v_result:=private.apply_entity_change_v1(v_user,p_bootstrap_id,v_session.device_id,v_change,v_revision);
      v_results:=v_results||jsonb_build_array(v_result); v_count:=v_count+1;
    end loop;
  end loop;
  v_result:=jsonb_build_object('bootstrapId',p_bootstrap_id,'status','committed','entityCount',v_count,'entityResults',v_results,'highWatermark',coalesce(v_revision,0));
  update public.sync_bootstrap_sessions set status='committed',result=v_result,committed_at=clock_timestamp() where user_id=v_user and bootstrap_id=p_bootstrap_id;
  return v_result;
end; $$;

do $$ declare t text; begin
  foreach t in array array['tasks','confirmations','memos','routines','routine_logs','activities','daily_logs','sync_user_state','sync_mutations','sync_mutation_results','sync_changes','sync_device_cursors','sync_conflicts','sync_bootstrap_sessions','sync_bootstrap_chunks'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from anon, authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('create policy %I on public.%I for select to authenticated using ((select auth.uid()) is not null and (select auth.uid()) = user_id)',t||'_owner_select',t);
  end loop;
end $$;

revoke all on function public.apply_sync_mutation_v1(jsonb) from public,anon;
revoke all on function public.query_sync_mutation_result_v1(uuid) from public,anon;
revoke all on function public.inspect_cloud_workspace_v1() from public,anon;
revoke all on function public.pull_sync_changes_v1(bigint,integer) from public,anon;
revoke all on function public.begin_sync_bootstrap_v1(uuid,uuid,text,integer) from public,anon;
revoke all on function public.upload_sync_bootstrap_chunk_v1(uuid,integer,uuid,jsonb) from public,anon;
revoke all on function public.commit_sync_bootstrap_v1(uuid) from public,anon;
grant execute on function public.apply_sync_mutation_v1(jsonb) to authenticated;
grant execute on function public.query_sync_mutation_result_v1(uuid) to authenticated;
grant execute on function public.inspect_cloud_workspace_v1() to authenticated;
grant execute on function public.pull_sync_changes_v1(bigint,integer) to authenticated;
grant execute on function public.begin_sync_bootstrap_v1(uuid,uuid,text,integer) to authenticated;
grant execute on function public.upload_sync_bootstrap_chunk_v1(uuid,integer,uuid,jsonb) to authenticated;
grant execute on function public.commit_sync_bootstrap_v1(uuid) to authenticated;
