/**
 * Deploy PaymentPool contract to Monad Testnet using viem + solc.
 *
 * Usage:  npx tsx scripts/deploy.ts
 */

import { createPublicClient, createWalletClient, http, defineChain, type Hex } from "viem";
import { privateKeyToAccount, HDKey } from "viem/accounts";
import { mnemonicToSeedSync } from "@scure/bip39";
import * as fs from "node:fs";
import * as path from "node:path";
import "dotenv/config";

// ──────────────────────── Solidity Compiler ──────────────────────

// @ts-ignore – solc has no types
import solc from "solc";

function compileSolidity(): { abi: any[]; bytecode: Hex } {
  const contractPath = path.resolve(
    import.meta.dirname,
    "..",
    "..",
    "..",
    "contracts",
    "src",
    "PaymentPool.sol"
  );
  const source = fs.readFileSync(contractPath, "utf-8");

  const input = {
    language: "Solidity",
    sources: {
      "PaymentPool.sol": { content: source },
    },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: {
        "*": {
          "*": ["abi", "evm.bytecode.object"],
        },
      },
    },
  };

  const output = JSON.parse(solc.compile(JSON.stringify(input)));

  if (output.errors) {
    const fatal = output.errors.filter((e: any) => e.severity === "error");
    if (fatal.length > 0) {
      console.error("Compilation errors:");
      fatal.forEach((e: any) => console.error(e.formattedMessage));
      process.exit(1);
    }
    // Print warnings
    output.errors
      .filter((e: any) => e.severity === "warning")
      .forEach((e: any) => console.warn(e.formattedMessage));
  }

  const contract = output.contracts["PaymentPool.sol"]["PaymentPool"];
  const abi = contract.abi;
  const bytecode = `0x${contract.evm.bytecode.object}` as Hex;

  return { abi, bytecode };
}

// ──────────────────────── Chain & Wallet ─────────────────────────

const monadTestnet = defineChain({
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
  rpcUrls: {
    default: { http: [process.env.MONAD_RPC_URL || "https://testnet-rpc.monad.xyz"] },
  },
  testnet: true,
});

function getRelayerAccount() {
  const mnemonic = process.env.HD_MNEMONIC;
  if (!mnemonic) {
    console.error("HD_MNEMONIC not set in .env");
    process.exit(1);
  }

  const seed = mnemonicToSeedSync(mnemonic);
  const hdKey = HDKey.fromMasterSeed(seed);
  const derived = hdKey.derive("m/44'/60'/0'/0/0");

  if (!derived.privateKey) {
    console.error("Failed to derive private key");
    process.exit(1);
  }

  const privateKey = `0x${Buffer.from(derived.privateKey).toString("hex")}` as Hex;
  return privateKeyToAccount(privateKey);
}

// ──────────────────────── Deploy ─────────────────────────────────

async function main() {
  console.log("📦 Compiling PaymentPool.sol...");
  const { abi, bytecode } = compileSolidity();
  console.log(`✅ Compiled — ABI has ${abi.length} entries, bytecode ${bytecode.length} chars\n`);

  const account = getRelayerAccount();
  console.log(`🔑 Deployer (relayer): ${account.address}`);

  const rpcUrl = process.env.MONAD_RPC_URL || "https://testnet-rpc.monad.xyz";

  const publicClient = createPublicClient({
    chain: monadTestnet,
    transport: http(rpcUrl, { timeout: 60_000 }),
  });

  const walletClient = createWalletClient({
    account,
    chain: monadTestnet,
    transport: http(rpcUrl, { timeout: 60_000 }),
  });

  // Check balance
  const balance = await publicClient.getBalance({ address: account.address });
  console.log(`💰 Balance: ${Number(balance) / 1e18} MON\n`);

  if (balance === 0n) {
    console.error("❌ No MON in relayer wallet. Get testnet MON first.");
    process.exit(1);
  }

  // Encode constructor args: constructor(address _relayer)
  // The relayer is the deployer itself
  const { encodeAbiParameters, parseAbiParameters } = await import("viem");
  const constructorArgs = encodeAbiParameters(
    parseAbiParameters("address"),
    [account.address]
  );

  const deployData = (bytecode + constructorArgs.slice(2)) as Hex;

  console.log("🚀 Deploying PaymentPool...");

  const txHash = await walletClient.sendTransaction({
    account,
    chain: monadTestnet,
    data: deployData,
    // No `to` = contract creation
  });

  console.log(`📨 Tx sent: ${txHash}`);
  console.log("⏳ Waiting for confirmation...\n");

  const receipt = await publicClient.waitForTransactionReceipt({
    hash: txHash,
    timeout: 120_000,
  });

  if (receipt.status === "reverted") {
    console.error("❌ Deployment reverted!");
    process.exit(1);
  }

  const contractAddress = receipt.contractAddress;
  console.log("═══════════════════════════════════════════════");
  console.log(`✅ PaymentPool deployed!`);
  console.log(`📍 Address: ${contractAddress}`);
  console.log(`🔗 Tx hash: ${txHash}`);
  console.log(`⛽ Gas used: ${receipt.gasUsed}`);
  console.log("═══════════════════════════════════════════════");
  console.log(`\nUpdate your .env:\n  PAYMENT_POOL_ADDRESS=${contractAddress}\n`);

  // Save ABI for reference
  const abiPath = path.resolve(import.meta.dirname, "..", "src", "abi", "PaymentPool.json");
  fs.mkdirSync(path.dirname(abiPath), { recursive: true });
  fs.writeFileSync(abiPath, JSON.stringify(abi, null, 2));
  console.log(`📄 ABI saved to ${abiPath}`);
}

main().catch((err) => {
  console.error("Deploy failed:", err);
  process.exit(1);
});
