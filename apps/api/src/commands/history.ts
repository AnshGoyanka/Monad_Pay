import type { ChatResponse } from "@chatpay/shared";
import { getTransactionHistory, type TxHistoryEntry } from "../services/payment.js";

/**
 * History command — shows the last 10 transactions.
 */
export async function handleHistory(userId: string): Promise<ChatResponse> {
  const history = await getTransactionHistory(userId);

  if (history.length === 0) {
    return { message: "No transactions yet — you're all caught up! ✨\n\nSay _send_ to make your first payment." };
  }

  const lines = history.map((tx, i) => formatTxLine(i + 1, tx));

  const message = [`Here are your recent transactions 📜\n`, ...lines].join("\n");

  return { message };
}

function formatTxLine(index: number, tx: TxHistoryEntry): string {
  const icon = getIcon(tx.type);
  const direction = getDirection(tx.type);
  const counterparty = tx.counterpartyLast4
    ? `****${tx.counterpartyLast4}`
    : "external";
  const statusBadge = getStatusBadge(tx.status);
  const date = tx.createdAt.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
  });

  return `${index}. ${icon} ${direction} *${tx.amount} ${tx.currency}* ${counterparty} ${statusBadge} (${date})`;
}

function getIcon(type: TxHistoryEntry["type"]): string {
  switch (type) {
    case "sent":
      return "📤";
    case "received":
      return "📥";
    case "deposit":
      return "💰";
    case "withdraw":
      return "🏧";
  }
}

function getDirection(type: TxHistoryEntry["type"]): string {
  switch (type) {
    case "sent":
      return "Sent";
    case "received":
      return "Received";
    case "deposit":
      return "Deposited";
    case "withdraw":
      return "Withdrawn";
  }
}

function getStatusBadge(status: string): string {
  switch (status) {
    case "confirmed":
      return "✅";
    case "pending":
      return "⏳";
    case "failed":
      return "❌";
    default:
      return "❓";
  }
}
