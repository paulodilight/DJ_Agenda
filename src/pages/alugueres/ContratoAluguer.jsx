import { useMemo } from 'react'
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

// ── Gera o HTML completo do contrato (usado tanto no iframe como na impressão)
function buildHtml(aluguer) {
  const cli   = aluguer?.aluguer_clientes
  const itens = aluguer?.aluguer_itens ?? []
  const valorTotal = aluguer?.valor_total
    ?? itens.reduce((s, i) => s + (parseFloat(i.preco_aplicado) || 0) * (i.quantidade || 1), 0)

  // ── helpers de HTML ──
  const esc = (s) => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')

  const row = (label, val) => `
    <div style="margin-bottom:3mm">
      <div style="font-size:7.5pt;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#888;margin-bottom:1mm">${esc(label)}</div>
      <div style="font-size:9.5pt;font-weight:600;border-bottom:1px solid #ddd;padding-bottom:1mm;color:#111;min-height:4mm">${esc(val) || '&nbsp;'}</div>
    </div>`

  const itensHtml = itens.map((item, i) => `
    <tr style="background:${i % 2 === 1 ? '#f9fafb' : '#ffffff'}">
      <td style="border:1px solid #ccc;padding:2mm 3mm;font-size:8.5pt;color:#9ca3af;font-family:monospace">${esc(item.equipamentos?.qr_code ?? '—')}</td>
      <td style="border:1px solid #ccc;padding:2mm 3mm;text-align:center;color:#111">${esc(item.quantidade)}</td>
      <td style="border:1px solid #ccc;padding:2mm 3mm;font-weight:600;color:#111">${esc(item.equipamentos?.nome ?? '—')}</td>
      <td style="border:1px solid #ccc;padding:2mm 3mm;text-align:right;color:#111">${item.preco_aplicado != null ? parseFloat(item.preco_aplicado).toFixed(2) + ' €' : '—'}</td>
    </tr>`).join('')

  const blankHtml = Array.from({ length: Math.max(0, 6 - itens.length) }).map(() => `
    <tr style="height:7mm;background:#ffffff">
      <td style="border:1px solid #ccc;padding:2mm 3mm;background:#ffffff"></td>
      <td style="border:1px solid #ccc;padding:2mm 3mm;background:#ffffff"></td>
      <td style="border:1px solid #ccc;padding:2mm 3mm;background:#ffffff"></td>
      <td style="border:1px solid #ccc;padding:2mm 3mm;background:#ffffff"></td>
    </tr>`).join('')

  const caucaoHtml = aluguer?.caucao_valor ? `
    <div style="text-align:right;font-size:9.5pt;margin-bottom:4mm;color:#666">
      Caução: ${parseFloat(aluguer.caucao_valor).toFixed(2)} € (${esc(aluguer.caucao_metodo ?? '—')})
    </div>` : ''

  const notasHtml = aluguer?.notas ? `
    <div style="border:1px solid #ccc;background:#fafafa;padding:3mm;margin-bottom:4mm;font-size:9pt;color:#111">
      <strong style="font-size:8pt;text-transform:uppercase;color:#888;letter-spacing:0.5px">Observações:</strong>
      <p style="margin-top:1mm">${esc(aluguer.notas)}</p>
    </div>` : ''

  const entregaHtml = aluguer?.local_devolucao && aluguer.local_devolucao !== aluguer.local_levantamento
    ? row('Entrega', aluguer.local_devolucao) : ''

  return `<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="UTF-8"/>
  <title>Contrato — ${esc(aluguer?.numero ?? '')}</title>
  <style>
    html,body{color-scheme:light;background:#ffffff;color:#111111}
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Arial,Helvetica,sans-serif;font-size:10.5pt;padding:20mm 18mm}
    h2{font-size:10.5pt;font-weight:700;text-align:center;letter-spacing:0.5px;
       border-top:1px solid #aaa;border-bottom:1px solid #aaa;padding:2mm 0;margin:5mm 0}
    table{width:100%;border-collapse:collapse;margin-bottom:4mm}
    thead th{background:#f0f0f0 !important;color:#111 !important;font-size:9pt;font-weight:700;
             text-align:left;padding:2mm 3mm;border:1px solid #ccc;text-transform:uppercase;
             letter-spacing:0.3px}
    @media print{body{padding:15mm 14mm}}
  </style>
</head>
<body>

  <!-- Logo -->
  <div style="text-align:center;margin-bottom:5mm">
    <strong style="font-size:15pt;letter-spacing:2px">LMD</strong>
    <div style="font-size:8pt;color:#555;letter-spacing:1px;margin-top:1mm">Laboratório de Música Digital</div>
  </div>

  <!-- Nº Aluguer -->
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4mm;border-bottom:2px solid #111;padding-bottom:2mm">
    <span style="font-size:12pt;font-weight:700">Nº Aluguer: ${esc(aluguer?.numero ?? '—')}</span>
    <span style="font-size:9pt;color:#555">Data de emissão: ${fmtDia(aluguer?.created_at)}</span>
  </div>

  <!-- Grid cliente / datas -->
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:3mm;margin-bottom:4mm">
    <div style="border:1px solid #ccc;padding:3mm">
      ${row('Cliente', cli?.nome)}
      ${row('Telemovel', cli?.telefone)}
      ${row('E-mail', cli?.email)}
      ${cli?.nif ? row('NIF', cli.nif) : ''}
    </div>
    <div style="border:1px solid #ccc;padding:3mm">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:2mm">
        ${row('Saída', fmtDia(aluguer?.data_saida_prevista))}
        ${row('Entrada', fmtDia(aluguer?.data_entrada_prevista))}
      </div>
      ${row('Morada / Local de uso', aluguer?.local_utilizacao || aluguer?.local_levantamento)}
      ${aluguer?.matricula ? row('Matrícula', aluguer.matricula) : ''}
    </div>
  </div>

  <!-- Atendido por / Levantamento -->
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:3mm;margin-bottom:4mm">
    <div style="border:1px solid #ccc;padding:3mm">
      ${row('Atendido por', aluguer?.atendido_por)}
      ${aluguer?.atendido_por_tel   ? row('Tel',    aluguer.atendido_por_tel)   : ''}
      ${aluguer?.atendido_por_email ? row('E-mail', aluguer.atendido_por_email) : ''}
    </div>
    <div style="border:1px solid #ccc;padding:3mm">
      ${row('Levantamento', aluguer?.local_levantamento)}
      ${entregaHtml}
    </div>
  </div>

  <!-- Tabela de equipamentos -->
  <table>
    <thead>
      <tr>
        <th>SKU</th>
        <th style="width:60px;text-align:center">Qtd.</th>
        <th>Descrição</th>
        <th style="width:80px;text-align:right">Valor</th>
      </tr>
    </thead>
    <tbody>
      ${itensHtml}
      ${blankHtml}
    </tbody>
  </table>

  <!-- Total -->
  <div style="text-align:right;font-size:12pt;font-weight:700;border-top:2px solid #111;padding-top:2mm;margin-bottom:4mm;color:#111">
    VALOR TOTAL ALUGUER: ${valorTotal ? parseFloat(valorTotal).toFixed(2) + ' €' : '_______ €'}
  </div>

  ${caucaoHtml}
  ${notasHtml}

  <!-- Contrato -->
  <h2>Contrato de Aluguer de Material</h2>
  <div style="font-size:8pt;line-height:1.55;text-align:justify;margin-bottom:4mm;color:#111">
    <p style="margin-bottom:2mm">Os termos do presente contrato, o Arrendador (LMD – Laboratório de Música Digital, Lda.) aluga ao Arrendatário os materiais descritos na frente deste documento, para que o Arrendatário os utilize de acordo com as condições definidas, mediante assinatura do presente contrato.</p>
    <p style="margin-bottom:2mm"><strong>Prazo:</strong> A duração do contrato está registada na frente deste documento, ambas as datas incluídas. O Arrendatário compromete-se a devolver o material no prazo acordado. Qualquer extensão deve ser acordada por escrito entre as partes. O Arrendatário será obrigado a pagar o montante previsto e, em caso de atraso, o triplo da importância diária do aluguer por cada dia, até ao momento em que entregue o material com todos os acessórios.</p>
    <p style="margin-bottom:2mm"><strong>Obrigações:</strong> O Arrendatário compromete-se a: utilizar o material de forma adequada; devolvê-lo nas mesmas condições em que foi entregue, com todos os acessórios; não sublocar, ceder ou partilhar com terceiros sem consentimento prévio escrito; suportar todos os custos de reparação por danos, extravios ou uso inadequado. Os materiais devem ser devolvidos nas instalações da LMD Lda., salvo acordo escrito em contrário.</p>
    <p style="margin-bottom:2mm"><strong>Responsabilidade:</strong> O Arrendatário torna-se responsável pelo material no momento da sua receção. Qualquer perda, dano, destruição ou deterioração — total ou parcial — será da sua responsabilidade, independentemente da causa, incluindo casos fortuitos ou de força maior. O Arrendatário indemnizará e isentará de responsabilidade o Arrendador por qualquer perda ou deterioração do material.</p>
    <p style="margin-bottom:2mm"><strong>Pagamento:</strong> Não será aceite outra forma de pagamento que não o previamente acordado. O incumprimento desta cláusula será justa causa para rescisão. Em caso de falta de pagamento, o Arrendatário devolverá o material no prazo de dois dias após notificação, sendo aplicada a cláusula penal do triplo do valor do aluguer por dia em atraso.</p>
    <p style="margin-bottom:2mm"><strong>Propriedade:</strong> O material alugado é propriedade do Arrendador. São proibidas quaisquer modificações sem autorização prévia escrita. O Arrendatário compromete-se a manter visíveis as marcas identificativas de propriedade da LMD Lda. A totalidade dos danos causados a terceiros durante o período de vigência será da responsabilidade do Arrendatário.</p>
    <p style="margin-bottom:2mm">A pessoa que assina responsabiliza-se em nome do cliente acima mencionado de danos, extravios, furtos, etc. A partir do momento em que o material lhe é entregue. Li e estou em conformidade com as condições acima.</p>
    <p style="font-weight:700">RECEBI O MATERIAL EM PERFEITO ESTADO &nbsp;&nbsp;&nbsp; ASSINATURA: ______________________________</p>
    <p>NOME: _______________________________________________&nbsp;&nbsp; CC/BI: _____________________________</p>
  </div>

  <!-- Assinaturas operacionais -->
  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:4mm;margin:6mm 0">
    ${['Preparado por','Entregue por','Recebido por','Revisto por'].map(s => `
      <div style="border-top:1px solid #111;padding-top:2mm">
        <div style="font-size:7.5pt;font-weight:700;text-transform:uppercase;color:#555">${s}</div>
        <div style="height:12mm"></div>
        <div style="border-top:1px solid #aaa"></div>
      </div>`).join('')}
  </div>

  <!-- Termo de responsabilidade -->
  <h2>Termo de Responsabilidade</h2>
  <div style="border:1px solid #111;padding:4mm;font-size:8.5pt;line-height:1.6;text-align:justify;margin-bottom:5mm;color:#111">
    <p style="margin-bottom:2mm">Eu <strong>${esc(cli?.nome ?? '____________________________________________')}</strong> declaro para fins de RESPONSABILIDADE, que recebi na data abaixo indicada o(s) equipamento(s) incluído(s) no orçamento de aluguer de material em perfeitas condições de uso, para meu uso exclusivo, conforme determinado na lei, comprometendo-me a mantê-los em seu perfeito estado de conservação/uso e a devolver o(s) mesmo(s) na condição de novo(s) em caso de:</p>
    <p style="margin-bottom:1mm">1. Se o equipamento for danificado ou inutilizado por emprego inadequado, mau uso, negligência ou extravio.</p>
    <p style="margin-bottom:1mm">2. Por roubo ou extravio do equipamento, e deverá comunicar imediatamente às autoridades competentes.</p>
    <p style="margin-bottom:2mm">3. Se o equipamento for apreendido pelas autoridades policiais.</p>
    <p>Declaro ainda que ao levar o(s) equipamento(s) verifiquei o estado e todos os equipamentos e acessórios e tomei conhecimento e aceitei sem reservas as Condições Gerais deste contrato de aluguer de Material.</p>
  </div>

  <p style="margin-bottom:10mm;font-size:9.5pt;color:#111">Lisboa, ________ de ${fmtMes(aluguer?.data_saida_prevista)}</p>
  <div style="text-align:right;font-size:9.5pt;color:#111">
    <div style="display:inline-block;border-top:1px solid #111;padding-top:2mm;width:48mm">O Locatário</div>
  </div>

</body>
</html>`
}

export function ContratoAluguer({ aluguer, onClose }) {
  const html = useMemo(() => buildHtml(aluguer), [aluguer])

  const imprimir = () => {
    const janela = window.open('', '_blank', 'width=900,height=1200')
    janela.document.write(html)
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

      {/* Prévia em iframe — isolado do dark mode da app */}
      <div className="flex-1 overflow-hidden bg-surface-0 p-4 flex justify-center">
        <iframe
          srcDoc={html}
          title={`Contrato ${aluguer?.numero}`}
          className="w-full max-w-[820px] h-full border-0 rounded shadow-xl"
          style={{ background: '#fff' }}
        />
      </div>
    </div>
  )
}
