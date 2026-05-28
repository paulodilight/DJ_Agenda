-- ============================================================
-- MIGRAÇÃO 02 — Turnos por espaço + DJs fixos por dia
-- Corre no SQL Editor do Supabase
-- ============================================================

-- Turnos de actuação por espaço
-- Cada turno tem nome, valor, horário e dias da semana associados
create table turnos_espaco (
  id uuid primary key default uuid_generate_v4(),
  espaco_id uuid not null references espacos(id) on delete cascade,
  nome text not null,                    -- "1º Turno", "2º Turno", etc.
  valor numeric(10,2),                   -- valor do turno (override ao valor do DJ)
  hora_inicio time,                      -- ex: 17:00
  hora_fim time,                         -- ex: 21:00
  dias_semana int[] not null default '{}', -- [0=Dom, 1=Seg, 2=Ter, 3=Qua, 4=Qui, 5=Sex, 6=Sáb]
  ordem integer default 0,
  criado_em timestamptz default now()
);

alter table turnos_espaco enable row level security;
create policy "autenticados" on turnos_espaco for all using (auth.role() = 'authenticated');
create index idx_turnos_espaco on turnos_espaco(espaco_id);

-- DJ fixo por dia da semana para um espaço
-- dj_id = null significa "Automático" (motor decide)
create table djs_fixos_espaco (
  id uuid primary key default uuid_generate_v4(),
  espaco_id uuid not null references espacos(id) on delete cascade,
  dia_semana integer not null check (dia_semana between 0 and 6),
  dj_id uuid references djs(id) on delete set null,
  unique(espaco_id, dia_semana)
);

alter table djs_fixos_espaco enable row level security;
create policy "autenticados" on djs_fixos_espaco for all using (auth.role() = 'authenticated');
create index idx_djs_fixos_espaco on djs_fixos_espaco(espaco_id);
