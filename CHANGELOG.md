# Changelog

## 0.6.3 — Universal Assets + Flexible Exposure

- Ativo universal com mapeamento Master -> SYNPEX -> Broker.
- Conversão de exposição por `contractSize`.
- Robots com `EXACT`, `FLEXIBLE` e `CUSTOM`.
- Limites opcionais de exposição e margem por robô; `freeMargin` continua soberana.
- Uma conta ativa por cliente no fan-out v1, com schema preparado para várias.
- Segredo individual por Master, cifrado em repouso.
- HMAC sobre os bytes exatos do body e nonce Redis com retenção >= 2x a janela.
- Endpoint administrativo para rotação de segredo do Master.
- Rotas antigas preservadas e expostas também sob `/api/v1`.
- Rebate deliberadamente fora do código.
- Testes de conversão de exposição adicionados.

# Changelog

## 0.6.0

### Corrigido (bugs da v0.5.2)
- **Nao compilava** (chave faltando em `closeRobotPositions`); `@types/node` ausente; migracao inicial inexistente (a unica migracao alterava uma tabela que nunca era criada).
- **Segredo fail-open**: nomes de variaveis divergentes faziam a API autenticar com `change-me`. Config agora e validada e falha alto.
- **MODIFY so de TP removia o Stop Loss** (`null` virava `0`).
- **PARTIAL_CLOSE fechava a fracao errada** (`Math.max(masterVolume, 1)`) e so era aceito uma vez por ticket; agora usa alvo acumulado, idempotente e imune a ordem.
- **MODIFY so era aceito uma vez por ticket** (unique sem sequencia); agora `eventSeq`.
- **Posicao orfa** quando CLOSE chegava antes do OPEN: lock por ticket + OPEN ignora ticket ja fechado.
- **Reconciliacao apagava posicoes recem-abertas** (lia broker antes do banco; sem carencia): ordem invertida, carencia e confirmacao dupla.
- Execucoes `PENDING` orfas nunca eram resolvidas; `UNKNOWN` sem ordem no broker ficava para sempre; reserva de margem de `UNKNOWN` expirava em 15s contra o README.
- `normalizeLot` subia lotes ao minimo (10x de risco) e aceitava `Infinity`; equity negativa era permitida.
- Reserva de margem era criada antes de checar o risco; limite "por robo" era igual ao global.
- Circuit breaker global por broker e sem meio-aberto real; `CIRCUIT_OPEN` era tratado como `UNKNOWN`.
- Erros de uma conta abortavam o job inteiro e os loops; `setInterval` sobrepunha ciclos; varios workers duplicavam trabalho.
- Robot OFF sem rede de seguranca; `enabledByDefault` ignorado; ids inconsistentes na API; 500 no lugar de 404.
- Worker BullMQ sem `maxRetriesPerRequest: null`; Prisma 7 sem adapter/`prisma.config.ts`; sem CORS para a tela.
- Seed quebrava (FK do ledger) e apontava 2/3 dos clientes para brokers sem adapter; `MockBroker` liberava margem da conta inteira.

### Adicionado
- Escopos de autenticacao (sinal / admin / token por cliente) com comparacao em tempo constante.
- Intencao de fechamento duravel, adocao de posicoes orfas, limite real por robo, `eventSeq`.
- Injecao de falhas no `MockBroker`; testes unitarios e de integracao.

### Alterado (quebra compatibilidade)
- `MODIFY`/`PARTIAL_CLOSE` exigem `eventSeq`. Segredos: `SIGNAL_SECRET`, `ADMIN_SECRET`, `CLIENT_TOKEN_SECRET`.
- Cliente usa `x-client-token`; rotas de robo usam `externalId` de cliente e robo.
- `LOT_BELOW_MIN_POLICY=SKIP` por padrao.


## v0.6.1

- Removido escalonamento de lote por `referenceCapital`; robos usam `configuredVolume` fixo.
- `marginAllocation`, `expectedLossPerOperation` e `riskProfile` adicionados ao robo como metadados de saude/risco.
- Elegibilidade de abertura agora depende da margem concreta estimada pelo broker contra `freeMargin` real, sem bloqueio por percentual global ou por alocacao ideal.
- Snapshot do broker passa a ser persistido em `ClientAccount` (balance/equity/usedMargin/freeMargin).
- `Broker.active` bloqueia novas aberturas, mas nao interfere em CLOSE/reducao.
- `eventSeq`: OPEN/CLOSE=0; MODIFY/PARTIAL_CLOSE>=1.
- Adicionado `cancelOrder` ao contrato para remainder de fills parciais.
- Reconciliacao reaplica CLOSE/PARTIAL_CLOSE/MODIFY que chegaram durante OPEN UNKNOWN.
- HMAC/timestamp/nonce e rate limit Redis adicionados ao endpoint de sinais.

## 0.6.2 — Front foundation / confirmed execution rules
- Confirmed and regression-tested concrete-margin-only opening rule.
- Kept `marginAllocation` and `expectedLossPerOperation` informational for health; they do not block openings.
- Added `BACKEND-FRONT-FOUNDATION.md` documenting the stable backend contract and deliberately deferred product modules.
- Versioned package as 0.6.2 without freezing still-changing front concepts into the database.
