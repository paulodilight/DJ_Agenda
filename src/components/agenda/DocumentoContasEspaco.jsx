import { formatarEuro } from '@/utils/formatacao'

const BORDER = '1px solid #374151'
const tdStyle = (extra = {}) => ({
  border: BORDER,
  padding: '6px 12px',
  ...extra,
})

export function DocumentoContasEspaco({ espaco, linhas = [], avenca = 0, extras = 0, tituloMes }) {
  if (!espaco) return null

  const subtotal = linhas.reduce((s, l) => s + l.valor, 0) + extras
  const total = subtotal + avenca

  return (
    <div id="documento-contas-espaco" style={{ display: 'none', background: 'white', color: '#111827' }}>
      <div style={{ padding: '48px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', lineHeight: '1.5' }}>
          <colgroup>
            <col style={{ width: '10%' }} />
            <col style={{ width: '65%' }} />
            <col style={{ width: '25%' }} />
          </colgroup>
          <thead>
            <tr>
              <th style={{ ...tdStyle(), background: '#f9fafb', fontWeight: 'bold', textAlign: 'left' }}>
                {tituloMes}
              </th>
              <th colSpan={2} style={{ ...tdStyle(), background: '#f9fafb', fontWeight: 'bold', textAlign: 'center', letterSpacing: '0.05em' }}>
                {espaco?.nome?.toUpperCase()}
              </th>
            </tr>
          </thead>
          <tbody>
            {/* DJ category rows */}
            {linhas.map((linha, i) => (
              <tr key={i}>
                <td style={{ ...tdStyle(), textAlign: 'center' }}>{linha.count}</td>
                <td style={tdStyle()}>{linha.nome}</td>
                <td style={{ ...tdStyle(), textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {formatarEuro(linha.valor)}
                </td>
              </tr>
            ))}

            {/* Extras row — only if > 0 */}
            {extras > 0 && (
              <tr>
                <td style={{ ...tdStyle(), textAlign: 'center' }}></td>
                <td style={tdStyle()}>Extras</td>
                <td style={{ ...tdStyle(), textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {formatarEuro(extras)}
                </td>
              </tr>
            )}

            {/* Subtotal */}
            <tr>
              <td style={{ ...tdStyle(), textAlign: 'center' }}></td>
              <td style={{ ...tdStyle(), textAlign: 'right', fontWeight: 'bold' }}>Subtotal:</td>
              <td style={{ ...tdStyle(), textAlign: 'right', fontWeight: 'bold', fontVariantNumeric: 'tabular-nums' }}>
                {formatarEuro(subtotal)}
              </td>
            </tr>

            {/* Spacer */}
            <tr><td colSpan={3} style={{ padding: '6px', border: 'none' }}></td></tr>

            {/* Avença */}
            {avenca > 0 && (
              <tr>
                <td style={{ padding: '6px 12px' }}></td>
                <td style={{ padding: '6px 12px' }}>Avença Gestão Musical</td>
                <td style={{ padding: '6px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {formatarEuro(avenca)}
                </td>
              </tr>
            )}

            {/* Spacer */}
            <tr><td colSpan={3} style={{ padding: '4px', border: 'none' }}></td></tr>

            {/* Total */}
            <tr>
              <td style={{ padding: '8px 12px' }}></td>
              <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 'bold', fontSize: '14px' }}>
                Total do Programa Musical:
              </td>
              <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 'bold', fontSize: '14px', fontVariantNumeric: 'tabular-nums' }}>
                {formatarEuro(total)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
