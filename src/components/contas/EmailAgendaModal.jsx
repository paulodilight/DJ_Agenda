import React, { useState, useMemo, useEffect, useRef } from 'react'
import { X, Copy, Download, Plus, Trash2 } from 'lucide-react'
import { clsx } from 'clsx'

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

// ── helpers (mirrored from ContasClientes) ────────────────────────────────────
const parseN = v => { const n = parseFloat(String(v ?? '').replace(',','.')); return isNaN(n) ? 0 : n }
const itemTot = r => {
  const sub = parseN(r.unidades) * parseN(r.valor_unitario)
  const m = parseN(r.margem)
  if (m <= 0) return sub
  return r.margem_tipo === 'pct' ? sub * (1 + m / 100) : sub + m
}
const TIPO_MAP = {
  'residente anl':'residente_anl','residente st':'residente_st','residente':'residente',
  'convidado int':'convidado_int','convidado ext':'convidado_ext','convidado':'convidado_ext','premium':'premium',
}
const mTipo = t => t ? (TIPO_MAP[t.trim().toLowerCase()] ?? null) : null
const RES_K  = new Set(['residente_anl','residente','residente_st'])
const CONV_K = new Set(['convidado_int'])
const EXT_K  = new Set(['convidado_ext','premium'])

function sRate(slot, subtiposConfig, catTotals) {
  if (slot.valor != null)
    return (Number(slot.valor)||0)+(Number(slot.margem)||0)+(Number(slot.transporte)||0)+(Number(slot.extras)||0)
  const tipo = mTipo(slot.tipo_slot)
  if (!tipo) return 0
  if (subtiposConfig?.length > 0) {
    const doy = slot.data ? new Date(slot.data+'T12:00:00').getDay() : -1
    const sub = (doy >= 0 ? subtiposConfig.find(s=>s.tipo===tipo&&s.dias.includes(doy)) : null)
      ?? subtiposConfig.find(s=>s.tipo===tipo)
    if (sub?.total > 0) return sub.total
  }
  return catTotals?.[tipo]?.total ?? 0
}

const eventoRate = ev =>
  (Number(ev.valor_apoio_tecnico)||0) + (Number(ev.margem)||0) +
  (Number(ev.transporte)||0) + (Number(ev.extras_contas)||0)

const fmtData = d => {
  if (!d) return ''
  const [, m, day] = d.split('-')
  return `${day}/${m}`
}

function initForm(espaco, slots, eventos, cards, catTotals, subtiposConfig, anoMes) {
  const [ano, mesN] = (anoMes||'').split('-').map(Number)
  const mesNome = MESES[(mesN||1)-1] || 'Janeiro'
  const anoStr = String(ano || new Date().getFullYear())

  let nRes=0, vRes=0, nConv=0, vConv=0, vExt=0
  for (const s of slots) {
    const tipo = mTipo(s.tipo_slot)
    const rate = sRate(s, subtiposConfig, catTotals)
    if (RES_K.has(tipo))       { nRes++; vRes += rate }
    else if (CONV_K.has(tipo)) { nConv++; vConv += rate }
    else if (EXT_K.has(tipo))  { vExt += rate }
  }

  const card = cards[espaco.id] || {}
  const apoio = []
  ;['equipamentos_alugado','equipamentos_comprado','musicos_bandas','extras'].forEach(sec => {
    ;(card[sec]||[]).forEach(r => {
      const v = itemTot(r)
      if (v > 0 && r.descricao)
        apoio.push({ mes: mesNome, item: r.descricao, valor: Math.round(v*100)/100, notas: r.notas||'' })
    })
  })

  // Apoio Técnico — from supa_eventos, agrupado por tipo (como na SpaceCard)
  const gruposTec = {}
  ;(eventos||[]).forEach(ev => {
    const rate = eventoRate(ev)
    if (rate <= 0) return
    const tipo = (ev.tipo || 'Outros').toUpperCase()
    if (!gruposTec[tipo]) gruposTec[tipo] = { tipo, n: 0, valor: 0 }
    gruposTec[tipo].n += 1
    gruposTec[tipo].valor += rate
  })
  const apoioTec = Object.values(gruposTec)
    .map(g => ({ tipo: g.tipo, n: g.n, valor: Math.round(g.valor * 100) / 100 }))

  return {
    contacto: '', para: espaco.email||'', cc: '',
    assunto: `Agenda DJ — ${mesNome} ${anoStr} · ${espaco.nome}`,
    mes: mesNome, ano: anoStr, espaco: espaco.nome,
    pin: espaco.pin_gestor||'', linkApp: 'https://app.xclusivedj.pt',
    txtP1: 'Segue abaixo o link para a Agenda dos DJs e Apoio aos Espetáculos previsto para o mês de {{MÊS}} {{ANO}} para validação, e a estimativa do valor total para vosso conhecimento. A agenda pode sofrer alterações.',
    txtP2: 'Ficamos a aguardar a NE para a validação desta Agenda.',
    nRes, vRes: Math.round(vRes), nResN: '',
    nConv, vConv: Math.round(vConv), nConvN: '',
    vExt: Math.round(vExt), nExtN: '',
    avenca: espaco.valor_avenca||0,
    incApoio: apoio.length > 0,
    incApoioTec: apoioTec.length > 0,
    notasG: 'Os DJs foram distribuídos mediante as indicações, quando não acontece é por indisponibilidade dos DJs favoritos.',
    mencao: '', txtMen: 'assim que possam enviam-me o programa das Drags, por favor.',
    _initApoio: apoio,
    _initApoioTec: apoioTec,
  }
}

// ── Email HTML builder ────────────────────────────────────────────────────────
const xe = s => (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
const nl = s => (s||'').replace(/\n/g,'<br>')
const fmtE = v => (parseFloat(v)||0).toLocaleString('pt-PT',{minimumFractionDigits:2,maximumFractionDigits:2})+' €'

const EMAIL_CSS = `
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,'Helvetica Neue',sans-serif;background:#e0e0ec;padding:24px 12px}
.ew{max-width:620px;margin:0 auto;background:#fff;border-radius:6px;overflow:hidden;box-shadow:0 2px 14px rgba(0,0,0,.14);color:#222;font-size:14px}
.eh{background:#12121e;padding:20px 28px 16px;display:flex;align-items:center;justify-content:space-between;gap:12px}
.eb-brand{font-size:13px;font-weight:700;letter-spacing:.06em;color:#c9a040;text-transform:uppercase}
.eb-sub{font-size:13px;color:#bbb;letter-spacing:.08em;text-transform:uppercase;margin-top:2px}
.eb-badge{background:rgba(201,160,64,.12);border:1px solid rgba(201,160,64,.28);border-radius:4px;padding:4px 10px;font-size:12.5px;font-weight:600;color:#c9a040}
.em{padding:22px 28px}.eg{font-size:13px;font-weight:600;margin-bottom:12px;color:#12121e}
.ei{font-size:13.5px;line-height:1.7;color:#444;margin-bottom:10px}
.ect{text-align:center;margin:16px 0 6px}.ect a{display:inline-block;background:#c9a040;color:#12121e;font-weight:700;font-size:12.5px;letter-spacing:.06em;padding:9px 28px;border-radius:4px;text-decoration:none;text-transform:uppercase}
.epin{text-align:center;font-size:11.5px;color:#bbb;letter-spacing:.08em;margin-bottom:12px;margin-top:5px}
.edv{height:1px;background:#eee;margin:16px 0}
.etit{font-size:11px;font-weight:700;letter-spacing:.10em;text-transform:uppercase;color:#c9a040;border-bottom:2px solid #c9a040;padding-bottom:3px;margin-bottom:8px}
.evn{font-size:14px;font-weight:700;color:#12121e;margin-bottom:7px}
.et,.eat{width:100%;border-collapse:collapse;font-size:13px;margin-bottom:16px}
.et thead tr{background:#12121e}.et thead th{padding:6px 10px;text-align:left;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#fff}
.eat thead tr{background:#1c1c30}.eat thead th{padding:6px 10px;text-align:left;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#fff}
.et thead th.r,.eat thead th.r{text-align:right}
.et tbody tr,.eat tbody tr{border-bottom:1px solid #f0f0f0}
.et tbody tr:nth-child(even){background:#fafafa}
.et tbody td,.eat tbody td{padding:7px 10px;color:#333}
.et tbody td.r,.eat tbody td.r{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.et tbody td.c{text-align:center;font-size:13px;font-weight:600;color:#444}
.esub td{background:#f5f2ea!important;font-weight:600;color:#12121e!important;border-top:2px solid #d4b96a}
.eavc td{color:#888!important;font-style:italic}
.etot td{background:#12121e!important;color:#fff!important;font-weight:700;font-size:13.5px}
.eatot td{background:#1c1c30!important;color:#fff!important;font-weight:700}
.enota{font-size:12px;color:#999;font-style:italic;padding:2px 10px 7px;line-height:1.5;white-space:pre-wrap}
.enb{background:#f8f8f8;border-left:3px solid #c9a040;border-radius:3px;padding:11px 13px;margin-bottom:16px;font-size:12.5px;line-height:1.7;color:#555}
.enbl{font-weight:700;color:#12121e;font-size:11px;letter-spacing:.07em;text-transform:uppercase;margin-bottom:4px}
.emen{color:#c9a040;font-weight:600}
.eft{background:#12121e;padding:12px 28px;text-align:center;font-size:12px;color:#888}
.eft a{color:#c9a040;text-decoration:none}
`

function buildEmailHTML(f, apoioItems, apoioTecItems) {
  const sub = (parseFloat(f.vRes)||0) + (parseFloat(f.vConv)||0) + (parseFloat(f.vExt)||0)
  const tot = sub + (parseFloat(f.avenca)||0)
  const apoioTot    = apoioItems.reduce((s,it) => s+(parseFloat(it.valor)||0), 0)
  const apoioTecTot = (apoioTecItems||[]).reduce((s,it) => s+(parseFloat(it.valor)||0), 0)
  const parseTxt = raw => nl(xe((raw||'').replace('{{MÊS}}', f.mes).replace('{{ANO}}', f.ano)))
  const notaRow = txt => txt ? `<tr><td colspan="3" class="enota">${nl(xe(txt))}</td></tr>` : ''

  const apoioSec = !f.incApoio || !apoioItems.length ? '' : `
    <div class="edv"></div>
    <div class="etit">Apoio Extra — ${xe(f.espaco)}</div>
    <table class="eat">
      <thead><tr><th style="width:70px">Mês</th><th>Item / Evento</th><th class="r">Valor</th></tr></thead>
      <tbody>
        ${apoioItems.map(it=>`
          <tr><td>${xe(it.mes)}</td><td>${xe(it.item)}</td><td class="r">${fmtE(it.valor)}</td></tr>
          ${it.notas?`<tr><td colspan="3" class="enota">${nl(xe(it.notas))}</td></tr>`:''}`).join('')}
        <tr class="eatot"><td colspan="2">Total Apoio Extra</td><td class="r">${fmtE(apoioTot)}</td></tr>
      </tbody>
    </table>`

  const notesSec = (f.notasG||f.mencao) ? `
    <div class="edv"></div>
    <div class="enb">
      <div class="enbl">Notas</div>
      ${f.notasG?`<p style="margin-bottom:5px">${nl(xe(f.notasG))}</p>`:''}
      ${f.mencao?`<p><span class="emen">@${xe(f.mencao)}</span> ${xe(f.txtMen)}</p>`:''}
    </div>` : ''

  // Outlook-safe inline styles for critical rows
  const S = {
    hdr:  'background:#12121e;padding:0',
    hdrL: 'padding:18px 28px 14px;vertical-align:middle',
    hdrR: 'padding:18px 28px 14px;vertical-align:middle;text-align:right;white-space:nowrap',
    brand:'font-size:13px;font-weight:700;letter-spacing:.06em;color:#c9a040;text-transform:uppercase;font-family:Arial,sans-serif',
    sub:  'font-size:13px;color:#bbb;letter-spacing:.08em;text-transform:uppercase;margin-top:2px;font-family:Arial,sans-serif',
    badge:'display:inline-block;background:#1e1a0e;border:1px solid #6b5520;padding:4px 10px;font-size:12px;font-weight:600;color:#c9a040;font-family:Arial,sans-serif',
    body: 'padding:22px 28px;font-family:Arial,sans-serif',
    th:   'padding:7px 10px;text-align:left;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#ffffff;background:#12121e',
    thr:  'padding:7px 10px;text-align:right;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#ffffff;background:#12121e',
    thc:  'padding:7px 10px;text-align:center;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#ffffff;background:#12121e;width:52px',
    td:   'padding:7px 10px;color:#333;border-bottom:1px solid #f0f0f0;font-family:Arial,sans-serif',
    tdr:  'padding:7px 10px;color:#333;border-bottom:1px solid #f0f0f0;text-align:right;white-space:nowrap;font-family:Arial,sans-serif',
    tdc:  'padding:7px 10px;color:#555;border-bottom:1px solid #f0f0f0;text-align:center;font-family:Arial,sans-serif',
    sub_: 'padding:7px 10px;background:#f5f2ea;font-weight:600;color:#12121e;border-top:2px solid #d4b96a;font-family:Arial,sans-serif',
    subr: 'padding:7px 10px;background:#f5f2ea;font-weight:600;color:#12121e;border-top:2px solid #d4b96a;text-align:right;font-family:Arial,sans-serif',
    avc: 'padding:7px 10px;color:#888;font-style:italic;font-family:Arial,sans-serif',
    avcr:'padding:7px 10px;color:#888;font-style:italic;text-align:right;font-family:Arial,sans-serif',
    tot: 'padding:8px 10px;background:#12121e;color:#ffffff;font-weight:700;font-size:13px;font-family:Arial,sans-serif',
    totr:'padding:8px 10px;background:#12121e;color:#ffffff;font-weight:700;font-size:13px;text-align:right;font-family:Arial,sans-serif',
    ath: 'padding:7px 10px;text-align:left;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#ffffff;background:#1c1c30',
    athr:'padding:7px 10px;text-align:right;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#ffffff;background:#1c1c30',
    att: 'padding:8px 10px;background:#1c1c30;color:#ffffff;font-weight:700;font-family:Arial,sans-serif',
    attr:'padding:8px 10px;background:#1c1c30;color:#ffffff;font-weight:700;text-align:right;font-family:Arial,sans-serif',
    tth: 'padding:7px 10px;text-align:left;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#ffffff;background:#1e3040',
    tthr:'padding:7px 10px;text-align:right;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#ffffff;background:#1e3040',
    ttt: 'padding:8px 10px;background:#1e3040;color:#ffffff;font-weight:700;font-size:13px;font-family:Arial,sans-serif',
    tttr:'padding:8px 10px;background:#1e3040;color:#ffffff;font-weight:700;font-size:13px;text-align:right;font-family:Arial,sans-serif',
    nota:'font-size:12px;color:#999;font-style:italic;padding:2px 10px 7px;line-height:1.5;font-family:Arial,sans-serif',
    ft:  'background:#12121e;padding:12px 28px;text-align:center;font-size:12px;color:#888;font-family:Arial,sans-serif',
  }

  const body = `
    <!-- HEADER (table layout for Outlook) -->
    <table width="100%" cellpadding="0" cellspacing="0" style="${S.hdr}">
      <tr>
        <td style="${S.hdrL}">
          <div style="${S.brand}">Gestão Musical</div>
          <div style="${S.sub}">DJs &amp; Apoio T.</div>
        </td>
        <td style="${S.hdrR}">
          <span style="${S.badge}">${xe(f.mes)} ${xe(f.ano)}</span>
        </td>
      </tr>
    </table>

    <!-- BODY -->
    <div style="${S.body}">
      <p style="font-size:13px;font-weight:600;margin:0 0 12px;color:#12121e;font-family:Arial,sans-serif">Bom dia ${xe(f.contacto)},</p>
      <p style="font-size:14px;line-height:1.7;color:#444;margin:0 0 10px;font-family:Arial,sans-serif">${parseTxt(f.txtP1)}</p>
      ${f.txtP2?`<p style="font-size:14px;line-height:1.7;color:#444;margin:0 0 10px;font-family:Arial,sans-serif">${parseTxt(f.txtP2)}</p>`:''}

      <hr style="border:none;border-top:1px solid #eee;margin:16px 0">

      <!-- PROGRAMA MUSICAL -->
      <div style="font-size:11px;font-weight:700;letter-spacing:.10em;text-transform:uppercase;color:#c9a040;border-bottom:2px solid #c9a040;padding-bottom:3px;margin-bottom:8px;font-family:Arial,sans-serif">Programa Musical</div>
      <div style="font-size:14px;font-weight:700;color:#12121e;margin-bottom:7px;font-family:Arial,sans-serif">${xe(f.espaco)}</div>

      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:12px;margin-bottom:16px">
        <thead>
          <tr>
            <th style="${S.th}">Categoria</th>
            <th style="${S.thc}">N&#186;</th>
            <th style="${S.thr}">Valor</th>
          </tr>
        </thead>
        <tbody>
          <tr><td style="${S.td}">DJ Residentes</td><td style="${S.tdc}">${parseFloat(f.nRes)||0}</td><td style="${S.tdr}">${fmtE(f.vRes)}</td></tr>
          ${f.nResN?`<tr><td colspan="3" style="${S.nota}">${nl(xe(f.nResN))}</td></tr>`:''}
          <tr style="background:#fafafa"><td style="${S.td}">DJ Convidados Residentes / Extras</td><td style="${S.tdc}">${parseFloat(f.nConv)||0}</td><td style="${S.tdr}">${fmtE(f.vConv)}</td></tr>
          ${f.nConvN?`<tr><td colspan="3" style="${S.nota}">${nl(xe(f.nConvN))}</td></tr>`:''}
          <tr><td style="${S.td}">Extras</td><td style="${S.tdc}">&#8212;</td><td style="${S.tdr}">${fmtE(f.vExt)}</td></tr>
          ${f.nExtN?`<tr><td colspan="3" style="${S.nota}">${nl(xe(f.nExtN))}</td></tr>`:''}
          <tr><td style="${S.sub_}" colspan="2">Subtotal</td><td style="${S.subr}">${fmtE(sub)}</td></tr>
          <tr><td style="${S.avc}" colspan="2">Aven&#231;a Gest&#227;o Musical</td><td style="${S.avcr}">${fmtE(f.avenca)}</td></tr>
          <tr><td style="${S.tot}" colspan="2">Total do Programa Musical</td><td style="${S.totr}">${fmtE(tot)}</td></tr>
        </tbody>
      </table>

      ${!f.incApoio || !apoioItems.length ? '' : `
        <hr style="border:none;border-top:1px solid #eee;margin:16px 0">
        <div style="font-size:10px;font-weight:700;letter-spacing:.10em;text-transform:uppercase;color:#c9a040;border-bottom:2px solid #c9a040;padding-bottom:3px;margin-bottom:8px;font-family:Arial,sans-serif">Apoio Extra &mdash; ${xe(f.espaco)}</div>
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:12px;margin-bottom:16px">
          <thead>
            <tr>
              <th style="${S.ath}" width="70">M&#234;s</th>
              <th style="${S.ath}">Item / Evento</th>
              <th style="${S.athr}">Valor</th>
            </tr>
          </thead>
          <tbody>
            ${apoioItems.map((it,i)=>`
              <tr style="${i%2?'background:#fafafa':''}"><td style="${S.td}">${xe(it.mes)}</td><td style="${S.td}">${xe(it.item)}</td><td style="${S.tdr}">${fmtE(it.valor)}</td></tr>
              ${it.notas?`<tr><td colspan="3" style="${S.nota}">${nl(xe(it.notas))}</td></tr>`:''}`).join('')}
            <tr><td style="${S.att}" colspan="2">Total Apoio Extra</td><td style="${S.attr}">${fmtE(apoioTot)}</td></tr>
          </tbody>
        </table>`}

      ${!f.incApoioTec || !(apoioTecItems||[]).length ? '' : `
        <hr style="border:none;border-top:1px solid #eee;margin:16px 0">
        <div style="font-size:11px;font-weight:700;letter-spacing:.10em;text-transform:uppercase;color:#c9a040;border-bottom:2px solid #c9a040;padding-bottom:3px;margin-bottom:8px;font-family:Arial,sans-serif">Apoio T&#233;cnico &mdash; ${xe(f.espaco)}</div>
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:12px;margin-bottom:16px">
          <thead>
            <tr>
              <th style="${S.tth}">Tipo</th>
              <th style="${S.tth}" width="44">N&#186;</th>
              <th style="${S.tthr}">Valor</th>
            </tr>
          </thead>
          <tbody>
            ${(apoioTecItems||[]).map((it,i)=>`
              <tr style="${i%2?'background:#fafafa':''}">
                <td style="${S.td}">${xe(it.tipo)}</td>
                <td style="${S.tdc}">${it.n}</td>
                <td style="${S.tdr}">${fmtE(it.valor)}</td>
              </tr>`).join('')}
            <tr><td style="${S.ttt}" colspan="2">Total Apoio T&#233;cnico</td><td style="${S.tttr}">${fmtE(apoioTecTot)}</td></tr>
          </tbody>
        </table>`}

      ${!(f.notasG||f.mencao) ? '' : `
        <hr style="border:none;border-top:1px solid #eee;margin:16px 0">
        <div style="background:#f8f8f8;border-left:3px solid #c9a040;padding:11px 13px;margin-bottom:16px;font-size:11px;line-height:1.7;color:#555;font-family:Arial,sans-serif">
          <div style="font-weight:700;color:#12121e;font-size:10px;letter-spacing:.07em;text-transform:uppercase;margin-bottom:4px">Notas</div>
          ${f.notasG?`<p style="margin:0 0 5px">${nl(xe(f.notasG))}</p>`:''}
          ${f.mencao?`<p style="margin:0"><span style="color:#c9a040;font-weight:600">@${xe(f.mencao)}</span> ${xe(f.txtMen)}</p>`:''}
        </div>`}
    </div>

    <!-- CTA -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0 8px">
      <tr><td align="center">
        <a href="${xe(f.linkApp)}" style="display:inline-block;background:#c9a040;color:#12121e;font-weight:700;font-size:12px;letter-spacing:.06em;padding:6px 16px;text-decoration:none;text-transform:uppercase;font-family:Arial,sans-serif">VER AGENDA</a>
      </td></tr>
    </table>
    ${f.pin?`<p style="text-align:center;font-size:11px;color:#bbb;letter-spacing:.08em;margin:4px 0 16px;font-family:Arial,sans-serif">PIN: ${xe(f.pin)}</p>`:''}

    <!-- FOOTER -->
    <table width="100%" cellpadding="0" cellspacing="0" style="${S.ft}">
      <tr><td style="${S.ft}">Paulo DiLight &nbsp;&middot;&nbsp; financeiro@prolabdj.com &nbsp;&middot;&nbsp; LMD Lda.</td></tr>
    </table>`

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${EMAIL_CSS}</style></head><body><div class="ew">${body}</div></body></html>`
}

// ── Form sub-components (module scope — must NOT be inside EmailAgendaModal) ──
const Lbl = ({ children }) => (
  <label className="block text-[10px] font-medium text-accent-subtle uppercase tracking-wider mb-1">{children}</label>
)
const Fld = ({ label, children }) => <div><Lbl>{label}</Lbl>{children}</div>
const Sec = ({ title, children }) => (
  <div className="bg-surface-2 border border-border/50 rounded-xl overflow-hidden">
    <div className="bg-surface-1 px-3 py-2 text-[10px] font-bold text-accent-subtle uppercase tracking-widest border-b border-border/50">{title}</div>
    <div className="p-3 flex flex-col gap-2.5">{children}</div>
  </div>
)
const SubCard = ({ title, children }) => (
  <div className="border border-border/50 rounded-lg overflow-hidden">
    <div className="px-3 py-2 bg-surface-1 text-[10px] font-semibold text-accent-subtle border-b border-border/50">{title}</div>
    <div className="p-3 flex flex-col gap-2 bg-surface-2">{children}</div>
  </div>
)

// Fields persisted per space (stable across months)
const PERSIST_FIELDS = ['contacto','para','cc','assunto','pin','linkApp','txtP1','txtP2','notasG','mencao','txtMen','nResN','nConvN','nExtN','avenca','incApoio','incApoioTec']

function loadCfg(espacoId) {
  try { return JSON.parse(localStorage.getItem(`email_cfg_${espacoId}`)) || {} } catch { return {} }
}
function saveCfg(espacoId, f) {
  const saved = {}
  PERSIST_FIELDS.forEach(k => { saved[k] = f[k] })
  localStorage.setItem(`email_cfg_${espacoId}`, JSON.stringify(saved))
}

// ── Modal component ───────────────────────────────────────────────────────────
export function EmailAgendaModal({ espaco, slots, eventos, cards, catTotals, subtiposConfig, anoMes, onClose }) {
  const init = useMemo(() => {
    const base = initForm(espaco, slots, eventos, cards, catTotals, subtiposConfig, anoMes)
    const saved = loadCfg(espaco.id)
    return { ...base, ...saved }
  }, [])
  const [f, setF] = useState(init)
  const [apoioItems, setApoioItems] = useState(init._initApoio || [])
  const [apoioTecItems] = useState(init._initApoioTec || [])
  const [tab, setTab] = useState('email')
  const [copied, setCopied] = useState('')
  const iframeRef = useRef(null)

  const set  = field => e => setF(p => ({ ...p, [field]: e.target.value }))
  const setN = field => e => setF(p => ({ ...p, [field]: parseFloat(e.target.value) || 0 }))
  const setC = field => e => setF(p => ({ ...p, [field]: e.target.checked }))

  // Persist stable fields whenever form changes
  useEffect(() => { saveCfg(espaco.id, f) }, [f])

  const emailHTML = useMemo(() => buildEmailHTML(f, apoioItems, apoioTecItems), [f, apoioItems, apoioTecItems])

  // Write HTML into iframe reliably
  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe) return
    const doc = iframe.contentDocument || iframe.contentWindow?.document
    if (!doc) return
    doc.open(); doc.write(emailHTML); doc.close()
  }, [emailHTML, tab])

  const copyHTML = async () => {
    await navigator.clipboard.writeText(emailHTML).catch(() => {})
    setCopied('html'); setTimeout(() => setCopied(''), 2000)
  }
  const copyText = async () => {
    const d = document.createElement('div'); d.innerHTML = emailHTML
    await navigator.clipboard.writeText(d.innerText || '').catch(() => {})
    setCopied('txt'); setTimeout(() => setCopied(''), 2000)
  }
  const exportEML = () => {
    const subjB64  = btoa(unescape(encodeURIComponent(f.assunto || 'Agenda DJ')))
    const bodyB64  = btoa(unescape(encodeURIComponent(emailHTML)))
    const bodyLines = bodyB64.match(/.{1,76}/g).join('\r\n')
    let eml = 'MIME-Version: 1.0\r\nX-Unsent: 1\r\nFrom: Paulo Di Light <paulodilight@prolabdj.com>\r\n'
    if (f.para) eml += `To: ${f.para}\r\n`
    if (f.cc)   eml += `CC: ${f.cc}\r\n`
    eml += `Subject: =?UTF-8?B?${subjB64}?=\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${bodyLines}`
    const url = URL.createObjectURL(new Blob([eml], { type: 'message/rfc822' }))
    const a = Object.assign(document.createElement('a'), {
      href: url,
      download: `agenda-${f.espaco}-${f.mes}-${f.ano}.eml`.replace(/\s+/g,'-').toLowerCase(),
    })
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url)
  }

  const addApoio = () => setApoioItems(p => [...p, { mes: f.mes, item: '', valor: 0, notas: '' }])
  const rmApoio  = i => setApoioItems(p => p.filter((_,j) => j !== i))
  const updApoio = (i, field, val) =>
    setApoioItems(p => p.map((it,j) => j===i ? { ...it, [field]: field==='valor'?(parseFloat(val)||0):val } : it))

  // ── shared style strings
  const inp = 'w-full bg-surface-0 border border-border rounded-lg px-2.5 py-1.5 text-xs text-accent placeholder-accent-subtle/40 focus:outline-none focus:border-accent/40 transition-colors'
  const ta  = inp + ' resize-y min-h-[44px]'

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-surface-0">

      {/* ── Header ── */}
      <div className="shrink-0 flex items-center justify-between px-5 py-3 bg-surface-1 border-b border-border">
        <span className="text-xs font-bold text-accent uppercase tracking-wider">
          Email Agenda · {espaco.nome}
        </span>
        <div className="flex items-center gap-2">
          <button onClick={exportEML}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1e4a8a] hover:bg-[#255ab0] text-white rounded-lg text-xs font-semibold transition-colors">
            <Download size={12} /> Exportar .EML
          </button>
          <button onClick={copyHTML}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-3 hover:bg-surface-3/80 text-accent border border-border/50 rounded-lg text-xs font-semibold transition-colors">
            <Copy size={12} /> {copied === 'html' ? '✓ Copiado!' : 'Copiar HTML'}
          </button>
          <button onClick={copyText}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-2 hover:bg-surface-3 text-accent-subtle border border-border/40 rounded-lg text-xs transition-colors">
            <Copy size={12} /> {copied === 'txt' ? '✓ Copiado!' : 'Copiar texto'}
          </button>
          <button onClick={onClose}
            className="p-1.5 hover:bg-surface-3 rounded-lg text-accent-subtle hover:text-accent transition-colors ml-1">
            <X size={16} />
          </button>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="shrink-0 flex border-b border-border/50 bg-surface-1 px-5 gap-1">
        {[['email','📧 Email'],['form','✏️ Formulário']].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={clsx(
              'px-4 py-2.5 text-xs font-semibold transition-colors border-b-2 -mb-px',
              tab === id ? 'text-accent border-accent' : 'text-accent-subtle border-transparent hover:text-accent'
            )}>
            {label}
          </button>
        ))}
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-hidden">

        {/* EMAIL PREVIEW — always mounted so iframe keeps its content */}
        <div className={tab === 'email' ? 'h-full overflow-y-auto bg-[#2a2a3e] p-6 flex justify-center' : 'hidden'}>
          <iframe
            ref={iframeRef}
            className="w-full max-w-[660px] border-0 rounded-md shadow-2xl"
            style={{ height: '820px' }}
            title="Email Preview"
          />
        </div>

        {/* FORM — always mounted to preserve state */}
        {true && (
          <div className={tab === 'form' ? 'h-full overflow-y-auto bg-surface-1 p-5' : 'hidden'}>
            <div className="max-w-2xl mx-auto flex flex-col gap-4">

              <Sec title="Envio">
                <div className="flex items-center gap-2 px-2.5 py-1.5 bg-surface-1 border border-border rounded-lg">
                  <span className="text-[10px] text-accent-subtle font-semibold shrink-0">De:</span>
                  <span className="text-xs text-amber-400 font-semibold">paulodilight@prolabdj.com</span>
                </div>
                <Fld label="Para (email do cliente)">
                  <input className={inp} type="email" value={f.para} onChange={set('para')} placeholder="contacto@espaco.pt" />
                </Fld>
                <Fld label="CC (opcional)">
                  <input className={inp} type="email" value={f.cc} onChange={set('cc')} />
                </Fld>
                <Fld label="Assunto">
                  <input className={inp} type="text" value={f.assunto} onChange={set('assunto')} />
                </Fld>
              </Sec>

              <Sec title="Destinatário">
                <Fld label="Nome do contacto">
                  <input className={inp} type="text" value={f.contacto} onChange={set('contacto')} />
                </Fld>
                <div className="grid grid-cols-3 gap-2">
                  <Fld label="Mês">
                    <select className={inp} value={f.mes} onChange={set('mes')}>
                      {MESES.map(m => <option key={m}>{m}</option>)}
                    </select>
                  </Fld>
                  <Fld label="Ano">
                    <input className={inp} type="number" value={f.ano} onChange={set('ano')} />
                  </Fld>
                  <Fld label="PIN do espaço">
                    <input className={inp} type="text" value={f.pin} onChange={set('pin')} />
                  </Fld>
                </div>
                <Fld label="Nome do espaço">
                  <input className={inp} type="text" value={f.espaco} onChange={set('espaco')} />
                </Fld>
                <Fld label="Link App Manager">
                  <input className={inp} type="url" value={f.linkApp} onChange={set('linkApp')} />
                </Fld>
              </Sec>

              <Sec title="Texto do Email">
                <Fld label="Parágrafo 1 (usa {{MÊS}} e {{ANO}})">
                  <textarea className={ta} rows={3} value={f.txtP1} onChange={set('txtP1')} />
                </Fld>
                <Fld label="Parágrafo 2">
                  <textarea className={ta} rows={2} value={f.txtP2} onChange={set('txtP2')} />
                </Fld>
              </Sec>

              <Sec title="Programa Musical">
                <SubCard title="DJ Residentes">
                  <div className="grid grid-cols-2 gap-2">
                    <Fld label="Nº DJs"><input className={inp} type="number" value={f.nRes} onChange={setN('nRes')} min="0" /></Fld>
                    <Fld label="Valor €"><input className={inp} type="number" value={f.vRes} onChange={setN('vRes')} min="0" /></Fld>
                  </div>
                  <Fld label="Notas"><textarea className={ta} value={f.nResN} onChange={set('nResN')} placeholder="Notas…" /></Fld>
                </SubCard>
                <SubCard title="DJ Convidados / Extras">
                  <div className="grid grid-cols-2 gap-2">
                    <Fld label="Nº DJs"><input className={inp} type="number" value={f.nConv} onChange={setN('nConv')} min="0" /></Fld>
                    <Fld label="Valor €"><input className={inp} type="number" value={f.vConv} onChange={setN('vConv')} min="0" /></Fld>
                  </div>
                  <Fld label="Notas"><textarea className={ta} value={f.nConvN} onChange={set('nConvN')} placeholder="Notas…" /></Fld>
                </SubCard>
                <SubCard title="Extras">
                  <Fld label="Valor €"><input className={inp} type="number" value={f.vExt} onChange={setN('vExt')} min="0" /></Fld>
                  <Fld label="Notas"><textarea className={ta} value={f.nExtN} onChange={set('nExtN')} placeholder="Notas…" /></Fld>
                </SubCard>
                <Fld label="Avença Gestão Musical €">
                  <input className={inp} type="number" value={f.avenca} onChange={setN('avenca')} min="0" />
                </Fld>
              </Sec>

              <Sec title="Apoio Extra">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={f.incApoio} onChange={setC('incApoio')} className="accent-amber-400" />
                  <span className="text-xs text-accent">Incluir secção Apoio Extra</span>
                </label>
                {apoioItems.map((it, i) => (
                  <div key={i} className="border border-border/50 rounded-lg overflow-hidden">
                    <div className="px-3 py-2 bg-surface-0 text-[10px] font-semibold text-accent-subtle border-b border-border/50 flex justify-between items-center">
                      Item {i + 1}
                      <button onClick={() => rmApoio(i)} className="text-red-400 hover:text-red-300 transition-colors">
                        <Trash2 size={11} />
                      </button>
                    </div>
                    <div className="p-3 flex flex-col gap-2">
                      <div className="grid grid-cols-2 gap-2">
                        <Fld label="Mês"><input className={inp} type="text" value={it.mes} onChange={e => updApoio(i,'mes',e.target.value)} /></Fld>
                        <Fld label="Valor €"><input className={inp} type="number" value={it.valor} min="0" onChange={e => updApoio(i,'valor',e.target.value)} /></Fld>
                      </div>
                      <Fld label="Item / Evento"><input className={inp} type="text" value={it.item} onChange={e => updApoio(i,'item',e.target.value)} /></Fld>
                      <Fld label="Notas"><textarea className={ta} value={it.notas} onChange={e => updApoio(i,'notas',e.target.value)} placeholder="Notas…" /></Fld>
                    </div>
                  </div>
                ))}
                <button onClick={addApoio}
                  className="w-full py-2 border border-dashed border-border/50 text-accent-subtle text-xs rounded-lg hover:border-accent/40 hover:text-accent transition-colors flex items-center justify-center gap-1">
                  <Plus size={11} /> Adicionar item
                </button>
              </Sec>

              {apoioTecItems.length > 0 && (
                <Sec title="Apoio Técnico">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={f.incApoioTec} onChange={setC('incApoioTec')} className="accent-amber-400" />
                    <span className="text-xs text-accent">Incluir secção Apoio Técnico</span>
                  </label>
                  <div className="rounded-lg border border-border/40 overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-surface-1 text-accent-subtle">
                          <th className="text-left px-3 py-2 font-semibold">Tipo</th>
                          <th className="text-center px-3 py-2 font-semibold w-10">N°</th>
                          <th className="text-right px-3 py-2 font-semibold">Valor</th>
                        </tr>
                      </thead>
                      <tbody>
                        {apoioTecItems.map((it, i) => (
                          <tr key={i} className="border-t border-border/30">
                            <td className="px-3 py-2 text-accent-subtle">{it.tipo}</td>
                            <td className="px-3 py-2 text-center text-accent-subtle">{it.n}</td>
                            <td className="px-3 py-2 text-right text-accent tabular-nums">{fmtE(it.valor)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-[10px] text-accent-subtle/60 italic">Preenchido automaticamente a partir dos Eventos</p>
                </Sec>
              )}

              <Sec title="Notas Gerais">
                <Fld label="Texto">
                  <textarea className={ta} rows={3} value={f.notasG} onChange={set('notasG')} />
                </Fld>
                <Fld label="Menção interna (@)">
                  <input className={inp} type="text" value={f.mencao} onChange={set('mencao')} />
                </Fld>
                <Fld label="Texto da menção">
                  <input className={inp} type="text" value={f.txtMen} onChange={set('txtMen')} />
                </Fld>
              </Sec>

            </div>
          </div>
        )}
      </div>
    </div>
  )
}
