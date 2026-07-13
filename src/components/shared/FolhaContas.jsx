import { format } from 'date-fns'
import { pt } from 'date-fns/locale'

const dt = (d) => new Date(`${d}T00:00:00`)
const dataCompleta = (d) => d ? (() => { const s = format(dt(d), "EEEE, d 'de' MMMM 'de' yyyy", { locale: pt }); return s.charAt(0).toUpperCase() + s.slice(1) })() : null
const hhmm = (t) => t ? String(t).slice(0, 5) : null
const fmt = (v) => Number(v).toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
const num = (v) => parseFloat(v) || 0

function Secao({ titulo, children }) {
  return (
    <div className="mb-5">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">{titulo}</span>
        <div className="flex-1 border-t border-gray-300" />
      </div>
      {children}
    </div>
  )
}

function LinhaConta({ label, valor, negrito, subtotal }) {
  if (valor == null) return null
  return (
    <div className={`flex items-center justify-between py-1 border-b border-gray-100 ${subtotal ? 'bg-gray-50 px-2 -mx-2 rounded' : ''}`}>
      <span className={`text-[12px] ${negrito ? 'font-bold text-gray-900' : 'text-gray-700'}`}>{label}</span>
      <span className={`text-[12px] tabular-nums ${negrito ? 'font-bold text-gray-900' : 'text-gray-700'}`}>{fmt(valor)}</span>
    </div>
  )
}

// dados: same as FolhaEvento
// financeiro: {
//   tecnicos: [{nome, valor}],
//   gruposEquip: [{label, rows:[{nome, quantidade, valorCusto}], subtotal}],
//   transporte, alimentacao, valorArtista, nomeArtista,
//   total, estadoPagamento, formaPagamento, notasFaturacao, notasContas
// }
export function FolhaContas({ dados, financeiro }) {
  const {
    nomeEvento, data, horaInicio, horaFim,
    local, morada, responsavel, contacto,
    tecnicos: tecs = [], tipoEvento,
  } = dados

  const {
    tecnicos: finTecs = [],
    gruposEquip = [],
    transporte, alimentacao, valorArtista, nomeArtista,
    total, estadoPagamento, formaPagamento,
    notasFaturacao, notasContas,
  } = financeiro

  const horaStr = [hhmm(horaInicio), hhmm(horaFim)].filter(Boolean).join(' — ')

  const labelEstado = { pendente: 'Pendente', parcial: 'Parcial', pago: 'Pago' }
  const labelForma  = { transferencia: 'Transferência', dinheiro: 'Dinheiro' }

  return (
    <div className="bg-white text-gray-900 p-10 shadow-lg print:shadow-none" style={{ minHeight: '297mm', fontFamily: 'Inter, system-ui, sans-serif' }}>

      {/* Cabeçalho */}
      <div className="flex items-start justify-between mb-6 pb-5 border-b-2 border-gray-900">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-gray-400 mb-1">Paulo DiLight · LMD</p>
          <p className="text-[22px] font-black text-gray-900 leading-tight">{nomeEvento || '—'}</p>
          {tipoEvento && <p className="text-[12px] text-gray-500 mt-0.5">{tipoEvento}</p>}
        </div>
        <div className="text-right">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Folha de Contas</p>
          {data && <p className="text-[11px] text-gray-600 mt-1">{dataCompleta(data)}</p>}
          {horaStr && <p className="text-[11px] text-gray-500">{horaStr}</p>}
        </div>
      </div>

      {/* Resumo do evento */}
      <div className="grid grid-cols-3 gap-4 mb-6 pb-5 border-b border-gray-200">
        {local && (
          <div>
            <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-0.5">Local</p>
            <p className="text-[12px] text-gray-800 font-medium">{local}</p>
            {morada && <p className="text-[11px] text-gray-500">{morada}</p>}
          </div>
        )}
        {(responsavel || contacto) && (
          <div>
            <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-0.5">Contacto</p>
            {responsavel && <p className="text-[12px] text-gray-800 font-medium">{responsavel}</p>}
            {contacto && <p className="text-[11px] text-gray-500">{contacto}</p>}
          </div>
        )}
        {tecs.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-0.5">Equipa</p>
            {tecs.map((t, i) => (
              <p key={i} className="text-[12px] text-gray-800">{t.nome} <span className="text-gray-400 text-[10px]">· {t.label}</span></p>
            ))}
          </div>
        )}
      </div>

      {/* 1. Técnicos */}
      {finTecs.some(t => t.nome) && (
        <Secao titulo="Técnicos">
          <div className="flex flex-col gap-0.5">
            {finTecs.filter(t => t.nome).map((t, i) => (
              <LinhaConta key={i} label={t.nome} valor={t.valor != null ? t.valor : 0} />
            ))}
            {finTecs.filter(t => t.nome).length > 1 && (
              <LinhaConta
                label="Subtotal técnicos"
                valor={finTecs.reduce((s, t) => s + num(t.valor), 0)}
                subtotal
              />
            )}
          </div>
        </Secao>
      )}

      {/* 2. Equipamentos */}
      {gruposEquip.some(g => g.rows.length > 0) && (
        <Secao titulo="Equipamentos">
          {gruposEquip.filter(g => g.rows.length > 0).map((g, gi) => (
            <div key={gi} className={gi > 0 ? 'mt-3' : ''}>
              <p className="text-[11px] font-semibold text-gray-600 mb-1">{g.label}</p>
              <div className="flex flex-col gap-0.5">
                {g.rows.map((r, ri) => (
                  <div key={ri} className="flex items-center justify-between py-0.5 border-b border-gray-100">
                    <span className="text-[12px] text-gray-700">
                      {(r.quantidade || 1) > 1 ? `${r.quantidade}× ` : ''}{r.nome}
                    </span>
                    <span className="text-[12px] tabular-nums text-gray-700">
                      {num(r.valorCusto) > 0 ? fmt((r.quantidade || 1) * num(r.valorCusto)) : '—'}
                    </span>
                  </div>
                ))}
                {g.subtotal > 0 && (
                  <div className="flex items-center justify-between py-1 bg-gray-50 px-2 -mx-2 rounded">
                    <span className="text-[11px] font-semibold text-gray-600">Subtotal {g.label}</span>
                    <span className="text-[12px] font-semibold text-gray-800 tabular-nums">{fmt(g.subtotal)}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </Secao>
      )}

      {/* 3. Notas de Faturação */}
      {notasFaturacao && (
        <Secao titulo="Notas de Faturação">
          <p className="text-[12px] text-gray-700 whitespace-pre-wrap">{notasFaturacao}</p>
        </Secao>
      )}

      {/* 4. Custos */}
      {(num(transporte) > 0 || num(alimentacao) > 0 || (nomeArtista && num(valorArtista) > 0)) && (
        <Secao titulo="Custos">
          <div className="flex flex-col gap-0.5">
            {num(transporte) > 0 && <LinhaConta label="Transporte / Combustível" valor={transporte} />}
            {num(alimentacao) > 0 && <LinhaConta label="Alimentação" valor={alimentacao} />}
            {nomeArtista && num(valorArtista) > 0 && <LinhaConta label={`Artista — ${nomeArtista}`} valor={valorArtista} />}
          </div>
        </Secao>
      )}

      {/* 5. Total */}
      <div className="mt-4 pt-4 border-t-2 border-gray-900">
        <div className="flex items-center justify-between">
          <span className="text-[15px] font-black text-gray-900 uppercase tracking-wide">Total</span>
          <span className="text-[18px] font-black text-gray-900 tabular-nums">{fmt(total)}</span>
        </div>
      </div>

      {/* 6. Pagamento */}
      {(estadoPagamento || formaPagamento) && (
        <div className="mt-3 pt-3 border-t border-gray-200 flex items-center gap-6">
          {estadoPagamento && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Estado</span>
              <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                estadoPagamento === 'pago'    ? 'bg-green-50 text-green-700 border-green-200' :
                estadoPagamento === 'parcial' ? 'bg-yellow-50 text-yellow-700 border-yellow-200' :
                'bg-red-50 text-red-600 border-red-200'
              }`}>
                {labelEstado[estadoPagamento] || estadoPagamento}
              </span>
            </div>
          )}
          {formaPagamento && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Forma</span>
              <span className="text-[12px] text-gray-800">{labelForma[formaPagamento] || formaPagamento}</span>
            </div>
          )}
        </div>
      )}

      {/* Notas de Contas */}
      {notasContas && (
        <div className="mt-4 pt-3 border-t border-gray-200">
          <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-1">Notas</p>
          <p className="text-[12px] text-gray-700 whitespace-pre-wrap">{notasContas}</p>
        </div>
      )}

      {/* Assinatura */}
      <div className="mt-8 pt-4 border-t border-gray-200">
        <div className="grid grid-cols-2 gap-8">
          {['Gestor LMD', 'Cliente'].map(label => (
            <div key={label} className="flex flex-col gap-1">
              <div className="border-b border-gray-300 mt-10" />
              <p className="text-[10px] uppercase tracking-wider text-gray-400 mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}
