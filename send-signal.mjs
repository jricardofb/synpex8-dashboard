import crypto from 'node:crypto';

const secret = process.env.MASTER_SECRET ?? 'dev-master-secret-1';
const ticket = process.env.TICKET ?? `T${Date.now()}`;

const body = JSON.stringify({
  masterAccountId: 'MASTER-1',
  robotId: 'ROBOT-1-1',
  strategyId: 'STRAT-1-1-1',
  magicNumber: '1001',
  masterTicketId: ticket,
  eventType: 'OPEN',
  eventSeq: 1,
  symbol: 'GOLD',
  direction: 'BUY',
  masterLot: 0.1,
  masterBalance: 10000,
  masterPrice: 2650.5,
});

const ts = Date.now().toString();
const nonce = crypto.randomBytes(16).toString('hex');
const sig = crypto.createHmac('sha256', secret).update(`${ts}.${nonce}.${body}`).digest('hex');

const res = await fetch('http://127.0.0.1:3000/api/v1/signals', {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'x-master-id': 'MASTER-1',
    'x-signal-timestamp': ts,
    'x-signal-nonce': nonce,
    'x-signal-signature': sig,
  },
  body,
});
console.log(res.status, await res.text());