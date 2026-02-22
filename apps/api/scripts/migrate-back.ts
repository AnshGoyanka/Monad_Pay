/**
 * Transfer 4.8 MON BACK from idx-3 wallet to idx-1 wallet,
 * now that Railway's PHONE_HASH_SALT matches local and finds idx-1.
 */
import { createPublicClient, createWalletClient, http, formatEther, keccak256, toHex, type Hex, defineChain } from "viem";
import { mnemonicToSeedSync } from "@scure/bip39";
import { HDKey, privateKeyToAccount } from "viem/accounts";

const monadTestnet = defineChain({
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: ["https://testnet-rpc.monad.xyz"] } },
});

const mnemonic = "inmate error dry there oblige leg human similar prize wonder behind game";
const seed = mnemonicToSeedSync(mnemonic);
const hdKey = HDKey.fromMasterSeed(seed);
const relayerKey = `0x${Buffer.from(hdKey.derive("m/44'/60'/0'/0/0").privateKey!).toString("hex")}` as Hex;
const relayerAccount = privateKeyToAccount(relayerKey);

console.log("Relayer:", relayerAccount.address);

const publicClient = createPublicClient({ chain: monadTestnet, transport: http() });
const walletClient = createWalletClient({ account: relayerAccount, chain: monadTestnet, transport: http() });

const poolAddress = "0xfa929adb2eb7839edac52193fe39b11313b9b2fa" as Hex;

const POOL_ABI = [
  { inputs: [{ name: "from", type: "address" }, { name: "to", type: "address" }, { name: "amount", type: "uint256" }, { name: "refId", type: "bytes32" }], name: "transfer", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ name: "user", type: "address" }], name: "balanceOf", outputs: [{ name: "", type: "uint256" }], stateMutability: "view", type: "function" },
] as const;

// REVERSE direction: from idx-3 back to idx-1
const FROM = "0x0430EE2B6EB9c239edC8f4e38EFc767759D12A9b" as Hex;  // idx 3 (Railway duplicate)
const TO   = "0xdC97A0631c100D514A2b45a7d2252570c6eFdf22" as Hex;  // idx 1 (original user)

const fromBal = await publicClient.readContract({ address: poolAddress, abi: POOL_ABI, functionName: "balanceOf", args: [FROM] });
const toBal = await publicClient.readContract({ address: poolAddress, abi: POOL_ABI, functionName: "balanceOf", args: [TO] });

console.log(`\nBEFORE:`);
console.log(`  idx3 (${FROM}): ${formatEther(fromBal)} MON`);
console.log(`  idx1 (${TO}): ${formatEther(toBal)} MON`);

const amount = fromBal;
const refId = keccak256(toHex("migrate-back-to-original"));

console.log(`\nTransferring ${formatEther(amount)} MON back to original wallet...`);

const txHash = await walletClient.writeContract({
  address: poolAddress,
  abi: POOL_ABI,
  functionName: "transfer",
  args: [FROM, TO, amount, refId],
});

console.log(`Tx hash: ${txHash}`);
const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
console.log(`Status: ${receipt.status}`);

const fromBal2 = await publicClient.readContract({ address: poolAddress, abi: POOL_ABI, functionName: "balanceOf", args: [FROM] });
const toBal2 = await publicClient.readContract({ address: poolAddress, abi: POOL_ABI, functionName: "balanceOf", args: [TO] });

console.log(`\nAFTER:`);
console.log(`  idx3 (${FROM}): ${formatEther(fromBal2)} MON`);
console.log(`  idx1 (${TO}): ${formatEther(toBal2)} MON`);
console.log(`\n✅ Done!`);
