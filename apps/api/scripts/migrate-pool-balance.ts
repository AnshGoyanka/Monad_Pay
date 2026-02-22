/**
 * Transfer pool balance from old wallet to new Railway-created wallet.
 */
import { createPublicClient, createWalletClient, http, formatEther, parseEther, keccak256, toHex, encodeFunctionData, type Hex, defineChain } from "viem";
import { mnemonicToSeedSync } from "@scure/bip39";
import { HDKey } from "viem/accounts";
import { privateKeyToAccount } from "viem/accounts";
import "dotenv/config";

const monadTestnet = defineChain({
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: ["https://testnet-rpc.monad.xyz"] } },
});

// Derive relayer from mnemonic (index 0)
const seed = mnemonicToSeedSync(process.env.HD_MNEMONIC!);
const hdKey = HDKey.fromMasterSeed(seed);
const relayerKey = `0x${Buffer.from(hdKey.derive("m/44'/60'/0'/0/0").privateKey!).toString("hex")}` as Hex;
const relayerAccount = privateKeyToAccount(relayerKey);

console.log("Relayer:", relayerAccount.address);

const publicClient = createPublicClient({ chain: monadTestnet, transport: http() });
const walletClient = createWalletClient({ account: relayerAccount, chain: monadTestnet, transport: http() });

const poolAddress = process.env.PAYMENT_POOL_ADDRESS! as Hex;

const POOL_ABI = [
  { inputs: [{ name: "from", type: "address" }, { name: "to", type: "address" }, { name: "amount", type: "uint256" }, { name: "refId", type: "bytes32" }], name: "transfer", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ name: "user", type: "address" }], name: "balanceOf", outputs: [{ name: "", type: "uint256" }], stateMutability: "view", type: "function" },
] as const;

const FROM = "0xdC97A0631c100D514A2b45a7d2252570c6eFdf22" as Hex;  // old wallet (idx 1) - has 4.8 MON
const TO = "0x0430EE2B6EB9c239edC8f4e38EFc767759D12A9b" as Hex;    // new Railway wallet (idx 3)

// Check balances before
const fromBal = await publicClient.readContract({ address: poolAddress, abi: POOL_ABI, functionName: "balanceOf", args: [FROM] });
const toBal = await publicClient.readContract({ address: poolAddress, abi: POOL_ABI, functionName: "balanceOf", args: [TO] });

console.log(`\nBEFORE:`);
console.log(`  Old wallet (${FROM}): ${formatEther(fromBal)} MON`);
console.log(`  New wallet (${TO}): ${formatEther(toBal)} MON`);

// Transfer ALL from old to new
const amount = fromBal; // transfer everything
const refId = keccak256(toHex("migrate-to-railway-wallet"));

console.log(`\nTransferring ${formatEther(amount)} MON...`);

const txHash = await walletClient.writeContract({
  address: poolAddress,
  abi: POOL_ABI,
  functionName: "transfer",
  args: [FROM, TO, amount, refId],
});

console.log(`Tx hash: ${txHash}`);
console.log("Waiting for confirmation...");

const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
console.log(`Status: ${receipt.status}`);

// Check balances after
const fromBal2 = await publicClient.readContract({ address: poolAddress, abi: POOL_ABI, functionName: "balanceOf", args: [FROM] });
const toBal2 = await publicClient.readContract({ address: poolAddress, abi: POOL_ABI, functionName: "balanceOf", args: [TO] });

console.log(`\nAFTER:`);
console.log(`  Old wallet (${FROM}): ${formatEther(fromBal2)} MON`);
console.log(`  New wallet (${TO}): ${formatEther(toBal2)} MON`);

console.log(`\n✅ Done! Explorer: https://testnet.monadexplorer.com/tx/${txHash}`);
