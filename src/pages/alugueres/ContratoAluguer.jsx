import { useRef } from 'react'
import { X, Printer } from 'lucide-react'
import { format } from 'date-fns'
import { pt } from 'date-fns/locale'

function fmtDia(iso) {
  if (!iso) return '___/___/______'
  return format(new Date(iso), 'dd/MM/yyyy', { locale: pt })
}

function fmtMes(iso) {
  if (!iso) return '___________________________'
  return format(new Date(iso), "d 'de' MMMM 'de' yyyy", { locale: pt })
}

export function ContratoAluguer({ aluguer, onClose }) {
  const printRef = useRef(null)
  const cli   = aluguer?.aluguer_clientes
  const itens = aluguer?.aluguer_itens ?? []

  const valorTotal = aluguer?.valor_total
    ?? itens.reduce((s, i) => s + (parseFloat(i.preco_aplicado) || 0) * (i.quantidade || 1), 0)

  const imprimir = () => {
    const conteudo = printRef.current?.innerHTML ?? ''
    const janela   = window.open('', '_blank', 'width=900,height=1200')
    janela.document.write(`<!DOCTYPE html><html lang="pt"><head>
      <meta charset="UTF-8"/>
      <title>Contrato — ${aluguer?.numero ?? ''}</title>
      <style>
        *{box-sizing:border-box;margin:0;padding:0}
        body{font-family:'Arial',sans-serif;font-size:10.5pt;color:#111;background:#fff;padding:20mm 18mm}
        h1{font-size:13pt;font-weight:700;text-align:center;margin-bottom:4mm;letter-spacing:1px}
        h2{font-size:10.5pt;font-weight:700;text-align:center;margin:6mm 0 3mm;letter-spacing:0.5px}
        .logo-row{text-align:center;margin-bottom:5mm}
        .logo-row strong{font-size:15pt;letter-spacing:2px}
        .logo-row span{display:block;font-size:8pt;color:#555;letter-spacing:1px}
        .header-grid{display:grid;grid-template-columns:1fr 1fr;gap:3mm;margin-bottom:4mm;border:1px solid #ccc;padding:3mm}
        .header-grid .col{display:flex;flex-direction:column;gap:1mm}
        .header-grid label{font-size:8pt;color:#555;font-weight:700;text-transform:uppercase;letter-spacing:0.5px}
        .header-grid span{font-size:10pt;font-weight:600;border-bottom:1px solid #ddd;padding-bottom:1mm}
        .grid-datas{display:grid;grid-template-columns:1fr 1fr;gap:2mm;margin-bottom:4mm}
        .datas-box{border:1px solid #ccc;padding:2mm 3mm}
        .datas-box label{font-size:8pt;color:#555;font-weight:700;display:block;margin-bottom:0.5mm}
        .datas-box span{font-size:10pt;font-weight:600}
        .nr-row{display:flex;justify-content:space-between;align-items:center;margin-bottom:4mm;border-bottom:2px solid #111;padding-bottom:2mm}
        .nr-row .nr{font-size:12pt;font-weight:700}
        .nr-row .estado{font-size:9pt;color:#555}
        table{width:100%;border-collapse:collapse;margin-bottom:4mm}
        thead th{background:#f0f0f0;font-size:9pt;font-weight:700;text-align:left;padding:2mm 3mm;border:1px solid #ccc;text-transform:uppercase;letter-spacing:0.3px}
        tbody td{padding:2mm 3mm;border:1px solid #ccc;font-size:9.5pt}
        tbody tr:nth-child(even){background:#fafafa}
        .total-row{text-align:right;font-size:12pt;font-weight:700;margin-bottom:6mm;padding:2mm 0;border-top:2px solid #111}
        .total-row span{font-size:9pt;font-weight:400;color:#555;display:block}
        .obs{font-size:9pt;border:1px solid #ccc;padding:3mm;background:#fafafa;margin-bottom:5mm}
        .obs p{margin-bottom:1.5mm}
        .legal{font-size:8pt;line-height:1.55;margin-bottom:5mm;text-align:justify}
        .legal p{margin-bottom:2mm}
        .legal strong{font-weight:700}
        .termo{border:1px solid #111;padding:4mm;font-size:8.5pt;line-height:1.6;text-align:justify;margin-bottom:5mm}
        .sigs{display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:4mm;margin-top:6mm}
        .sig{border-top:1px solid #111;padding-top:2mm;font-size:8pt;color:#333}
        .sig strong{display:block;font-size:7.5pt;font-weight:700;text-transform:uppercase;color:#555;margin-bottom:5mm}
        .data-assin{margin-bottom:4mm;font-size:9.5pt}
        @media print{body{padding:15mm 14mm}}
      </style>
    </head><body>${conteudo}</body></html>`)
    janela.document.close()
    janela.focus()
    setTimeout(() => { janela.print() }, 400)
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/70 flex flex-col">
      {/* Barra topo */}
      <div className="shrink-0 flex items-center justify-between px-5 py-3 bg-surface-1 border-b border-border">
        <span className="text-sm font-bold text-accent">Contrato — {aluguer?.numero}</span>
        <div className="flex items-center gap-2">
          <button onClick={imprimir}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-status-confirmado/15 border border-status-confirmado/30 text-status-confirmado text-xs font-semibold hover:bg-status-confirmado/25 transition-colors">
            <Printer size={13} /> Imprimir / Guardar PDF
          </button>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-surface-2 text-accent-subtle hover:text-accent transition-colors">
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Preview scrollável */}
      <div className="flex-1 overflow-y-auto bg-surface-0 p-6 flex justify-center">
        <div ref={printRef} className="bg-white text-black w-full max-w-[780px] p-10 shadow-xl text-[10.5pt] leading-snug font-['Arial',sans-serif]">

          {/* Logo */}
          <div className="text-center mb-5">
            <strong className="text-[15pt] tracking-widest">LMD</strong>
            <span className="text-[8pt] text-gray-500 block tracking-wider">Laboratório de Música Digital</span>
          </div>

          {/* Nº Aluguer */}
          <div className="flex justify-between items-center mb-4 border-b-2 border-black pb-2">
            <span className="text-[12pt] font-bold">Nº Aluguer: {aluguer?.numero ?? '—'}</span>
            <span className="text-[9pt] text-gray-500">Data de emissão: {fmtDia(aluguer?.created_at)}</span>
          </div>

          {/* Grid info */}
          <div className="grid grid-cols-2 gap-3 mb-4 text-[9.5pt]">
            {/* Esquerda: cliente */}
            <div className="border border-gray-300 p-3 space-y-1.5">
              <Row label="Cliente"     val={cli?.nome} />
              <Row label="Telemovel"   val={cli?.telefone} />
              <Row label="E-mail"      val={cli?.email} />
              {cli?.nif && <Row label="NIF" val={cli.nif} />}
            </div>
            {/* Direita: datas + local */}
            <div className="border border-gray-300 p-3 space-y-1.5">
              <div className="grid grid-cols-2 gap-2">
                <Row label="Saída"   val={fmtDia(aluguer?.data_saida_prevista)} />
                <Row label="Entrada" val={fmtDia(aluguer?.data_entrada_prevista)} />
              </div>
              <Row label="Morada / Local de uso" val={aluguer?.local_utilizacao || aluguer?.local_levantamento} />
              {aluguer?.matricula && <Row label="Matrícula" val={aluguer.matricula} />}
            </div>
          </div>

          {/* Atendido por */}
          <div className="grid grid-cols-2 gap-3 mb-4 text-[9.5pt]">
            <div className="border border-gray-300 p-3 space-y-1.5">
              <Row label="Atendido por"  val={aluguer?.atendido_por} />
              {aluguer?.atendido_por_tel   && <Row label="Tel"   val={aluguer.atendido_por_tel} />}
              {aluguer?.atendido_por_email && <Row label="E-mail" val={aluguer.atendido_por_email} />}
            </div>
            <div className="border border-gray-300 p-3 space-y-1.5">
              <Row label="Levantamento" val={aluguer?.local_levantamento} />
              <Row label="Entrega"      val={aluguer?.local_devolucao !== aluguer?.local_levantamento ? aluguer?.local_devolucao : ''} />
            </div>
          </div>

          {/* Tabela de equipamentos */}
          <table className="w-full border-collapse mb-3 text-[9.5pt]">
            <thead>
              <tr className="bg-gray-100">
                <th className="border border-gray-300 px-3 py-1.5 text-left uppercase text-[8pt] tracking-wide">SKU</th>
                <th className="border border-gray-300 px-3 py-1.5 text-center uppercase text-[8pt] tracking-wide w-20">Qtd.</th>
                <th className="border border-gray-300 px-3 py-1.5 text-left uppercase text-[8pt] tracking-wide">Descrição</th>
                <th className="border border-gray-300 px-3 py-1.5 text-right uppercase text-[8pt] tracking-wide w-24">Valor</th>
              </tr>
            </thead>
            <tbody>
              {itens.map((item, i) => (
                <tr key={item.id ?? i} className={i % 2 === 1 ? 'bg-gray-50' : ''}>
                  <td className="border border-gray-300 px-3 py-1.5 text-gray-400 font-mono text-[8.5pt]">{item.equipamentos?.qr_code ?? '—'}</td>
                  <td className="border border-gray-300 px-3 py-1.5 text-center">{item.quantidade}</td>
                  <td className="border border-gray-300 px-3 py-1.5 font-medium">{item.equipamentos?.nome ?? '—'}</td>
                  <td className="border border-gray-300 px-3 py-1.5 text-right tabular-nums">
                    {item.preco_aplicado != null ? `${parseFloat(item.preco_aplicado).toFixed(2)} €` : '—'}
                  </td>
                </tr>
              ))}
              {/* Linhas em branco */}
              {Array.from({ length: Math.max(0, 6 - itens.length) }).map((_, i) => (
                <tr key={`blank-${i}`} className="h-7">
                  <td className="border border-gray-300 px-3" />
                  <td className="border border-gray-300 px-3" />
                  <td className="border border-gray-300 px-3" />
                  <td className="border border-gray-300 px-3" />
                </tr>
              ))}
            </tbody>
          </table>

          {/* Total */}
          <div className="text-right mb-4 text-[11pt] font-bold border-t-2 border-black pt-2">
            VALOR TOTAL ALUGUER: {valorTotal ? `${parseFloat(valorTotal).toFixed(2)} €` : '_______ €'}
          </div>
          {aluguer?.caucao_valor && (
            <div className="text-right text-[9.5pt] mb-4 text-gray-600">
              Caução: {parseFloat(aluguer.caucao_valor).toFixed(2)} € ({aluguer.caucao_metodo ?? '—'})
            </div>
          )}

          {aluguer?.notas && (
            <div className="border border-gray-300 bg-gray-50 p-3 mb-4 text-[9pt]">
              <strong className="uppercase text-[8pt] tracking-wide text-gray-500">Observações:</strong>
              <p className="mt-1">{aluguer.notas}</p>
            </div>
          )}

          {/* Contrato */}
          <h2 className="text-center font-bold uppercase tracking-wider text-[10.5pt] my-4 border-t border-b border-gray-400 py-2">
            Contrato de Aluguer de Material
          </h2>
          <div className="text-[8pt] leading-relaxed text-justify space-y-2 mb-4">
            <p>Os termos do presente contrato, o Arrendador (LMD – Laboratório de Música Digital, Lda.) aluga ao Arrendatário os materiais descritos na frente deste documento, para que o Arrendatário os utilize de acordo com as condições definidas, mediante assinatura do presente contrato.</p>
            <p><strong>Prazo:</strong> A duração do contrato está registada na frente deste documento, ambas as datas incluídas. O Arrendatário compromete-se a devolver o material no prazo acordado. Qualquer extensão deve ser acordada por escrito entre as partes. O Arrendatário será obrigado a pagar o montante previsto e, em caso de atraso, o triplo da importância diária do aluguer por cada dia, até ao momento em que entregue o material com todos os acessórios.</p>
            <p><strong>Obrigações:</strong> O Arrendatário compromete-se a: utilizar o material de forma adequada; devolvê-lo nas mesmas condições em que foi entregue, com todos os acessórios; não sublocar, ceder ou partilhar com terceiros sem consentimento prévio escrito; suportar todos os custos de reparação por danos, extravios ou uso inadequado. Os materiais devem ser devolvidos nas instalações da LMD Lda., salvo acordo escrito em contrário.</p>
            <p><strong>Responsabilidade:</strong> O Arrendatário torna-se responsável pelo material no momento da sua receção. Qualquer perda, dano, destruição ou deterioração — total ou parcial — será da sua responsabilidade, independentemente da causa, incluindo casos fortuitos ou de força maior. O Arrendatário indemnizará e isentará de responsabilidade o Arrendador por qualquer perda ou deterioração do material.</p>
            <p><strong>Pagamento:</strong> Não será aceite outra forma de pagamento que não o previamente acordado. O incumprimento desta cláusula será justa causa para rescisão. Em caso de falta de pagamento, o Arrendatário devolverá o material no prazo de dois dias após notificação, sendo aplicada a cláusula penal do triplo do valor do aluguer por dia em atraso.</p>
            <p><strong>Propriedade:</strong> O material alugado é propriedade do Arrendador. São proibidas quaisquer modificações sem autorização prévia escrita. O Arrendatário compromete-se a manter visíveis as marcas identificativas de propriedade da LMD Lda. A totalidade dos danos causados a terceiros durante o período de vigência será da responsabilidade do Arrendatário.</p>
            <p>A pessoa que assina responsabiliza-se em nome do cliente acima mencionado de danos, extravios, furtos, etc. A partir do momento em que o material lhe é entregue. Li e estou em conformidade com as condições acima.</p>
            <p className="font-bold">RECEBI O MATERIAL EM PERFEITO ESTADO &nbsp;&nbsp;&nbsp;&nbsp;&nbsp; ASSINATURA: ______________________________</p>
            <p>NOME: _______________________________________________&nbsp;&nbsp;&nbsp; CC/BI: _____________________________</p>
          </div>

          {/* Assinaturas operacionais */}
          <div className="grid grid-cols-4 gap-4 mt-4 mb-6">
            {['Preparado por', 'Entregue por', 'Recebido por', 'Revisto por'].map(s => (
              <div key={s} className="border-t border-black pt-1">
                <span className="text-[7.5pt] uppercase font-bold text-gray-500 block">{s}</span>
                <div className="h-10" />
                <div className="border-t border-gray-400 mt-1" />
              </div>
            ))}
          </div>

          {/* Termo de responsabilidade */}
          <h2 className="text-center font-bold uppercase tracking-wider text-[10.5pt] my-4 border-t border-b border-gray-400 py-2">
            Termo de Responsabilidade
          </h2>
          <div className="text-[8.5pt] leading-relaxed text-justify border border-black p-4 mb-5">
            <p className="mb-2">Eu <strong>{cli?.nome ?? '____________________________________________'}</strong> declaro para fins de RESPONSABILIDADE, que recebi na data abaixo indicada o(s) equipamento(s) incluído(s) no orçamento de aluguer de material em perfeitas condições de uso, para meu uso exclusivo, conforme determinado na lei, comprometendo-me a mantê-los em seu perfeito estado de conservação/uso e a devolver o(s) mesmo(s) na condição de novo(s) em caso de:</p>
            <p className="mb-1">1. Se o equipamento for danificado ou inutilizado por emprego inadequado, mau uso, negligência ou extravio.</p>
            <p className="mb-1">2. Por roubo ou extravio do equipamento, e deverá comunicar imediatamente às autoridades competentes.</p>
            <p className="mb-2">3. Se o equipamento for apreendido pelas autoridades policiais.</p>
            <p>Declaro ainda que ao levar o(s) equipamento(s) verifiquei o estado e todos os equipamentos e acessórios e tomei conhecimento e aceitei sem reservas as Condições Gerais deste contrato de aluguer de Material.</p>
          </div>

          <p className="mb-10 text-[9.5pt]">Lisboa, ________ de {fmtMes(aluguer?.data_saida_prevista)}</p>
          <div className="text-right text-[9.5pt]">
            <div className="inline-block border-t border-black pt-1 w-48">O Locatário</div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Row({ label, val }) {
  return (
    <div>
      <span className="text-[7.5pt] uppercase font-bold text-gray-400 tracking-wider">{label}</span>
      <div className="text-[9.5pt] font-semibold border-b border-gray-200 pb-0.5 mt-0.5">{val || ' '}</div>
    </div>
  )
}
