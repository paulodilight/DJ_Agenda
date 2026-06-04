-- Assinatura de presença (GPS)
--   presencas_djs       → DJ numa data da agenda (assinada no perfil do DJ; signed_by 'manager'/'dj')
--   presencas_tecnicos  → Técnico num evento (assinada na app /apoiot; signed_by 'tecnico'/'manager')
-- Aplicada no projeto principal (jpfbucsstzewywdqmdxp).

create table if not exists public.presencas_djs (
  id uuid primary key default gen_random_uuid(),
  agenda_id uuid not null references public.agenda(id) on delete cascade,
  dj_id uuid references public.djs(id),
  signed_at timestamptz not null default now(),
  latitude numeric(10,7),
  longitude numeric(10,7),
  accuracy_m integer,
  signed_by text check (signed_by in ('dj','manager')) default 'manager',
  created_at timestamptz default now(),
  constraint presencas_djs_agenda_unique unique (agenda_id)
);

create table if not exists public.presencas_tecnicos (
  id uuid primary key default gen_random_uuid(),
  evento_id bigint not null references public.supa_eventos(id) on delete cascade,
  tecnico_id uuid references public.tecnicos(id),
  signed_at timestamptz not null default now(),
  latitude numeric(10,7),
  longitude numeric(10,7),
  accuracy_m integer,
  signed_by text check (signed_by in ('tecnico','manager')) default 'tecnico',
  created_at timestamptz default now(),
  constraint presencas_tecnicos_unique unique (evento_id, tecnico_id)
);

alter table public.presencas_djs enable row level security;
alter table public.presencas_tecnicos enable row level security;

-- RLS permissiva (anon + authenticated): a app dos colaboradores (/apoiot) usa a anon key
-- sem sessão Supabase. Alinhado com o padrão já usado em supa_eventos.
create policy presencas_djs_all on public.presencas_djs
  for all to anon, authenticated using (true) with check (true);
create policy presencas_tecnicos_all on public.presencas_tecnicos
  for all to anon, authenticated using (true) with check (true);
