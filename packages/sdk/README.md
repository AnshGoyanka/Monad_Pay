# @monad-pay/sdk

TypeScript SDK for **Monad Pay** — gasless P2P payments on [Monad](https://monad.xyz).

Interact with the PaymentPool smart contract: deposit MON, transfer between users (gasless), withdraw, check balances, and watch events — all type-safe with [viem](https://viem.sh).

## Install

```bash
npm install @monad-pay/sdk viem
```

## Quick Start

### Read-Only (no private key needed)

```ts
import { MonadPay } from "@monad-pay/sdk";

const mp = new MonadPay();

// Check pool balance
const balance = await mp.getBalance("0xYourAddress...");
console.log(`Sendable: ${balance.poolBalance} MON`);
console.log(`Wallet:   ${balance.nativeBalance} MON`);

// Get pool info
const info = await mp.getPoolInfo();
console.log(`Relayer: ${info.relayer}`);
console.log(`Total deposited: ${info.totalDeposited} MON`);
```

### Deposit MON into the Pool

```ts
import { MonadPay } from "@monad-pay/sdk";

const mp = new MonadPay({
  privateKey: "0xYourPrivateKey...",
});

// Deposit for yourself
const result = await mp.deposit({ amount: "2.5" });
console.log(`TX: ${result.explorerUrl}`);

// Deposit for another user
const result2 = await mp.depositFor({
  user: "0xRecipientAddress...",
  amount: "1.0",
});
```

### Gasless Transfer (Relayer)

```ts
// Only the relayer wallet can call transfer
const mp = new MonadPay({
  privateKey: "0xRelayerPrivateKey...",
});

const result = await mp.transfer({
  from: "0xSender...",
  to: "0xRecipient...",
  amount: "0.5",
});
console.log(`Sent! ${result.explorerUrl}`);
```

### Batch Transfers

```ts
const result = await mp.batchTransfer({
  transfers: [
    { from: "0xA...", to: "0xB...", amount: "1.0" },
    { from: "0xC...", to: "0xD...", amount: "2.0" },
  ],
});
```

### Withdraw

```ts
const result = await mp.withdraw({
  from: "0xUser...",
  to: "0xExternalWallet...",
  amount: "3.0",
});
```

### Watch Events (Real-Time)

```ts
import { formatEther } from "viem";

// Watch new deposits
const unwatch = mp.watchDeposits((event) => {
  console.log(`${event.user} deposited ${formatEther(event.amount)} MON`);
});

// Watch new transfers
mp.watchTransfers((event) => {
  console.log(`${event.from} → ${event.to}: ${formatEther(event.amount)} MON`);
});

// Stop watching
unwatch();
```

### Query Historical Events

```ts
// Get recent deposits (last 5000 blocks)
const deposits = await mp.getDeposits();

// Get transfers from a specific block
const transfers = await mp.getTransfers(1000000n);
```

## Custom Configuration

```ts
const mp = new MonadPay({
  // Use a custom pool contract
  poolAddress: "0xYourPoolContract...",

  // Use a custom RPC
  rpcUrl: "https://your-rpc-endpoint.com",

  // Sign transactions
  privateKey: "0xYourKey...",
});
```

## Exports

| Export | Description |
|--------|-------------|
| `MonadPay` | Main SDK client class |
| `PAYMENT_POOL_ABI` | Contract ABI (const assertion for type inference) |
| `monadTestnet` | viem chain definition for Monad Testnet |
| `DEFAULT_POOL_ADDRESS` | Official deployed contract address |
| `MONAD_CHAIN_ID` | 10143 |
| `EXPLORER_TX_URL` | Transaction explorer base URL |
| `EXPLORER_ADDRESS_URL` | Address explorer base URL |
| `NATIVE_CURRENCY` | "MON" |

## Contract

**PaymentPool** is deployed on Monad Testnet at [`0xfa929adb2eb7839edac52193fe39b11313b9b2fa`](https://testnet.monadexplorer.com/address/0xfa929adb2eb7839edac52193fe39b11313b9b2fa).

| Function | Access | Description |
|----------|--------|-------------|
| `deposit()` | Anyone | Deposit MON for yourself |
| `depositFor(user)` | Anyone | Deposit MON for another user |
| `transfer(from, to, amount, refId)` | Relayer only | Gasless transfer between pool balances |
| `batchTransfer(...)` | Relayer only | Multiple transfers in one tx |
| `withdraw(from, to, amount)` | Relayer only | Withdraw MON to external address |
| `balanceOf(user)` | Anyone | Check pool balance |

## License

MIT
