# supa-evento-to-calendar — finalização

A Edge Function já está **deployada** no projeto principal (`jpfbucsstzewywdqmdxp`).
Falta o setup do Google e ligar o webhook. Passos:

## 1. Service account Google
1. Google Cloud Console → criar projeto (ou usar existente) → **APIs & Services → Enable APIs → Google Calendar API**.
2. **Credentials → Create credentials → Service account**. Dá-lhe um nome (ex.: `lmd-calendar-sync`).
3. Na service account criada → **Keys → Add key → JSON** → faz download do ficheiro.
4. Abre o calendário **lmdcorporativo@gmail.com** no Google Calendar →
   *Definições do calendário → Partilhar com pessoas específicas* → adiciona o
   **client_email** da service account (vem no JSON, termina em `.iam.gserviceaccount.com`)
   com permissão **"Fazer alterações nos eventos"**.
   > Nota: não é preciso domain-wide delegation — basta partilhar o calendário.

## 2. Segredos da função
No projeto principal (Supabase → Edge Functions → supa-evento-to-calendar → Secrets,
ou via CLI):
```bash
supabase secrets set GOOGLE_SA_KEY="$(cat caminho/para/service-account.json)" --project-ref jpfbucsstzewywdqmdxp
supabase secrets set WEBHOOK_SECRET="<gera-uma-string-aleatoria-forte>" --project-ref jpfbucsstzewywdqmdxp
```
(`SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` são injetados automaticamente.)

## 3. Ligar o Database Webhook
Opção A — **Dashboard** (recomendado): Supabase → Database → Webhooks → *Create a new hook*:
- Tabela: `public.supa_eventos`
- Eventos: **Insert, Update, Delete**
- Tipo: **Supabase Edge Functions** → `supa-evento-to-calendar`
- HTTP Header: `x-webhook-secret: <o mesmo WEBHOOK_SECRET>`

Opção B — **SQL** (pg_net). Substitui `<WEBHOOK_SECRET>` pelo valor real:
```sql
create or replace function public.tg_supa_evento_to_calendar()
returns trigger language plpgsql security definer as $$
begin
  perform net.http_post(
    url := 'https://jpfbucsstzewywdqmdxp.supabase.co/functions/v1/supa-evento-to-calendar',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', '<WEBHOOK_SECRET>'
    ),
    body := jsonb_build_object(
      'type', TG_OP,
      'table', TG_TABLE_NAME,
      'schema', TG_TABLE_SCHEMA,
      'record',     case when TG_OP = 'DELETE' then null else to_jsonb(NEW) end,
      'old_record', case when TG_OP = 'INSERT' then null else to_jsonb(OLD) end
    )
  );
  return null;
end; $$;

create trigger supa_eventos_calendar_sync
after insert or update or delete on public.supa_eventos
for each row execute function public.tg_supa_evento_to_calendar();
```

## 4. Testar
Cria um evento no :5180 (ou no :5173) com data e hora → deve aparecer no
calendário **lmdcorporativo@gmail.com**. Logs em Edge Functions → Logs.

## Comportamento
- **INSERT**: cria evento no Calendar (exceto `status = 'cancelado'`); guarda `google_event_id`.
- **UPDATE**: atualiza o evento; se passar a `cancelado`, remove-o do Calendar.
- **DELETE**: remove o evento do Calendar.
- Loop-guard: a escrita automática de `google_event_id` não volta a disparar sincronização.
- Eventos sem hora ficam como evento de dia inteiro.
