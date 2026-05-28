import { AlertTriangle } from 'lucide-react'
import { Modal } from './Modal'
import { Button } from './Button'

/**
 * Modal de confirmação com lista de avisos.
 *
 * @param {{
 *   aberto: boolean,
 *   titulo?: string,
 *   avisos: string[],
 *   labelConfirmar?: string,
 *   onConfirmar: () => void,
 *   onCancelar: () => void,
 * }} props
 */
export function ConfirmModal({
  aberto,
  titulo = 'Confirmar acção',
  avisos = [],
  labelConfirmar = 'Continuar mesmo assim',
  onConfirmar,
  onCancelar,
}) {
  return (
    <Modal aberto={aberto} onFechar={onCancelar} largura="max-w-sm">
      <div className="px-6 py-5 flex flex-col gap-5">

        {/* Cabeçalho com ícone */}
        <div className="flex items-start gap-3">
          <div className="mt-0.5 shrink-0 w-8 h-8 rounded-full bg-orange-400/15 border border-orange-400/25 flex items-center justify-center">
            <AlertTriangle size={15} className="text-orange-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-accent">{titulo}</p>
            <p className="text-xs text-accent-subtle mt-0.5">Verifique antes de continuar.</p>
          </div>
        </div>

        {/* Lista de avisos */}
        {avisos.length > 0 && (
          <ul className="flex flex-col gap-2 pl-1">
            {avisos.map((a, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-accent-muted">
                <span className="mt-1 w-1.5 h-1.5 rounded-full bg-orange-400/70 shrink-0" />
                {a}
              </li>
            ))}
          </ul>
        )}

        {/* Botões */}
        <div className="flex justify-end gap-2 pt-1 border-t border-border">
          <Button variante="ghost" tamanho="sm" onClick={onCancelar}>
            Cancelar
          </Button>
          <Button variante="secondary" tamanho="sm" onClick={onConfirmar}
            className="border-orange-400/30 text-orange-300 hover:bg-orange-400/10">
            {labelConfirmar}
          </Button>
        </div>

      </div>
    </Modal>
  )
}
