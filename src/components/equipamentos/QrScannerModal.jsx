import { useEffect, useRef, useState, useCallback } from 'react'
import jsQR from 'jsqr'
import { equipamentosApi } from '@/lib/equipamentosApi'
import { X, Package, LogOut, LogIn, CheckCircle, AlertCircle, QrCode } from 'lucide-react'
import { clsx } from 'clsx'

const inputCls = 'w-full bg-white/8 border border-white/15 rounded-xl px-3 py-2 text-white placeholder:text-white/30 focus:outline-none focus:border-white/35 text-sm'
const labelCls = 'block text-[10px] font-bold uppercase tracking-wider text-white/40 mb-1.5'

export function QrScannerModal({ onClose, nomeOperador = null }) {
  const videoRef   = useRef(null)
  const canvasRef  = useRef(null)
  const animRef    = useRef(null)
  const streamRef  = useRef(null)
  const lockedRef  = useRef(false)

  const [estado, setEstado]         = useState('scanning')
  const [equipamento, setEquip]     = useState(null)
  const [a_registar, setARegistar]  = useState(false)
  const [mensagem, setMensagem]     = useState(null)
  const [scanKey, setScanKey]       = useState(0)

  // Saída
  const [quantidade, setQuantidade]   = useState('1')
  const [notasSaida, setNotasSaida]   = useState('')
  // Entrada
  const [retornoPor, setRetornoPor]   = useState('')
  const [notasRetorno, setNotasRetorno] = useState('')

  const stopAll = useCallback(() => {
    if (animRef.current)  { cancelAnimationFrame(animRef.current); animRef.current = null }
    if (streamRef.current){ streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null }
  }, [])

  const lookupQr = useCallback(async (qrCode) => {
    try {
      const equip = await equipamentosApi.porQrCode(qrCode)
      if (!equip) {
        setMensagem(`Código "${qrCode}" não encontrado`)
        setEstado('not_found')
      } else {
        setEquip(equip)
        setRetornoPor(nomeOperador ?? '')
        setEstado('found')
      }
    } catch (e) {
      setMensagem(e.message ?? 'Erro ao consultar')
      setEstado('not_found')
    }
  }, [nomeOperador])

  useEffect(() => {
    lockedRef.current = false
    let active = true
    function tick() {
      if (!active || lockedRef.current) return
      const video  = videoRef.current
      const canvas = canvasRef.current
      if (!video || !canvas || video.readyState < 2) { animRef.current = requestAnimationFrame(tick); return }
      canvas.width  = video.videoWidth
      canvas.height = video.videoHeight
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      ctx.drawImage(video, 0, 0)
      const img  = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'attemptBoth' })
      if (code && !lockedRef.current) { lockedRef.current = true; stopAll(); lookupQr(code.data); return }
      animRef.current = requestAnimationFrame(tick)
    }
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } })
      .then(stream => {
        if (!active) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream
        const video = videoRef.current
        if (video) { video.srcObject = stream; video.play().then(() => { if (active) animRef.current = requestAnimationFrame(tick) }).catch(() => {}) }
      })
      .catch(() => { if (active) setEstado('camera_error') })
    return () => { active = false; stopAll() }
  }, [scanKey, stopAll, lookupQr])

  const retry = () => {
    setEstado('scanning'); setMensagem(null); setEquip(null)
    setQuantidade('1'); setNotasSaida(''); setRetornoPor(''); setNotasRetorno('')
    setScanKey(k => k + 1)
  }

  const registarSaida = async () => {
    setARegistar(true)
    try {
      await equipamentosApi.registarSaida(equipamento.id, nomeOperador, { quantidade, notas: notasSaida })
      setMensagem('Saída registada com sucesso')
      setEstado('success')
    } catch (e) { setMensagem(e.message ?? 'Erro ao registar') }
    finally { setARegistar(false) }
  }

  const registarEntrada = async () => {
    setARegistar(true)
    try {
      await equipamentosApi.registarEntrada(equipamento.movimentoAberto.id, retornoPor || null, notasRetorno || null)
      setMensagem('Entrada registada com sucesso')
      setEstado('success')
    } catch (e) { setMensagem(e.message ?? 'Erro ao registar') }
    finally { setARegistar(false) }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Barra de topo */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/70 to-transparent">
        <div className="flex items-center gap-2 text-white/80">
          <QrCode size={16} />
          <span className="text-sm font-semibold">Scan QR</span>
        </div>
        <button onClick={() => { stopAll(); onClose() }} className="p-1.5 rounded-full bg-black/30 text-white/70 hover:text-white">
          <X size={16} />
        </button>
      </div>

      {/* Câmara */}
      {estado === 'scanning' && (
        <div className="relative flex-1 flex items-center justify-center overflow-hidden">
          <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" muted playsInline autoPlay />
          <canvas ref={canvasRef} className="hidden" />
          <div className="relative w-60 h-60 z-10">
            <span className="absolute top-0    left-0  block w-10 h-10 border-t-[3px] border-l-[3px] border-green-400 rounded-tl-xl" />
            <span className="absolute top-0    right-0 block w-10 h-10 border-t-[3px] border-r-[3px] border-green-400 rounded-tr-xl" />
            <span className="absolute bottom-0 left-0  block w-10 h-10 border-b-[3px] border-l-[3px] border-green-400 rounded-bl-xl" />
            <span className="absolute bottom-0 right-0 block w-10 h-10 border-b-[3px] border-r-[3px] border-green-400 rounded-br-xl" />
          </div>
          <p className="absolute bottom-10 left-0 right-0 text-center text-white/60 text-sm">
            Aponta a câmara para o QR code do equipamento
          </p>
        </div>
      )}

      {/* Equipamento encontrado */}
      {estado === 'found' && equipamento && (
        <div className="flex-1 overflow-y-auto flex flex-col items-center justify-start pt-16 p-6 gap-4">
          {/* Card */}
          <div className="w-full max-w-sm rounded-2xl p-4 bg-white/8 border border-white/12">
            <div className="flex items-start gap-3 mb-3">
              <div className="p-2.5 rounded-xl bg-white/10 shrink-0"><Package size={20} className="text-white/80" /></div>
              <div>
                <p className="font-semibold text-white text-base leading-tight">{equipamento.nome}</p>
                <p className="text-xs text-white/45 mt-0.5">{equipamento.categoria} · <span className="font-mono">{equipamento.qr_code}</span></p>
              </div>
            </div>
            <div className={clsx('inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold',
              equipamento.movimentoAberto ? 'bg-amber-500/20 text-amber-300' : 'bg-green-500/20 text-green-300')}>
              <span className="w-1.5 h-1.5 rounded-full bg-current" />
              {equipamento.movimentoAberto ? 'Em uso' : 'Disponível'}
            </div>
          </div>

          {/* Formulário saída */}
          {!equipamento.movimentoAberto && (
            <div className="w-full max-w-sm flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Quantidade</label>
                  <input type="number" min="1" step="1" value={quantidade}
                    onChange={e => setQuantidade(e.target.value)}
                    className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Operador</label>
                  <input value={nomeOperador ?? '—'} readOnly
                    className={inputCls + ' opacity-50 cursor-default'} />
                </div>
              </div>
              <div>
                <label className={labelCls}>Notas de saída</label>
                <textarea value={notasSaida} onChange={e => setNotasSaida(e.target.value)}
                  rows={2} placeholder="Observações…" className={inputCls + ' resize-none'} />
              </div>
              <button onClick={registarSaida} disabled={a_registar}
                className="w-full py-3.5 rounded-2xl bg-amber-500 text-white font-semibold flex items-center justify-center gap-2 active:opacity-80 disabled:opacity-50">
                <LogOut size={16} />
                {a_registar ? 'A registar…' : 'Registar Saída'}
              </button>
            </div>
          )}

          {/* Formulário entrada */}
          {equipamento.movimentoAberto && (
            <div className="w-full max-w-sm flex flex-col gap-3">
              {equipamento.movimentoAberto.supa_eventos?.evento && (
                <p className="text-xs text-amber-400/70 text-center">Evento: {equipamento.movimentoAberto.supa_eventos.evento}</p>
              )}
              <div>
                <label className={labelCls}>Devolvido por</label>
                <input value={retornoPor} onChange={e => setRetornoPor(e.target.value)}
                  placeholder="Nome de quem devolve…" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Observações de retorno</label>
                <textarea value={notasRetorno} onChange={e => setNotasRetorno(e.target.value)}
                  rows={2} placeholder="Estado do equipamento, danos, notas…" className={inputCls + ' resize-none'} />
              </div>
              <button onClick={registarEntrada} disabled={a_registar}
                className="w-full py-3.5 rounded-2xl bg-blue-600 text-white font-semibold flex items-center justify-center gap-2 active:opacity-80 disabled:opacity-50">
                <LogIn size={16} />
                {a_registar ? 'A registar…' : 'Registar Entrada'}
              </button>
            </div>
          )}

          <button onClick={retry} className="text-xs text-white/40 hover:text-white/70">Escanear outro</button>
        </div>
      )}

      {/* Não encontrado */}
      {estado === 'not_found' && (
        <div className="flex-1 flex flex-col items-center justify-center p-6 gap-4">
          <AlertCircle size={44} className="text-red-400" />
          <p className="text-white/70 text-sm text-center">{mensagem}</p>
          <button onClick={retry} className="px-6 py-2.5 rounded-xl bg-white/10 text-white text-sm font-medium hover:bg-white/15">Tentar de novo</button>
          <button onClick={() => { stopAll(); onClose() }} className="text-xs text-white/35 hover:text-white/60">Fechar</button>
        </div>
      )}

      {/* Sucesso */}
      {estado === 'success' && (
        <div className="flex-1 flex flex-col items-center justify-center p-6 gap-4">
          <CheckCircle size={52} className="text-green-400" />
          <p className="text-white font-semibold text-lg text-center">{mensagem}</p>
          <button onClick={retry} className="px-6 py-2.5 rounded-xl bg-white/10 text-white text-sm font-medium hover:bg-white/15">Escanear outro</button>
          <button onClick={() => { stopAll(); onClose() }} className="text-xs text-white/35 hover:text-white/60">Fechar</button>
        </div>
      )}

      {/* Sem câmara */}
      {estado === 'camera_error' && (
        <div className="flex-1 flex flex-col items-center justify-center p-6 gap-4">
          <AlertCircle size={44} className="text-red-400" />
          <p className="text-white/70 text-sm text-center">Sem acesso à câmara.<br />Verifica as permissões do browser.</p>
          <button onClick={() => { stopAll(); onClose() }} className="px-6 py-2.5 rounded-xl bg-white/10 text-white text-sm font-medium">Fechar</button>
        </div>
      )}
    </div>
  )
}
