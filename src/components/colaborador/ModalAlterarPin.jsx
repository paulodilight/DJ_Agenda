import { useState } from 'react'
import { X, KeyRound } from 'lucide-react'
import { clsx } from 'clsx'
import { colaboradorApi } from '@/lib/colaboradorApi'
import { useColaboradorStore } from '@/store'

const PIN_LEN = 4

function PinInput({ value, onChange, placeholder, disabled }) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {Array.from({ length: PIN_LEN }).map((_, i) => (
        <div key={i} className={clsx(
          'h-12 rounded-xl flex items-center justify-center text-lg font-bold border transition-all',
          value.length > i
            ? 'bg-amber-400/15 border-amber-400/40 text-amber-400'
            : 'bg-surface-2 border-border text-accent-subtle/30'
        )}>
          {value[i] ? '●' : '—'}
        </div>
      ))}
      <input
        type="tel" inputMode="numeric" pattern="[0-9]*"
        maxLength={PIN_LEN} value={value} onChange={e => onChange(e.target.value.replace(/\D/g, '').slice(0, PIN_LEN))}
        disabled={disabled} placeholder={placeholder}
        className="sr-only"
        style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }}
      />
    </div>
  )
}

function TecladoPin({ onPremir, onApagar, disabled }) {
  return (
    <div className="grid grid-cols-3 gap-2 mt-2">
      {[1,2,3,4,5,6,7,8,9].map(n => (
        <button key={n} type="button" onClick={() => onPremir(String(n))} disabled={disabled}
          className="h-12 rounded-xl bg-surface-2 border border-border text-lg font-semibold hover:bg-surface-3 active:scale-95 transition-all disabled:opacity-40 select-none">
          {n}
        </button>
      ))}
      <span />
      <button type="button" onClick={() => onPremir('0')} disabled={disabled}
        className="h-12 rounded-xl bg-surface-2 border border-border text-lg font-semibold hover:bg-surface-3 active:scale-95 transition-all disabled:opacity-40 select-none">
        0
      </button>
      <button type="button" onClick={onApagar} disabled={disabled}
        className="h-12 rounded-xl text-accent-muted hover:text-accent flex items-center justify-center hover:bg-surface-2 transition-all text-xl select-none">
        ⌫
      </button>
    </div>
  )
}

const PASSOS = ['atual', 'novo', 'confirmar']
const LABELS = { atual: 'PIN actual', novo: 'Novo PIN', confirmar: 'Confirmar novo PIN' }

export function ModalAlterarPin({ onFechar }) {
  const { colaborador } = useColaboradorStore()
  const [passo, setPasso]       = useState('atual')
  const [pinAtual, setPinAtual] = useState('')
  const [pinNovo, setPinNovo]   = useState('')
  const [pinConf, setPinConf]   = useState('')
  const [erro, setErro]         = useState(null)
  const [loading, setLoading]   = useState(false)
  const [sucesso, setSucesso]   = useState(false)

  const valorActual = passo === 'atual' ? pinAtual : passo === 'novo' ? pinNovo : pinConf
  const setValor = passo === 'atual' ? setPinAtual : passo === 'novo' ? setPinNovo : setPinConf

  const premir = (d) => {
    if (loading) return
    const novo = (valorActual + d).slice(0, PIN_LEN)
    setValor(novo)
    if (novo.length === PIN_LEN) avancar(novo)
  }

  const apagar = () => setValor(v => v.slice(0, -1))

  const avancar = async (pin) => {
    setErro(null)
    if (passo === 'atual') {
      setPasso('novo')
    } else if (passo === 'novo') {
      setPasso('confirmar')
    } else {
      // confirmar
      if (pin !== pinNovo) {
        setErro('Os PINs não coincidem.')
        setPinConf('')
        return
      }
      setLoading(true)
      try {
        const ok = await colaboradorApi.alterarPin(colaborador.id, pinAtual, pinNovo)
        if (!ok) {
          setErro('PIN actual incorrecto.')
          setPinAtual(''); setPinNovo(''); setPinConf('')
          setPasso('atual')
        } else {
          setSucesso(true)
          setTimeout(onFechar, 1800)
        }
      } catch (e) {
        setErro(e.message)
      } finally {
        setLoading(false)
      }
    }
  }

  const voltar = () => {
    setErro(null)
    const idx = PASSOS.indexOf(passo)
    if (idx > 0) { setPasso(PASSOS[idx - 1]); setValor('') }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-black/70" onClick={onFechar} />
      <div className="relative z-10 w-full md:max-w-sm bg-surface-1 border border-border rounded-t-3xl md:rounded-2xl shadow-2xl p-6 flex flex-col gap-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <KeyRound size={18} className="text-amber-400" />
            <span className="text-sm font-bold text-accent">Alterar PIN</span>
          </div>
          <button onClick={onFechar} className="text-accent-subtle hover:text-accent p-1">
            <X size={18} />
          </button>
        </div>

        {sucesso ? (
          <div className="flex flex-col items-center gap-3 py-6">
            <span className="text-4xl">✅</span>
            <p className="text-sm font-semibold text-accent">PIN alterado com sucesso!</p>
          </div>
        ) : (
          <>
            {/* Indicador de passos */}
            <div className="flex items-center gap-2">
              {PASSOS.map((p, i) => (
                <div key={p} className={clsx(
                  'flex-1 h-1 rounded-full transition-all',
                  PASSOS.indexOf(passo) >= i ? 'bg-amber-400' : 'bg-surface-3'
                )} />
              ))}
            </div>

            <div>
              <p className="text-[11px] uppercase tracking-wider text-accent-subtle mb-3 font-semibold">
                {LABELS[passo]}
              </p>
              {/* Dots visuais */}
              <div className="flex justify-center gap-4 mb-4">
                {Array.from({ length: PIN_LEN }).map((_, i) => (
                  <span key={i} className={clsx(
                    'w-4 h-4 rounded-full border-2 transition-all duration-150',
                    i < valorActual.length ? 'bg-amber-400 border-amber-400 scale-110' : 'border-accent-subtle/40',
                  )} />
                ))}
              </div>
            </div>

            {erro && <p className="text-sm text-status-cancelado text-center -mt-2">{erro}</p>}

            <TecladoPin onPremir={premir} onApagar={apagar} disabled={loading} />

            <div className="flex items-center justify-between mt-1">
              {passo !== 'atual' && (
                <button onClick={voltar} className="text-xs text-accent-subtle hover:text-accent">
                  ← Voltar
                </button>
              )}
              <span />
              <p className="text-[11px] text-accent-subtle/60 capitalize">{passo === 'atual' ? 'Passo 1 de 3' : passo === 'novo' ? 'Passo 2 de 3' : 'Passo 3 de 3'}</p>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
