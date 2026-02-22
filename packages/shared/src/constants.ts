// ──────────────────────────── Queue Names ───────────────────────

export const QUEUE_TX_SUBMIT = "tx-submit" as const;
export const QUEUE_TX_CONFIRM = "tx-confirm" as const;
export const QUEUE_NOTIFY = "notify" as const;

// ──────────────────────────── Rate Limits ────────────────────────

export const RATE_LIMIT_REQUESTS_PER_MIN = 10;
export const RATE_LIMIT_SENDS_PER_MIN = 5;
export const RATE_LIMIT_DAILY_VOLUME_MON = 50;
export const RATE_LIMIT_PIN_ATTEMPTS = 3;
export const RATE_LIMIT_PIN_LOCKOUT_MS = 15 * 60 * 1000; // 15 min

// ──────────────────────────── Sessions ───────────────────────────

export const SESSION_TTL_MS = 5 * 60 * 1000; // 5 min session timeout

// ──────────────────────────── Crypto ─────────────────────────────

export const ENCRYPTION_ALGORITHM = "aes-256-gcm" as const;
export const ENCRYPTION_KEY_LENGTH = 32; // bytes
export const ENCRYPTION_IV_LENGTH = 16;  // bytes
export const ENCRYPTION_AUTH_TAG_LENGTH = 16; // bytes

// ──────────────────────────── Blockchain ─────────────────────────

export const MONAD_CHAIN_ID = 10143; // Monad testnet
export const GAS_PRICE_CACHE_MS = 3_000;
export const TX_CONFIRMATION_BLOCKS = 2;
export const RELAYER_LOW_BALANCE_THRESHOLD = "10000000000000000000"; // 10 MON in wei
export const NATIVE_CURRENCY = "MON" as const;

// ──────────────────────────── Wallet ─────────────────────────────

export const HD_PATH_PREFIX = "m/44'/60'/0'/0/" as const;

// ──────────────────────────── Display ────────────────────────────

export const HISTORY_PAGE_SIZE = 10;
export const ADDRESS_DISPLAY_CHARS = 6; // show first 6 and last 4
