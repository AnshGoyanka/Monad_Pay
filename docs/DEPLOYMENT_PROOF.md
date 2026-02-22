# Deployment Proof — Monad Pay

Evidence that Monad Pay is fully deployed, operational, and processing real on-chain transactions on Monad Testnet.

---

## 1. Live API Server (Railway)

**URL:** `https://chatpayapi-production.up.railway.app`

### Health Check Response

```
GET https://chatpayapi-production.up.railway.app/health

HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8
Server: railway-edge
X-Railway-Edge: railway/europe-west4-drams3a
X-Railway-Request-Id: Dba3-q6PRHGVW9UG0-QtfA
X-Ratelimit-Limit: 10
X-Railway-CDN-Edge: fastly/cache-bom-vanm7210036-BOM
Date: Sat, 22 Feb 2026 11:58:01 GMT

{
  "status": "ok",
  "timestamp": "2026-02-22T11:58:01.730Z",
  "relayerGasLow": true
}
```

> You can verify this yourself: [`https://chatpayapi-production.up.railway.app/health`](https://chatpayapi-production.up.railway.app/health)

### Railway Configuration

- **Builder:** Nixpacks (auto-detected Node.js 20+)
- **Build Command:** `npm install && cd packages/shared && npm run build && cd ../../apps/api && npx prisma generate && npm run build`
- **Start Command:** `cd apps/api && node dist/index.js`
- **Health Check:** `/health` endpoint
- **Restart Policy:** On failure (max 10 retries)
- **Region:** Auto-assigned (Europe West)

---

## 2. Smart Contract Deployment (Monad Testnet)

**Contract:** `PaymentPool.sol`  
**Address:** [`0xfa929adb2eb7839edac52193fe39b11313b9b2fa`](https://testnet.monadexplorer.com/address/0xfa929adb2eb7839edac52193fe39b11313b9b2fa)  
**Chain:** Monad Testnet (Chain ID: 10143)  
**RPC:** `https://testnet-rpc.monad.xyz`

### Contract Features
- `deposit()` / `depositFor(address)` — deposit MON into the pool
- `transfer(from, to, amount, refId)` — relayer-only internal balance transfer
- `batchTransfer(...)` — batch multiple transfers in one tx
- `withdraw(from, to, amount)` — relayer-only MON withdrawal
- `balanceOf(user)` — check balance
- Reentrancy protection on withdrawals
- Event emission for all operations

### Verified On-Chain Activity

| Action | Explorer Link |
|--------|--------------|
| Contract Deployment | [View on Monad Explorer](https://testnet.monadexplorer.com/address/0xfa929adb2eb7839edac52193fe39b11313b9b2fa) |
| Pool Deposit (5 MON) | Visible in contract's transaction history |
| P2P Transfer (0.1 MON) | Executed via relayer through `transfer()` |

---

## 3. Relayer Wallet

**Address:** [`0x46AB561868e2c0a1bd6b8CFCD29304284c292c04`](https://testnet.monadexplorer.com/address/0x46AB561868e2c0a1bd6b8CFCD29304284c292c04)  
**Role:** Sponsors all gas fees for user transactions  
**Derivation:** HD Mnemonic index 0 (`m/44'/60'/0'/0/0`)

---

## 4. Cloud Infrastructure

| Service | Provider | Evidence |
|---------|----------|----------|
| **API Server** | Railway | Live at `chatpayapi-production.up.railway.app` |
| **Database** | Neon PostgreSQL | Cloud-hosted, connection via pooler |
| **Cache/Queue** | Upstash Redis | TLS-encrypted, BullMQ job queues |
| **WhatsApp** | Twilio Sandbox | Webhook → Railway URL |
| **Blockchain** | Monad Testnet | Contract deployed, transactions confirmed |

---

## 5. WhatsApp Bot (Live)

The WhatsApp bot is connected to the Railway deployment and responds 24/7.

### How to Test (Live)

1. Send **"join experiment-silver"** to **+1 (415) 523-8886** on WhatsApp
2. Send **"hey"** — bot will welcome you and create a wallet
3. Send **"balance"** — shows your pool + native balance
4. Send **"help"** — shows all available commands

### Supported Commands (Natural Language)

```
"hey" / "hello"              → Welcome + onboarding
"send 2 MON to +91..."      → P2P payment (asks for PIN)
"balance" / "how much?"      → Pool + wallet balance
"history" / "my transactions"→ Recent tx list with explorer links
"set pin 1234"               → Set/update payment PIN
"add priya +91..."           → Save contact
"deposit"                    → Get deposit address
"withdraw 1 to 0xabc..."    → Withdraw from pool
"help"                       → Command reference
```

---

## 6. Architecture Verification

```
WhatsApp User
     │
     ▼  (Twilio Webhook)
┌────────────────────────────────────────────┐
│  Railway: chatpayapi-production.up.railway │
│                                            │
│  Fastify API Server (Node.js 20)           │
│  ├── NL Parser (intent extraction)         │
│  ├── Command Router                        │
│  ├── BullMQ Workers (tx processing)        │
│  ├── Prisma ORM → Neon PostgreSQL          │
│  ├── ioredis → Upstash Redis               │
│  └── viem → Monad Testnet RPC              │
│         │                                  │
│         ▼                                  │
│  PaymentPool Contract                      │
│  0xfa929adb...b9b2fa                       │
└────────────────────────────────────────────┘
```

---

## 7. Transaction Flow (Verified)

A complete payment flow was tested and confirmed on-chain:

1. **User sends:** *"send 0.1 MON to +91XXXXXXXXXX"*
2. **Bot responds:** Asks for PIN confirmation
3. **User sends:** PIN
4. **Bot responds:** "⏳ Payment submitted..." with Monad explorer link
5. **txSubmitWorker:** Calls `PaymentPool.transfer()` via relayer
6. **txConfirmWorker:** Confirms on-chain receipt
7. **Bot responds:** "✅ Sent 0.1 MON!" with explorer link

All transaction confirmations include clickable links to `https://testnet.monadexplorer.com/tx/{hash}`.

---

## 8. Security in Production

| Measure | Status |
|---------|--------|
| Wallet private keys encrypted (AES-256-GCM) | ✅ Active |
| Phone numbers hashed (SHA-256) | ✅ Active |
| PINs bcrypt-hashed | ✅ Active |
| Rate limiting (10 req/min, 50 MON daily cap) | ✅ Active |
| Twilio webhook signature verification | ✅ Active |
| Environment variables in Railway (not in code) | ✅ Verified |
| `.gitignore` excludes `.env`, secrets, `RAILWAY_SETUP.md` | ✅ Verified |

---

*Last verified: February 22, 2026*
