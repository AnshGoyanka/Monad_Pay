<p align="center">
  <img src="https://img.shields.io/badge/Monad-Testnet-8B5CF6?style=for-the-badge&logo=ethereum&logoColor=white" />
  <img src="https://img.shields.io/badge/WhatsApp-Bot-25D366?style=for-the-badge&logo=whatsapp&logoColor=white" />
  <img src="https://img.shields.io/badge/Gasless-Payments-F59E0B?style=for-the-badge" />
  <img src="https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white" />
</p>

# ⚡ Monad Pay — Conversational Gasless Crypto Payments on Monad

**Monad Pay** turns WhatsApp into a crypto wallet. Send money to anyone using natural language — no gas fees, no seed phrases, no app downloads. Just chat.

> *"send 2 MON to +91 82379 87667"* — that's it. Payment done.

---

## 🎯 Problem

Crypto payments are hard. You need wallets, gas tokens, addresses, confirmations — it's a terrible UX for everyday users. Billions of people already use WhatsApp daily but have zero access to crypto.

## 💡 Solution

Monad Pay is a **gasless, conversational payment system** built on [Monad](https://monad.xyz). Users interact through WhatsApp with natural language — the system handles wallet creation, gas sponsorship, and on-chain settlement behind the scenes.

**Zero friction:**
- No app download → WhatsApp is pre-installed
- No gas fees → Relayer pays all tx costs
- No seed phrases → HD wallets auto-created & encrypted
- No crypto jargon → Natural language commands

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 💬 **Natural Language** | Understands casual speech — *"send 5 to priya"*, *"how much do I have?"*, *"zap 0.1 MON to +91..."* |
| ⛽ **Gasless Transactions** | Users never pay gas. A relayer wallet sponsors all on-chain operations via a PaymentPool smart contract. |
| 🔐 **End-to-End Encryption** | All wallet keys encrypted with AES-256-GCM. Phone numbers hashed with SHA-256. PINs bcrypt-hashed. |
| 👛 **Auto Wallet Creation** | HD wallets derived deterministically. New users get a wallet on first message — no setup required. |
| 📇 **Contacts** | Save contacts by name — *"add priya +91..."* then *"send 1 to priya"* |
| 📊 **Transaction History** | View recent transactions with Monad explorer links |
| 🔒 **PIN Protection** | 4-6 digit PIN required for all outgoing payments |
| 🚀 **Sub-second Finality** | Powered by Monad's 10,000+ TPS with 1-second block times |

---

## 🏗️ Architecture

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   WhatsApp   │────▶│   Fastify API    │────▶│  Monad Testnet  │
│   (Twilio)   │◀────│                  │◀────│                 │
└─────────────┘     │  ┌────────────┐  │     │  PaymentPool.sol│
                    │  │ NL Parser  │  │     └─────────────────┘
                    │  └────────────┘  │
                    │  ┌────────────┐  │     ┌─────────────────┐
                    │  │  BullMQ    │  │────▶│  PostgreSQL      │
                    │  │  Workers   │  │     │  (Neon Cloud)    │
                    │  └────────────┘  │     └─────────────────┘
                    │  ┌────────────┐  │     ┌─────────────────┐
                    │  │  Relayer   │  │────▶│  Redis           │
                    │  │  Service   │  │     │  (Upstash)       │
                    │  └────────────┘  │     └─────────────────┘
                    └──────────────────┘
```

### How a Payment Works

1. User sends *"send 2 MON to +91 82379 87667"* on WhatsApp
2. **NL Parser** extracts intent, amount, recipient
3. User is prompted for their **PIN**
4. Transaction is queued via **BullMQ**
5. **txSubmitWorker** calls `PaymentPool.transfer()` through the relayer
6. **txConfirmWorker** waits for on-chain confirmation
7. User receives confirmation with a **Monad explorer link**

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Runtime** | Node.js 20+, TypeScript, ESM |
| **API Framework** | Fastify v5 |
| **Monorepo** | Turborepo + npm workspaces |
| **Blockchain** | Monad Testnet (EVM), viem v2 |
| **Smart Contract** | Solidity 0.8.24 (PaymentPool) |
| **Database** | PostgreSQL (Neon) + Prisma ORM |
| **Queue** | BullMQ + Redis (Upstash) |
| **Messaging** | Twilio WhatsApp API |
| **Encryption** | AES-256-GCM, SHA-256, bcrypt |
| **Wallet** | HD derivation (BIP-32/39/44) |
| **Deployment** | Railway |

---

## 📁 Project Structure

```
monad-pay/
├── apps/api/                    # Main API server
│   ├── prisma/schema.prisma     # Database schema
│   ├── scripts/                 # Deployment & utility scripts
│   └── src/
│       ├── index.ts             # Fastify app entry point
│       ├── abi/                 # Contract ABIs
│       ├── commands/            # Command handlers (send, balance, etc.)
│       ├── config/              # Env, DB, Redis, Logger config
│       ├── middleware/          # Webhook authentication
│       ├── parser/              # Natural language message parser
│       ├── queue/               # BullMQ producers & workers
│       ├── security/            # Encryption & PIN auth
│       ├── services/            # Core business logic
│       └── webhooks/            # WhatsApp & Telegram routes
├── contracts/                   # Solidity smart contracts
│   ├── src/PaymentPool.sol      # Gasless payment pool contract
│   ├── script/Deploy.s.sol      # Foundry deploy script
│   └── test/PaymentPool.t.sol   # Contract tests
├── packages/shared/             # Shared types & constants
├── railway.json                 # Railway deployment config
├── docker-compose.yml           # Local dev (Postgres + Redis)
└── turbo.json                   # Turborepo pipeline config
```

---

## 🚀 Getting Started

### Prerequisites

- Node.js ≥ 20
- npm ≥ 10
- PostgreSQL 16 + Redis 7 (or use cloud: Neon + Upstash)

### 1. Clone & Install

```bash
git clone https://github.com/AnshGoyanka/Monad_Pay_.git
cd Monad_Pay_
npm install
```

### 2. Environment Variables

```bash
cp apps/api/.env.example apps/api/.env
```

Fill in the required values:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string (TLS supported) |
| `MASTER_ENCRYPTION_KEY` | 64 hex chars (32 bytes) for AES-256 |
| `PHONE_HASH_SALT` | 16+ char salt for phone hashing |
| `MONAD_RPC_URL` | Monad testnet RPC (`https://testnet-rpc.monad.xyz`) |
| `PAYMENT_POOL_ADDRESS` | Deployed PaymentPool contract address |
| `HD_MNEMONIC` | 12 or 24 word mnemonic for HD wallet derivation |
| `TWILIO_ACCOUNT_SID` | Twilio account SID |
| `TWILIO_AUTH_TOKEN` | Twilio auth token |
| `TWILIO_WHATSAPP_NUMBER` | `whatsapp:+14155238886` (sandbox) |

### 3. Database Setup

```bash
# Push schema to database
npm run db:push

# Generate Prisma client
npm run db:generate
```

### 4. Start Development

```bash
# Option A: Local Docker (Postgres + Redis)
docker-compose up -d
npm run dev

# Option B: Cloud DBs (Neon + Upstash) — just start the API
cd apps/api && npx tsx src/index.ts
```

### 5. Expose Webhook (Development)

```bash
ngrok http 3000
```

Set the ngrok URL as your Twilio WhatsApp sandbox webhook:
```
https://<your-id>.ngrok-free.dev/webhooks/whatsapp  (POST)
```

---

## 📜 Smart Contract

The **PaymentPool** contract (`contracts/src/PaymentPool.sol`) enables gasless payments:

```solidity
// Users deposit MON into the pool
function deposit() external payable;
function depositFor(address user) external payable;

// Relayer executes transfers between pool balances (no gas for users)
function transfer(address from, address to, uint256 amount, bytes32 refId) external onlyRelayer;

// Relayer withdraws real MON on behalf of users
function withdraw(address from, address to, uint256 amount) external onlyRelayer;
```

**Deployed on Monad Testnet:** [`0xfa929adb2eb7839edac52193fe39b11313b9b2fa`](https://testnet.monadexplorer.com/address/0xfa929adb2eb7839edac52193fe39b11313b9b2fa)

### Deploy Your Own

```bash
cd apps/api
npx tsx scripts/deploy.ts
```

---

## 💬 WhatsApp Commands

All commands work with **natural language** — no strict syntax required.

| Say something like... | What happens |
|----------------------|-------------|
| *"hey"* / *"hello"* | Welcome message + available commands |
| *"send 2 MON to +91..."* | Initiate a payment (will ask for PIN) |
| *"balance"* / *"how much do I have?"* | Check pool + wallet balance |
| *"history"* / *"show my transactions"* | View recent transactions |
| *"set pin 1234"* | Set or update your payment PIN |
| *"add priya +91..."* | Save a contact |
| *"deposit"* | Get deposit address & instructions |
| *"withdraw 1 to 0xabc..."* | Withdraw MON from pool to external address |
| *"help"* | Show all available commands |

---

## 🔒 Security Model

| Aspect | Implementation |
|--------|---------------|
| **Wallet Keys** | AES-256-GCM encrypted, unique IV per record, master key in env only |
| **Phone Numbers** | SHA-256 hashed for lookups, never stored in plaintext |
| **PIN Auth** | bcrypt-hashed, 3 attempts before 15-min lockout |
| **Rate Limiting** | 10 req/min per user, 50 MON daily volume cap |
| **Webhook Auth** | Twilio signature verification |
| **Memory Safety** | Plaintext buffers zeroed after encryption |

---

## ☁️ Live Deployment

> **Monad Pay is deployed and running 24/7 on Railway.**

| | |
|---|---|
| **Live URL** | `https://chatpayapi-production.up.railway.app` |
| **Health Check** | [`/health`](https://chatpayapi-production.up.railway.app/health) — returns `{"status":"ok"}` |
| **Platform** | [Railway](https://railway.app) (Nixpacks builder) |
| **Region** | Europe West (auto-scaled) |
| **CDN** | Fastly edge network |
| **WhatsApp Webhook** | `https://chatpayapi-production.up.railway.app/webhooks/whatsapp` |

### Deployment Proof

The API server is live and verified. See [`docs/DEPLOYMENT_PROOF.md`](docs/DEPLOYMENT_PROOF.md) for full evidence including:
- Health check response with Railway edge headers
- On-chain transaction hashes on Monad explorer
- Smart contract deployment address
- Live WhatsApp bot interaction proof

### Self-Deploy

To deploy your own instance:

1. Connect your GitHub repo on [railway.app](https://railway.app)
2. Add environment variables (see `RAILWAY_SETUP.md` locally for full list)
3. Railway auto-builds and deploys using `railway.json`
4. Update Twilio webhook to your Railway URL

---

## 🧪 Testing a Payment

1. **Join Twilio Sandbox**: Send *"join experiment-silver"* to `+1 (415) 523-8886` on WhatsApp
2. **Say "hey"**: Bot creates your wallet and asks you to set a PIN
3. **Set PIN**: *"set pin 1234"*
4. **Deposit MON**: Send testnet MON to your wallet address (shown via *"deposit"*)
5. **Send Payment**: *"send 0.1 MON to +91..."*
6. **Confirm**: Enter your PIN when prompted
7. **Done**: Receive confirmation with Monad explorer link ✅

---

<p align="center">
  Built for the <strong>Monad Blitz Hackathon</strong> 🟣⚡
</p>
