-- Phase 3.2B acceptance fix: avoid SELECT FOR UPDATE followed by an UPSERT on
-- the same row. Use explicit INSERT versus UPDATE paths and real row counts.

create or replace function private.apply_entity_change_v2(
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
  v_row_count bigint;
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
  get diagnostics v_row_count = row_count;
  if v_operation = 'create' then
    if v_row_count <> 0 or v_base_revision is not null then
      raise exception using errcode = '40001', message = 'BaseServerRevisionConflict';
    end if;
    v_server_version := 1;
  else
    if v_row_count = 0 or v_base_revision is null or v_current_revision <> v_base_revision then
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
    if v_operation = 'create' then
      insert into public.tasks values (
        p_user_id,v_entity_id,v_snapshot->>'title',v_snapshot->>'notes',v_snapshot->>'status',v_snapshot->>'priority',
        nullif(v_snapshot->>'plannedDate','')::date,nullif(v_snapshot->>'dueAt','')::timestamptz,
        nullif(v_snapshot->>'projectId','')::uuid,nullif(v_snapshot->>'focusDate','')::date,
        nullif(v_snapshot->>'focusOrder','')::smallint,nullif(v_snapshot->>'completedAt','')::timestamptz,
        v_server_version,p_revision,p_mutation_id,p_device_id,(v_snapshot->>'createdAt')::timestamptz,
        (v_snapshot->>'updatedAt')::timestamptz,nullif(v_snapshot->>'deletedAt','')::timestamptz,clock_timestamp());
    else
      update public.tasks set
        title=v_snapshot->>'title',notes=v_snapshot->>'notes',status=v_snapshot->>'status',priority=v_snapshot->>'priority',
        planned_date=nullif(v_snapshot->>'plannedDate','')::date,due_at=nullif(v_snapshot->>'dueAt','')::timestamptz,
        project_id=nullif(v_snapshot->>'projectId','')::uuid,focus_date=nullif(v_snapshot->>'focusDate','')::date,
        focus_order=nullif(v_snapshot->>'focusOrder','')::smallint,completed_at=nullif(v_snapshot->>'completedAt','')::timestamptz,
        version=v_server_version,server_revision=p_revision,last_mutation_id=p_mutation_id,
        last_modified_by_device_id=p_device_id,updated_at=(v_snapshot->>'updatedAt')::timestamptz,
        deleted_at=nullif(v_snapshot->>'deletedAt','')::timestamptz,server_changed_at=clock_timestamp()
      where user_id=p_user_id and id=v_entity_id;
    end if;
  elsif v_type = 'waiting' then
    if v_operation = 'create' then
      insert into public.confirmations values (
        p_user_id,v_entity_id,v_snapshot->>'title',v_snapshot->>'notes',v_snapshot->>'status',v_snapshot->>'person',
        nullif(v_snapshot->>'projectId','')::uuid,nullif(v_snapshot->>'sourceTaskId','')::uuid,
        (v_snapshot->>'sentAt')::timestamptz,nullif(v_snapshot->>'followUpDate','')::date,
        nullif(v_snapshot->>'confirmedAt','')::timestamptz,nullif(v_snapshot->>'closedAt','')::timestamptz,
        v_server_version,p_revision,p_mutation_id,p_device_id,(v_snapshot->>'createdAt')::timestamptz,
        (v_snapshot->>'updatedAt')::timestamptz,nullif(v_snapshot->>'deletedAt','')::timestamptz,clock_timestamp());
    else
      update public.confirmations set
        title=v_snapshot->>'title',notes=v_snapshot->>'notes',status=v_snapshot->>'status',person=v_snapshot->>'person',
        project_id=nullif(v_snapshot->>'projectId','')::uuid,source_task_id=nullif(v_snapshot->>'sourceTaskId','')::uuid,
        sent_at=(v_snapshot->>'sentAt')::timestamptz,follow_up_date=nullif(v_snapshot->>'followUpDate','')::date,
        confirmed_at=nullif(v_snapshot->>'confirmedAt','')::timestamptz,closed_at=nullif(v_snapshot->>'closedAt','')::timestamptz,
        version=v_server_version,server_revision=p_revision,last_mutation_id=p_mutation_id,
        last_modified_by_device_id=p_device_id,updated_at=(v_snapshot->>'updatedAt')::timestamptz,
        deleted_at=nullif(v_snapshot->>'deletedAt','')::timestamptz,server_changed_at=clock_timestamp()
      where user_id=p_user_id and id=v_entity_id;
    end if;
  elsif v_type = 'memo' then
    if v_operation = 'create' then
      insert into public.memos values (
        p_user_id,v_entity_id,v_snapshot->>'content',coalesce((v_snapshot->>'pinned')::boolean,false),
        nullif(v_snapshot->>'projectId','')::uuid,v_server_version,p_revision,p_mutation_id,p_device_id,
        (v_snapshot->>'createdAt')::timestamptz,(v_snapshot->>'updatedAt')::timestamptz,
        nullif(v_snapshot->>'deletedAt','')::timestamptz,clock_timestamp());
    else
      update public.memos set
        content=v_snapshot->>'content',pinned=coalesce((v_snapshot->>'pinned')::boolean,false),
        project_id=nullif(v_snapshot->>'projectId','')::uuid,version=v_server_version,server_revision=p_revision,
        last_mutation_id=p_mutation_id,last_modified_by_device_id=p_device_id,
        updated_at=(v_snapshot->>'updatedAt')::timestamptz,deleted_at=nullif(v_snapshot->>'deletedAt','')::timestamptz,
        server_changed_at=clock_timestamp()
      where user_id=p_user_id and id=v_entity_id;
    end if;
  elsif v_type = 'routine' then
    if v_operation = 'create' then
      insert into public.routines values (
        p_user_id,v_entity_id,v_snapshot->>'title',v_snapshot->>'status',v_snapshot->'schedule',v_snapshot->>'timezone',
        (v_snapshot->>'sortOrder')::integer,v_server_version,p_revision,p_mutation_id,p_device_id,
        (v_snapshot->>'createdAt')::timestamptz,(v_snapshot->>'updatedAt')::timestamptz,
        nullif(v_snapshot->>'deletedAt','')::timestamptz,clock_timestamp());
    else
      update public.routines set
        title=v_snapshot->>'title',status=v_snapshot->>'status',schedule=v_snapshot->'schedule',timezone=v_snapshot->>'timezone',
        sort_order=(v_snapshot->>'sortOrder')::integer,version=v_server_version,server_revision=p_revision,
        last_mutation_id=p_mutation_id,last_modified_by_device_id=p_device_id,
        updated_at=(v_snapshot->>'updatedAt')::timestamptz,deleted_at=nullif(v_snapshot->>'deletedAt','')::timestamptz,
        server_changed_at=clock_timestamp()
      where user_id=p_user_id and id=v_entity_id;
    end if;
  elsif v_type = 'routine_log' then
    if v_operation = 'create' then
      insert into public.routine_logs values (
        p_user_id,v_entity_id,(v_snapshot->>'routineId')::uuid,(v_snapshot->>'date')::date,
        (v_snapshot->>'completedAt')::timestamptz,v_server_version,p_revision,p_mutation_id,p_device_id,
        (v_snapshot->>'createdAt')::timestamptz,(v_snapshot->>'updatedAt')::timestamptz,
        nullif(v_snapshot->>'deletedAt','')::timestamptz,clock_timestamp());
    else
      update public.routine_logs set
        routine_id=(v_snapshot->>'routineId')::uuid,date=(v_snapshot->>'date')::date,
        completed_at=(v_snapshot->>'completedAt')::timestamptz,version=v_server_version,server_revision=p_revision,
        last_mutation_id=p_mutation_id,last_modified_by_device_id=p_device_id,
        updated_at=(v_snapshot->>'updatedAt')::timestamptz,deleted_at=nullif(v_snapshot->>'deletedAt','')::timestamptz,
        server_changed_at=clock_timestamp()
      where user_id=p_user_id and id=v_entity_id;
    end if;
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
  perform pg_catalog.set_config('lock_timeout','10s',true);
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
    v_result := private.apply_entity_change_v2(v_user,v_mutation,v_device,v_change,v_revision);
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

revoke all on function private.apply_entity_change_v2(uuid,uuid,uuid,jsonb,bigint) from public,anon,authenticated;
