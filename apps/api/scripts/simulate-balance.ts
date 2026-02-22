/**
 * Simulate exactly what Railway does when you send "balance"
 */
import { PrismaClient } from "@prisma/client";
import crypto from "node:crypto";
import { createPublicClient, http, formatEther, parseAbi } from "viem";

const prisma = new PrismaClient();
const MASTER_KEY = process.env.MASTER_ENCRYPTION_KEY || "a54a9e3eb1b59b6962018498a8206f8d30bd254c96a245f404e15f1dfc821822";
const SALT = process.env.PHONE_HASH_SALT || "b321958528b2cf95ff795643113f70aa";

// Step 1: Hash phone like Railway does
const phone = "+918237987667";
const phoneHash = crypto.createHmac("sha256", SALT).update(phone).digest("hex");
console.log("Phone hash computed:", phoneHash.slice(0, 20) + "...");

// Step 2: Look up user by phone hash
const user = await prisma.user.findUnique({ where: { phoneHash } });
if (!user) {
  console.log("❌ USER NOT FOUND with this hash!");
  console.log("This means PHONE_HASH_SALT on Railway doesn't match.");
  await prisma.$disconnect();
  process.exit(1);
}
console.log("✅ Found user:", user.id);

// Step 3: Get wallet
const wallet = await prisma.wallet.findUnique({
  where: { userId: user.id },
  select: { addressEnc: true, addressIv: true, derivationIdx: true },
});
if (!wallet) {
  console.log("❌ NO WALLET for this user!");
  await prisma.$disconnect();
  process.exit(1);
}
console.log("✅ Found wallet, derivationIdx:", wallet.derivationIdx);

// Step 4: Decrypt address like Railway does
try {
  const key = Buffer.from(MASTER_KEY, "hex");
  const ciphertext = Buffer.from(wallet.addressEnc);
  const iv = Buffer.from(wallet.addressIv);
  const authTagLength = 16;
  
  const encryptedData = ciphertext.subarray(0, ciphertext.length - authTagLength);
  const authTag = ciphertext.subarray(ciphertext.length - authTagLength);
  
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv, { authTagLength });
  decipher.setAuthTag(authTag);
  
  const decrypted = Buffer.concat([decipher.update(encryptedData), decipher.final()]);
  const address = decrypted.toString("utf8");
  console.log("✅ Decrypted address:", address);
  
  // Step 5: Check pool balance
  const client = createPublicClient({ transport: http("https://testnet-rpc.monad.xyz") });
  const abi = parseAbi(["function balanceOf(address) view returns (uint256)"]);
  const pool = "0xfa929adb2eb7839edac52193fe39b11313b9b2fa" as `0x${string}`;
  
  const bal = await client.readContract({ address: pool, abi, functionName: "balanceOf", args: [address as `0x${string}`] });
  console.log("✅ Pool balance:", formatEther(bal), "MON");
  
  const native = await client.getBalance({ address: address as `0x${string}` });
  console.log("✅ Native balance:", formatEther(native), "MON");
  
} catch (e: any) {
  console.log("❌ DECRYPTION FAILED:", e.message);
  console.log("This means MASTER_ENCRYPTION_KEY on Railway doesn't match.");
}

await prisma.$disconnect();
