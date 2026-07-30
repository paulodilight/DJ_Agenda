import { useState, useEffect, useCallback } from 'react'
import { AlertTriangle, Plus, Clock, CheckCircle, AlertCircle } from 'lucide-react'
import { clsx } from 'clsx'
import { supabase } from '@/lib/supabase'
import { useColaboradorStore } from '@/store'
import { OcorrenciaDetalhe } from '@/components/ocorrencias/OcorrenciaDetalhe'
import { ModalNovaOcorrencia } from '@/components/ocorrencias/ModalNovaOcorrencia'
import { LoadingPage } from '@/components/ui/LoadingSpinner'

const STATUS_CFG = {
  aberta:      { label: 'Aberta',      Ic: AlertCircle,  cls: 'text-red-400 bg-red-400/10 border-red-400/30' },
  em_processo: { label: 'Em processo', Ic: Clock,         cls: 'text-amber-400 bg-amber-400/10 border-amber-400/30' },
  fechada:     { label: 'Fechada',     Ic: CheckCircle,   cls: 'text-green-400 bg-green-400/10 border-green-400/30' },
}

const FILTROS = [
  { id: 'abertas_em_processo', label: 'Abertas/Em Processo' },
  { id: 'fechada',             label: 'Fechadas' },
  { id: 'todas',               label: 'Todas' },
]

export function ColaboradorOcorrencias() {
  const { colaborador } = useColaboradorStore()
  const [ocorrencias,   setOcorrencias]  = useState([])
  const [intervIdx,     setIntervIdx]    = useState({})
  const [loading,       setLoading]      = useState(true)
  const [filtro,        setFiltro]       = useState('abertas_em_processo')
  const [aberta,        setAberta]       = useState(null)
  const [modalNova,     setModalNova]    = useState(false)
  const [versao,        setVersao]       = useState(0)
  const [espacos,       setEspacos]      = useState([])

  useEffect(() => {
    supabase.from('espacos').select('id, nome').eq('activo', true).order('nome')
      .then(({ data }) => setEspacos(data ?? []))
  }, [])

  const carregar = useCallback(async () => {
    setLoading(true)
    const { data: ocs } = await supabase
      .from('ocorrencias')
      .select('*, espacos(nome)')
      .order('created_at', { ascending: false })

    const ids = (ocs ?? []).map(o => o.id)
    let ivIdx = {}
    if (ids.length > 0) {
      const { data: ivs } = await supabase
        .from('ocorrencias_intervencoes')
        .select('*')
        .in('ocorrencia_id', ids)
        .order('created_at', { ascending: true })
      ;(ivs ?? []).forEach(iv => {
        if (!ivIdx[iv.ocorrencia_id]) ivIdx[iv.ocorrencia_id] = []
        ivIdx[iv.ocorrencia_id].push(iv)
      })
    }
    setOcorrencias(ocs ?? [])
    setIntervIdx(ivIdx)
    setLoading(false)
  }, [versao])

  useEffect(() => { carregar() }, [carregar])

  const atualizar = () => {
    setVersao(v => v + 1)
    if (aberta) {
      // re-fetch a ocorrência aberta
      supabase.from('ocorrencias').select('*, espacos(nome)').eq('id', aberta.id).single()
        .then(({ data }) => data && setAberta(data))
    }
  }

  const lista = filtro === 'todas'
    ? ocorrencias
    : filtro === 'abertas_em_processo'
      ? ocorrencias.filter(o => o.status === 'aberta' || o.status === 'em_processo')
      : ocorrencias.filter(o => o.status === filtro)

  if (loading) return <LoadingPage />

  return (
    <div className="flex flex-col h-full">

      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-border/40">
        <div className="flex items-center gap-2">
          <AlertTriangle size={16} className="text-amber-400" />
          <span className="text-[15px] font-bold text-accent">Ocorrências</span>
          {ocorrencias.filter(o => o.status !== 'fechada').length > 0 && (
            <span className="text-[10px] font-bold bg-red-400/15 border border-red-400/30 text-red-400 rounded-full px-2 py-0.5">
              {ocorrencias.filter(o => o.status !== 'fechada').length}
            </span>
          )}
        </div>
        <button onClick={() => setModalNova(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-amber-400/30 bg-amber-400/10 text-amber-400 text-[12px] font-semibold hover:bg-amber-400/20 transition-colors">
          <Plus size={13} />
          Nova
        </button>
      </div>

      {/* Filtros */}
      <div className="shrink-0 flex gap-1.5 px-4 py-2 border-b border-border/30 overflow-x-auto">
        {FILTROS.map(f => (
          <button key={f.id} onClick={() => setFiltro(f.id)}
            className={clsx(
              'px-3 py-1 rounded-full border text-[11px] font-semibold shrink-0 transition-colors',
              filtro === f.id
                ? 'bg-amber-400/15 border-amber-400/30 text-amber-400'
                : 'bg-surface-2/60 border-border/60 text-accent-subtle hover:text-accent',
            )}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Lista */}
      <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-2">
        {lista.length === 0
          ? <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <AlertTriangle size={32} className="text-accent-subtle/20" />
              <p className="text-[13px] text-accent-subtle/50">Sem ocorrências.</p>
            </div>
          : lista.map(oc => {
              const cfg = STATUS_CFG[oc.status] ?? STATUS_CFG.aberta
              const Ic  = cfg.Ic
              const nIv = (intervIdx[oc.id] ?? []).length
              return (
                <button key={oc.id} onClick={() => setAberta(oc)}
                  className="w-full text-left rounded-xl border border-border/60 bg-surface-1 hover:border-white/15 active:scale-[0.99] transition-all px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[13px] font-bold text-accent leading-snug">{oc.titulo}</p>
                    <span className={clsx('shrink-0 inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border', cfg.cls)}>
                      <Ic size={9} />{cfg.label}
                    </span>
                  </div>
                  {oc.descricao && (
                    <p className="text-[11px] text-accent-muted mt-0.5 line-clamp-1">{oc.descricao}</p>
                  )}
                  <div className="flex items-center gap-2 mt-1.5 text-[10px] text-accent-subtle/60">
                    <span>{oc.data_ocorrencia}</span>
                    {oc.espacos?.nome && <><span>·</span><span>{oc.espacos.nome}</span></>}
                    {nIv > 0 && <><span>·</span><span>{nIv} intervenção{nIv !== 1 ? 'ões' : ''}</span></>}
                  </div>
                </button>
              )
            })
        }
      </div>

      {aberta && (
        <OcorrenciaDetalhe
          ocorrencia={aberta}
          intervencoes={intervIdx[aberta.id] ?? []}
          nomeUtilizador={colaborador?.nome ?? 'Técnico'}
          tipoUtilizador="tecnico"
          onFechar={() => setAberta(null)}
          onAtualizar={atualizar}
        />
      )}

      {modalNova && (
        <ModalNovaOcorrencia
          nomeUtilizador={colaborador?.nome ?? 'Técnico'}
          tipoUtilizador="tecnico"
          espacos={espacos}
          onFechar={() => setModalNova(false)}
          onCriada={() => setVersao(v => v + 1)}
        />
      )}
    </div>
  )
}
