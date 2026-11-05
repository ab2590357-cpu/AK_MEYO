-- A-X-HK worker liveness gate: private service_role RPC only.
create table if not exists public.axhk_channel_worker_status (
  id smallint primary key default 1 check (id = 1),
  last_seen_at timestamptz not null default now(),
  channel_jid text,
  verified boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.axhk_channel_worker_status enable row level security;
revoke all on public.axhk_channel_worker_status from public, anon, authenticated;
grant select, insert, update on public.axhk_channel_worker_status to service_role;

create or replace function public.axhk_record_worker_heartbeat(p_channel_jid text, p_verified boolean)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  if p_channel_jid is not null and p_channel_jid !~ '^[0-9]{10,30}@newsletter$'
  then raise exception 'Invalid Channel JID'; end if;
  insert into public.axhk_channel_worker_status(id,last_seen_at,updated_at,channel_jid,verified)
    values (1,now(),now(),p_channel_jid,coalesce(p_verified,false))
  on conflict (id) do update set last_seen_at=now(),updated_at=now(),
    channel_jid=excluded.channel_jid,verified=excluded.verified;
  return true;
end;
$$;

create or replace function public.axhk_worker_ready()
returns boolean language sql security invoker set search_path = '' as $$
  select exists (
    select 1 from public.axhk_channel_worker_status
    where id = 1 and last_seen_at > now() - interval '40 seconds'
      and verified = true and channel_jid ~ '^[0-9]{10,30}@newsletter$'
  );
$$;

revoke execute on function public.axhk_record_worker_heartbeat(text,boolean) from public,anon,authenticated;
revoke execute on function public.axhk_worker_ready() from public,anon,authenticated;
grant execute on function public.axhk_record_worker_heartbeat(text,boolean) to service_role;
grant execute on function public.axhk_worker_ready() to service_role;
