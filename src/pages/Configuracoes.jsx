import { useState, useEffect } from 'react'
import { Settings, AlertTriangle, Ban, ScrollText } from 'lucide-react'
import { configuracoesApi, regrasAtuacaoApi } from '@/lib/api'
import { Card, CardHeader, CardBody } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Alerta } from '@/components/ui/Alerta'
import { LoadingPage } from '@/components/ui/LoadingSpinner'
import { useAppStore } from '@/store'
import { clsx } from 'clsx'

function Toggle({ checked, onChange, label, descricao }) {
  return (
    <label className="flex items-start gap-3 cursor-pointer group">
      <div className="mt-0.5 shrink-0">
        <div
          onClick={onChange}
          className={clsx(
            'w-9 h-5 rounded-full transition-colors relative cursor-pointer',
            checked ? 'bg-status-confirmado' : 'bg-surface-3'
          )}
        >
          <div className={clsx(
            'absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform shadow-sm',
            checked ? 'left-[18px]' : 'left-0.5'
          )} />
        </div>
      </div>
      <div>
        <p className="text-sm text-accent">{label}</p>
        {descricao && <p className="text-xs text-accent-subtle mt-0.5">{descricao}</p>}
      </div>
    </label>
  )
}

export function Configuracoes() {
  const setConfig = useAppStore((s) => s.setConfig)
  const [config, setConfigLocal] = useState({})
  const [regras, setRegras] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState(null)
  const [sucesso, setSucesso] = useState(false)

  useEffect(() => {
    Promise.all([configuracoesApi.listar(), regrasAtuacaoApi.obter()])
      .then(([c, r]) => { setConfigLocal(c); setConfig(c); setRegras(r) })
      .catch((e) => setErro(e.message))
      .finally(() => setLoading(false))
  }, [setConfig])

  const set = (chave) => (e) =>
    setConfigLocal((c) => ({ ...c, [chave]: e.target.value }))

  const setToggle = (chave) => () =>
    setConfigLocal((c) => ({ ...c, [chave]: c[chave] === 'true' ? 'false' : 'true' }))

  const guardar = async () => {
    setSaving(true); setErro(null); setSucesso(false)
    try {
      for (const [chave, valor] of Object.entries(config)) {
        await configuracoesApi.actualizar(chave, valor)
      }
      await regrasAtuacaoApi.guardar(regras)
      setConfig(config)
      setSucesso(true)
      setTimeout(() => setSucesso(false), 3000)
    } catch (e) {
      setErro(e.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <LoadingPage />

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center gap-2 mb-6">
        <Settings size={16} className="text-accent-muted" />
        <div>
          <h1 className="text-base font-semibold text-accent">Configurações</h1>
          <p className="text-xs text-accent-muted mt-0.5">Regras globais de distribuição</p>
        </div>
      </div>

      {erro && <Alerta tipo="erro" mensagem={erro} className="mb-4" />}
      {sucesso && <Alerta tipo="sucesso" mensagem="Configurações guardadas com sucesso." className="mb-4" />}

      {/* ── Regras de atuação (visíveis aos DJs) ── */}
      <Card className="mb-4">
        <CardHeader>
          <div className="flex items-center gap-2">
            <ScrollText size={13} className="text-accent-muted" />
            <p className="text-xs font-semibold text-accent-muted uppercase tracking-wider">Regras de atuação — visíveis aos DJs</p>
          </div>
        </CardHeader>
        <CardBody className="flex flex-col gap-2">
          <p className="text-xs text-accent-subtle">
            Este texto aparece no modal de <span className="text-accent-muted font-medium">todas as datas</span> e para <span className="text-accent-muted font-medium">todos os DJs</span> na app deles. Cada linha é mostrada tal como aqui escrita.
          </p>
          <textarea
            value={regras}
            onChange={(e) => setRegras(e.target.value)}
            rows={8}
            placeholder={'Ex:\n• Chegar 30 min antes do início.\n• Dress code: preto.\n• Confirmar presença por WhatsApp até 48h antes.'}
            className="w-full bg-surface-2 border border-border rounded-lg px-3.5 py-2.5 text-sm text-accent placeholder:text-accent-subtle/50 focus:outline-none focus:border-accent/30 transition-colors resize-y leading-relaxed"
          />
        </CardBody>
      </Card>

      {/* ── Espaçamentos ── */}
      <Card className="mb-4">
        <CardHeader>
          <p className="text-xs font-semibold text-accent-muted uppercase tracking-wider">Espaçamentos</p>
        </CardHeader>
        <CardBody className="flex flex-col gap-4">
          <Input
            label="Espaçamento mínimo global (dias)"
            type="number" min={1} max={90}
            value={config.dias_espacamento_global ?? ''}
            onChange={set('dias_espacamento_global')}
            descricao="Número mínimo de dias entre atuações do mesmo DJ em qualquer Cliente."
          />
          <Input
            label="Dias sem repetir DJ no mesmo Cliente (default)"
            type="number" min={1} max={180}
            value={config.dias_sem_repeticao_global ?? ''}
            onChange={set('dias_sem_repeticao_global')}
            descricao="Cada Cliente pode sobrepor este valor nas suas configurações."
          />
        </CardBody>
      </Card>

      {/* ── Regra 1: Sem repetição entre Clientes ── */}
      <Card className="mb-4">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Ban size={13} className="text-accent-muted" />
            <p className="text-xs font-semibold text-accent-muted uppercase tracking-wider">Regra 1 — Sem repetição entre Clientes</p>
          </div>
        </CardHeader>
        <CardBody className="flex flex-col gap-4">
          <Toggle
            checked={config.regra_sem_repeticao_espacos === 'true'}
            onChange={setToggle('regra_sem_repeticao_espacos')}
            label="Activar regra de não repetição entre Clientes no mesmo dia"
            descricao="Um DJ não pode estar agendado em mais do que um Cliente no mesmo dia e turno. A Distribuição assinala o conflito automaticamente."
          />
          {config.regra_sem_repeticao_espacos === 'true' && (
            <div className="bg-surface-2 border border-border/50 rounded-lg px-4 py-3 text-xs text-accent-subtle leading-relaxed">
              <p className="font-semibold text-accent-muted mb-1">Como funciona</p>
              <p>Ao atribuir um DJ a um slot, o motor verifica se esse DJ já tem uma atuação confirmada ou proposta noutro Cliente no mesmo dia. Se existir conflito, o slot é assinalado com aviso e o DJ não é sugerido na distribuição automática.</p>
            </div>
          )}
        </CardBody>
      </Card>

      {/* ── Regra 2: Penalização por faltas ── */}
      <Card className="mb-4">
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle size={13} className="text-accent-muted" />
            <p className="text-xs font-semibold text-accent-muted uppercase tracking-wider">Regra 2 — Penalização por faltas</p>
          </div>
        </CardHeader>
        <CardBody className="flex flex-col gap-4">
          <Toggle
            checked={config.penalizacao_faltas_ativa === 'true'}
            onChange={setToggle('penalizacao_faltas_ativa')}
            label="Activar penalização automática por excesso de faltas"
            descricao="DJs que ultrapassem o limite de faltas num mês ficam penalizados no mês seguinte."
          />
          {config.penalizacao_faltas_ativa === 'true' && (
            <>
              <Input
                label="Limite de faltas por mês"
                type="number" min={1} max={10}
                value={config.penalizacao_faltas_limite ?? '2'}
                onChange={set('penalizacao_faltas_limite')}
                descricao={`DJs com mais de ${config.penalizacao_faltas_limite ?? 2} falta(s) num mês são penalizados no mês seguinte.`}
              />
              <div className="bg-surface-2 border border-border/50 rounded-lg px-4 py-3 text-xs text-accent-subtle leading-relaxed">
                <p className="font-semibold text-accent-muted mb-1">Como funciona</p>
                <p>No início de cada mês, o motor verifica as faltas do mês anterior. DJs que excedam o limite ficam marcados como penalizados — são os últimos a ser considerados na distribuição automática e o n8n é notificado para registo.</p>
              </div>
            </>
          )}
        </CardBody>
      </Card>

      {/* ── Notificações ── */}
      <Card className="mb-6">
        <CardHeader>
          <p className="text-xs font-semibold text-accent-muted uppercase tracking-wider">Notificações</p>
        </CardHeader>
        <CardBody>
          <Toggle
            checked={config.notificacoes_ativas === 'true'}
            onChange={setToggle('notificacoes_ativas')}
            label="Notificações WhatsApp activas"
            descricao="Envia confirmações e lembretes de atuação via WhatsApp através do n8n."
          />
        </CardBody>
      </Card>

      <div className="flex justify-end">
        <Button variante="primary" tamanho="md" loading={saving} onClick={guardar}>
          Guardar alterações
        </Button>
      </div>
    </div>
  )
}
