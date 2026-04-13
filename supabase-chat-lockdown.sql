-- Run this after deploying Edge Functions.
-- It keeps anonymous read access for the chat UI,
-- but removes anonymous write access so writes must go through Functions.

do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'chat_messages' and policyname = 'chat_messages_insert_anon'
  ) then
    drop policy chat_messages_insert_anon on public.chat_messages;
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'chat_read_state' and policyname = 'chat_read_state_insert_anon'
  ) then
    drop policy chat_read_state_insert_anon on public.chat_read_state;
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'chat_read_state' and policyname = 'chat_read_state_update_anon'
  ) then
    drop policy chat_read_state_update_anon on public.chat_read_state;
  end if;
end $$;

revoke insert, update, delete on public.chat_messages from anon, authenticated;
revoke insert, update, delete on public.chat_read_state from anon, authenticated;

do $$
declare
  p record;
begin
  for p in
    select policyname
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and cmd in ('INSERT', 'UPDATE', 'ALL')
      and (
        coalesce(qual, '') ilike '%chat-images%'
        or coalesce(with_check, '') ilike '%chat-images%'
        or coalesce(qual, '') ilike '%chat-audios%'
        or coalesce(with_check, '') ilike '%chat-audios%'
      )
  loop
    execute format('drop policy if exists %I on storage.objects', p.policyname);
  end loop;
end $$;

-- Optional sanity checks:
-- select schemaname, tablename, policyname, cmd from pg_policies where schemaname in ('public', 'storage') order by schemaname, tablename, policyname;
