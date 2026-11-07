# SYNPEX Copy Trading Engine v0.6.3 v0.6.0
> **v0.6.4** - leia `V0.6.4-CHANGES.md`, `docs/SIGNAL-CONTRACT.md` (contrato do EA) e `docs/STATES.md`.

Motor de copy trading: recebe sinais de contas master (EAs), converte o volume pelos tamanhos de contrato do ativo para clientes,
controla margem real do broker e mantem o banco reconciliado com o broker.

> **Status: pre-producao.** Nao ha adapter de broker real. `XMAdapter` e somente um simulador em memoria e recusa `environment: real`; nao conecta a contas XM demo nem real.

O processo `src/worker.ts` publica a outbox e consome sinais em modo dry-run: valida rotas e mappings e calcula o volume proporcional, sem chamar corretoras. `PROCESSED` na outbox significa somente que o job foi publicado na fila.

## Arquitetura

```
EA do master --POST /signals--> API --(Signal + OutboxEvent, mesma transacao)--> Postgres
                                                                                    |
Relay: outbox (SKIP LOCKED) --> BullMQ --> consumidor dry-run --> resultado persistido
Execucao de ordens e processamento de eventos de saida: ainda nao habilitados
```

Ideias centrais:

- **Idempotencia**: `clientOrderId = CT-<signalId>-<accountId>`; `Execution` e `Signal` com chaves unicas.
- **Estado UNKNOWN**: timeout/erro no `placeOrder` **nunca** reenvia a ordem; resolve consultando o broker pelo `clientOrderId`.
- **Intencao de fechamento duravel**: PARAR, Robo OFF e CLOSE do master gravam `closeRequestedAt` na posicao; o worker insiste ate o broker confirmar. Se fila/Redis/worker falharem, a intencao continua no banco.
- **Ordem por ticket**: eventos do mesmo ticket sao serializados por lock (Redis). OPEN nao abre copia de um ticket que o master ja fechou/reduziu; MODIFYs recebidos antes do OPEN sao aplicados a ele.
- **Reconciliacao segura**: le o banco *antes* do broker; posicao ausente so vira `CLOSED` apos carencia + confirmacao dupla; posicoes orfas (mesmo `clientOrderId` no broker, sem registro local) sao adotadas.
- **Reserva de margem atomica**: checa a margem concreta exigida pela ordem contra o `freeMargin` real do broker e cria a reserva na mesma transacao, sob advisory lock por conta. Margem ideal do robo e perda esperada sao indicadores, nao bloqueios.
- **Volume**: lote Master x contrato Master / contrato do cliente; `Robot.configuredVolume` e referencia, nao escala por capital.
- **Saude de margem**: `/clients/:clientId/margin-health` compara `freeMargin` real com a soma das margens ideais e mostra alerta; esse indicador nao bloqueia ordens.
- **Perfil do investidor**: o cliente pode registrar seu perfil via `/clients/:clientId/investor-profile`; o backend nao usa isso para recomendar ou selecionar robo automaticamente.
- **Eventos durante UNKNOWN**: depois de reconciliar um OPEN executado, o worker reaplica CLOSE/PARTIAL_CLOSE/MODIFY que chegaram enquanto a abertura estava incerta.
- **Parcial**: o adapter precisa suportar cancelamento do restante (`cancelOrder`) antes de o motor aceitar um `PARTIALLY_FILLED`.
- **Seguranca de sinais**: cada Master tem segredo proprio; sinais exigem HMAC + timestamp + nonce e rate limit Redis.

## Contrato dos sinais (`POST /api/v1/signals`, segredo individual por Master)

| Campo | Regra |
|---|---|
| `eventType` | `OPEN` (padrao), `MODIFY`, `PARTIAL_CLOSE`, `CLOSE` |
| `eventSeq` | Sequencia por ticket, com `OPEN` = 1; cada evento posterior incrementa. Nao exige sequencia sem lacunas. |
| Duplicata | Mesmo ticket + `eventSeq` + conteudo = duplicata; mesma sequencia com conteudo diferente = `409 EVENT_SEQ_CONFLICT`. |
| `masterPrice` | Obrigatorio em `OPEN`; usado para medir diferenca de cotacao e execucao, sem bloquear a ordem. |
| `MODIFY` `stopLoss`/`takeProfit` | ausente ou `null` = **manter**; numero = novo valor; `0` = remover |
| `PARTIAL_CLOSE` `masterLot` | lote **fechado** pelo master neste evento (o motor acumula e mira a fracao restante) |
| `OPEN` `masterLot` | volume inicial do master no ticket |

Retransmitir o mesmo evento (mesmo ticket + tipo + `eventSeq`) devolve `200 {duplicate:true}`.

## Autenticacao e anti-replay

`POST /api/v1/signals` identifica o Master pelo corpo e pelo header `x-master-id`. Cada Master possui um segredo próprio, armazenado cifrado no banco. A assinatura é HMAC-SHA256 sobre os bytes exatos recebidos: `HMAC(secret, timestamp.nonce.rawBody)`. O timestamp usa janela configurável (padrão 60s), o nonce é mantido no Redis por pelo menos o dobro da janela, e há rate limit por Master/origem.

## Autenticacao (escopos separados)

| Escopo | Header | Uso |
|---|---|---|
| Sinais | `x-master-id`, `x-signal-timestamp`, `x-signal-nonce`, `x-signal-signature` | EAs dos Masters (`POST /api/v1/signals`) |
| Admin | `x-admin-secret` | controle de master, emissao de token, qualquer acao sobre qualquer cliente |
| Cliente | `x-client-token` | so age sobre **o proprio** cliente. Emitido por `POST /admin/clients/:id/token` (token = HMAC do id) |

Os segredos de plataforma (`ADMIN_SECRET` e `CLIENT_TOKEN_SECRET`) precisam ser diferentes e ter 16+ caracteres; o segredo de cada Master e gerado com `npx tsx src/provisionMaster.ts MASTER-1` e cifrado com `MASTER_SECRET_ENCRYPTION_KEY`. O comando mostra o segredo uma vez; configure-o no EA do MetaTrader.
Os aliases de ativos sao cadastrados por Master e por conta de corretora com:

```text
npx tsx src/provisionAssetMapping.ts <MASTER_ID> <MASTER_SYMBOL> <UNIVERSAL_CODE> <DISPLAY_NAME> <MASTER_CONTRACT_SIZE> <MASTER_INSTRUMENT_TYPE> <BROKER_ACCOUNT_ID> <BROKER_SYMBOL> <BROKER_CONTRACT_SIZE> <BROKER_INSTRUMENT_TYPE> <CONVERSION_MODE>
```

`MASTER_INSTRUMENT_TYPE` e `BROKER_INSTRUMENT_TYPE` aceitam `SPOT`, `CFD`, `FUTURE`, `OPTION`, `STOCK`, `ETF` ou `CRYPTO_SPOT`. Use um `UNIVERSAL_CODE` diferente para produtos diferentes, por exemplo `GOLD_SPOT_CFD` e `GOLD_MICRO_FUTURE`; o codigo e apenas uma identidade cadastrada, nao uma especificacao fornecida pela corretora. `CONVERSION_MODE` deve ser `EXACT_ONLY` por padrao. So use `CONTRACT_SIZE_RATIO` quando as especificacoes de ambos os instrumentos confirmarem que a conversao proporcional e valida.

Tipos diferentes sao sempre bloqueados, mesmo que o codigo universal coincida. Tamanhos de contrato diferentes tambem sao bloqueados em `EXACT_ONLY`. Simbolos como `XAUUSD`, `XAUUSD.s` e `GOLD` nunca sao associados automaticamente. A classificacao e os tamanhos devem ser confirmados para o simbolo exato e a conta; sinais recebidos nao substituem esses dados cadastrados.
A tela `web/client-control.html` usa o token do cliente. Defina `CORS_ORIGINS` para servi-la de outra origem.

## Como rodar

```bash
cp .env.example .env
# gere e configure MASTER_SECRET_ENCRYPTION_KEY com: openssl rand -base64 32
docker compose up -d
npm install
npm run db:generate
npm run db:deploy                    # aplica as migrations incluidas no pacote
npm run db:seed                       # fixtures locais idempotentes; nao apaga dados existentes
npm run dev                           # API + worker
```

### Roteamento explicito de sinais

Cada destino e cadastrado explicitamente por Master + robotId de origem + strategyId + conta do cliente. O cadastro aponta para um robo daquele mesmo cliente e conta; destinos sem vinculo nao recebem o sinal. Para habilitar elegibilidade, o Master, a conta e o vinculo devem estar ativos, e o robo do cliente deve estar `ON`. Um robo e proprio de um cliente, permitindo separar volume, posicoes e controles entre robos que compartilham a mesma conta.

O seed cria fixtures `MASTER-1`, `DEV-CLIENT-1`, conta `MOCK-DEV-1`, robo `DEV-ROBOT-1` (inicialmente `OFF`) e uma rota de desenvolvimento. Para cadastrar uma rota fora do seed, crie o robo do cliente (inicialmente `OFF`) e depois associe a origem e a conta:

```bash
npx tsx src/provisionClientRobot.ts <CLIENT_EXTERNAL_ID> <CLIENT_ROBOT_EXTERNAL_ID> <NAME> <CONFIGURED_VOLUME>
npx tsx src/provisionCopyTradingRoute.ts <MASTER_EXTERNAL_ID> <SOURCE_ROBOT_ID> <STRATEGY_ID> <CLIENT_EXTERNAL_ID> <BROKER_ACCOUNT_ID> <CLIENT_ROBOT_EXTERNAL_ID>
```

O cadastro da rota confere os mapeamentos ativos do Master contra os da conta destino. Todos os ativos ativos do Master precisam ter tipo conhecido, contrato válido e um mapeamento compatível na conta; qualquer ausência, tipo divergente ou conversão de contrato sem aprovação explicita bloqueia o cadastro. Como hoje os mapeamentos são definidos por Master (não por robô/estratégia), esta validação conservadora considera todos os ativos ativos daquele Master.

O worker ainda e somente relay da outbox: essa rota restringe os destinos que poderao ser elegiveis, mas nao habilita execucao de ordens.

Para testar um sinal, gere timestamp/nonce/assinatura primeiro:

Para enviar um unico sinal de teste pelo MetaTrader 5, use o EA [mt5/Signal1Test.mq5](./mt5/Signal1Test.mq5) e siga [docs/MT5-MASTER-INTEGRATION.md](./docs/MT5-MASTER-INTEGRATION.md). Ele somente envia o sinal; nao abre ordens.

Provisione o Master no banco de desenvolvimento; o comando mostra o segredo uma unica vez:

```bash
npx tsx src/provisionMaster.ts <MASTER_EXTERNAL_ID>
```

```bash
BODY='{"masterAccountId":"MASTER-1","robotId":"ROBOT-1-1","strategyId":"STRAT-1-1-1","magicNumber":"1001","masterTicketId":"T1","eventType":"OPEN","eventSeq":1,"symbol":"GOLD","direction":"BUY","masterLot":0.10,"masterBalance":10000,"masterPrice":2328.15}'
TS=$(date +%s%3N)
NONCE=$(openssl rand -hex 16)
MASTER_SECRET="<segredo exibido pelo provisionMaster para o Master correspondente>"
SIG=$(node -e 'const crypto=require("crypto"); const [secret,ts,nonce,body]=process.argv.slice(1); console.log(crypto.createHmac("sha256",secret).update(`${ts}.${nonce}.${body}`).digest("hex"))' "$MASTER_SECRET" "$TS" "$NONCE" "$BODY")
curl -X POST localhost:3000/api/v1/signals \
  -H 'content-type: application/json' \
  -H "x-master-id: MASTER-1" \
  -H "x-signal-timestamp: $TS" -H "x-signal-nonce: $NONCE" -H "x-signal-signature: $SIG" \
  -d "$BODY"
```

## Testes

```bash
npm test                    # unitarios (sem banco): lote, risco, posicoes, reconciliacao, resiliencia, config, seguranca
npm run test:integration    # exige Postgres + Redis (veja o cabecalho do arquivo)
npm run typecheck           # exige `npm run db:generate` antes
```

O seed e aditivo e idempotente; nao apaga dados e recusa rodar com `NODE_ENV=production`. Ele cria fixtures locais com conta `MOCK`; nao use essas fixtures para execucao real.

## Configuracao

Veja `.env.example`. Pontos de atencao: `LOT_BELOW_MIN_POLICY` (`SKIP` nao opera lotes abaixo do minimo; `ROUND_UP` sobe ao minimo e aumenta o risco),
`MAX_EXECUTION_CONCURRENCY` x `WORKER_CONCURRENCY` x `DB_POOL_MAX` (dimensione juntos), `MOCK_BROKER_RPS`.

## Limitacoes conhecidas

- **Sem adapter de broker real.** Ao escrever um, ele deve: devolver `clientOrderId` em `listPositions` (MT5: campo *comment*), devolver `positionId` no fill, e tratar `stopLoss`/`takeProfit` = `undefined` como "sem stop".
- Sinais com atraso de rede entre EA e API: o TTL conta a partir do recebimento na API (nao ha timestamp do master).
- O adapter real de broker ainda precisa implementar historico/resultado de fechamentos para PnL oficial.
- O simulador/backtest visual do front ainda depende de uma fonte de dados historicos de mercado; o motor real e o simulador devem permanecer ambientes separados.
- Circuit breaker e rate limiter sao em memoria (por processo).
- A validacao desta entrega inclui checagem de sintaxe TypeScript e revisao estrutural; `npm test`, `npm run typecheck` e `npm run test:integration` devem ser executados no ambiente com as dependencias instaladas e Postgres/Redis disponiveis.
