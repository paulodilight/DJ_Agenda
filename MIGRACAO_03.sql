-- ============================================================
-- MIGRAÇÃO 03 — Renomear tiers + múltiplos tiers por DJ
-- Corre no SQL Editor do Supabase
-- ============================================================

-- 1. Renomear os 3 tiers existentes (preserva os IDs/nivéis actuais)
UPDATE tiers SET nome = 'Restauração' WHERE nivel = 1;
UPDATE tiers SET nome = 'Club'        WHERE nivel = 2;
UPDATE tiers SET nome = 'Festival'    WHERE nivel = 3;

-- 2. Adicionar os 2 novos tiers
INSERT INTO tiers (nivel, nome) VALUES (4, 'Evento'), (5, 'Evento Premium');

-- 3. Tabela de associação DJ ↔ múltiplos tiers (até 3)
CREATE TABLE dj_tiers (
  id       uuid    PRIMARY KEY DEFAULT uuid_generate_v4(),
  dj_id    uuid    NOT NULL REFERENCES djs(id) ON DELETE CASCADE,
  tier_id  integer NOT NULL REFERENCES tiers(id),
  UNIQUE(dj_id, tier_id)
);

ALTER TABLE dj_tiers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "autenticados" ON dj_tiers FOR ALL USING (auth.role() = 'authenticated');
CREATE INDEX idx_dj_tiers_dj ON dj_tiers(dj_id);

-- 4. Migrar tier_id existente para a nova tabela de associação
INSERT INTO dj_tiers (dj_id, tier_id)
SELECT id, tier_id FROM djs WHERE tier_id IS NOT NULL;
