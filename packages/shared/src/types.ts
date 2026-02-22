// ──────────────────────────── Platforms ──────────────────────────

export type Platform = "whatsapp" | "telegram";

// ──────────────────────────── Unified Message ───────────────────

export interface UnifiedMessage {
  platform: Platform;
  platformUserId: string;
  phoneNumber: string | null;
  messageText: string;
  timestamp: string;
  chatId: string;                // platform-specific chat/conversation ID
}

// ──────────────────────────── Parsed Command ────────────────────

export type CommandType =
  | "send"
  | "balance"
  | "history"
  | "register"
  | "set_pin"
  | "deposit"
  | "withdraw"
  | "add_contact"
  | "help"
  | "unknown";

export interface ParsedCommand {
  type: CommandType;
  amount?: string;               // raw decimal string e.g. "2.5"
  currency?: string;             // e.g. "MON"
  recipientPhone?: string;       // e.g. "+91XXXXXXXXXX"
  recipientName?: string;        // e.g. "Rahul"
  pin?: string;                  // 4-digit PIN
  contactName?: string;          // for add_contact
  contactPhone?: string;         // for add_contact
  raw: string;                   // original message text
}

// ──────────────────────────── Transaction ────────────────────────

export type TxType = "transfer" | "deposit" | "withdraw";
export type TxStatus = "pending" | "confirmed" | "failed" | "expired";

export interface TransactionResult {
  refId: string;
  txHash: string | null;
  status: TxStatus;
  amount: string;
  currency: string;
}

// ──────────────────────────── Queue Jobs ─────────────────────────

export interface TxSubmitJob {
  refId: string;
  senderUserId: string;
  recipientUserId: string;
  amount: string;                // wei string
  txType: TxType;
  idempotencyKey: string;
}

export interface TxConfirmJob {
  refId: string;
  txHash: string;
  transactionId: string;
}

export interface NotifyJob {
  platform: Platform;
  chatId: string;
  message: string;
}

// ──────────────────────────── Session State ──────────────────────

export type SessionStep =
  | "idle"
  | "awaiting_pin_for_send"
  | "awaiting_pin_setup"
  | "awaiting_pin_confirm"
  | "awaiting_contact_share";

export interface UserSession {
  step: SessionStep;
  pendingCommand?: ParsedCommand;
  pinSetupValue?: string;        // temporary during pin setup flow
  expiresAt: number;             // unix timestamp ms
}

// ──────────────────────────── API Responses ──────────────────────

export interface ChatResponse {
  message: string;
  expectingReply?: boolean;
}
