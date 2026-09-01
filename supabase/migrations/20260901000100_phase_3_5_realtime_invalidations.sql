-- Phase 3.5: content-free Realtime wake-ups. Realtime is an optimization;
-- pull_sync_changes_v1 remains the correctness boundary.

create table if not exists public.sync_invalidations (
  user_id uuid not null,
  server_revision bigint not null check (server_revision > 0),
  mutation_id uuid not null,
  changed_at timestamptz not null default clock_timestamp(),
  primary key (user_id, server_revision)
);

alter table public.sync_invalidations enable row level security;
revoke all on public.sync_invalidations from anon, authenticated;
grant select on public.sync_invalidations to authenticated;

drop policy if exists sync_invalidations_owner_select
  on public.sync_invalidations;
create policy sync_invalidations_owner_select
  on public.sync_invalidations
  for select to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create or replace function private.publish_sync_invalidation_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.sync_invalidations(
    user_id,
    server_revision,
    mutation_id,
    changed_at
  ) values (
    new.user_id,
    new.server_revision,
    new.mutation_id,
    new.server_changed_at
  ) on conflict (user_id, server_revision) do nothing;
  return new;
end;
$$;

drop trigger if exists sync_changes_publish_invalidation
  on public.sync_changes;
create trigger sync_changes_publish_invalidation
after insert on public.sync_changes
for each row execute function private.publish_sync_invalidation_v1();

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'sync_invalidations'
  ) then
    alter publication supabase_realtime add table public.sync_invalidations;
  end if;
end;
$$;
