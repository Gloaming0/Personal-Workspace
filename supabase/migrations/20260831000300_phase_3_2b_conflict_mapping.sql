-- Phase 3.2B acceptance hardening: expose optimistic-concurrency failures as
-- HTTP 409 rather than PostgreSQL serialization failures. PostgREST retries
-- SQLSTATE 40001, which can otherwise turn a deterministic conflict into a
-- gateway timeout.

create or replace function private.apply_entity_change_checked_v1(
  p_user_id uuid, p_mutation_id uuid, p_device_id uuid, p_change jsonb, p_revision bigint
) returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  return private.apply_entity_change_v2(
    p_user_id, p_mutation_id, p_device_id, p_change, p_revision
  );
exception
  when serialization_failure then
    raise exception using errcode = 'PT409', message = 'BaseServerRevisionConflict';
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
    v_result := private.apply_entity_change_checked_v1(v_user,v_mutation,v_device,v_change,v_revision);
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
  if exists(select 1 from public.tasks where user_id=v_user)
    or exists(select 1 from public.confirmations where user_id=v_user)
    or exists(select 1 from public.memos where user_id=v_user)
    or exists(select 1 from public.routines where user_id=v_user)
    or exists(select 1 from public.routine_logs where user_id=v_user)
    or exists(select 1 from public.activities where user_id=v_user)
    or exists(select 1 from public.daily_logs where user_id=v_user)
    or exists(select 1 from public.sync_changes where user_id=v_user) then
    raise exception 'CloudWorkspaceNotEmpty';
  end if;
  insert into public.sync_user_state(user_id) values(v_user) on conflict do nothing;
  perform 1 from public.sync_user_state where user_id=v_user for update;
  for v_chunk in select payload from public.sync_bootstrap_chunks where user_id=v_user and bootstrap_id=p_bootstrap_id order by chunk_index loop
    if jsonb_typeof(v_chunk.payload->'changes')<>'array' then raise exception 'InvalidBootstrapChunk'; end if;
    for v_change in select value from jsonb_array_elements(v_chunk.payload->'changes') loop
      update public.sync_user_state set last_revision=last_revision+1,updated_at=clock_timestamp() where user_id=v_user returning last_revision into v_revision;
      v_result:=private.apply_entity_change_checked_v1(v_user,p_bootstrap_id,v_session.device_id,v_change,v_revision);
      v_results:=v_results||jsonb_build_array(v_result); v_count:=v_count+1;
    end loop;
  end loop;
  v_result:=jsonb_build_object('bootstrapId',p_bootstrap_id,'status','committed','entityCount',v_count,'entityResults',v_results,'highWatermark',coalesce(v_revision,0));
  update public.sync_bootstrap_sessions set status='committed',result=v_result,committed_at=clock_timestamp() where user_id=v_user and bootstrap_id=p_bootstrap_id;
  return v_result;
end;
$$;

revoke all on function private.apply_entity_change_checked_v1(uuid,uuid,uuid,jsonb,bigint) from public,anon,authenticated;
