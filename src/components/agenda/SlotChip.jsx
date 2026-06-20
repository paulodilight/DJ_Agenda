import { clsx } from 'clsx'
import { useDraggable } from '@dnd-kit/core'
import { Sparkles, Star, Check } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

function PagamentoBtn({ cor }) {
  const navigate = useNavigate()
  return (
    <button
      onClick={(e) => { e.stopPropagation(); navigate('/pagamentos') }}
      title="Ver pagamentos"
      className={clsx('absolute bottom-0.5 left-1 text-[9px] font-bold leading-none hover:scale-125 transition-transform', cor)}
    >
      €
    </button>
  )
}

export function SlotChip({ slot, isLock, onClick, onClickVazio, onSugerir, onToggleDestaque, onConfirmar, dimmed = false, dragId, dragData, conflito = false, motivoConflito = null }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: dragId ?? 'chip-empty',
    disabled: !dragId,
    data: dragData,
  })

  // ── Célula vazia ───────────────────────────────────────────────────────────
  if (!slot) {
    return (
      <button
        onClick={onClickVazio}
        className={clsx(
          'w-full px-2 py-1 rounded border border-dashed min-h-[34px] flex items-center justify-center transition-colors',
          dimmed
            ? 'border-surface-4/15 bg-black/[0.35] text-white/[0.07] hover:text-white/20 hover:border-surface-4/40'
            : 'border-surface-4 bg-surface-2 text-accent-subtle/40 hover:text-accent-subtle hover:border-border'
        )}
      >
        +
      </button>
    )
  }

  // Slot completamente vazio após reset — aparece como célula "+"
  if (!slot.dj_id && !slot.dj_nome && !slot.estado) {
    return (
      <button
        onClick={(e) => { if (!isDragging) onClick?.(e) }}
        className={clsx(
          'w-full px-2 py-1 rounded border border-dashed min-h-[34px] flex items-center justify-center transition-colors',
          dimmed
            ? 'border-surface-4/15 bg-black/[0.35] text-white/[0.07] hover:text-white/20 hover:border-surface-4/40'
            : 'border-surface-4 bg-surface-2 text-accent-subtle/40 hover:text-accent-subtle hover:border-border'
        )}
      >
        +
      </button>
    )
  }

  const temDJ         = !!slot.dj_nome
  const isManual      = temDJ && !slot.dj_id
  const estado        = slot.estado
  const GOLD_ESTADOS       = ['aceitação', 'pré-confirmado']
  const isGold             = !!slot.is_premium && GOLD_ESTADOS.includes(estado)
  const isGoldConfirmado   = !!slot.is_premium && (estado === 'confirmado' || estado === 'presente')
  const isSemEfeito        = estado === 'sem_efeito'
  const isAPedido          = estado === 'a_pedido'
  const isProposta         = estado === 'proposta'
  const isAceitacao        = estado === 'aceitação'
  const isAlterar          = estado === 'alterar'
  const isValidacao        = estado === 'validação'
  const isAceite           = estado === 'aceite'
  const isPreConf          = estado === 'pré-confirmado'
  const isAddAgenda        = estado === 'add_agenda'
  const isTrocado          = estado === 'trocado'
  const isCancelado        = estado === 'cancelado' || estado === 'faltou'
  const isManualConfirmado = isManual && (estado === 'confirmado' || estado === 'presente')
  const isDestaque         = !!slot.marketing_destaque

  // ── Slot com ou sem DJ ─────────────────────────────────────────────────────
  const chip = (
    <button
      ref={setNodeRef}
      {...(dragId ? listeners : {})}
      {...(dragId ? attributes : {})}
      onClick={(e) => { if (!isDragging) onClick?.(e) }}
      className={clsx(
        'w-full text-center px-2 py-1 rounded border transition-colors min-h-[34px] flex items-center justify-center',
        dragId && 'cursor-grab active:cursor-grabbing',
        isDragging && 'opacity-30',
        // Padding esquerdo para estrela
        onToggleDestaque && !isSemEfeito && !isLock && 'pl-5',
        // Padding direito para Sparkles
        onSugerir && !isSemEfeito && !isLock && 'pr-5',
        conflito
          ? 'border-red-500/60 bg-red-500/15 hover:bg-red-500/25'
          : isSemEfeito
            ? 'border-white/[0.07] border-dashed bg-surface-1/50 hover:bg-surface-2'
            : isAPedido
              ? 'border-violet-400/50 bg-status-confirmado/[0.10] hover:bg-status-confirmado/20'
              : isLock
                ? 'border-status-lock/35 bg-status-lock/[0.13] hover:bg-status-lock/20'
                : isGold && estado === 'aceitação'
                  ? 'border-gold-400/40 bg-gold-400/[0.13] hover:bg-gold-400/20'
                  : isGold
                    ? 'border-gold-300/45 bg-gold-300/[0.15] hover:bg-gold-300/22'
                    : isGoldConfirmado
                      ? 'border-gold-400/60 bg-status-confirmado/[0.13] hover:bg-status-confirmado/22'
                      : isAlterar
                        ? 'border-rose-400/40 bg-rose-500/[0.15] hover:bg-rose-500/25'
                        : isProposta
                          ? 'border-status-proposta/40 bg-status-proposta/[0.17] hover:bg-status-proposta/25'
                          : isAceitacao
                            ? 'border-orange-400/40 bg-orange-500/[0.15] hover:bg-orange-500/25'
                            : isAceite
                              ? 'border-teal-400/40 bg-teal-500/[0.15] hover:bg-teal-500/25'
                            : isValidacao
                              ? 'border-amber-400/40 bg-amber-500/[0.15] hover:bg-amber-500/25'
                              : isPreConf
                                ? 'border-sky-400/40 bg-sky-500/[0.15] hover:bg-sky-500/25'
                                : isAddAgenda
                                  ? 'border-indigo-400/40 bg-indigo-500/[0.15] hover:bg-indigo-500/25'
                                : isTrocado
                                  ? 'border-[#fc03c6]/30 bg-[#fc03c6]/[0.10] hover:bg-[#fc03c6]/15'
                                  : isCancelado
                                    ? 'border-red-500/40 bg-red-500/[0.13] hover:bg-red-500/20'
                                    : isManualConfirmado
                                      ? 'border-gold-400/60 bg-status-confirmado/[0.13] hover:bg-status-confirmado/22'
                                      : isManual
                                        ? 'border-yellow-400/35 bg-yellow-400/[0.11] hover:bg-yellow-400/20'
                                        : temDJ
                                          ? 'border-status-confirmado/35 bg-status-confirmado/[0.13] hover:bg-status-confirmado/20'
                                          : 'border-violet-400/35 bg-violet-400/[0.13] hover:bg-violet-400/20'
      )}
    >
      <span className={clsx(
        'text-xs truncate flex flex-col items-center leading-tight w-full',
        conflito           ? 'font-semibold text-red-400'             :
        isAPedido          ? 'font-semibold text-violet-400'          :
        isLock             ? 'font-semibold text-status-lock'         :
        isGold && estado === 'aceitação' ? 'font-semibold text-gold-400' :
        isGold             ? 'font-semibold text-gold-300'            :
        isGoldConfirmado   ? 'font-semibold text-status-confirmado'   :
        isAlterar          ? 'font-semibold text-rose-400'            :
        isProposta         ? 'font-semibold text-status-proposta'     :
        isAceitacao        ? 'font-semibold text-orange-400'          :
        isAceite           ? 'font-semibold text-teal-400'            :
        isValidacao        ? 'font-semibold text-amber-400'           :
        isPreConf          ? 'font-semibold text-sky-400'             :
        isAddAgenda        ? 'font-semibold text-indigo-400'          :
        isTrocado          ? 'font-semibold text-[#fc03c6]'           :
        isCancelado        ? 'font-semibold text-red-400'             :
        isManualConfirmado ? 'font-semibold text-status-confirmado'   :
        isManual           ? 'font-semibold text-yellow-300'          :
        temDJ              ? 'font-semibold text-status-confirmado'   :
                             'italic text-violet-400'
      )}>
        <span className="truncate w-full text-center">
          {isSemEfeito
            ? (temDJ ? <s>{slot.dj_nome}</s> : 'Sem Efeito')
            : (isLock ? 'LOCK' : temDJ ? slot.dj_nome : 'Sem DJ')
          }
        </span>
        {conflito && motivoConflito && (
          <span className="text-[10px] font-normal text-red-400/80 truncate w-full text-center leading-none mt-0.5">
            {motivoConflito}
          </span>
        )}
      </span>
    </button>
  )

  const temAccoes = (onSugerir || onToggleDestaque) && !isSemEfeito && !isLock && temDJ
  const temConfirmar = !!onConfirmar && (estado === 'proposta' || estado === 'aceite' || estado === 'pré-confirmado')
  const estadoPag = slot.estado_pagamento
  const corPag = estadoPag === 'a_pagamento' ? 'text-amber-400' : estadoPag === 'pago' ? 'text-green-400' : null
  const temPagamento = !!corPag

  if (!temAccoes && !temConfirmar && !temPagamento) return chip

  return (
    <div className="relative group/chip" style={!temAccoes && !temConfirmar ? { isolation: 'isolate' } : undefined}>
      {chip}
      <div className="absolute top-0.5 left-0.5 flex items-center gap-0.5">
        {/* Estrelinha marketing — sempre visível, activa/inactiva */}
        {onToggleDestaque && !isSemEfeito && !isLock && temDJ && (
          <button
            onClick={(e) => { e.stopPropagation(); onToggleDestaque() }}
            title={isDestaque ? 'Remover destaque marketing' : 'Definir como destaque marketing'}
            className="w-4 h-4 rounded flex items-center justify-center hover:bg-black/40 transition-colors"
          >
            <Star
              size={11}
              fill={isDestaque ? 'currentColor' : 'none'}
              className={isDestaque ? 'text-yellow-400' : 'text-white/50 hover:text-yellow-400'}
              strokeWidth={1.5}
            />
          </button>
        )}
      </div>
      {/* Sugerir DJ — canto superior direito, só no hover */}
      {onSugerir && !isSemEfeito && !isLock && temDJ && (
        <button
          onClick={(e) => { e.stopPropagation(); onSugerir() }}
          title="Sugerir DJ"
          className="absolute top-0.5 right-0.5 w-4 h-4 rounded flex items-center justify-center opacity-0 group-hover/chip:opacity-100 transition-opacity bg-black/30 hover:bg-black/60 text-accent-subtle hover:text-accent"
        >
          <Sparkles size={9} />
        </button>
      )}
      {/* Pagamento — canto inferior esquerdo */}
      {temPagamento && (
        <PagamentoBtn cor={corPag} />
      )}
      {/* Confirmar — canto inferior direito, sempre visível */}
      {temConfirmar && (
        <button
          onClick={(e) => { e.stopPropagation(); onConfirmar() }}
          title="Confirmar"
          className="absolute bottom-0.5 right-0.5 w-4 h-4 rounded flex items-center justify-center hover:bg-black/40 transition-colors text-status-confirmado/60 hover:text-status-confirmado"
        >
          <Check size={11} />
        </button>
      )}
    </div>
  )
}
