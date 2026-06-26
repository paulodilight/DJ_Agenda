-- Subscrições Web Push da app Apoio Técnico (Xclusive TS).
-- Os colaboradores acedem de forma anónima (sem Supabase Auth), por isso a
-- política permite INSERT/UPDATE/DELETE públicos. A leitura é feita apenas pela
-- Edge Function `send-push` com a service role (ignora RLS).

create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  app         text not null default 'apoiot',
  created_at  timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

-- Inserir / atualizar a própria subscrição (upsert por endpoint)
drop policy if exists push_subscriptions_insert on public.push_subscriptions;
create policy push_subscriptions_insert
  on public.push_subscriptions for insert
  to anon, authenticated
  with check (true);

drop policy if exists push_subscriptions_update on public.push_subscriptions;
create policy push_subscriptions_update
  on public.push_subscriptions for update
  to anon, authenticated
  using (true) with check (true);

-- Remover a subscrição ao desligar as notificações
drop policy if exists push_subscriptions_delete on public.push_subscriptions;
create policy push_subscriptions_delete
  on public.push_subscriptions for delete
  to anon, authenticated
  using (true);
