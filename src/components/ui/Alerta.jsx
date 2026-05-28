import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react'
import { clsx } from 'clsx'

const tipos = {
  erro:    { cor: 'border-status-cancelado/30 bg-status-cancelado/5 text-status-cancelado', Icone: XCircle },
  aviso:   { cor: 'border-status-proposta/30 bg-status-proposta/5 text-status-proposta', Icone: AlertTriangle },
  sucesso: { cor: 'border-status-confirmado/30 bg-status-confirmado/5 text-status-confirmado', Icone: CheckCircle2 },
  info:    { cor: 'border-border bg-surface-2 text-accent-muted', Icone: Info },
}

export function Alerta({ tipo = 'info', mensagem, className }) {
  const { cor, Icone } = tipos[tipo]
  return (
    <div className={clsx('flex items-start gap-3 px-4 py-3 rounded border text-sm', cor, className)}>
      <Icone size={15} className="mt-0.5 shrink-0" />
      <span>{mensagem}</span>
    </div>
  )
}
