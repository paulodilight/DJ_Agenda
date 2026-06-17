import { useState, useEffect } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Alerta } from '@/components/ui/Alerta'
import { espacosApi } from '@/lib/api'

const TIPO_OPCOES = [
  { value: 'club', label: 'Club' },
  { value: 'bar', label: 'Bar' },
  { value: 'hotel', label: 'Hotel' },
  { value: 'restaurante', label: 'Restaurante' },
]

const vazio = {
  nome: '', tipo: 'club', budget_max: '', valor_avenca: '',
  dias_sem_repeticao: 14, dias_espacamento: 7, notas: '', activo: true,
  morada: '',
}

/**
 * @param {{ aberto: boolean, espaco?: object|null, onFechar: () => void, onGuardado: () => void }} props
 */
export function FormEspaco({ aberto, espaco, onFechar, onGuardado }) {
  const [form, setForm] = useState(vazio)
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState(null)
  const editar = !!espaco

  useEffect(() => {
    if (aberto) {
      setForm(espaco ? { ...vazio, ...espaco, budget_max: espaco.budget_max ?? '' } : vazio)
      setErro(null)
    }
  }, [aberto, espaco])

  const set = (campo) => (e) => setForm((f) => ({ ...f, [campo]: e.target.value }))

  const guardar = async (e) => {
    e.preventDefault()
    setErro(null)
    setLoading(true)
    try {
      const payload = {
        ...form,
        dias_sem_repeticao: Number(form.dias_sem_repeticao),
        dias_espacamento:   Number(form.dias_espacamento),
        budget_max:         form.budget_max    === '' ? null : Number(form.budget_max),
        valor_avenca:       form.valor_avenca  === '' ? null : Number(form.valor_avenca),
      }
      if (editar) {
        await espacosApi.actualizar(espaco.id, payload)
      } else {
        await espacosApi.criar(payload)
      }
      onGuardado()
      onFechar()
    } catch (e) {
      setErro(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal aberto={aberto} onFechar={onFechar} titulo={editar ? 'Editar Cliente' : 'Novo Cliente'} largura="max-w-xl">
      <form onSubmit={guardar}>
        <div className="px-6 py-5 flex flex-col gap-4">
          {erro && <Alerta tipo="erro" mensagem={erro} />}

          <div className="grid grid-cols-2 gap-4">
            <Input label="Nome" value={form.nome} onChange={set('nome')} placeholder="Nome do Cliente" required />
            <Select label="Tipo" value={form.tipo} onChange={set('tipo')}>
              {TIPO_OPCOES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input label="Budget máximo por sessão (€)" value={form.budget_max} onChange={set('budget_max')} placeholder="200" type="number" min={0} step={0.01} />
            <Input label="Avença mensal (€)" value={form.valor_avenca ?? ''} onChange={set('valor_avenca')} placeholder="500" type="number" min={0} step={0.01} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Dias sem repetir DJ"
              value={form.dias_sem_repeticao}
              onChange={set('dias_sem_repeticao')}
              type="number" min={1} max={365}
            />
            <Input
              label="Espaçamento mínimo (dias)"
              value={form.dias_espacamento}
              onChange={set('dias_espacamento')}
              type="number" min={1} max={365}
            />
          </div>

          <Input label="Morada" value={form.morada ?? ''} onChange={set('morada')} placeholder="Rua, cidade (ex: Herdade da Comporta, Comporta)" />

          <Textarea label="Notas / Regras do Cliente" value={form.notas} onChange={set('notas')} placeholder="Regras específicas, preferências, notas internas..." />
        </div>

        <div className="px-6 py-4 border-t border-border flex justify-end gap-2">
          <Button type="button" variante="ghost" tamanho="sm" onClick={onFechar}>Cancelar</Button>
          <Button type="submit" variante="primary" tamanho="sm" loading={loading}>
            {editar ? 'Guardar alterações' : 'Criar Cliente'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
