# One-shot MT5 signal test

`Signal1Test.mq5` is a one-shot Expert Advisor (EA) that sends a signed `OPEN` event to the SYNPEX8 signal API. It does not place, modify, or close trades. The worker can validate route/asset mappings and calculate a dry-run volume, but does not call any broker or execute orders.

Use a development/test API only. A signal is persisted even though this EA does not trade, so do not send it to a production database.

Follow the complete contract, environment, Codespaces, installation, and troubleshooting guide in [docs/MT5-MASTER-INTEGRATION.md](../docs/MT5-MASTER-INTEGRATION.md).

The EA uses the configured symbol's current quote and a synthetic `TEST-...` ticket; it does not read or mirror an existing position or send the account login/balance. Its persistent one-shot guard prevents accidental repeats; use the documented reset-only input to intentionally enable another test.
