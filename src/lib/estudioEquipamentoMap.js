// Liga o vocabulário usado no formulário de reservas de estúdio (config_precos /
// reserva-estudio.html) aos nomes reais das unidades físicas na tabela `equipamentos`
// (projeto Supabase principal, partilhado com o aluguer de material a DJs/eventos).
// Se um dia um `nome` em `equipamentos` mudar, só é preciso atualizar aqui.
export const ESTUDIO_EQUIPAMENTO_MAP = [
  { chave: 'CDJ-2000NXS2',          nomeCatalogo: 'Pioneer CDJ 2000 NXS2',   categoriaEstudio: 'player' },
  { chave: 'CDJ-3000',              nomeCatalogo: 'Pioneer CDJ-3000',        categoriaEstudio: 'player' },
  { chave: 'PLX-1000',              nomeCatalogo: 'Pioneer PLX 1000',        categoriaEstudio: 'player' },
  { chave: 'DJM-900NXS2',           nomeCatalogo: 'Pioneer DJM 900 NXS2',    categoriaEstudio: 'mesa' },
  { chave: 'Pioneer DJM-2000NXS',   nomeCatalogo: 'Pioneer DJM 2000 NXS2',   categoriaEstudio: 'mesa' },
  { chave: 'Ecler WARM 2',          nomeCatalogo: 'Mesa ECLER WARM 2',       categoriaEstudio: 'mesa' },
  { chave: 'RMX-1000',              nomeCatalogo: 'Pioneer RMX 1000',        categoriaEstudio: 'efeitos' },
  { chave: 'Pioneer RMX-Ignite',    nomeCatalogo: 'AlphaTheta RMX Ignite',   categoriaEstudio: 'efeitos' },
  { chave: 'A&H Xone 96',           nomeCatalogo: 'Allen & Heath XONE 96',   categoriaEstudio: 'mesa' },
  { chave: 'XDJ-RX3',               nomeCatalogo: 'Pioneer XDJ RX3',         categoriaEstudio: 'setup' },
  { chave: 'XDJ-Opus-Quad',         nomeCatalogo: 'Pioneer Opus Quad',       categoriaEstudio: 'setup' },
]

export function nomeCatalogoParaChave(nomeCatalogo) {
  return ESTUDIO_EQUIPAMENTO_MAP.find(m => m.nomeCatalogo === nomeCatalogo)?.chave ?? null
}
