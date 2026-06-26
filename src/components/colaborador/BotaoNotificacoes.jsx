import { useEffect, useState } from 'react'
import { Bell, BellOff, BellRing } from 'lucide-react'
import { clsx } from 'clsx'
import { pushSuportado, estadoPush, ativarPush, desativarPush } from '@/lib/push'

/**
 * Botão no header da app Apoio T para ligar/desligar as notificações push.
 * A permissão de notificações TEM de ser pedida a partir de um clique (gesto
 * do utilizador) — por isso vive aqui e não num efeito automático.
 */
export function BotaoNotificacoes() {
  const [estado, setEstado] = useState(null) // 'indisponivel' | 'bloqueado' | 'inativo' | 'ativo'
  const [ocupado, setOcupado] = useState(false)

  useEffect(() => {
    if (!pushSuportado()) { setEstado('indisponivel'); return }
    estadoPush().then(setEstado).catch(() => setEstado('inativo'))
  }, [])

  if (estado === 'indisponivel' || estado === null) return null

  const onClick = async () => {
    if (ocupado) return
    setOcupado(true)
    try {
      if (estado === 'ativo') setEstado(await desativarPush())
      else setEstado(await ativarPush())
    } catch (e) {
      alert(e.message || 'Não foi possível alterar as notificações.')
      setEstado(await estadoPush())
    } finally {
      setOcupado(false)
    }
  }

  const ativo = estado === 'ativo'
  const bloqueado = estado === 'bloqueado'
  const Icone = bloqueado ? BellOff : ativo ? BellRing : Bell

  return (
    <button
      onClick={onClick}
      disabled={ocupado || bloqueado}
      title={
        bloqueado
          ? 'Notificações bloqueadas — ativa nas definições do telemóvel'
          : ativo
            ? 'Notificações ativas — toca para desligar'
            : 'Ativar notificações no ícone'
      }
      className={clsx(
        'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider transition-colors',
        ativo
          ? 'border-amber-400/50 text-amber-400'
          : 'border-border text-accent-subtle hover:text-amber-400 hover:border-amber-400/40',
        (ocupado || bloqueado) && 'opacity-50',
      )}
    >
      <Icone size={13} />
      <span>{bloqueado ? 'Bloq.' : ativo ? 'On' : 'Avisos'}</span>
    </button>
  )
}
