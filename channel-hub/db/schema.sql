-- A-X-HK Channel Link Hub. Apply to a dedicated Supabase project.
-- This uses the service-role API on the server; the browser has no database credentials.
create extension if not exists pgcrypto;
create table if not exists public.axhk_channel_submissions (
  id uuid primary key default gen_random_uuid(),
  link text not null,
  kind text not null check (kind in ('group','channel')),
  actor_hash text not null,
  ip_hash text not null,
  receipt_hash text not null unique,
  status text not null default 'pending' check (status in ('pending','processing','posted','failed','rejected','needs_review')),
  attempts integer not null default 0,
  claim_token uuid,
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  posted_at timestamptz,
  message_id text,
  last_error text
);
create index if not exists axhk_submissions_actor_created_idx on public.axhk_channel_submissions(actor_hash,created_at desc);
create index if not exists axhk_submissions_ip_created_idx on public.axhk_channel_submissions(ip_hash,created_at desc);
create index if not exists axhk_submissions_queue_idx on public.axhk_channel_submissions(status,created_at);
alter table public.axhk_channel_submissions enable row level security;
revoke all on public.axhk_channel_submissions from anon, authenticated;
grant all on public.axhk_channel_submissions to service_role;

create or replace function public.axhk_submit_link(p_link text, p_kind text, p_actor_hash text, p_ip_hash text, p_receipt_hash text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  t timestamptz; n integer; x uuid;
begin
  if p_kind not in ('group','channel') or length(p_link) > 250 or length(p_actor_hash) <> 64
     or length(p_ip_hash) <> 64 or length(p_receipt_hash) <> 64 then
    raise exception 'Invalid submission';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_actor_hash));
  select max(created_at) into t from public.axhk_channel_submissions
    where actor_hash=p_actor_hash and created_at>now()-interval '24 hours';
  if t is not null then
    return jsonb_build_object('accepted',false,'error','24-hour cooldown active','nextAllowedAt',t+interval '24 hours');
  end if;
  select count(*) into n from public.axhk_channel_submissions where ip_hash=p_ip_hash and created_at>now()-interval '1 hour';
  if n>=10 then return jsonb_build_object('accepted',false,'error','Too many submissions from this network'); end if;
  select count(*) into n from public.axhk_channel_submissions where link=p_link and created_at>now()-interval '24 hours';
  if n>0 then return jsonb_build_object('accepted',false,'error','This link was already submitted recently'); end if;
  insert into public.axhk_channel_submissions(link,kind,actor_hash,ip_hash,receipt_hash)
    values (p_link,p_kind,p_actor_hash,p_ip_hash,p_receipt_hash) returning id into x;
  return jsonb_build_object('accepted',true,'id',x,'nextAllowedAt',now()+interval '24 hours');
end;
$$;

create or replace function public.axhk_claim_link()
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare x public.axhk_channel_submissions%rowtype;
begin
  -- A lost ACK after posting must not trigger duplicate automatic posts.
  update public.axhk_channel_submissions set status='needs_review', last_error='Claim timed out; manually check Channel before retry'
    where status='processing' and claimed_at < now()-interval '15 minutes';
  update public.axhk_channel_submissions set status='processing', claimed_at=now(),
       claim_token=gen_random_uuid(), attempts=attempts+1
    where id=(select id from public.axhk_channel_submissions where status='pending'
              order by created_at asc for update skip locked limit 1)
    returning * into x;
  if x.id is null then return null; end if;
  return jsonb_build_object('id',x.id,'link',x.link,'kind',x.kind,'claimToken',x.claim_token);
end;
$$;

create or replace function public.axhk_complete_link(p_id uuid, p_claim_token uuid, p_status text, p_message_id text, p_error text)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare count_updated integer;
begin
  if p_status not in ('posted','failed') then return false; end if;
  update public.axhk_channel_submissions
    set status=p_status, message_id=left(p_message_id,150), last_error=left(p_error,240),
        posted_at=case when p_status='posted' then now() else null end,
        claim_token=null
    where id=p_id and claim_token=p_claim_token and status='processing';
  get diagnostics count_updated=row_count;
  return count_updated=1;
end;
$$;

create or replace function public.axhk_admin_link_action(p_id uuid,p_action text)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare count_updated integer;
begin
  if p_action='retry' then
    update public.axhk_channel_submissions set status='pending',claim_token=null,claimed_at=null,last_error=null
      where id=p_id and status in ('failed','needs_review','rejected');
  elsif p_action='reject' then
    update public.axhk_channel_submissions set status='rejected',claim_token=null
      where id=p_id and status in ('pending','failed','needs_review');
  else return false; end if;
  get diagnostics count_updated=row_count;
  return count_updated=1;
end;
$$;

revoke all on function public.axhk_submit_link(text,text,text,text,text) from public, anon, authenticated;
revoke all on function public.axhk_claim_link() from public, anon, authenticated;
revoke all on function public.axhk_complete_link(uuid,uuid,text,text,text) from public, anon, authenticated;
revoke all on function public.axhk_admin_link_action(uuid,text) from public, anon, authenticated;
grant execute on function public.axhk_submit_link(text,text,text,text,text) to service_role;
grant execute on function public.axhk_claim_link() to service_role;
grant execute on function public.axhk_complete_link(uuid,uuid,text,text,text) to service_role;
grant execute on function public.axhk_admin_link_action(uuid,text) to service_role;
