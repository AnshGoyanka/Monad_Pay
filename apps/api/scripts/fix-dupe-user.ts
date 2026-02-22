import { PrismaClient } from "@prisma/client";
import "dotenv/config";

const prisma = new PrismaClient();

// Delete the duplicate user created by Railway with wrong PHONE_HASH_SALT
const dupeId = "b5a7c99a-75bd-43fd-888e-4add907006ed";

// Delete wallet first (foreign key)
const walletDel = await prisma.wallet.deleteMany({ where: { userId: dupeId } });
console.log("Deleted wallets:", walletDel.count);

// Delete any transactions
const txDel = await prisma.transaction.deleteMany({
  where: { OR: [{ senderId: dupeId }, { recipientId: dupeId }] },
});
console.log("Deleted transactions:", txDel.count);

// Delete contacts
const contactDel = await prisma.contact.deleteMany({ where: { ownerId: dupeId } });
console.log("Deleted contacts:", contactDel.count);

// Delete audit logs
const auditDel = await prisma.auditLog.deleteMany({ where: { userId: dupeId } });
console.log("Deleted audit logs:", auditDel.count);

// Delete user
const userDel = await prisma.user.delete({ where: { id: dupeId } });
console.log("Deleted user:", userDel.id, "phoneLast4:", userDel.phoneLast4);

// Verify
const remaining = await prisma.user.findMany({
  where: { phoneLast4: "7667" },
  select: { id: true, phoneLast4: true, phoneHash: true },
});
console.log("\nRemaining users with 7667:", remaining.length);
for (const u of remaining) {
  console.log(`  ${u.id} hash=${u.phoneHash.substring(0, 20)}...`);
}

await prisma.$disconnect();
