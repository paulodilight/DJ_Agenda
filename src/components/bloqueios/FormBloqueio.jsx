import { useState, useEffect } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Select, Textarea } from '@/components/ui/Input'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Alerta } from '@/components/ui/Alerta'
import { bloqueiosApi } from '@/lib/api'
import { useDJs } from '@/hooks/useDJs'
import { useEspacos } from '@/hooks/useEspacos'

const TIPO_OPCOES = [
  { value: 'BAN', label: 'BAN — Bloquear DJ num espaço' },
  { value: 'LOCK', label: 'LOCK — Fixar DJ num espaço numa data' },
  { value: 'SWAP', label: 'SWAP — Trocar dois DJs entre espaços' },
]

const vazio = { tipo: 'BAN', dj_id: '', dj_swap_id: '', espaco_id: '', data: '', motivo: '' }

/**
 * @param {{ aberto: boolean, onFechar: () => void, onGuardado: () => void }} props
 */
export function FormBloqueio({ aberto, onFechar, onGuardado }) {
  const [form, setForm] = useState(vazio)
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState(null)
  const { djs } = useDJs()
  const { espacos } = useEspacos()

  useEffect(() => {
    if (aberto) { setForm(vazio); setErro(null) }
  }, [aberto])

  const set = (campo) => (e) => setForm((f) => ({ ...f, [campo]: e.target.value }))

  const guardar = async (e) => {
    e.preventDefault()
    setErro(null)
    setLoading(true)
    try {
      const payload = {
        tipo: form.tipo,
        dj_id: form.dj_id || null,
        espaco_id: form.espaco_id || null,
        dj_swap_id: form.tipo === 'SWAP' ? (form.dj_swap_id || null) : null,
        data: form.tipo !== 'BAN' ? (form.data || null) : null,
        motivo: form.motivo || null,
        activo: true,
      }
      await bloqueiosApi.criar(payload)
      onGuardado()
      onFechar()
    } catch (e) {
      setErro(e.message)
    } finally {
      setLoading(false)
    }
  }

  const djsActivos = djs.filter((d) => d.estado === 'activo')

  return (
    <Modal aberto={aberto} onFechar={onFechar} titulo="Novo bloqueio" largura="max-w-lg">
      <form onSubmit={guardar}>
        <div className="px-6 py-5 flex flex-col gap-4">
          {erro && <Alerta tipo="erro" mensagem={erro} />}

          <Select label="Tipo" value={form.tipo} onChange={set('tipo')}>
            {TIPO_OPCOES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </Select>

          {/* Descrição do tipo */}
          <div className="text-xs text-accent-muted bg-surface-2 rounded px-3 py-2 border border-border">
            {form.tipo === 'BAN' && 'O DJ nunca será distribuído para este espaço (permanente).'}
            {form.tipo === 'LOCK' && 'O DJ fica fixo neste espaço nesta data — o motor não pode alterar.'}
            {form.tipo === 'SWAP' && 'Dois DJs trocam de espaço automaticamente na data indicada.'}
          </div>

          <Select label={form.tipo === 'SWAP' ? 'DJ A' : 'DJ'} value={form.dj_id} onChange={set('dj_id')} required>
            <option value="">Seleccionar DJ...</option>
            {djsActivos.map((d) => (
              <option key={d.id} value={d.id}>{d.nome_artistico || d.nome}</option>
            ))}
          </Select>

          {form.tipo === 'SWAP' && (
            <Select label="DJ B (para trocar)" value={form.dj_swap_id} onChange={set('dj_swap_id')} required>
              <option value="">Seleccionar DJ B...</option>
              {djsActivos.filter((d) => d.id !== form.dj_id).map((d) => (
                <option key={d.id} value={d.id}>{d.nome_artistico || d.nome}</option>
              ))}
            </Select>
          )}

          <Select label="Espaço" value={form.espaco_id} onChange={set('espaco_id')} required>
            <option value="">Seleccionar espaço...</option>
            {espacos.map((e) => (
              <option key={e.id} value={e.id}>{e.nome}</option>
            ))}
          </Select>

          {form.tipo !== 'BAN' && (
            <Input label="Data" value={form.data} onChange={set('data')} type="date" required />
          )}

          <Textarea label="Motivo (opcional)" value={form.motivo} onChange={set('motivo')} placeholder="Razão do bloqueio..." />
        </div>

        <div className="px-6 py-4 border-t border-border flex justify-end gap-2">
          <Button type="button" variante="ghost" tamanho="sm" onClick={onFechar}>Cancelar</Button>
          <Button type="submit" variante="primary" tamanho="sm" loading={loading}>
            Criar bloqueio
          </Button>
        </div>
      </form>
    </Modal>
  )
}
