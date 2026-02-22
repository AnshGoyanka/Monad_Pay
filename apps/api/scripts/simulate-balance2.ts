/**
 * Full end-to-end simulation of what Railway does for "balance" command.
 * Uses the EXACT same code paths the app uses.
 */
import { PrismaClient } from "@prisma/client";
import crypto from "node:crypto";
import { createPublicClient, http, formatEther, parseAbi } from "viem";

const prisma = new PrismaClient();
const MASTER_KEY = "a54a9e3eb1b59b6962018498a8206f8d30bd254c96a245f404e15f1dfc821822";
const SALT = "b321958528b2cf95ff795643113f70aa";

// Step 1: Hash phone using EXACT same logic as encryption.ts hashPhone()
const phone = "+918237987667";
const salted = `${SALT}:${phone}`;
const phoneHash = crypto.createHash("sha256").update(salted).digest("hex");
console.log("1. Phone hash:", phoneHash.slice(0, 20) + "...");

// Step 2: Look up user
const user = await prisma.user.findUnique({ where: { phoneHash } });
if (!user) {
  console.log("❌ USER NOT FOUND! Railway will create a new user.");
  // List all existing users for comparison
  const all = await prisma.user.findMany({ select: { phoneHash: true, phoneLast4: true } });
  console.log("Existing users:");
  for (const u of all) console.log(`  hash=${u.phoneHash.slice(0, 20)}... last4=${u.phoneLast4}`);
  await prisma.$disconnect();
  process.exit(1);
}
console.log("2. ✅ Found user:", user.id);

// Step 3: Check wallet exists
const wallet = await prisma.wallet.findUnique({
  where: { userId: user.id },
  select: { addressEnc: true, addressIv: true },
});
if (!wallet) {
  console.log("❌ NO WALLET!");
  await prisma.$disconnect();
  process.exit(1);
}
console.log("3. ✅ Wallet found");

// Step 4: Decrypt wallet address using EXACT same logic as encryption.ts decrypt()
const key = Buffer.from(MASTER_KEY, "hex");
const ciphertext = Buffer.from(wallet.addressEnc);
const iv = Buffer.from(wallet.addressIv);
const authTagLength = 16;

const encryptedData = ciphertext.subarray(0, ciphertext.length - authTagLength);
const authTag = ciphertext.subarray(ciphertext.length - authTagLength);

const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv, { authTagLength });
decipher.setAuthTag(authTag);
const decrypted = Buffer.concat([decipher.update(encryptedData), decipher.final()]);
const address = decrypted.toString("utf8") as `0x${string}`;
console.log("4. ✅ Decrypted address:", address);

// Step 5: Get pool balance
const client = createPublicClient({ transport: http("https://testnet-rpc.monad.xyz") });
const abi = parseAbi(["function balanceOf(address) view returns (uint256)"]);
const pool = "0xfa929adb2eb7839edac52193fe39b11313b9b2fa" as `0x${string}`;

const bal = await client.readContract({ address: pool, abi, functionName: "balanceOf", args: [address] });
const poolBalance = formatEther(bal);
console.log("5. ✅ Pool balance:", poolBalance, "MON");

const native = await client.getBalance({ address });
const nativeBalance = formatEther(native);
console.log("6. ✅ Native balance:", nativeBalance, "MON");

// Step 6: Simulate the exact response message
const poolVal = parseFloat(poolBalance);
const nativeVal = parseFloat(nativeBalance);
const lines = ["💰 *Your Balance*\n"];
lines.push(`Pool (sendable): *${poolVal > 0 ? poolBalance : "0"} MON*`);
lines.push(`Wallet (on-chain): *${nativeVal > 0 ? parseFloat(nativeBalance).toFixed(4) : "0"} MON*`);
console.log("\n--- RESPONSE MESSAGE ---");
console.log(lines.join("\n"));

await prisma.$disconnect();
