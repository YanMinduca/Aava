# Backup, lixeira e dízimo

## Lixeira (painel → Lixeira, só CEO e Pastor Presidente)
- Tudo o que é excluído no sistema vai para `public.trash` e fica 30 dias; depois é apagado de vez (com as fotos e arquivos).
- Funciona por gatilho (`zz_trash_row`) em todas as tabelas, então nenhuma tela precisa mudar para o item "cair" na lixeira.
- Itens excluídos juntos (um evento com inscrições, ingressos e parcelas) formam um lote e são restaurados juntos.
- Não vão para a lixeira: exclusão de conta/cadastro por `delete_user_account` (apaga dados pessoais de verdade), tabelas técnicas
  (`trash`, `storage_trash`, `backup_runs`, `member_claim_attempts`, `push_subscriptions`, `profiles`) e a limpeza automática do
  registro de atividades com mais de 12 meses.
- **Tabela nova?** Na migration dela, rode `select public.trash_attach_all();` para ela também ir para a lixeira.
  Se a tabela guarda caminhos de arquivos, inclua-a em `public.trash_files` e em `public.storage_path_in_use`.
- Limpeza: `pg_cron` diário (se a extensão existir no projeto), ao abrir a tela da lixeira e, de vez em quando, no próprio gatilho.

## Backup (painel → Backup, só CEO e Pastor Presidente)
- Baixa um ZIP com `dados/<tabela>.json` (todas as tabelas), `arquivos/<pasta>/<arquivo>` (opcional) e `LEIAME.txt`.
- A visão geral avisa o CEO/Pastor Presidente quando o último backup tem mais de 7 dias.
- Fora do navegador: `SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run backup` grava uma pasta em `backups/`
  (ignorada pelo git). Dá para agendar no seu computador ou num servidor **privado**.
  Não rode isso em GitHub Actions de repositório público: os artefatos são públicos.
- O backup contém dados pessoais e sensíveis. Guarde em local privado e apague cópias antigas.
- Senhas e contas de login (schema `auth`) não entram. Para recuperar o projeto todo, use também os backups do próprio Supabase
  (backups diários e PITR dependem do plano) e `pg_dump`.

### Restaurar a partir de um backup
Cada `dados/<tabela>.json` é uma lista de registros. Para voltar tabelas inteiras, importe no SQL Editor/`psql`, por exemplo:

```sql
insert into public.members select * from jsonb_populate_recordset(null::public.members, '<conteúdo do members.json>'::jsonb)
on conflict do nothing;
```

Restaure primeiro as tabelas "pai" (members, events, departments...) e depois as que dependem delas.
Arquivos de `arquivos/<pasta>/` voltam pelo painel do Supabase Storage (mesmo nome de pasta e caminho).

## Dízimo
Contribuições (dízimo/ofertas) só aparecem para CEO, Pastor Presidente e quem tem a permissão "Ver financeiro":
tela Financeiro, cartões da visão geral, aba de contribuições no cadastro do membro e "Minhas contribuições" em Meu cadastro.
No banco, a leitura de `financial_transactions` exige `view_finance`.
