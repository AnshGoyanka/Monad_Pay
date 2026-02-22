import type { ParsedCommand, ChatResponse } from "@chatpay/shared";
import { addContact as addContactService } from "../services/contacts.js";
import { logger } from "../config/logger.js";

/**
 * Add contact command — save a named contact for easier payments.
 */
export async function handleAddContact(
  userId: string,
  command: ParsedCommand
): Promise<ChatResponse> {
  if (!command.contactName || !command.contactPhone) {
    return {
      message: "I can save a contact for you! Just tell me their name and number.\n\nLike: _save rahul +919876543210_",
    };
  }

  const result = await addContactService(
    userId,
    command.contactName,
    command.contactPhone
  );

  if (!result.success) {
    return { message: `Hmm, that didn't work — ${result.message}` };
  }

  logger.info({ userId }, "Contact added");
  return { message: `Saved! 👤 You can now just say _send 2 monad to ${command.contactName}_ to pay them.` };
}
