import type { ChatResponse } from "@chatpay/shared";
import { getUserBalance, getUserNativeBalance } from "../services/payment.js";
import { userHasWallet } from "../services/wallet.js";

/**
 * Balance — shows pool balance + native wallet balance.
 */
export async function handleBalance(userId: string): Promise<ChatResponse> {
  const hasWallet = await userHasWallet(userId);
  if (!hasWallet) {
    return {
      message: "Looks like you don't have a wallet yet. Just say *hi* and I'll set one up for you!",
    };
  }

  try {
    const [poolBalance, nativeBalance] = await Promise.all([
      getUserBalance(userId),
      getUserNativeBalance(userId),
    ]);

    const pool = parseFloat(poolBalance);
    const native = parseFloat(nativeBalance);

    const lines: string[] = ["💰 *Your Balance*\n"];

    lines.push(`Pool (sendable): *${pool > 0 ? poolBalance : "0"} MON*`);
    lines.push(`Wallet (on-chain): *${native > 0 ? parseFloat(nativeBalance).toFixed(4) : "0"} MON*`);

    if (pool === 0 && native === 0) {
      lines.push("\nYou're starting fresh! Say _deposit_ to add funds, or ask someone to send you MON.");
    } else if (pool === 0 && native > 0) {
      lines.push("\nYour MON is in your wallet but not in the pool yet. Say _deposit_ to move it into the pool so you can send payments.");
    }

    return { message: lines.join("\n") };
  } catch (error) {
    return {
      message: "Couldn't check your balance right now. Try again in a moment 🙏",
    };
  }
}
