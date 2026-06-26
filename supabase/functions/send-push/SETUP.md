# send-push — notificações no ícone da app Apoio Técnico

Faz aparecer um **número (badge)** no ícone da PWA "Xclusive TS" no telemóvel,
e uma notificação, sempre que há um **evento** (`supa_eventos`) ou **ocorrência**
(`ocorrencias`) novo ou alterado. Envia para **todos** os técnicos com a app
instalada e notificações ativadas.

> Tudo isto corre no **projeto principal** do Supabase (o mesmo do
> `supa-evento-to-calendar`). Não é preciso o projeto iVO.

## 1. Gerar as chaves VAPID
Numa máquina com Node:
```bash
npx web-push generate-vapid-keys
```
Guarda a **Public Key** e a **Private Key**.

## 2. Configurar o frontend
No `.env` (e nas variáveis de ambiente da Vercel) adiciona a chave **pública**:
```
VITE_VAPID_PUBLIC_KEY=<public key>
```
Faz novo build/deploy para a chave entrar na app.

## 3. Aplicar a migração da tabela
Corre a migração `supabase/migrations/20260626_push_subscriptions.sql`
(via `supabase db push`, ou colando o SQL no SQL Editor do Dashboard).

## 4. Deploy da função e segredos
```bash
supabase functions deploy send-push --project-ref <REF_DO_PROJETO>

supabase secrets set VAPID_PUBLIC_KEY="<public key>"  --project-ref <REF>
supabase secrets set VAPID_PRIVATE_KEY="<private key>" --project-ref <REF>
supabase secrets set VAPID_SUBJECT="mailto:dj@paulodilight.com" --project-ref <REF>
supabase secrets set WEBHOOK_SECRET="<gera-uma-string-aleatoria-forte>" --project-ref <REF>
```
(`SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` são injetados automaticamente.)

## 5. Ligar os Database Webhooks
Cria **dois** webhooks (Supabase → Database → Webhooks → *Create a new hook*):

**Webhook A — eventos**
- Tabela: `public.supa_eventos`
- Eventos: **Insert, Update**
- Tipo: **Supabase Edge Functions** → `send-push`
- HTTP Header: `x-webhook-secret: <o mesmo WEBHOOK_SECRET>`

**Webhook B — ocorrências**
- Tabela: `public.ocorrencias`
- Eventos: **Insert, Update**
- Tipo: **Supabase Edge Functions** → `send-push`
- HTTP Header: `x-webhook-secret: <o mesmo WEBHOOK_SECRET>`

> Alternativa por SQL (pg_net): igual ao exemplo no SETUP da função
> `supa-evento-to-calendar`, mas apontando a `/functions/v1/send-push` e com
> `for each row execute` em cada tabela.

## 6. Testar no telemóvel
1. Abre a app Apoio T no telemóvel e **instala-a** ("Adicionar ao ecrã principal").
   - **iPhone:** obrigatório iOS **16.4+** e abrir a app **a partir do ícone** do ecrã
     principal (no Safari normal o push não funciona).
2. Dentro da app, toca no botão **"Avisos"** (sino, no topo) e aceita a permissão.
3. Cria/edita um evento ou abre uma ocorrência no painel admin.
4. Deve chegar a notificação e aparecer o **número no ícone**. Ao abrir a app,
   o número é limpo.

## Notas
- O contador do badge é **por dispositivo** (guardado no service worker) e soma
  cada push recebido; é reposto a 0 quando a app é aberta ou a notificação é tocada.
- O badge no ícone (App Badging API) funciona em **Android (Chrome/Edge)** e em
  **iOS 16.4+** com a PWA instalada. Em desktop funciona na PWA instalada.
- Subscrições mortas (HTTP 404/410) são removidas automaticamente da tabela.
