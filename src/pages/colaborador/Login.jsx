import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Delete, ChevronLeft } from 'lucide-react'
import { clsx } from 'clsx'
import { colaboradorApi } from '@/lib/colaboradorApi'
import { useColaboradorStore } from '@/store'
import { Avatar } from '@/components/colaborador/Avatar'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'

const PIN_LEN = 4

export function ColaboradorLogin() {
  const [colaboradores, setColaboradores] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [sel, setSel] = useState(null)
  const [pin, setPin] = useState('')
  const [erro, setErro] = useState(null)
  const [aEntrar, setAEntrar] = useState(false)
  const entrar = useColaboradorStore((s) => s.entrar)
  const navigate = useNavigate()

  useEffect(() => {
    colaboradorApi
      .listarColaboradores()
      .then(setColaboradores)
      .catch((e) => setErro(e.message))
      .finally(() => setCarregando(false))
  }, [])

  const tentarEntrar = async (codigo) => {
    setAEntrar(true); setErro(null)
    try {
      const colab = await colaboradorApi.login(sel.nome, codigo)
      if (!colab) { setErro('PIN incorrecto.'); setPin(''); return }
      entrar(colab)
      navigate('/apoiot', { replace: true })
    } catch (e) { setErro(e.message); setPin('') }
    finally { setAEntrar(false) }
  }

  const premir = (d) => {
    if (aEntrar) return
    const novo = (pin + d).slice(0, PIN_LEN)
    setPin(novo)
    if (novo.length === PIN_LEN) tentarEntrar(novo)
  }
  const apagar = () => setPin((p) => p.slice(0, -1))
  const voltar = () => { setSel(null); setPin(''); setErro(null) }

  return (
    <div className="bg-surface-0 text-accent min-h-screen px-6 py-10">
      <div className="mx-auto max-w-xs flex flex-col items-center gap-8">

        {/* Logo */}
        <div className="flex items-center gap-2">
          <img src="https://xclusive-dj-app.vercel.app/logo-x.png" alt="Xclusive" className="w-9 h-9 object-contain" />
          <span className="text-base font-bold tracking-widest text-accent uppercase">Clusive</span>
        </div>

        {/* Corpo */}
        <div className="w-full">
          {carregando ? (
            <div className="flex justify-center py-10"><LoadingSpinner tamanho="lg" /></div>

          ) : !sel ? (
            <div className="flex flex-col gap-5">
              <div className="text-center">
                <h1 className="text-2xl font-black">Quem és tu?</h1>
                <p className="text-sm text-accent-muted mt-1">Escolhe o teu nome para entrar.</p>
              </div>
              {erro && <p className="text-sm text-status-cancelado text-center">{erro}</p>}
              <div className="grid grid-cols-2 gap-4">
                {colaboradores.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => { setSel(c); setErro(null) }}
                    className="flex flex-col items-center gap-3 py-6 px-3 rounded-2xl bg-surface-1 border border-border hover:border-white/25 hover:bg-surface-2 active:scale-95 transition-all"
                  >
                    <Avatar nome={c.nome} foto={c.foto_url} tamanho="md" />
                    <span className="text-sm font-semibold">{c.nome}</span>
                  </button>
                ))}
              </div>
            </div>

          ) : (
            <div className="flex flex-col gap-5">
              <button onClick={voltar} className="flex items-center gap-1 text-xs text-accent-subtle hover:text-accent">
                <ChevronLeft size={14} /> Trocar
              </button>

              <div className="flex flex-col items-center gap-3">
                <Avatar nome={sel.nome} foto={sel.foto_url} tamanho="xl" anel />
                <div className="text-center">
                  <p className="text-xl font-black">Olá, {sel.nome}!</p>
                  <p className="text-sm text-accent-muted mt-0.5">Introduz o teu PIN</p>
                </div>
              </div>

              <div className="flex justify-center gap-4">
                {Array.from({ length: PIN_LEN }).map((_, i) => (
                  <span key={i} className={clsx(
                    'w-4 h-4 rounded-full border-2 transition-all duration-150',
                    i < pin.length ? 'bg-accent border-accent scale-110' : 'border-accent-subtle/40',
                  )} />
                ))}
              </div>

              {erro && <p className="text-sm text-status-cancelado text-center">{erro}</p>}

              <div className="grid grid-cols-3 gap-3">
                {[1,2,3,4,5,6,7,8,9].map((n) => (
                  <button key={n} onClick={() => premir(String(n))} disabled={aEntrar}
                    className="h-16 rounded-2xl bg-surface-2 border border-border text-2xl font-semibold hover:bg-surface-3 active:scale-95 active:bg-surface-4 transition-all disabled:opacity-40 select-none">
                    {n}
                  </button>
                ))}
                <span />
                <button onClick={() => premir('0')} disabled={aEntrar}
                  className="h-16 rounded-2xl bg-surface-2 border border-border text-2xl font-semibold hover:bg-surface-3 active:scale-95 active:bg-surface-4 transition-all disabled:opacity-40 select-none">
                  0
                </button>
                <button onClick={apagar} disabled={aEntrar}
                  className="h-16 rounded-2xl text-accent-muted hover:text-accent flex items-center justify-center hover:bg-surface-2 active:bg-surface-3 transition-all select-none">
                  <Delete size={22} />
                </button>
              </div>

              {aEntrar && <div className="flex justify-center"><LoadingSpinner /></div>}
            </div>
          )}
        </div>

        <p className="text-xs text-accent-subtle">Xclusive Events — Área de colaboradores</p>
      </div>
    </div>
  )
}
