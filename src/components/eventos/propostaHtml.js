const EMPRESA = {
  nome: 'Laboratório de Música Digital, Unipessoal LDA',
  morada: 'Praceta Maestro Ivo Cruz, 12 C',
  codigoPostal: '1500-401 Benfica',
  pais: 'Portugal',
  telefone: '965593369',
  email: 'financeiro@prolabdj.com',
  site: 'xclusivebandjs.com',
  nif: '516233726',
  iban: 'PT50-0033-0000-45616248686-05',
  banco: 'Millenium BCP',
}

function euro(val) {
  return Number(val || 0).toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '€'
}

function hoje() {
  return new Date().toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function gerarHTMLProposta({ linhas, notasTecnicas, notasProposta, evento, espaco, numeroProposta, logoUrl, comIva = true, nomeEvento = '', nomeCliente = '' }) {
  const subtotal = linhas.reduce((s, l) => s + (Number(l.preco) || 0) * (Number(l.qtd) || 1), 0)
  const iva = comIva ? subtotal * 0.23 : 0
  const total = subtotal + iva
  const dataEmissao = hoje()

  const linhasHTML = linhas.map((l, i) => {
    const tot = (Number(l.preco) || 0) * (Number(l.qtd) || 1)
    return `
      <tr>
        <td style="padding:6px 4px;color:#333;">${i + 1}</td>
        <td style="padding:6px 4px;">
          <div>${l.descricao || '—'}</div>
          ${l.observacoes ? `<div style="color:#333;font-size:10px;">${l.observacoes}</div>` : ''}
        </td>
        <td style="padding:6px 4px;text-align:center;color:#333;">${l.qtd || 1}</td>
        <td style="padding:6px 4px;text-align:center;">${l.unidade || 'Uni.'}</td>
        <td style="padding:6px 4px;text-align:right;">${euro(l.preco)}</td>
        ${comIva ? `<td style="padding:6px 4px;text-align:center;">23%</td>` : ''}
        <td style="padding:6px 4px;text-align:right;">${euro(tot)}</td>
      </tr>`
  }).join('')

  const notasHTML = notasTecnicas ? `
    <div style="margin-bottom:20px;padding:10px;background:#f9f9f9;border:1px solid #eee;border-radius:4px;font-size:10px;">
      <div style="font-weight:bold;margin-bottom:4px;">Notas Técnicas</div>
      <div style="white-space:pre-wrap;">${notasTecnicas}</div>
    </div>` : ''

  const clienteHTML = espaco ? `
    <div style="margin-bottom:20px;display:flex;justify-content:flex-end;">
      <div>
        <div style="font-weight:bold;font-size:12px;">${espaco.nome || ''}</div>
        ${evento?.morada ? `<div>${evento.morada}</div>` : ''}
        ${evento?.contacto_pelo_evento ? `<div>${evento.contacto_pelo_evento}</div>` : ''}
        <div>Portugal</div>
      </div>
    </div>` : ''

  return `<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="UTF-8">
  <title>Proposta ${numeroProposta}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 11px; color: #333; background: #fff; padding: 28px 36px; }
    table { width: 100%; border-collapse: collapse; }
    @media print {
      body { padding: 16px 24px; }
      @page { margin: 1.2cm; }
    }
  </style>
</head>
<body>

  <!-- Cabeçalho -->
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;">
    <div>
      ${logoUrl ? `<img src="${logoUrl}" alt="Xclusive" style="height:38px;margin-bottom:6px;display:block;">` : ''}
      <div style="font-weight:bold;font-size:12px;margin-bottom:4px;">${EMPRESA.nome}</div>
      <div style="color:#333;line-height:1.7;">
        <div>${EMPRESA.morada}</div>
        <div>${EMPRESA.codigoPostal}</div>
        <div>${EMPRESA.pais}</div>
        <div><span style="color:#333;font-weight:bold;">Telefone:</span> ${EMPRESA.telefone}</div>
        <div><span style="color:#333;font-weight:bold;">E-mail:</span> ${EMPRESA.email}</div>
        <div><span style="color:#333;font-weight:bold;">Site:</span> ${EMPRESA.site}</div>
      </div>
      <div style="margin-top:6px;font-size:10px;color:#555;">Contribuinte: ${EMPRESA.nif}</div>
    </div>
    <div style="text-align:right;">
      <div style="color:#888;font-size:10px;margin-bottom:2px;">Original</div>
      <div style="font-size:16px;font-weight:bold;">Proposta N.º ${numeroProposta}</div>
      <div style="font-size:11px;margin-top:4px;"><strong>Data de Emissão:</strong> ${dataEmissao}</div>
      ${nomeEvento ? `<div style="font-size:11px;margin-top:6px;"><strong>Evento:</strong> ${nomeEvento}</div>` : ''}
      ${nomeCliente ? `<div style="font-size:11px;"><strong>Cliente:</strong> ${nomeCliente}</div>` : ''}
    </div>
  </div>

  ${clienteHTML}

  <hr style="border:none;border-top:1px solid #ccc;margin-bottom:16px;">

  <!-- Tabela de itens -->
  <table style="margin-bottom:20px;">
    <thead>
      <tr style="border-bottom:1.5px solid #333;">
        <th style="text-align:left;padding:6px 4px;font-size:10px;">Ref.ª</th>
        <th style="text-align:left;padding:6px 4px;font-size:10px;">Designação</th>
        <th style="text-align:center;padding:6px 4px;font-size:10px;">Qtd.</th>
        <th style="text-align:center;padding:6px 4px;font-size:10px;">Uni.</th>
        <th style="text-align:right;padding:6px 4px;font-size:10px;">Preço</th>
        ${comIva ? '<th style="text-align:center;padding:6px 4px;font-size:10px;">Imposto</th>' : ''}
        <th style="text-align:right;padding:6px 4px;font-size:10px;">${comIva ? 'Total s/ imp.' : 'Total'}</th>
      </tr>
    </thead>
    <tbody>
      ${linhasHTML}
    </tbody>
  </table>

  ${notasHTML}

  <hr style="border:none;border-top:1px solid #ccc;margin-bottom:16px;">

  <!-- Totais + Resumo de Impostos -->
  <div style="display:flex;justify-content:space-between;align-items:flex-start;">
    ${comIva ? `<div style="flex:1;">
      <div style="font-weight:bold;font-size:11px;margin-bottom:6px;">Resumo de Impostos</div>
      <table style="min-width:260px;">
        <thead>
          <tr style="border-bottom:1px solid #ccc;">
            <th style="text-align:left;padding:4px 8px 4px 0;font-size:10px;">Designação</th>
            <th style="text-align:right;padding:4px 8px;font-size:10px;">Valor</th>
            <th style="text-align:right;padding:4px 8px;font-size:10px;">Incidência</th>
            <th style="text-align:right;padding:4px 0;font-size:10px;">Total</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="padding:4px 8px 4px 0;color:#333;">IVA Normal</td>
            <td style="padding:4px 8px;text-align:right;">23%</td>
            <td style="padding:4px 8px;text-align:right;">${euro(subtotal)}</td>
            <td style="padding:4px 0;text-align:right;">${euro(iva)}</td>
          </tr>
        </tbody>
      </table>
    </div>` : '<div></div>'}
    <div style="text-align:right;min-width:200px;">
      ${comIva ? `<div style="display:flex;justify-content:space-between;gap:24px;margin-bottom:4px;">
        <span>Total Ilíq.</span><span>${euro(subtotal)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;gap:24px;margin-bottom:4px;">
        <span>IVA Normal</span><span>${euro(iva)}</span>
      </div>` : ''}
      <div style="display:flex;justify-content:space-between;gap:24px;font-weight:bold;font-size:13px;border-top:1.5px solid #333;padding-top:6px;margin-top:4px;">
        <span>Total a pagar</span><span>${euro(total)}</span>
      </div>
    </div>
  </div>

  <!-- Info bancária -->
  <div style="margin-top:24px;font-size:10px;">
    <div style="font-weight:bold;">Informação Bancária</div>
    <div><strong>${EMPRESA.banco}:</strong> ${EMPRESA.iban}</div>
  </div>

  <!-- Detalhes do evento -->
  ${(evento?.hora_instalacao || evento?.hora_inicio || evento?.hora_fim || evento?.morada) ? `
  <div style="margin-top:20px;font-size:10px;border-top:1px solid #eee;padding-top:12px;display:grid;grid-template-columns:1fr 1fr;gap:4px 24px;">
    ${evento?.hora_instalacao ? `<div><strong>Hora de instalação:</strong> ${evento.hora_instalacao.slice(0,5)}</div>` : ''}
    ${evento?.hora_inicio     ? `<div><strong>Hora de início:</strong> ${evento.hora_inicio.slice(0,5)}</div>` : ''}
    ${evento?.hora_fim        ? `<div><strong>Hora de fim:</strong> ${evento.hora_fim.slice(0,5)}</div>` : ''}
    ${evento?.morada          ? `<div style="grid-column:1/-1;"><strong>Morada do evento:</strong> ${evento.morada}</div>` : ''}
  </div>` : ''}

  <!-- Nota legal -->
  <div style="margin-top:16px;font-size:9px;color:#666;border-top:1px solid #eee;padding-top:8px;">
    Este documento não serve de fatura e foi criado a ${dataEmissao}.${!comIva ? ' Esta proposta acresce IVA à taxa legal em vigor.' : ''}
  </div>

  ${notasProposta ? `
  <!-- Notas da Proposta -->
  <div style="margin-top:10px;font-size:10px;color:#333;white-space:pre-wrap;">${notasProposta}</div>` : ''}

  <script>window.onload = function() { window.print(); window.onafterprint = function() { window.close(); }; }</script>
</body>
</html>`
}
