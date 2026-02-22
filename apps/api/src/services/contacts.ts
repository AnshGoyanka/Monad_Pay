import { prisma } from "../config/database.js";
import { hashPhone } from "../security/encryption.js";
import { logger } from "../config/logger.js";

// ──────────────────────── Create Contact ─────────────────────────

/**
 * Add a named contact for a user.
 */
export async function addContact(
  ownerId: string,
  contactName: string,
  contactPhone: string
): Promise<{ success: boolean; message: string }> {
  const phoneH = hashPhone(contactPhone);

  // Check if the contact phone corresponds to an existing user
  const contactUser = await prisma.user.findUnique({
    where: { phoneHash: phoneH },
    select: { id: true },
  });

  try {
    await prisma.contact.create({
      data: {
        ownerId,
        contactName: contactName.toLowerCase().trim(),
        contactUserId: contactUser?.id ?? null,
        phoneHash: phoneH,
      },
    });

    return { success: true, message: `Contact "${contactName}" saved.` };
  } catch (error: unknown) {
    // Handle unique constraint violation (duplicate contact name)
    if (
      error instanceof Error &&
      error.message.includes("Unique constraint")
    ) {
      return {
        success: false,
        message: `You already have a contact named "${contactName}".`,
      };
    }
    throw error;
  }
}

// ──────────────────────── Resolve Contact ────────────────────────

/**
 * Resolve a contact name to a user ID.
 */
export async function resolveContactByName(
  ownerId: string,
  contactName: string
): Promise<string | null> {
  const contact = await prisma.contact.findUnique({
    where: {
      ownerId_contactName: {
        ownerId,
        contactName: contactName.toLowerCase().trim(),
      },
    },
    select: { contactUserId: true, phoneHash: true },
  });

  if (!contact) return null;

  // If we already have a linked user, return it
  if (contact.contactUserId) return contact.contactUserId;

  // Try to resolve via phone hash (user may have registered since contact was added)
  if (contact.phoneHash) {
    const user = await prisma.user.findUnique({
      where: { phoneHash: contact.phoneHash },
      select: { id: true },
    });

    if (user) {
      // Update the link for future lookups
      await prisma.contact.updateMany({
        where: { ownerId, phoneHash: contact.phoneHash },
        data: { contactUserId: user.id },
      });
      return user.id;
    }
  }

  return null;
}

// ──────────────────────── Resolve by Phone ──────────────────────

/**
 * Find or create a user by phone number.
 * If the user doesn't exist, auto-registers them (wallet created separately).
 */
export async function resolveUserByPhone(
  phoneNumber: string,
  platform: "whatsapp" | "telegram",
  platformId: string
): Promise<{ userId: string; isNew: boolean }> {
  const phoneH = hashPhone(phoneNumber);
  const last4 = phoneNumber.slice(-4);

  const existing = await prisma.user.findUnique({
    where: { phoneHash: phoneH },
    select: { id: true },
  });

  if (existing) {
    return { userId: existing.id, isNew: false };
  }

  // Auto-register
  const user = await prisma.user.create({
    data: {
      phoneHash: phoneH,
      phoneSalt: phoneH.slice(0, 16), // derived salt for display
      phoneLast4: last4,
      platform,
      platformId,
      status: "new_user",
    },
  });

  logger.info({ userId: user.id }, "Auto-registered new user");
  return { userId: user.id, isNew: true };
}
