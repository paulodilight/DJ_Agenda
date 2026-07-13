import { format } from 'date-fns'
import { pt } from 'date-fns/locale'

const dt = (d) => new Date(`${d}T00:00:00`)
const dataCompleta = (d) => d ? (() => { const s = format(dt(d), "EEEE, d 'de' MMMM 'de' yyyy", { locale: pt }); return s.charAt(0).toUpperCase() + s.slice(1) })() : null
const hhmm = (t) => t ? String(t).slice(0, 5) : null

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

function Linha({ rotulo, valor }) {
  if (!valor) return null
  return (
    <div className="flex gap-2 mb-1">
      <span className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold w-24 shrink-0 pt-px">{rotulo}</span>
      <span className="text-[13px] text-gray-800 leading-snug">{valor}</span>
    </div>
  )
}

// dados: { nomeEvento, data, horaInicio, horaFim, diaInstalacao, horaInstalacao,
//          local, morada, responsavel, contacto,
//          tecnicos: [{nome, label}], equipamentos: [{nome, quantidade}],
//          checklists: [{nome, fase, itens:[string]}],
//          veiculo: {descricao, condutor} | null,
//          notasOperacionais, tipoEvento, status, fase }
export function FolhaEvento({ dados }) {
  const {
    nomeEvento, data, horaInicio, horaFim,
    diaInstalacao, horaInstalacao,
    local, morada, responsavel, contacto,
    tecnicos = [], equipamentos = [],
    checklists = [],
    veiculo,
    notasOperacionais, tipoEvento,
  } = dados

  const horaStr = [hhmm(horaInicio), hhmm(horaFim)].filter(Boolean).join(' — ')
  const instStr = diaInstalacao
    ? [dataCompleta(diaInstalacao), hhmm(horaInstalacao)].filter(Boolean).join(' · ')
    : null

  const clPrep = checklists.filter(c => c.fase !== 'saida')
  const clSaida = checklists.filter(c => c.fase === 'saida')

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
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Folha de Evento</p>
          {data && <p className="text-[11px] text-gray-600 mt-1">{dataCompleta(data)}</p>}
        </div>
      </div>

      {/* Data, hora, instalação */}
      <Secao titulo="Data & Hora">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Linha rotulo="Data" valor={data ? dataCompleta(data) : null} />
            <Linha rotulo="Hora" valor={horaStr || null} />
          </div>
          {instStr && (
            <div>
              <Linha rotulo="Instalação" valor={instStr} />
            </div>
          )}
        </div>
      </Secao>

      {/* Local */}
      {(local || morada || responsavel || contacto) && (
        <Secao titulo="Local & Contacto">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Linha rotulo="Local" valor={local} />
              <Linha rotulo="Morada" valor={morada} />
            </div>
            <div>
              <Linha rotulo="Responsável" valor={responsavel} />
              <Linha rotulo="Contacto" valor={contacto} />
            </div>
          </div>
        </Secao>
      )}

      {/* Equipa */}
      {tecnicos.length > 0 && (
        <Secao titulo="Equipa">
          <div className="flex flex-wrap gap-3">
            {tecnicos.map((t, i) => (
              <div key={i} className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 bg-gray-50">
                <span className="text-[12px] font-semibold text-gray-800">{t.nome}</span>
                <span className="text-[10px] text-gray-400 uppercase tracking-wider">{t.label}</span>
              </div>
            ))}
          </div>
        </Secao>
      )}

      {/* Equipamentos */}
      {equipamentos.length > 0 && (
        <Secao titulo="Equipamentos para o Evento">
          <div className="grid grid-cols-2 gap-x-8 gap-y-1">
            {equipamentos.map((e, i) => (
              <div key={i} className="flex items-center gap-2 py-1 border-b border-gray-100">
                <span className="text-[12px] font-bold text-gray-400 w-6 text-right shrink-0">{e.quantidade}×</span>
                <span className="text-[12px] text-gray-800">{e.nome}</span>
              </div>
            ))}
          </div>
        </Secao>
      )}

      {/* Checklists de Preparação */}
      {clPrep.length > 0 && (
        <Secao titulo="Checklist de Preparação">
          {clPrep.map((cl, ci) => (
            <div key={ci} className={ci > 0 ? 'mt-3' : ''}>
              {clPrep.length > 1 && <p className="text-[11px] font-semibold text-gray-600 mb-1">{cl.nome}</p>}
              <div className="grid grid-cols-2 gap-x-8 gap-y-0.5">
                {cl.itens.map((item, ii) => (
                  <div key={ii} className="flex items-start gap-2 py-0.5">
                    <div className="w-3.5 h-3.5 border border-gray-400 rounded-sm shrink-0 mt-px" />
                    <span className="text-[11px] text-gray-700 leading-tight">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </Secao>
      )}

      {/* Checklist de Saída */}
      {clSaida.length > 0 && (
        <Secao titulo="Checklist de Saída">
          {clSaida.map((cl, ci) => (
            <div key={ci} className={ci > 0 ? 'mt-3' : ''}>
              {clSaida.length > 1 && <p className="text-[11px] font-semibold text-gray-600 mb-1">{cl.nome}</p>}
              <div className="grid grid-cols-2 gap-x-8 gap-y-0.5">
                {cl.itens.map((item, ii) => (
                  <div key={ii} className="flex items-start gap-2 py-0.5">
                    <div className="w-3.5 h-3.5 border border-gray-400 rounded-sm shrink-0 mt-px" />
                    <span className="text-[11px] text-gray-700 leading-tight">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </Secao>
      )}

      {/* Veículo */}
      {veiculo && (
        <Secao titulo="Veículo">
          <div className="grid grid-cols-2 gap-4">
            <div>
              {veiculo.descricao && <Linha rotulo="Viatura" valor={veiculo.descricao} />}
              {veiculo.condutor  && <Linha rotulo="Condutor" valor={veiculo.condutor} />}
            </div>
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold w-24 shrink-0">KM Saída</span>
                <div className="flex-1 border-b border-gray-300" style={{ minWidth: 80 }} />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold w-24 shrink-0">KM Chegada</span>
                <div className="flex-1 border-b border-gray-300" style={{ minWidth: 80 }} />
              </div>
            </div>
          </div>
        </Secao>
      )}

      {/* Notas Operacionais */}
      {notasOperacionais && (
        <Secao titulo="Notas Operacionais">
          <p className="text-[12px] text-gray-700 leading-relaxed whitespace-pre-wrap">{notasOperacionais}</p>
        </Secao>
      )}

      {/* Assinaturas */}
      <div className="mt-auto pt-6 border-t border-gray-200">
        <div className="grid grid-cols-3 gap-6">
          {['IN — Work', 'IN — Evento', 'OUT — Evento'].map(label => (
            <div key={label} className="flex flex-col gap-1">
              <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">{label}</p>
              <div className="border-b border-gray-300 mt-6" />
              <p className="text-[10px] text-gray-400 mt-0.5">Hora / Rubrica</p>
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}
