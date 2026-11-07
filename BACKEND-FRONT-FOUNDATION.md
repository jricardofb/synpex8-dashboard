# SYNPEX Backend — Foundation for Front v0.6.2

Esta versão consolida apenas requisitos já decididos. Funcionalidades de produto ainda em definição (Machine, Lab, Store, Market Data, Events) não foram forçadas ao schema antes do fechamento do desenho do front.

## Regras confirmadas

### Margem
- `Robot.configuredVolume` é fixo; o motor não escala lote por saldo/capital.
- `Robot.marginAllocation` é margem ideal/planejada e serve para saúde/indicadores.
- `Robot.expectedLossPerOperation` é metadado de risco e não é descontado do free margin.
- Para uma nova abertura, a decisão operacional usa `marginRequired` estimada pelo broker contra o `freeMargin` real, descontando reservas concorrentes.
- Se não couber, o sinal é perdido (`SKIPPED`); não existe fila de recuperação desse sinal.
- Posição já existente pode ser reduzida/fechada mesmo quando o broker estiver marcado inativo, conforme o adapter permitir.

### Volume e execução
- O volume do robô é fixo e somente normalizado às regras do broker.
- Partial fill de uma ordem é diferente de `PARTIAL_CLOSE` da estratégia.
- `PARTIAL_CLOSE` representa uma saída intencional do Master e deve ser replicado usando alvo de volume restante/cumulativo.
- `CLOSE`, `MODIFY` e `PARTIAL_CLOSE` recebidos durante abertura `UNKNOWN` são reaplicados após reconciliação/adopção.

### Cliente
- STOP é intenção durável de fechamento e impede novas entradas.
- RESUME não recupera sinais perdidos; o cliente volta a receber somente novos sinais.
- Perfil do investidor é armazenado para persistência/auditoria, mas não é usado pelo Copy Engine para escolher ou recomendar robôs.

## Partes deliberadamente não congeladas

O desenho completo de `Machine`, `Lab`, `Store`, `Market Data`, `Events` e módulos comerciais deve ser fechado depois que a especificação do front for enviada. A arquitetura será preparada para essas áreas sem acoplá-las ao motor de execução.
