import type { ChatResponse } from "@chatpay/shared";
import { userHasWallet, decryptWalletAddress } from "../services/wallet.js";
import { env } from "../config/env.js";

/**
 * Deposit — shows pool contract address + user's wallet address.
 */
export async function handleDeposit(userId: string): Promise<ChatResponse> {
  const hasWallet = await userHasWallet(userId);

  if (!hasWallet) {
    return {
      message: "Let me set up your wallet first! Just pick a PIN by saying _my pin is 1234_",
    };
  }

  const userAddress = await decryptWalletAddress(userId);
  const poolAddress = env.PAYMENT_POOL_ADDRESS;

  return {
    message: [
      "📥 *How to Deposit MON*\n",
      `Your wallet address:\n\`${userAddress}\`\n`,
      `Payment Pool contract:\n\`${poolAddress}\`\n`,
      "To fund your sendable balance, send MON to the *pool contract* from your wallet (MetaMask, etc.)\n",
      "Or just ask a friend to _send_ you MON through Monad Pay — zero gas! ⚡",
    ].join("\n"),
  };
}
