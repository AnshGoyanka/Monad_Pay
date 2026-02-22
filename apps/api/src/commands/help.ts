import type { ChatResponse } from "@chatpay/shared";

/**
 * Help — friendly, minimal guide. No rigid syntax shown.
 */
export async function handleHelp(): Promise<ChatResponse> {
  const message = [
    "Hey! 👋 I'm *WattsPay* — send & receive crypto right here on WhatsApp. Zero gas fees.\n",
    "Here's what you can do:\n",
    "💸 *Send money* — _send 2 monad to rahul_",
    "💰 *Check balance* — _what's my balance?_",
    "📜 *Transaction history* — _show my transactions_",
    "📥 *Deposit* — _I want to deposit_",
    "🏧 *Withdraw* — _withdraw 5 monad_",
    "👤 *Save a contact* — _save rahul +91..._",
    "🔑 *Set PIN* — _my pin is 1234_\n",
    "Just talk to me naturally — no special commands needed ✨",
  ].join("\n");

  return { message };
}
