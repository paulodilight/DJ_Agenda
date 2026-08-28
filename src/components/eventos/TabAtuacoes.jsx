import { useState, useEffect, useCallback } from 'react'
import { Plus, Link2, Unlink, UserRound, Clock, EuroIcon, Pencil } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { FormSlot } from '@/components/agenda/FormSlot'
import { clsx } from 'clsx'

const ESTADO_VARIANTE = {
  confirmado:        'confirmado',
  proposta:          'proposta',
  'pré-confirmado':  'proposta',
  aceite:            'proposta',
  presente:          'confirmado',
  faltou:            'cancelado',
  cancelado:         'cancelado',
  sem_efeito:        'cancelado',
}

function djNome(s) {
  return s.djs?.nome_artistico || s.djs?.nome || s.dj_nome || 'DJ Externo'
}

function SlotRow({ s, onEditar, onDesligar }) {
  return (
    <div className="flex items-center gap-3 bg-surface-2 rounded-lg px-4 py-3 border border-border">
      <div className="w-8 h-8 rounded-full bg-violet-500/10 border border-violet-500/20 flex items-center justify-center shrink-0">
        <UserRound size={14} className="text-violet-400/60" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-accent truncate">{djNome(s)}</p>
        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
          {s.hora_inicio && (
            <span className="text-[11px] text-accent-muted flex items-center gap-0.5">
              <Clock size={10} />
              {s.hora_inicio.slice(0, 5)}{s.hora_fim ? `–${s.hora_fim.slice(0, 5)}` : ''}
            </span>
          )}
          {(s.valor_total_cliente != null || s.valor != null) && (
            <span className="text-[11px] text-accent-muted flex items-center gap-0.5">
              <EuroIcon size={10} />{Number(s.valor_total_cliente ?? s.valor).toFixed(0)}€
            </span>
          )}
          {s.tipo_slot && (
            <span className="text-[10px] text-accent-subtle capitalize">{s.tipo_slot}</span>
          )}
        </div>
      </div>
      <Badge variante={ESTADO_VARIANTE[s.estado] ?? 'default'}>
        {s.estado}
      </Badge>
      <Button variante="ghost" tamanho="sm" onClick={() => onEditar(s)} title="Editar">
        <Pencil size={13} />
      </Button>
      <Button
        variante="ghost" tamanho="sm"
        className="text-accent-subtle hover:text-status-cancelado"
        onClick={() => onDesligar(s.id)}
        title="Desligar do evento"
      >
        <Unlink size={13} />
      </Button>
    </div>
  )
}

export function TabAtuacoes({ evento, onSlotsChange }) {
  const [slots, setSlots] = useState([])
  const [disponiveis, setDisponiveis] = useState([])
  const [loadingLink, setLoadingLink] = useState(null)
  const [modalDisp, setModalDisp] = useState(false)
  const [formSlotAberto, setFormSlotAberto] = useState(false)
  const [slotEditar, setSlotEditar] = useState(null)

  const carregar = useCallback(async () => {
    if (!evento?.id) return
    const { data } = await supabase
      .from('agenda')
      .select('*, djs!agenda_dj_id_fkey(nome_artistico, nome)')
      .eq('evento_id', evento.id)
      .order('hora_inicio')
    const resultado = data ?? []
    if (resultado.length > 0) {
      const { data: hext } = await supabase
        .from('agenda_horas_extra')
        .select('agenda_id, valor_total')
        .in('agenda_id', resultado.map(s => s.id))
        .eq('estado', 'validado')
      const extMap = {}
      for (const h of hext ?? []) extMap[h.agenda_id] = (extMap[h.agenda_id] ?? 0) + (h.valor_total ?? 0)
      for (const s of resultado) {
        s.valor_total_cliente = (Number(s.valor) || 0) + (Number(s.margem) || 0) + (Number(s.transporte) || 0) + (Number(s.extras) || 0) + (extMap[s.id] ?? 0)
      }
    }
    setSlots(resultado)
    onSlotsChange?.(resultado)
  }, [evento?.id, onSlotsChange])

  useEffect(() => { carregar() }, [carregar])

  const abrirDisp = async () => {
    if (!evento?.espaco_id || !evento?.data_evento) return
    const { data } = await supabase
      .from('agenda')
      .select('*, djs!agenda_dj_id_fkey(nome_artistico, nome)')
      .eq('espaco_id', evento.espaco_id)
      .eq('data', evento.data_evento)
      .is('evento_id', null)
      .order('hora_inicio')
    setDisponiveis(data ?? [])
    setModalDisp(true)
  }

  const ligar = async (slotId) => {
    setLoadingLink(slotId)
    try {
      await supabase.from('agenda').update({ evento_id: evento.id }).eq('id', slotId)
      setDisponiveis(prev => prev.filter(s => s.id !== slotId))
      await carregar()
    } finally {
      setLoadingLink(null)
    }
  }

  const desligar = async (slotId) => {
    await supabase.from('agenda').update({ evento_id: null }).eq('id', slotId)
    await carregar()
  }

  const abrirNovo = () => {
    setSlotEditar(null)
    setFormSlotAberto(true)
  }

  const abrirEditar = (s) => {
    setSlotEditar(s)
    setFormSlotAberto(true)
  }

  const aoGuardar = async () => {
    await carregar()
    setFormSlotAberto(false)
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-accent-muted">
          {slots.length} atuação{slots.length !== 1 ? 'ões' : ''} ligada{slots.length !== 1 ? 's' : ''}
        </span>
        <div className="flex gap-2">
          <Button variante="ghost" tamanho="sm" onClick={abrirDisp}>
            <Link2 size={13} /> Adicionar do dia
          </Button>
          <Button variante="primary" tamanho="sm" onClick={abrirNovo}>
            <Plus size={13} /> Novo DJ / Banda
          </Button>
        </div>
      </div>

      {/* Lista */}
      {slots.length === 0 ? (
        <p className="text-center text-xs text-accent-subtle py-8">
          Nenhuma atuação ligada a este evento.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {slots.map(s => (
            <SlotRow key={s.id} s={s} onEditar={abrirEditar} onDesligar={desligar} />
          ))}
        </div>
      )}

      {/* Modal "Adicionar do dia" */}
      {modalDisp && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => setModalDisp(false)}
        >
          <div
            className="bg-surface-1 rounded-xl border border-border shadow-xl w-full max-w-md mx-4 p-5"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-accent mb-3">
              Atuações do dia neste espaço
            </h3>
            {disponiveis.length === 0 ? (
              <p className="text-xs text-accent-muted py-4 text-center">
                Não há atuações disponíveis para ligar.
              </p>
            ) : (
              <div className="flex flex-col gap-2 max-h-72 overflow-y-auto">
                {disponiveis.map(s => (
                  <div
                    key={s.id}
                    className="flex items-center gap-3 bg-surface-2 rounded-lg px-3 py-2.5 border border-border"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-accent">{djNome(s)}</p>
                      {s.hora_inicio && (
                        <p className="text-[11px] text-accent-muted">
                          {s.hora_inicio.slice(0, 5)}{s.hora_fim ? `–${s.hora_fim.slice(0, 5)}` : ''}
                          {s.valor != null ? ` · ${Number(s.valor).toFixed(0)}€` : ''}
                        </p>
                      )}
                    </div>
                    <Button
                      variante="primary" tamanho="sm"
                      loading={loadingLink === s.id}
                      onClick={() => ligar(s.id)}
                    >
                      <Link2 size={12} /> Ligar
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-4 flex justify-end">
              <Button variante="ghost" tamanho="sm" onClick={() => setModalDisp(false)}>
                Fechar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* FormSlot */}
      <FormSlot
        aberto={formSlotAberto}
        onFechar={() => setFormSlotAberto(false)}
        slot={slotEditar}
        eventoId={evento?.id}
        defaultEspacoId={evento?.espaco_id}
        defaultData={evento?.data_evento}
        defaultEvento={evento?.evento}
        onGuardado={aoGuardar}
      />
    </div>
  )
}
