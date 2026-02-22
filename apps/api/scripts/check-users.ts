import { PrismaClient } from "@prisma/client";
import "dotenv/config";

const prisma = new PrismaClient();

const users = await prisma.user.findMany({
  include: { wallet: { select: { addressEnc: true, derivationIdx: true } } },
  orderBy: { createdAt: "asc" },
});

console.log(`Total users: ${users.length}\n`);

for (const u of users) {
  console.log(`User: ${u.id}`);
  console.log(`  phoneLast4: ${u.phoneLast4}`);
  console.log(`  phoneHash: ${u.phoneHash.substring(0, 20)}...`);
  console.log(`  platform: ${u.platform}`);
  console.log(`  created: ${u.createdAt}`);
  console.log(`  wallet idx: ${u.wallet?.derivationIdx}`);
  console.log(`  has wallet: ${!!u.wallet}`);
  console.log();
}

await prisma.$disconnect();
