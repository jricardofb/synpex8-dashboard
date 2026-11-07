# Integracao MT5 Master -> API SYNPEX8

## 1. Arquitetura e estado atual

O EA de teste envia um unico evento `OPEN` pela internet para `POST /api/v1/signals`. O Fastify valida o JSON, autentica o Master, aplica limite de requisicoes e protecao contra replay, e persiste o evento com uma entrada na outbox. O worker publica o job e o consumidor dry-run valida rotas/mappings e calcula o volume proporcional previsto, persistindo o resultado. Nenhum adaptador de corretora e chamado e nenhuma ordem e enviada.

`mt5/Signal1Test.mq5` e um EA de teste de envio unico. Ele usa uma cotacao do grafico/simbolo configurado e gera um ticket sintetico `TEST-...`; nao observa posicoes reais nem informa login ou saldo da conta. O teste persiste o sinal no banco, portanto use somente um ambiente de desenvolvimento.

## 2. Contrato HTTP e payload

- Metodo e rota: `POST /api/v1/signals`.
- Tipo de conteudo: `application/json`.
- `eventType`: `OPEN`, `MODIFY`, `PARTIAL_CLOSE` ou `CLOSE`; o backend assume `OPEN` se omitido, mas o EA envia explicitamente.
- `eventSeq`: inteiro a partir de 1; `OPEN` exige `1`. A sequencia e por ticket; nao precisa ser sem lacunas.
- Campos obrigatorios: `masterAccountId`, `robotId`, `strategyId`, `magicNumber`, `masterTicketId`, `eventSeq`, `symbol`, `direction`, `masterLot`.
- `masterPrice` e obrigatorio e positivo para `OPEN`.
- `magicNumber`: string nao vazia (ate 64 caracteres) ou inteiro nao negativo.
- `masterTicketId`: string nao vazia (ate 128 caracteres) ou inteiro positivo.
- `masterAccountId`, `robotId` e `strategyId`: strings nao vazias, ate 128 caracteres.
- `symbol`: string nao vazia, ate 64 caracteres. O backend nao normaliza aliases automaticamente.
- `direction`: `BUY` ou `SELL`.
- `masterLot`: numero finito positivo. Em `PARTIAL_CLOSE`, representa o volume fechado nesse evento.
- Campos opcionais: `masterBalance` e `contractSize` positivos; `stopLoss` e `takeProfit` podem ser numeros nao negativos ou `null`.
- `contractSize` no sinal e apenas informativo para compatibilidade; o calculo usa o tamanho de contrato cadastrado no mapeamento do Master.
- `MODIFY` precisa fornecer `stopLoss` ou `takeProfit`; campo ausente ou `null` significa manter o stop atual, e `0` significa remove-lo.
- O schema rejeita campos JSON desconhecidos.

Payload usado pelo EA, com valores substituidos pelos parametros e cotacao lida no MT5:

```json
{
  "masterAccountId": "<MASTER_ID>",
  "robotId": "<ROBOT_ID>",
  "strategyId": "<STRATEGY_ID>",
  "magicNumber": "1001",
  "masterTicketId": "TEST-<GERADO_PELO_EA>",
  "eventType": "OPEN",
  "eventSeq": 1,
  "symbol": "XAUUSD",
  "direction": "BUY",
  "masterLot": 0.01,
  "masterPrice": "<COTACAO_ASK_OU_BID>"
}
```

`masterPrice` deve ser um numero JSON positivo, nao o texto literal do marcador.

Antes de qualquer roteamento, o simbolo exato precisa estar mapeado para um codigo universal e um tipo de instrumento confirmado. A conta destino tambem precisa ter um mapeamento ativo para esse mesmo produto. Tipos diferentes (por exemplo, `CFD` e `FUTURE`) sao bloqueados. Tamanhos de contrato diferentes exigem o modo explicito `CONTRACT_SIZE_RATIO`; sem essa configuracao, o dry-run bloqueia o destino. O `contractSize` enviado pelo EA nao substitui o valor cadastrado. Os tipos aceitos no mapeamento sao `SPOT`, `CFD`, `FUTURE`, `OPTION`, `STOCK`, `ETF` e `CRYPTO_SPOT`.

Exemplo valido usado pelos testes do contrato (IDs de fixture; nao sao credenciais nem garantem que existam no seu banco):

```json
{"masterAccountId":"MASTER-1","robotId":"ROBOT-1","strategyId":"STRATEGY-1","magicNumber":1001,"masterTicketId":12345,"eventType":"OPEN","eventSeq":1,"symbol":"XAUUSD","direction":"BUY","masterLot":0.1,"masterPrice":2328.15}
```

## 3. Autenticacao, segredo e idempotencia

O backend exige estes headers:

- `x-master-id`: ID externo do Master; deve ser igual a `masterAccountId` no corpo.
- `x-signal-timestamp`: Unix epoch em milissegundos, com 13 digitos.
- `x-signal-nonce`: valor novo por tentativa, de 16 a 128 caracteres alfanumericos, `_` ou `-`.
- `x-signal-signature`: HMAC-SHA256 hexadecimal, 64 caracteres.

A assinatura e calculada sobre os bytes UTF-8 exatos do corpo enviado:

```text
HMAC-SHA256(masterSecret, timestamp + "." + nonce + "." + rawBody)
```

Qualquer alteracao no JSON apos assinar invalida a assinatura. A janela de timestamp e configuravel por `SIGNAL_SIGNATURE_MAX_AGE_MS` (padrao `60000` ms). O nonce e reservado no Redis por pelo menos o dobro dessa janela; reutiliza-lo resulta em rejeicao. Os limites por IP e Master usam `SIGNAL_RATE_LIMIT_PER_MINUTE` (padrao `300`).

Cada Master tem segredo proprio. Gere um ID novo e provisione-o no ambiente conectado ao banco:

```bash
npx tsx src/provisionMaster.ts <MASTER_EXTERNAL_ID>
```

O comando mostra o segredo uma unica vez e guarda somente a versao cifrada no banco. Configure o segredo diretamente no parametro privado do EA; nao o envie em chat, logs, preset ou controle de versao. A chave de cifragem do servidor e `MASTER_SECRET_ENCRYPTION_KEY`; ela nao e o segredo do Master.

Reenvio do mesmo ticket e `eventSeq` com o mesmo conteudo e duplicata (`200`); a mesma chave com conteudo diferente retorna conflito (`409`). Um retry HTTP precisa de timestamp, nonce e assinatura novos, mantendo o evento igual.

## 4. Pre-requisitos e ambiente

Requer Node.js `>=20.19.0`, dependencias npm instaladas, PostgreSQL e Redis acessiveis. `docker-compose.yml` publica PostgreSQL na porta `5432` e Redis localmente na `6379`.

```bash
cp .env.example .env
```

Confira no `.env` os valores para:

- `DATABASE_URL`: URL PostgreSQL do ambiente.
- `REDIS_URL`: Redis do ambiente (padrao documentado `redis://localhost:6379`).
- `HOST=0.0.0.0` e `PORT=3000`.
- `MASTER_SECRET_ENCRYPTION_KEY`: gere uma chave local de 32 bytes em Base64 com `openssl rand -base64 32`; mantenha-a apenas no `.env` nao versionado.
- `SIGNAL_SIGNATURE_MAX_AGE_MS` e `SIGNAL_RATE_LIMIT_PER_MINUTE` sao opcionais, com os padroes acima.

Inicie as dependencias e prepare o banco:

```bash
docker compose up -d postgres redis
npm install
npm run db:generate
npm run db:deploy
```

Para receber o sinal, inicie a API:

```bash
npm run dev:api
```

`npm run dev` inicia API, relay e consumidor dry-run. Para simular o processamento e necessario aplicar as migrations, iniciar PostgreSQL/Redis e manter o worker ativo. O modo atual nao executa operacoes. A migration de resultados dry-run e `20261019184000_signal_processing_results`; aplique migrations somente apos revisar o estado pendente do banco de destino.

## 5. Instalar e compilar o EA

1. Abra `mt5/Signal1Test.mq5` no MetaEditor do MT5.
2. Compile e confirme que nao ha erros.
3. Copie o EA compilado para a pasta `MQL5/Experts` do terminal, se o MetaEditor nao o salvar ali.
4. No MT5, abra **Tools > Options > Expert Advisors** e marque **Allow WebRequest for listed URL**. Adicione somente o host HTTPS da API (sem o caminho `/api/v1/signals`).

`WebRequest` e sincrono e precisa ser autorizado explicitamente no terminal MT5.

## 6. Parametros do EA

- `InpApiUrl`: URL HTTPS completa terminando em `/api/v1/signals`.
- `InpMasterId`: ID provisionado do Master.
- `InpMasterSecret`: segredo mostrado uma vez pelo comando de provisionamento.
- `InpRobotId` e `InpStrategyId`: identificadores cadastrados para o roteamento esperado.
- `InpSymbol`: exemplo padrao `XAUUSD`; configure o nome exato do ativo no broker.
- `InpBuy`: `true` envia `BUY`; `false` envia `SELL`.
- `InpTestLot`: volume de teste positivo.
- `InpMagicNumber`: numero magico nao negativo.
- `InpSendTestSignal`: deve permanecer `false` ate confirmar ambiente e parametros; habilite somente para a tentativa de teste.
- `InpResetTestGuard`: modo de reset apenas; quando `true`, limpa o bloqueio local e nao envia sinal. Depois retorne a `false` antes de anexar para enviar.

O EA usa um bloqueio persistente do terminal MT5 para evitar outro envio acidental. A primeira tentativa HTTP marca o bloqueio mesmo se a conexao falhar, pois a resposta pode ter se perdido depois de o servidor persistir o evento. Para uma nova tentativa intencional: anexe com `InpResetTestGuard=true` para limpar o bloqueio sem enviar, depois use `false`, confirme `InpSendTestSignal=true` e anexe novamente. O bloqueio e compartilhado por esse EA no terminal.

Os parametros de EA do MT5 nao sao um cofre de segredos. Nao compartilhe perfil, preset ou captura de tela que contenha `InpMasterSecret`; limpe-o depois do teste e rotacione-o se houver exposicao.

## 7. URL HTTPS e porta do Codespace

A API escuta em `0.0.0.0:3000`. No Codespaces:

1. Com a API iniciada, abra a aba **Ports** do VS Code.
2. Encaminhe a porta local `3000`, se ainda nao aparecer.
3. Defina a visibilidade como **Public** para permitir que o terminal MT5 externo alcance o servico.
4. Use o endereco HTTPS exibido pelo Codespaces, acrescentando `/api/v1/signals`. O formato do host e `<CODESPACE_NAME>-3000.<GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN>`; o dominio real e fornecido pelo ambiente, nao o adivinhe.

Uma URL formada pelo padrao nao prova que a API esteja no ar ou que a porta esteja encaminhada. Confirme a porta na aba **Ports** e teste o host antes de configurar o EA. O endpoint `/health` existe para verificacao de disponibilidade, mas nao autentica sinais.

## 8. Teste e respostas esperadas

1. Confirme ambiente de desenvolvimento, migrations aplicadas, API ativa, porta encaminhada e acesso HTTPS.
2. Provisione o Master usando um ID que ainda nao exista nesse banco e guarde o segredo com seguranca.
3. Autorize o host na lista `WebRequest` do MT5.
4. Compile o EA, configure os parametros e verifique cuidadosamente URL e ativo.
5. Anexe o EA com `InpSendTestSignal=false` para conferir os parametros sem enviar.
6. Habilite `InpSendTestSignal=true` e anexe para uma unica tentativa. Consulte o log **Experts** e a resposta da API.

Respostas da ingestao:

```json
HTTP 202 {"accepted":true,"duplicate":false}
HTTP 200 {"accepted":true,"duplicate":true}
HTTP 400 {"error":"INVALID_JSON"}
HTTP 400 {"error":"INVALID_SIGNAL"}
HTTP 401 {"error":"UNAUTHORIZED"}
HTTP 409 {"error":"EVENT_SEQ_CONFLICT"}
HTTP 429 {"error":"RATE_LIMITED"}
HTTP 503 {"error":"SERVICE_UNAVAILABLE"}
```

Um `202` confirma persistencia do evento, nao uma ordem executada. Com o worker e as migrations de processamento ativos, o resultado dry-run e persistido em `SignalProcessingResult`; `200` e retry duplicado. O limite do corpo HTTP e 16 KiB. Nao existe endpoint HTTP para consultar o resultado nesta etapa.

Consulta SQL de verificacao, executada no banco de desenvolvimento:

```sql
SELECT signal."masterTicketId", result."status", result."result", result."processedAt"
FROM "MasterSignal" AS signal
JOIN "SignalProcessingResult" AS result ON result."signalId" = signal.id
WHERE signal."masterTicketId" = '<TICKET_DE_TESTE>';
```

`DRY_RUN_COMPLETED` significa que rotas e mappings foram validados e o volume proporcional foi calculado. `NO_ROUTE`, `BLOCKED` e `UNSUPPORTED` explicam por que nao ha um plano mapeado. Mesmo em `DRY_RUN_COMPLETED`, nao foram consultadas cotacoes/margem do destino nem enviada ordem.

## 9. Diagnostico

- `WebRequest` retorna `-1`: autorize o host HTTPS em **Allow WebRequest**, confirme conectividade do terminal e consulte `GetLastError()` no log **Experts**.
- `401 UNAUTHORIZED`: confira Master ativo, ID igual no header/corpo, segredo correspondente, hora do computador, timestamp, nonce novo e bytes do corpo sem alteracoes.
- `400 INVALID_JSON` ou `INVALID_SIGNAL`: valide JSON, campos obrigatorios, tipos, `eventSeq=1` e `masterPrice` positivo para `OPEN`; remova campos nao previstos.
- `409 EVENT_SEQ_CONFLICT`: ticket e sequencia ja foram usados com outro conteudo; nao altere o payload de um evento em retry.
- `429 RATE_LIMITED`: aguarde o limite por minuto.
- `503 SERVICE_UNAVAILABLE`: verifique logs da API e disponibilidade de PostgreSQL/Redis.
- Sem conexao pelo endereco Codespaces: confirme API escutando na porta `3000`, encaminhamento ativo e visibilidade Public.

## 10. Testes existentes e limitacoes

Testes unitarios existentes relevantes:

```bash
npx vitest run tests/master-signal-contract.test.ts tests/master-signal-security.test.ts tests/receive-master-signal.test.ts tests/signal-api.test.ts
```

Eles cobrem contrato e validacoes, assinatura HMAC sobre corpo bruto, janela temporal, criptografia do segredo, nonce/replay, duplicatas, rate limit, endpoint e indisponibilidade do Redis. A compilacao do EA deve ser confirmada no MetaEditor; ela nao e coberta pelos testes TypeScript.

Este EA so envia um evento sintetico de teste e nao monitora operacoes reais. O consumidor atual simula apenas eventos `OPEN`; `MODIFY`, `PARTIAL_CLOSE` e `CLOSE` ficam marcados como nao suportados. Monitoramento automatico no MT5, ciclo de posicao completo, adapter de corretora real, checagem efetiva de cotacao/margem, aprovacao operacional e execucao real permanecem etapas futuras. O modo dry-run nunca chama o broker.
