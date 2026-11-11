# Migrations do banco (Supabase)

## Fonte única de verdade

**`supabase/migrations/`** é a única pasta de migrations do projeto. Ela corresponde 1 a 1 ao
histórico registrado no Supabase (`supabase_migrations.schema_migrations`) do projeto
`mzqdsfadkaviwaazdwlx`.

- 29 arquivos, um por versão registrada no banco.
- Cada arquivo tem o texto **exato** que foi executado (verificado por hash MD5 contra o banco).
- O nome do arquivo é `<versão>_<nome>.sql`, onde a versão é a que o Supabase registrou.

`drizzle/migrations/` é **histórico antigo (legado)**, da época do Lovable Cloud. Não é aplicado em
nenhum banco, o `_journal.json` está incompleto (vai só até a 0017) e os arquivos não são cópias fiéis
do que rodou. Foi mantido só como referência. **Não crie migrations novas lá.**

## Como criar uma migration nova

```sh
supabase link --project-ref mzqdsfadkaviwaazdwlx
supabase migration new nome_da_mudanca     # cria supabase/migrations/<versão>_nome_da_mudanca.sql
# escreva o SQL no arquivo criado e depois:
supabase db push --dry-run                 # mostra o que seria aplicado, sem aplicar
supabase db push                           # aplica e registra a versão
```

Assim o arquivo e o registro no banco nascem juntos, com a mesma versão.

**Evite** aplicar SQL direto pelo editor SQL do painel ou por ferramentas que usam `apply_migration`
sem salvar o arquivo no repositório: o banco registra uma versão que não existe no GitHub e o erro
`Remote migration versions not found in local migrations directory` volta. Se isso acontecer, rode
`supabase migration fetch` para trazer os arquivos que faltam (não altera o banco).

## Verificar se está tudo sincronizado

```sh
supabase migration list     # as colunas Local e Remote devem mostrar as mesmas versões
supabase db push --dry-run  # deve responder "Remote database is up to date."
```

## Origem das 29 migrations

| Faixa | Origem |
|---|---|
| Antes de `20261014221406` | Baseline: o banco foi restaurado do backup do Lovable Cloud (12/10/2026). Equivale às migrations `drizzle/migrations/0000` a `0006`, que não têm versão registrada. |
| `20261014221406` a `20261026153903` (25 versões) | Aplicadas direto no banco durante o desenvolvimento. Correspondem, de forma aproximada, às `drizzle/migrations/0007` a `0022`. Há versões extras que são hotfixes (`revoke_clear_leader_trigger_rpc`, `restore_department_members_role_column_compat`, `site_assets_select_policy` e as de compatibilidade de departamentos). A `0011_events` foi dividida em 3 versões. |
| `20261105225416` | Atividade de membros (`drizzle/migrations/0027`). |
| `20261106002523`, `20261106002641` | Detalhes de conta e bloqueio das funções de gatilho da atividade. |
| `20261106003856` | Restauração da vinculação de contas a membros. |

## Migrations drizzle 0023 a 0026: sem versão própria no histórico

Estas quatro existem em `drizzle/migrations/`, mas **nunca foram registradas** no histórico do Supabase.
Nenhuma precisa ser reaplicada. O estado de cada uma no banco (verificado em 06/11/2026):

| Arquivo | O que faz | Situação no banco |
|---|---|---|
| `0023_link_member_account.sql` | Funções `list_accounts_for_linking`, `link_member_account` e `unlink_member_account`, e a atualização do `members_guard()`, para o CEO / Pastor Presidente vincular uma conta a um membro. | **Não estava aplicada.** As funções não existiam no banco. Foi coberta pela migration `20261106003856_restore_member_account_linking`. |
| `0024_event_birth_date.sql` | Data de nascimento nas inscrições de eventos (`event_registrations.attendee_birth_date`), a função `is_valid_birth_date` e o novo parâmetro de data em `ensure_visitor_profile`. | **Aplicada fora do histórico** (direto no banco). Objetos presentes. |
| `0025_event_institution_religion.sql` | Instituição e religião nas inscrições (`attendee_institution`, `attendee_religion`, constraint de religião) e novos parâmetros em `register_for_event`. | **Aplicada fora do histórico.** Objetos presentes. |
| `0026_event_visitor_questionnaire.sql` | Questionário de instituição/religião só para visitantes; membros aprovados ficam registrados como `membro_igreja` na constraint de religião. | **Aplicada fora do histórico.** Estado final da constraint inclui `membro_igreja`. |

Como o banco de produção já está correto, **não foi criada migration de reconciliação**. O custo é que
um banco novo criado do zero só com `supabase/migrations/` não teria as mudanças 0024 a 0026
(colunas `attendee_*` e as versões novas de `register_for_event` e `ensure_visitor_profile`).
Se um dia for preciso recriar o banco do zero, o caminho é escrever uma migration idempotente nova
(`add column if not exists`, `create or replace function`) com o conteúdo dessas três, usando os arquivos
em `drizzle/migrations/` como base e conferindo contra o banco real antes.

## Projeto Supabase

`supabase/config.toml` aponta para o projeto `mzqdsfadkaviwaazdwlx`. Antes apontava para o projeto
antigo do Lovable Cloud (`uvqdbfupjhazktkigcoa`).

## Tabelas novas e a lixeira

Toda tabela nova precisa ir para a lixeira geral: na migration dela, rode `select public.trash_attach_all();`
(veja `docs/backup-e-lixeira.md`). Se ela guarda caminhos de arquivos do armazenamento, inclua o campo em
`public.trash_files` e em `public.storage_path_in_use`.
