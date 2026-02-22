import { PrismaClient } from "@prisma/client";
import { createPublicClient, http, formatEther, parseAbi } from "viem";
import "dotenv/config";
import { decrypt } from "../src/security/encryption.js";

const prisma = new PrismaClient();

const POOL_ABI = parseAbi(["function balanceOf(address) view returns (uint256)"]);
const client = createPublicClient({ transport: http("https://testnet-rpc.monad.xyz") });
const poolAddr = process.env.PAYMENT_POOL_ADDRESS! as `0x${string}`;

// Get ALL users with phoneLast4 = 7667
const users = await prisma.user.findMany({
  where: { phoneLast4: "7667" },
  include: { wallet: { select: { addressEnc: true, addressIv: true, derivationIdx: true } } },
  orderBy: { createdAt: "asc" },
});

console.log(`Found ${users.length} users with phone ending 7667:\n`);

for (const u of users) {
  if (!u.wallet) {
    console.log(`User ${u.id}: NO WALLET`);
    continue;
  }

  const address = decrypt(Buffer.from(u.wallet.addressEnc), Buffer.from(u.wallet.addressIv));
  
  const poolBal = await client.readContract({
    address: poolAddr,
    abi: POOL_ABI,
    functionName: "balanceOf",
    args: [address as `0x${string}`],
  });
  
  const nativeBal = await client.getBalance({ address: address as `0x${string}` });

  console.log(`User: ${u.id}`);
  console.log(`  phoneHash: ${u.phoneHash.substring(0, 20)}...`);
  console.log(`  created: ${u.createdAt}`);
  console.log(`  wallet idx: ${u.wallet.derivationIdx}`);
  console.log(`  address: ${address}`);
  console.log(`  pool balance: ${formatEther(poolBal)} MON`);
  console.log(`  native balance: ${formatEther(nativeBal)} MON`);
  console.log();
}

await prisma.$disconnect();
