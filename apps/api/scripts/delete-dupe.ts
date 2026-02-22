import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();
const dupeId = "eb962003-6302-44df-b46d-242c74891d36";

const wDel = await p.wallet.deleteMany({ where: { userId: dupeId } });
console.log("Deleted wallets:", wDel.count);

const tDel = await p.transaction.deleteMany({ where: { OR: [{ senderId: dupeId }, { recipientId: dupeId }] } });
console.log("Deleted txs:", tDel.count);

const cDel = await p.contact.deleteMany({ where: { OR: [{ ownerId: dupeId }, { contactUserId: dupeId }] } });
console.log("Deleted contacts:", cDel.count);

const aDel = await p.auditLog.deleteMany({ where: { userId: dupeId } });
console.log("Deleted audit logs:", aDel.count);

const uDel = await p.user.delete({ where: { id: dupeId } });
console.log("Deleted user:", uDel.id);

const remaining = await p.user.findMany({ where: { phoneLast4: "7667" } });
console.log("Remaining 7667 users:", remaining.length);
for (const u of remaining) console.log("  ", u.id, u.phoneHash.slice(0, 20));

await p.$disconnect();
