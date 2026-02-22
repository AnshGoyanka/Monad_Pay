import { PrismaClient } from "@prisma/client";
import { createPublicClient, http, formatEther, parseAbi } from "viem";
import { mnemonicToSeedSync } from "@scure/bip39";
import { HDKey, privateKeyToAccount } from "viem/accounts";

const prisma = new PrismaClient();
const client = createPublicClient({ transport: http("https://testnet-rpc.monad.xyz") });
const abi = parseAbi(["function balanceOf(address) view returns (uint256)"]);
const pool = "0xfa929adb2eb7839edac52193fe39b11313b9b2fa" as `0x${string}`;
const mnemonic = "inmate error dry there oblige leg human similar prize wonder behind game";

const seed = mnemonicToSeedSync(mnemonic);
const hdKey = HDKey.fromMasterSeed(seed);

const users = await prisma.user.findMany({
  include: { wallet: true },
  orderBy: { createdAt: "asc" },
});

console.log(`Total users: ${users.length}\n`);

for (const u of users) {
  console.log(`--- User ${u.id} ---`);
  console.log(`  phoneHash: ${u.phoneHash.slice(0, 20)}...`);
  console.log(`  phoneLast4: ${u.phoneLast4}`);
  console.log(`  created: ${u.createdAt.toISOString()}`);

  if (u.wallet) {
    const w = u.wallet;
    console.log(`  derivationIdx: ${w.derivationIdx}`);
    console.log(`  addressHash: ${w.addressHash.slice(0, 20)}...`);

    const derived = hdKey.derive(`m/44'/60'/0'/0/${w.derivationIdx}`);
    const privKey = `0x${Buffer.from(derived.privateKey!).toString("hex")}` as `0x${string}`;
    const acct = privateKeyToAccount(privKey);
    console.log(`  derived address: ${acct.address}`);

    const bal = await client.readContract({
      address: pool,
      abi,
      functionName: "balanceOf",
      args: [acct.address],
    });
    console.log(`  pool balance: ${formatEther(bal)} MON`);

    const native = await client.getBalance({ address: acct.address });
    console.log(`  native balance: ${formatEther(native)} MON`);
  } else {
    console.log(`  NO WALLET`);
  }
  console.log();
}

await prisma.$disconnect();
