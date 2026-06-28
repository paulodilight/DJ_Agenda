# Plano — Controlo de Acesso por Vínculo a Dispositivo

> Objetivo: impedir que um PIN partilhado dê acesso à app a partir de
> dispositivos não autorizados (ex.: a Isabel passar o PIN ao marido).
> A defesa principal é **vincular o acesso a dispositivos aprovados**,
> validado **no servidor** (Supabase), não no browser.

## Princípio central

- O **token do dispositivo** é gerado e guardado **silenciosamente** no aparelho
  (`localStorage`). O utilizador não instala nem copia nada.
- Um dispositivo novo fica **pendente** e **bloqueado** até aprovação do admin.
- A validação corre dentro da RPC `SECURITY DEFINER` no Supabase → não é
  contornável pelo browser.

---

## 1. Base de dados (Supabase)

### Nova tabela `dispositivos_autorizados`

| Coluna           | Tipo        | Descrição                                   |
|------------------|-------------|---------------------------------------------|
| `id`             | uuid (PK)   | Identificador interno                        |
| `token`          | text unique | Chave única gerada no dispositivo            |
| `nome`           | text        | Etiqueta dada pelo admin ("Tablet escritório")|
| `estado`         | text        | `pendente` \| `aprovado` \| `revogado`       |
| `colaborador_id` | uuid (null) | Quem o registou (opcional, informativo)      |
| `user_agent`     | text        | Browser/SO — ajuda a identificar o aparelho  |
| `codigo_curto`   | text        | 4 caracteres p/ o utilizador ditar ao admin  |
| `criado_em`      | timestamptz | Quando apareceu                              |
| `aprovado_em`    | timestamptz | Quando foi aprovado                          |

RLS: `INSERT` público (anon) para o registo silencioso; `SELECT/UPDATE` só via
RPC/admin. Alinhado com o padrão anon já usado em `supa_eventos`/`push_subscriptions`.

### Alterar a RPC `colaborador_login`

- Passa a receber um parâmetro novo `p_device_token`.
- Lógica:
  1. Valida nome + PIN (como hoje).
  2. Verifica o `device_token` na tabela:
     - `aprovado` → login normal.
     - `pendente` / inexistente / `revogado` → devolve estado especial
       (ex.: `{ erro: 'device_pendente', codigo: 'A3F9' }`), **sem** dados.
- Nova RPC `registar_dispositivo(token, user_agent)` → faz upsert do dispositivo
  como `pendente` e devolve o `codigo_curto`.
- Novas RPC de admin: `listar_dispositivos()`, `aprovar_dispositivo(id, nome)`,
  `revogar_dispositivo(id)`.

### (Fase 2, opcional) Blindar os dados sensíveis

Hoje a RLS é permissiva (`using (true)`) com a anon key. Para que o vínculo
seja realmente à prova de contorno, as tabelas sensíveis devem exigir um
dispositivo aprovado — feito via função `SECURITY DEFINER` que verifica o token.
Marcado como fase 2 porque exige rever todas as políticas RLS com cuidado.

---

## 2. Frontend (React)

### `src/lib/device.js` (novo)
- `getDeviceToken()` — lê o token do `localStorage`; se não existir, gera um
  UUID, grava-o e regista o dispositivo via `registar_dispositivo`.

### `src/lib/colaboradorApi.js`
- `login()` passa a enviar `p_device_token: getDeviceToken()`.
- Tratar a resposta `device_pendente` (não é "PIN errado").

### `src/pages/colaborador/Login.jsx`
- Quando o login devolve `device_pendente`, mostrar ecrã:
  > "Este dispositivo ainda não está autorizado.
  >  Pede ao administrador para o aprovar — Código: **A3F9**"
- Mantém o fluxo normal (nome → PIN) intacto para dispositivos aprovados.

### Painel de gestão (área admin, `RotaProtegida`)
- Nova página `Configurações → Dispositivos`:
  - Lista **Pendentes** (com código curto + user agent) → botão **Aprovar**.
  - Lista **Aprovados** → renomear / **Revogar**.

---

## 3. Experiência na prática

| Situação                                   | O que acontece                          |
|--------------------------------------------|-----------------------------------------|
| Tablet da empresa (aprovado 1x)            | Login normal, igual a hoje (silencioso) |
| Aparelho novo / telemóvel do marido        | PIN certo mas **bloqueado** + código    |
| Colaborador sai da equipa                  | Admin **revoga** o aparelho             |

**Decisão de produto pendente:** dispositivo pendente é sempre **aprovação
manual** (recomendado, mais seguro) ou **1.º dispositivo de cada colaborador
auto-aprovado** (mais cómodo, menos seguro)? → assumido **manual** por defeito.

---

## 4. Limite honesto

Isto impede levar os dados para **fora** (outro aparelho, casa, etc.).
**Não** impede mostrar o ecrã a alguém ao lado, no aparelho já autorizado —
isso é política interna/confiança, não tecnologia.

---

## 5. Ordem de execução

1. Migração SQL: tabela `dispositivos_autorizados` + RPCs.
2. Atualizar `colaborador_login` (parâmetro device token).
3. `src/lib/device.js` + ligação no `colaboradorApi.login`.
4. Ecrã "dispositivo pendente" no `Login.jsx`.
5. Painel admin de dispositivos.
6. (Fase 2) Blindar RLS das tabelas sensíveis.
7. Commit + push para `claude/app-location-access-control-02ckoj`.

> Opcional (decisão tua): juntar **allowlist de IP** por cima disto, se o local
> tiver IP público fixo, para "só abre fisicamente no escritório".
