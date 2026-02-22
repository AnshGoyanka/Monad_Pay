import type { ParsedCommand, CommandType } from "@chatpay/shared";

/**
 * Natural-language message parser.
 *
 * Understands casual human speech, not just rigid commands.
 * Examples:
 *   "hey send 2 monad to rahul"
 *   "can you pay 0.5 to +919876543210"
 *   "i want to transfer 10 mon to priya"
 *   "what's my balance?"
 *   "how much do I have"
 *   "show me my transactions"
 *   "my pin is 1234" / "set my pin to 5678"
 *   "save rahul as +919876543210"
 *   "i want to deposit"
 *   "withdraw 5 monad please"
 *   "hi" / "hey" / "what can you do?"
 */

// ──────────────────────── Helpers ────────────────────────────────

/** Remove filler words / punctuation that don't affect intent */
function normalize(text: string): string {
  return text
    .trim()
    .toLowerCase()
    // Strip common chat punctuation but keep +, digits, dots
    .replace(/[!?,.'"""'']+$/g, "")
    .replace(/\s+/g, " ");
}

/** Extract the first number (int or decimal) from a string */
function extractAmount(text: string): string | null {
  const m = text.match(/(\d+(?:\.\d+)?)/);
  return m ? m[1] : null;
}

/** Extract a phone number (+xx… or 10+ digits) */
function extractPhone(text: string): string | null {
  const m = text.match(/(\+\d{10,15}|\b\d{10,15}\b)/);
  return m ? m[1] : null;
}

/** Extract a 4-digit PIN */
function extractPin(text: string): string | null {
  const m = text.match(/\b(\d{4})\b/);
  return m ? m[1] : null;
}

/**
 * Extract the recipient — everything after "to" or the last word/phone.
 * Returns { phone, name } — one of them will be set.
 */
function extractRecipient(text: string): { phone?: string; name?: string } {
  // First try to find a phone number anywhere
  const phone = extractPhone(text);
  if (phone) return { phone };

  // Try to find "to <name>" pattern
  const toMatch = text.match(/\bto\s+([a-z][a-z0-9_ ]{0,30})/i);
  if (toMatch) {
    const name = toMatch[1].trim().replace(/\s*(please|pls|now|asap|quickly|fast)$/i, "").trim();
    if (name.length > 0) return { name };
  }

  return {};
}

// ──────────────────────── Intent Patterns ────────────────────────
// Each pattern is a set of keywords/phrases that signal an intent.
// We match loosely — the user doesn't need exact syntax.

const SEND_SIGNALS =
  /\b(send|pay|transfer|give|forward|move|zap|shot)\b/i;

const BALANCE_SIGNALS =
  /\b(balance|bal|how\s*much|my\s*money|funds|wallet|check\s*(my\s*)?balance|kitna|paisa|amount\s*left)\b/i;

const HISTORY_SIGNALS =
  /\b(history|transactions?|txns?|recent|past\s*(payments?|txns?)|activity|statement|log)\b/i;

const PIN_SET_SIGNALS =
  /\b(set\s*(my\s*)?pin|pin\s*(set|change|update|is)|my\s*pin\s*(is|should\s*be|will\s*be)|change\s*(my\s*)?pin|create\s*(a\s*)?pin|new\s*pin)\b/i;

const ADD_CONTACT_SIGNALS =
  /\b(add|save|store|remember|create\s*contact|new\s*contact)\b/i;

const DEPOSIT_SIGNALS =
  /\b(deposit|fund|top\s*up|add\s*(money|funds|cash)|load|recharge)\b/i;

const WITHDRAW_SIGNALS =
  /\b(withdraw|cash\s*out|take\s*out|pull\s*out|redeem|claim)\b/i;

const HELP_SIGNALS =
  /^(hi|hey|hello|hola|yo|sup|what'?s?\s*up|gm|good\s*(morning|evening|afternoon)|help|menu|commands?|what\s*can\s*you\s*do|how\s*does\s*this\s*work|start|options|guide)/i;

const GREETING_ONLY =
  /^(hi|hey|hello|hola|yo|sup|what'?s?\s*up|gm|good\s*(morning|evening|afternoon)|namaste|hii+)[\s!?.]*$/i;

const PIN_ONLY_PATTERN = /^(\d{4})$/;

// ──────────────────────── Parser ────────────────────────────────

export function parseMessage(text: string): ParsedCommand {
  const raw = text.trim();
  const n = normalize(raw);

  // ── PIN-only input (during awaiting_pin flow) ──
  const pinOnly = raw.match(PIN_ONLY_PATTERN);
  if (pinOnly) {
    return { type: "unknown", pin: pinOnly[1], raw };
  }

  // ── Send / Pay / Transfer (check first — most complex) ──
  if (SEND_SIGNALS.test(n)) {
    const amount = extractAmount(n);
    const { phone, name } = extractRecipient(n);

    if (amount && (phone || name)) {
      return {
        type: "send",
        amount,
        currency: "MON",
        recipientPhone: phone,
        recipientName: name,
        raw,
      };
    }

    // Partial — got the intent but missing info
    if (amount && !phone && !name) {
      return { type: "send", amount, currency: "MON", raw };
    }
    if (!amount && (phone || name)) {
      return {
        type: "send",
        recipientPhone: phone,
        recipientName: name,
        currency: "MON",
        raw,
      };
    }

    // Just the verb with nothing else — still route to send
    return { type: "send", currency: "MON", raw };
  }

  // ── Withdraw (check before balance — "withdraw" also mentions amounts) ──
  if (WITHDRAW_SIGNALS.test(n)) {
    const amount = extractAmount(n);
    return {
      type: "withdraw",
      amount: amount || undefined,
      currency: "MON",
      raw,
    };
  }

  // ── Add Contact ──
  if (ADD_CONTACT_SIGNALS.test(n)) {
    const phone = extractPhone(n);
    // Try to extract name: "save rahul +91..." or "add rahul as +91..."
    const nameMatch = n.match(
      /(?:add|save|store|remember)\s+([a-z][a-z0-9_]{0,20})\s+(?:as\s+)?(\+?\d{10,15})/i
    );
    if (nameMatch) {
      return {
        type: "add_contact",
        contactName: nameMatch[1],
        contactPhone: nameMatch[2],
        raw,
      };
    }
    // Also: "save +91... as rahul"
    const reverseMatch = n.match(
      /(?:add|save|store|remember)\s+(\+?\d{10,15})\s+(?:as\s+)?([a-z][a-z0-9_]{0,20})/i
    );
    if (reverseMatch) {
      return {
        type: "add_contact",
        contactPhone: reverseMatch[1],
        contactName: reverseMatch[2],
        raw,
      };
    }
    // Partial
    return { type: "add_contact", contactPhone: phone || undefined, raw };
  }

  // ── Set PIN ──
  if (PIN_SET_SIGNALS.test(n)) {
    const pin = extractPin(n);
    return { type: "set_pin", pin: pin || undefined, raw };
  }

  // ── Balance ──
  if (BALANCE_SIGNALS.test(n)) {
    return { type: "balance", raw };
  }

  // ── History ──
  if (HISTORY_SIGNALS.test(n)) {
    return { type: "history", raw };
  }

  // ── Deposit ──
  if (DEPOSIT_SIGNALS.test(n)) {
    return { type: "deposit", raw };
  }

  // ── Greeting / Help ──
  if (GREETING_ONLY.test(n)) {
    return { type: "help", raw };
  }
  if (HELP_SIGNALS.test(n)) {
    return { type: "help", raw };
  }

  // ── Fuzzy fallback: look for amounts + phone = probably a send ──
  const fallbackAmount = extractAmount(n);
  const fallbackPhone = extractPhone(n);
  if (fallbackAmount && fallbackPhone) {
    return {
      type: "send",
      amount: fallbackAmount,
      currency: "MON",
      recipientPhone: fallbackPhone,
      raw,
    };
  }

  // ── Unknown ──
  return { type: "unknown", raw };
}
