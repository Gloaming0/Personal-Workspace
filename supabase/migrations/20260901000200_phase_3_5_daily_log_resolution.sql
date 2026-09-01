-- DailyLog remains immutable for ordinary writes. This explicit, owner-scoped,
-- idempotent command is the sole exception used to choose an official snapshot
-- after a cross-device same-day conflict.

create table if not exists public.sync_conflict_resolutions (
  user_id uuid not null references auth.users(id) on delete cascade,
  resolution_id uuid not null,
  device_id uuid not null,
  conflict_type text not null check (conflict_type = 'daily_log'),
  request_hash text not null,
  result jsonb not null,
  resolved_at timestamptz not null default clock_timestamp(),
  primary key (user_id, resolution_id)
);

alter table public.sync_conflict_resolutions enable row level security;
revoke all on public.sync_conflict_resolutions from anon, authenticated;
grant select on public.sync_conflict_resolutions to authenticated;
create policy sync_conflict_resolutions_owner_select
  on public.sync_conflict_resolutions
  for select to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create or replace function private.reject_immutable_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_table_name = 'daily_logs'
     and current_setting('daily_work.allow_immutable_resolution', true) = 'on'
  then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  raise exception using errcode = 'P0001', message = tg_table_name || ' is immutable';
end;
$$;

create or replace function public.resolve_daily_log_conflict_v1(p_request jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_resolution uuid := (p_request->>'resolutionId')::uuid;
  v_device uuid := (p_request->>'deviceId')::uuid;
  v_candidate jsonb := p_request->'candidate';
  v_candidate_id uuid := (v_candidate->>'id')::uuid;
  v_date date := (v_candidate->>'date')::date;
  v_hash text := encode(extensions.digest(convert_to(p_request::text,'UTF8'),'sha256'),'hex');
  v_receipt public.sync_conflict_resolutions%rowtype;
  v_existing public.daily_logs%rowtype;
  v_revision bigint;
  v_record jsonb;
  v_result jsonb;
begin
  if v_user is null then
    raise exception using errcode='42501', message='AuthenticationRequired';
  end if;
  if v_candidate is null
     or v_candidate->>'userId' <> v_user::text
     or coalesce(v_candidate->>'deletedAt','') <> ''
     or jsonb_typeof(v_candidate->'snapshot') <> 'object'
  then
    raise exception using errcode='22023', message='InvalidDailyLogCandidate';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user::text || v_resolution::text, 0)
  );
  select * into v_receipt
    from public.sync_conflict_resolutions
    where user_id=v_user and resolution_id=v_resolution;
  if found then
    if v_receipt.request_hash <> v_hash then
      raise exception using errcode='22023', message='ResolutionIdReuse';
    end if;
    return v_receipt.result;
  end if;

  insert into public.sync_user_state(user_id) values(v_user) on conflict do nothing;
  perform 1 from public.sync_user_state where user_id=v_user for update;
  select * into v_existing from public.daily_logs
    where user_id=v_user and date=v_date and deleted_at is null
    for update;
  if not found then
    raise exception using errcode='P0001', message='DailyLogConflictNotFound';
  end if;

  perform pg_catalog.set_config('daily_work.allow_immutable_resolution','on',true);
  if v_existing.id <> v_candidate_id then
    update public.sync_user_state
      set last_revision=last_revision+1,updated_at=clock_timestamp()
      where user_id=v_user returning last_revision into v_revision;
    update public.daily_logs
      set deleted_at=clock_timestamp(),updated_at=clock_timestamp(),
          server_revision=v_revision,last_mutation_id=v_resolution,
          last_modified_by_device_id=v_device,server_changed_at=clock_timestamp()
      where user_id=v_user and id=v_existing.id;
    select to_jsonb(d) into v_record from public.daily_logs d
      where user_id=v_user and id=v_existing.id;
    insert into public.sync_changes(
      user_id,server_revision,entity_type,entity_id,operation,mutation_id,device_id,record
    ) values (v_user,v_revision,'daily_log',v_existing.id,'delete',v_resolution,v_device,v_record);

    update public.sync_user_state
      set last_revision=last_revision+1,updated_at=clock_timestamp()
      where user_id=v_user returning last_revision into v_revision;
    insert into public.daily_logs values (
      v_user,v_candidate_id,v_date,v_candidate->>'finalizeTimezone',
      coalesce(v_candidate->>'summary',''),v_candidate->'snapshot',
      (v_candidate->>'finalizedAt')::timestamptz,1,v_revision,v_resolution,v_device,
      (v_candidate->>'createdAt')::timestamptz,
      (v_candidate->>'updatedAt')::timestamptz,null,clock_timestamp()
    );
    select to_jsonb(d) into v_record from public.daily_logs d
      where user_id=v_user and id=v_candidate_id;
    insert into public.sync_changes(
      user_id,server_revision,entity_type,entity_id,operation,mutation_id,device_id,record
    ) values (v_user,v_revision,'daily_log',v_candidate_id,'create',v_resolution,v_device,v_record);
  else
    update public.sync_user_state
      set last_revision=last_revision+1,updated_at=clock_timestamp()
      where user_id=v_user returning last_revision into v_revision;
    update public.daily_logs set
      finalize_timezone=v_candidate->>'finalizeTimezone',
      summary=coalesce(v_candidate->>'summary',''),snapshot=v_candidate->'snapshot',
      finalized_at=(v_candidate->>'finalizedAt')::timestamptz,
      server_revision=v_revision,last_mutation_id=v_resolution,
      last_modified_by_device_id=v_device,
      created_at=(v_candidate->>'createdAt')::timestamptz,
      updated_at=(v_candidate->>'updatedAt')::timestamptz,
      deleted_at=null,server_changed_at=clock_timestamp()
      where user_id=v_user and id=v_candidate_id;
    select to_jsonb(d) into v_record from public.daily_logs d
      where user_id=v_user and id=v_candidate_id;
    insert into public.sync_changes(
      user_id,server_revision,entity_type,entity_id,operation,mutation_id,device_id,record
    ) values (v_user,v_revision,'daily_log',v_candidate_id,'update',v_resolution,v_device,v_record);
  end if;

  v_result := jsonb_build_object(
    'resolutionId',v_resolution,
    'officialEntityId',v_candidate_id,
    'highWatermark',v_revision
  );
  insert into public.sync_conflict_resolutions(
    user_id,resolution_id,device_id,conflict_type,request_hash,result
  ) values (v_user,v_resolution,v_device,'daily_log',v_hash,v_result);
  return v_result;
end;
$$;

revoke all on function public.resolve_daily_log_conflict_v1(jsonb) from public,anon;
grant execute on function public.resolve_daily_log_conflict_v1(jsonb) to authenticated;
