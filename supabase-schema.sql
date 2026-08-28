-- FreeChat / Conversa — schema seguro e idempotente
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null check (char_length(trim(nickname)) between 2 and 30),
  avatar text,
  online boolean not null default false,
  available boolean not null default true,
  last_seen timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.waiting_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'waiting' check (status in ('waiting','matched','cancelled')),
  created_at timestamptz not null default now()
);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'active' check (status in ('active','ended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.conversation_members (
  conversation_id uuid references public.conversations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  last_read_at timestamptz,
  primary key (conversation_id,user_id)
);

create table if not exists public.messages (
  id bigint generated always as identity primary key,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  content text not null check (char_length(trim(content)) between 1 and 2000),
  created_at timestamptz not null default now(),
  read boolean not null default false
);

create table if not exists public.blocked_users (
  blocker_id uuid references auth.users(id) on delete cascade,
  blocked_id uuid references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(blocker_id,blocked_id),
  check(blocker_id<>blocked_id)
);

create table if not exists public.reports (
  id bigint generated always as identity primary key,
  conversation_id uuid references public.conversations(id) on delete set null,
  reporter_id uuid references auth.users(id) on delete cascade,
  reported_user_id uuid references auth.users(id) on delete cascade,
  reason text not null check (char_length(trim(reason)) between 1 and 500),
  created_at timestamptz not null default now(),
  status text not null default 'open'
);

create index if not exists profiles_presence_idx on public.profiles(online,available,last_seen desc);
create index if not exists messages_conversation_created_idx on public.messages(conversation_id,created_at);
create index if not exists conversation_members_user_idx on public.conversation_members(user_id);
create index if not exists waiting_users_status_created_idx on public.waiting_users(status,created_at);

alter table public.profiles enable row level security;
alter table public.waiting_users enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.blocked_users enable row level security;
alter table public.reports enable row level security;

-- Recria políticas para tornar o script seguro ao ser executado novamente.
drop policy if exists profiles_select_online on public.profiles;
create policy profiles_select_online on public.profiles for select to authenticated
using (id=auth.uid() or (online=true and available=true and last_seen > now() - interval '65 seconds'));

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles for insert to authenticated
with check(id=auth.uid());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update to authenticated
using(id=auth.uid()) with check(id=auth.uid());

drop policy if exists members_select_own on public.conversation_members;
create policy members_select_own on public.conversation_members for select to authenticated
using(user_id=auth.uid());

drop policy if exists conversations_select_member on public.conversations;
create policy conversations_select_member on public.conversations for select to authenticated
using(exists(select 1 from public.conversation_members cm where cm.conversation_id=id and cm.user_id=auth.uid()));

drop policy if exists messages_select_member on public.messages;
create policy messages_select_member on public.messages for select to authenticated
using(exists(select 1 from public.conversation_members cm join public.conversations c on c.id=cm.conversation_id where cm.conversation_id=conversation_id and cm.user_id=auth.uid()));

drop policy if exists messages_insert_member on public.messages;
create policy messages_insert_member on public.messages for insert to authenticated
with check(sender_id=auth.uid() and exists(select 1 from public.conversation_members cm join public.conversations c on c.id=cm.conversation_id where cm.conversation_id=conversation_id and cm.user_id=auth.uid() and c.status='active'));

drop policy if exists blocked_own on public.blocked_users;
create policy blocked_own on public.blocked_users for all to authenticated
using(blocker_id=auth.uid()) with check(blocker_id=auth.uid());

drop policy if exists reports_insert_own on public.reports;
create policy reports_insert_own on public.reports for insert to authenticated
with check(reporter_id=auth.uid());

-- Evita ambiguidade e valida os dois participantes.
create or replace function public.start_direct_conversation(other_user uuid)
returns uuid language plpgsql security definer set search_path=public
as $$
declare cid uuid; other_online boolean; other_available boolean; other_seen timestamptz;
begin
  if auth.uid() is null or other_user is null or other_user=auth.uid() then raise exception 'Usuário inválido'; end if;
  if not exists(select 1 from auth.users where id=other_user) then raise exception 'Usuário não encontrado'; end if;
  if exists(select 1 from blocked_users where (blocker_id=auth.uid() and blocked_id=other_user) or (blocker_id=other_user and blocked_id=auth.uid())) then raise exception 'Não foi possível iniciar esta conversa'; end if;

  select p.online,p.available,p.last_seen into other_online,other_available,other_seen from profiles p where p.id=other_user;
  if other_online is distinct from true or other_available is distinct from true or other_seen <= now() - interval '65 seconds' then raise exception 'Esta pessoa já não está disponível'; end if;

  select cm1.conversation_id into cid
  from conversation_members cm1 join conversation_members cm2 on cm2.conversation_id=cm1.conversation_id
  join conversations c on c.id=cm1.conversation_id
  where cm1.user_id=auth.uid() and cm2.user_id=other_user and c.status='active' limit 1;
  if cid is null then
    insert into conversations default values returning id into cid;
    insert into conversation_members(conversation_id,user_id) values(cid,auth.uid()),(cid,other_user);
  end if;
  return cid;
end $$;

create or replace function public.find_random_match()
returns uuid language plpgsql security definer set search_path=public
as $$
declare partner uuid; cid uuid;
begin
  if auth.uid() is null then raise exception 'Não autenticado'; end if;
  if not exists(select 1 from profiles where id=auth.uid() and online=true and available=true and last_seen > now()-interval '65 seconds') then raise exception 'Ative a disponibilidade para procurar alguém'; end if;

  delete from waiting_users where status<>'waiting' or created_at < now()-interval '2 minutes';
  insert into waiting_users(user_id,status,created_at) values(auth.uid(),'waiting',now())
  on conflict(user_id) do update set status='waiting',created_at=now();

  select w.user_id into partner
  from waiting_users w join profiles p on p.id=w.user_id
  where w.status='waiting' and w.user_id<>auth.uid() and p.online=true and p.available=true and p.last_seen > now()-interval '65 seconds'
    and not exists(select 1 from blocked_users b where (b.blocker_id=auth.uid() and b.blocked_id=w.user_id) or (b.blocker_id=w.user_id and b.blocked_id=auth.uid()))
  order by w.created_at for update skip locked limit 1;

  if partner is null then return null; end if;
  select start_direct_conversation(partner) into cid;
  update waiting_users set status='matched' where user_id in(auth.uid(),partner);
  return cid;
end $$;

create or replace function public.cancel_waiting()
returns void language sql security definer set search_path=public
as $$ update waiting_users set status='cancelled' where user_id=auth.uid() and status='waiting'; $$;

create or replace function public.mark_conversation_read(p_conversation_id uuid)
returns void language sql security definer set search_path=public
as $$
update conversation_members set last_read_at=now() where conversation_id=p_conversation_id and user_id=auth.uid();
update messages set read=true where conversation_id=p_conversation_id and sender_id<>auth.uid() and read=false
and exists(select 1 from conversation_members where conversation_id=p_conversation_id and user_id=auth.uid());
$$;

create or replace function public.leave_conversation(p_conversation_id uuid)
returns void language plpgsql security definer set search_path=public
as $$
begin
  if not exists(select 1 from conversation_members where conversation_id=p_conversation_id and user_id=auth.uid()) then raise exception 'Conversa não encontrada'; end if;
  update conversations set status='ended',updated_at=now() where id=p_conversation_id;
end $$;

create or replace function public.conversation_partner(p_conversation_id uuid)
returns table(nickname text, online boolean) language sql security definer set search_path=public
as $$
select p.nickname,(p.online=true and p.last_seen > now()-interval '65 seconds')
from conversation_members cm join profiles p on p.id=cm.user_id
where cm.conversation_id=p_conversation_id and cm.user_id<>auth.uid()
and exists(select 1 from conversation_members mine where mine.conversation_id=p_conversation_id and mine.user_id=auth.uid()) limit 1;
$$;

create or replace function public.my_conversations()
returns table(conversation_id uuid,nickname text,last_message text,updated_at timestamptz,unread_count bigint)
language sql security definer set search_path=public
as $$
select c.id,p.nickname,
 (select m.content from messages m where m.conversation_id=c.id order by m.created_at desc limit 1), c.updated_at,
 (select count(*) from messages m join conversation_members me2 on me2.conversation_id=c.id and me2.user_id=auth.uid()
  where m.conversation_id=c.id and m.sender_id<>auth.uid() and m.created_at>coalesce(me2.last_read_at,'epoch'))
from conversations c join conversation_members mine on mine.conversation_id=c.id and mine.user_id=auth.uid()
join conversation_members other on other.conversation_id=c.id and other.user_id<>auth.uid()
join profiles p on p.id=other.user_id order by c.updated_at desc;
$$;

create or replace function public.block_conversation_partner(p_conversation_id uuid)
returns void language plpgsql security definer set search_path=public
as $$
declare other uuid;
begin
  if not exists(select 1 from conversation_members where conversation_id=p_conversation_id and user_id=auth.uid()) then raise exception 'Conversa não encontrada'; end if;
  select user_id into other from conversation_members where conversation_id=p_conversation_id and user_id<>auth.uid() limit 1;
  if other is not null then insert into blocked_users(blocker_id,blocked_id) values(auth.uid(),other) on conflict do nothing; end if;
end $$;

create or replace function public.report_conversation_partner(p_conversation_id uuid,p_reason text)
returns void language plpgsql security definer set search_path=public
as $$
declare other uuid;
begin
  if not exists(select 1 from conversation_members where conversation_id=p_conversation_id and user_id=auth.uid()) then raise exception 'Conversa não encontrada'; end if;
  if char_length(trim(coalesce(p_reason,'')))=0 then raise exception 'Informe um motivo'; end if;
  select user_id into other from conversation_members where conversation_id=p_conversation_id and user_id<>auth.uid() limit 1;
  insert into reports(conversation_id,reporter_id,reported_user_id,reason) values(p_conversation_id,auth.uid(),other,left(trim(p_reason),500));
end $$;

create or replace function public.touch_conversation()
returns trigger language plpgsql security definer set search_path=public
as $$ begin update conversations set updated_at=new.created_at where id=new.conversation_id; return new; end $$;
drop trigger if exists messages_touch_conversation on public.messages;
create trigger messages_touch_conversation after insert on public.messages for each row execute function public.touch_conversation();

-- Funções RPC usadas pelo frontend não ficam executáveis anon/publicamente.
revoke execute on function public.start_direct_conversation(uuid) from public, anon;
revoke execute on function public.find_random_match() from public, anon;
revoke execute on function public.cancel_waiting() from public, anon;
revoke execute on function public.mark_conversation_read(uuid) from public, anon;
revoke execute on function public.leave_conversation(uuid) from public, anon;
revoke execute on function public.conversation_partner(uuid) from public, anon;
revoke execute on function public.my_conversations() from public, anon;
revoke execute on function public.block_conversation_partner(uuid) from public, anon;
revoke execute on function public.report_conversation_partner(uuid,text) from public, anon;
grant execute on function public.start_direct_conversation(uuid) to authenticated;
grant execute on function public.find_random_match() to authenticated;
grant execute on function public.cancel_waiting() to authenticated;
grant execute on function public.mark_conversation_read(uuid) to authenticated;
grant execute on function public.leave_conversation(uuid) to authenticated;
grant execute on function public.conversation_partner(uuid) to authenticated;
grant execute on function public.my_conversations() to authenticated;
grant execute on function public.block_conversation_partner(uuid) to authenticated;
grant execute on function public.report_conversation_partner(uuid,text) to authenticated;

-- Realtime: adiciona as tabelas somente se ainda não estiverem na publicação.
do $$
begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='messages') then
    alter publication supabase_realtime add table public.messages;
  end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='profiles') then
    alter publication supabase_realtime add table public.profiles;
  end if;
end $$;
