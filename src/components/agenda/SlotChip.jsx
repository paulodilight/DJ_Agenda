import { clsx } from 'clsx'
import { useDraggable } from '@dnd-kit/core'
import { Sparkles, Star } from 'lucide-react'

export function SlotChip({ slot, isLock, onClick, onClickVazio, onSugerir, onToggleDestaque, dimmed = false, dragId, dragData, conflito = false, motivoConflito = null }) {
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

  const temDJ      = !!slot.dj_nome
  const isManual   = temDJ && !slot.dj_id
  const isProposta  = temDJ && slot.estado === 'proposta'
  const isSemEfeito = slot.estado === 'sem_efeito'
  const isAPedido   = slot.estado === 'a_pedido'
  const isDestaque  = !!slot.marketing_destaque

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
              ? 'border-violet-400/35 bg-violet-400/[0.13] hover:bg-violet-400/20'
              : isLock
                ? 'border-status-lock/35 bg-status-lock/[0.13] hover:bg-status-lock/20'
                : isProposta
                  ? 'border-status-proposta/40 bg-status-proposta/[0.17] hover:bg-status-proposta/25'
                  : isManual
                    ? 'border-yellow-400/35 bg-yellow-400/[0.11] hover:bg-yellow-400/20'
                    : temDJ
                      ? 'border-status-confirmado/35 bg-status-confirmado/[0.13] hover:bg-status-confirmado/20'
                      : 'border-surface-4 bg-surface-3 hover:bg-surface-4 hover:border-border'
      )}
    >
      <span className={clsx(
        'text-xs truncate flex flex-col items-center leading-tight w-full',
        conflito       ? 'font-semibold text-red-400'         :
        isAPedido      ? 'font-semibold text-violet-300'       :
        isLock         ? 'font-semibold text-status-lock'      :
        isProposta     ? 'font-semibold text-status-proposta'  :
        isManual       ? 'font-semibold text-yellow-300'       :
        temDJ          ? 'font-semibold text-status-confirmado':
                         'italic text-accent-subtle'
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

  if (!temAccoes) return chip

  return (
    <div className="relative group/chip">
      {chip}
      <div className="absolute top-0.5 left-0.5 flex items-center gap-0.5">
        {/* Estrelinha marketing — sempre visível, activa/inactiva */}
        {onToggleDestaque && (
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
      {/* Sugerir DJ — canto direito, só no hover */}
      {onSugerir && !isSemEfeito && !isLock && (
        <button
          onClick={(e) => { e.stopPropagation(); onSugerir() }}
          title="Sugerir DJ"
          className="absolute top-0.5 right-0.5 w-4 h-4 rounded flex items-center justify-center opacity-0 group-hover/chip:opacity-100 transition-opacity bg-black/30 hover:bg-black/60 text-accent-subtle hover:text-accent"
        >
          <Sparkles size={9} />
        </button>
      )}
    </div>
  )
}
