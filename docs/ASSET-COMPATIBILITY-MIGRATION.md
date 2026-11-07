# Checklist da migracao de compatibilidade de ativos

Esta migracao adiciona o tipo de instrumento aos mapeamentos e o modo de conversao aos mapeamentos da corretora. Ela nao remove nem renomeia mapeamentos: registros existentes recebem `UNKNOWN` e `EXACT_ONLY`, e o dry-run os bloqueia ate que sejam recadastrados com especificacoes confirmadas.

## Antes de aplicar

1. Confirme o ambiente e a URL do banco sem compartilhar credenciais.
2. Verifique o estado das migrations. A migration esperada e `20261021124500_asset_instrument_compatibility`; nao aplique se houver outras migrations pendentes nao revisadas.
3. Gere um backup completo e confira que o arquivo pode ser lido:

```bash
umask 077
export BACKUP_FILE="$HOME/synpex8-before-asset-compatibility.dump"
pg_dump --format=custom --file="$BACKUP_FILE" "$DATABASE_URL"
pg_restore --list "$BACKUP_FILE" >/dev/null
```

`DATABASE_URL` deve estar configurada apenas no ambiente local seguro. Nunca a cole no chat ou em logs.

4. Restaure o backup em um banco isolado, nunca sobre o banco de producao. Confira os mapeamentos no clone antes e depois do teste.
5. Na copia, aplique a migration e confira que mapeamentos antigos receberam `instrumentType = UNKNOWN` e `conversionMode = EXACT_ONLY`. Confirme que o worker os bloqueia em dry-run.
6. Recadastre um simbolo de teste com tipo e tamanhos confirmados. Verifique que o dry-run so libera o caso compativel e continua bloqueando tipo divergente e conversao nao aprovada.
7. Teste a restauracao do backup em outro banco isolado e confirme que os dados estao acessiveis.
8. Planeje a versao da aplicacao: a versao que consulta as novas colunas deve ser ativada somente depois da migration.

## Aplicacao no ambiente escolhido

Somente depois de revisar o backup, a restauracao, o estado das migrations e os testes:

```bash
npx prisma migrate status
npx prisma migrate deploy
npx prisma migrate status
```

`migrate deploy` aplica todas as migrations pendentes no `DATABASE_URL` ativo. Confirme cuidadosamente o destino e a lista pendente antes de executa-lo. Esta migration nao foi aplicada por este procedimento.

## Verificacoes ja realizadas no desenvolvimento

- A migration SQL foi executada em uma instancia temporaria descartavel do PostgreSQL, com linhas antigas nas tabelas de mapeamento. Foram verificados os defaults `UNKNOWN`/`EXACT_ONLY` e uma atualizacao explicita para tipos conhecidos.
- Testes de unidade verificam que tipos desconhecidos, tipos divergentes e conversoes nao autorizadas bloqueiam o dry-run, e que um mapeamento explicitamente recadastrado pode passar.
- A verificacao acima nao substitui backup, restauracao testada, teste em clone completo nem aprovacao para o ambiente desejado.
