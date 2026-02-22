import {
  createPublicClient,
  createWalletClient,
  http,
  parseEther,
  formatEther,
  getContract,
  keccak256,
  encodePacked,
  type PublicClient,
  type WalletClient,
  type Address,
  type Hash,
  type GetContractReturnType,
  type Transport,
  type Chain,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { PAYMENT_POOL_ABI } from "./abi.js";
import { monadTestnet, DEFAULT_POOL_ADDRESS, EXPLORER_TX_URL } from "./chain.js";
import type {
  MonadPayConfig,
  DepositParams,
  DepositForParams,
  DepositResult,
  TransferParams,
  BatchTransferParams,
  TransferResult,
  WithdrawParams,
  WithdrawResult,
  BalanceResult,
  PoolInfo,
  DepositEvent,
  TransferEvent,
  WithdrawEvent,
} from "./types.js";

/**
 * MonadPay SDK Client
 *
 * Interact with the Monad Pay PaymentPool contract — deposit, transfer,
 * withdraw, check balances, and watch events.
 *
 * @example Read-only (no private key needed):
 * ```ts
 * import { MonadPay } from "@monad-pay/sdk";
 *
 * const mp = new MonadPay();
 * const balance = await mp.getBalance("0x...");
 * console.log(`Pool: ${balance.poolBalance} MON`);
 * ```
 *
 * @example With signer (deposit / transfer / withdraw):
 * ```ts
 * import { MonadPay } from "@monad-pay/sdk";
 *
 * const mp = new MonadPay({
 *   privateKey: "0xabc123...",
 * });
 *
 * const result = await mp.deposit({ amount: "1.5" });
 * console.log(`Deposited! TX: ${result.explorerUrl}`);
 * ```
 */
export class MonadPay {
  /** Public client for read operations */
  public readonly publicClient: PublicClient<Transport, Chain>;

  /** Wallet client for write operations (undefined if no private key) */
  public readonly walletClient: WalletClient | undefined;

  /** Signer address (undefined if no private key) */
  public readonly signerAddress: Address | undefined;

  /** PaymentPool contract address */
  public readonly poolAddress: Address;

  private readonly pool: GetContractReturnType<
    typeof PAYMENT_POOL_ABI,
    { public: PublicClient<Transport, Chain> }
  >;

  constructor(config: MonadPayConfig = {}) {
    const rpcUrl = config.rpcUrl ?? "https://testnet-rpc.monad.xyz";
    this.poolAddress = (config.poolAddress ?? DEFAULT_POOL_ADDRESS) as Address;

    this.publicClient = createPublicClient({
      chain: monadTestnet,
      transport: http(rpcUrl),
    });

    if (config.privateKey) {
      const account = privateKeyToAccount(config.privateKey as Hash);
      this.signerAddress = account.address;
      this.walletClient = createWalletClient({
        account,
        chain: monadTestnet,
        transport: http(rpcUrl),
      });
    }

    this.pool = getContract({
      address: this.poolAddress,
      abi: PAYMENT_POOL_ABI,
      client: { public: this.publicClient },
    });
  }

  // ────────────────── Read Operations ──────────────────────────────────────

  /**
   * Get pool balance and native wallet balance for an address.
   *
   * @example
   * ```ts
   * const bal = await mp.getBalance("0xabc...");
   * console.log(`Sendable: ${bal.poolBalance} MON`);
   * console.log(`Wallet:   ${bal.nativeBalance} MON`);
   * ```
   */
  async getBalance(address: Address): Promise<BalanceResult> {
    const [poolBalanceWei, nativeBalanceWei] = await Promise.all([
      this.pool.read.balanceOf([address]),
      this.publicClient.getBalance({ address }),
    ]);

    return {
      poolBalanceWei,
      poolBalance: formatEther(poolBalanceWei),
      nativeBalanceWei,
      nativeBalance: formatEther(nativeBalanceWei),
    };
  }

  /**
   * Get pool balance only (wei).
   */
  async getPoolBalance(address: Address): Promise<bigint> {
    return this.pool.read.balanceOf([address]);
  }

  /**
   * Get pool contract information.
   */
  async getPoolInfo(): Promise<PoolInfo> {
    const [relayer, totalDepositedWei] = await Promise.all([
      this.pool.read.relayer(),
      this.pool.read.totalDeposited(),
    ]);

    return {
      address: this.poolAddress,
      relayer: relayer as Address,
      totalDepositedWei,
      totalDeposited: formatEther(totalDepositedWei),
    };
  }

  // ────────────────── Write Operations ─────────────────────────────────────

  /**
   * Deposit MON into the pool for your own address.
   *
   * @example
   * ```ts
   * const result = await mp.deposit({ amount: "2.5" });
   * console.log(result.explorerUrl);
   * ```
   */
  async deposit(params: DepositParams): Promise<DepositResult> {
    this.requireSigner();

    const amountWei = parseEther(params.amount);
    const txHash = await this.walletClient!.writeContract({
      address: this.poolAddress,
      abi: PAYMENT_POOL_ABI,
      functionName: "deposit",
      chain: monadTestnet,
      account: this.walletClient!.account!,
      value: amountWei,
    });

    await this.publicClient.waitForTransactionReceipt({ hash: txHash });

    return {
      txHash,
      amountWei,
      explorerUrl: `${EXPLORER_TX_URL}${txHash}`,
    };
  }

  /**
   * Deposit MON into the pool for another user's address.
   *
   * @example
   * ```ts
   * const result = await mp.depositFor({
   *   user: "0xrecipient...",
   *   amount: "1.0",
   * });
   * ```
   */
  async depositFor(params: DepositForParams): Promise<DepositResult> {
    this.requireSigner();

    const amountWei = parseEther(params.amount);
    const txHash = await this.walletClient!.writeContract({
      address: this.poolAddress,
      abi: PAYMENT_POOL_ABI,
      functionName: "depositFor",
      args: [params.user],
      chain: monadTestnet,
      account: this.walletClient!.account!,
      value: amountWei,
    });

    await this.publicClient.waitForTransactionReceipt({ hash: txHash });

    return {
      txHash,
      amountWei,
      explorerUrl: `${EXPLORER_TX_URL}${txHash}`,
    };
  }

  /**
   * Transfer MON between pool balances (relayer-only).
   * Users never pay gas — the relayer wallet executes this.
   *
   * @example
   * ```ts
   * const result = await mp.transfer({
   *   from: "0xsender...",
   *   to: "0xrecipient...",
   *   amount: "0.5",
   * });
   * ```
   */
  async transfer(params: TransferParams): Promise<TransferResult> {
    this.requireSigner();

    const amountWei = parseEther(params.amount);
    const refId =
      params.refId ??
      keccak256(
        encodePacked(
          ["address", "address", "uint256", "uint256"],
          [params.from, params.to, amountWei, BigInt(Date.now())],
        ),
      );

    const txHash = await this.walletClient!.writeContract({
      address: this.poolAddress,
      abi: PAYMENT_POOL_ABI,
      functionName: "transfer",
      chain: monadTestnet,
      account: this.walletClient!.account!,
      args: [params.from, params.to, amountWei, refId],
    });

    await this.publicClient.waitForTransactionReceipt({ hash: txHash });

    return {
      txHash,
      refId,
      amountWei,
      explorerUrl: `${EXPLORER_TX_URL}${txHash}`,
    };
  }

  /**
   * Execute multiple transfers in a single transaction (relayer-only).
   *
   * @example
   * ```ts
   * const result = await mp.batchTransfer({
   *   transfers: [
   *     { from: "0xA...", to: "0xB...", amount: "1.0" },
   *     { from: "0xC...", to: "0xD...", amount: "2.0" },
   *   ],
   * });
   * ```
   */
  async batchTransfer(params: BatchTransferParams): Promise<{ txHash: Hash; explorerUrl: string }> {
    this.requireSigner();

    const froms: Address[] = [];
    const tos: Address[] = [];
    const amounts: bigint[] = [];
    const refIds: Hash[] = [];

    for (const t of params.transfers) {
      const amountWei = parseEther(t.amount);
      froms.push(t.from);
      tos.push(t.to);
      amounts.push(amountWei);
      refIds.push(
        t.refId ??
          keccak256(
            encodePacked(
              ["address", "address", "uint256", "uint256"],
              [t.from, t.to, amountWei, BigInt(Date.now())],
            ),
          ),
      );
    }

    const txHash = await this.walletClient!.writeContract({
      address: this.poolAddress,
      abi: PAYMENT_POOL_ABI,
      functionName: "batchTransfer",
      chain: monadTestnet,
      account: this.walletClient!.account!,
      args: [froms, tos, amounts, refIds],
    });

    await this.publicClient.waitForTransactionReceipt({ hash: txHash });

    return {
      txHash,
      explorerUrl: `${EXPLORER_TX_URL}${txHash}`,
    };
  }

  /**
   * Withdraw MON from the pool to an external address (relayer-only).
   *
   * @example
   * ```ts
   * const result = await mp.withdraw({
   *   from: "0xuser...",
   *   to: "0xexternal...",
   *   amount: "3.0",
   * });
   * ```
   */
  async withdraw(params: WithdrawParams): Promise<WithdrawResult> {
    this.requireSigner();

    const amountWei = parseEther(params.amount);
    const txHash = await this.walletClient!.writeContract({
      address: this.poolAddress,
      abi: PAYMENT_POOL_ABI,
      functionName: "withdraw",
      chain: monadTestnet,
      account: this.walletClient!.account!,
      args: [params.from, params.to, amountWei],
    });

    await this.publicClient.waitForTransactionReceipt({ hash: txHash });

    return {
      txHash,
      amountWei,
      explorerUrl: `${EXPLORER_TX_URL}${txHash}`,
    };
  }

  // ────────────────── Event Watchers ───────────────────────────────────────

  /**
   * Get recent deposit events.
   *
   * @param fromBlock - Start block (default: last 5000 blocks)
   */
  async getDeposits(fromBlock?: bigint): Promise<DepositEvent[]> {
    const currentBlock = await this.publicClient.getBlockNumber();
    const start = fromBlock ?? (currentBlock > 5000n ? currentBlock - 5000n : 0n);

    const logs = await this.publicClient.getContractEvents({
      address: this.poolAddress,
      abi: PAYMENT_POOL_ABI,
      eventName: "Deposited",
      fromBlock: start,
      toBlock: "latest",
    });

    return logs.map((log) => ({
      user: log.args.user!,
      amount: log.args.amount!,
      timestamp: log.args.timestamp!,
      txHash: log.transactionHash!,
      blockNumber: log.blockNumber!,
    }));
  }

  /**
   * Get recent transfer events.
   *
   * @param fromBlock - Start block (default: last 5000 blocks)
   */
  async getTransfers(fromBlock?: bigint): Promise<TransferEvent[]> {
    const currentBlock = await this.publicClient.getBlockNumber();
    const start = fromBlock ?? (currentBlock > 5000n ? currentBlock - 5000n : 0n);

    const logs = await this.publicClient.getContractEvents({
      address: this.poolAddress,
      abi: PAYMENT_POOL_ABI,
      eventName: "Transferred",
      fromBlock: start,
      toBlock: "latest",
    });

    return logs.map((log) => ({
      from: log.args.from!,
      to: log.args.to!,
      amount: log.args.amount!,
      refId: log.args.refId!,
      timestamp: log.args.timestamp!,
      txHash: log.transactionHash!,
      blockNumber: log.blockNumber!,
    }));
  }

  /**
   * Get recent withdraw events.
   *
   * @param fromBlock - Start block (default: last 5000 blocks)
   */
  async getWithdrawals(fromBlock?: bigint): Promise<WithdrawEvent[]> {
    const currentBlock = await this.publicClient.getBlockNumber();
    const start = fromBlock ?? (currentBlock > 5000n ? currentBlock - 5000n : 0n);

    const logs = await this.publicClient.getContractEvents({
      address: this.poolAddress,
      abi: PAYMENT_POOL_ABI,
      eventName: "Withdrawn",
      fromBlock: start,
      toBlock: "latest",
    });

    return logs.map((log) => ({
      user: log.args.user!,
      to: log.args.to!,
      amount: log.args.amount!,
      timestamp: log.args.timestamp!,
      txHash: log.transactionHash!,
      blockNumber: log.blockNumber!,
    }));
  }

  /**
   * Watch for new deposit events in real-time.
   *
   * @returns Unwatch function to stop listening.
   *
   * @example
   * ```ts
   * const unwatch = mp.watchDeposits((event) => {
   *   console.log(`${event.user} deposited ${formatEther(event.amount)} MON`);
   * });
   *
   * // Later: stop watching
   * unwatch();
   * ```
   */
  watchDeposits(callback: (event: DepositEvent) => void): () => void {
    return this.publicClient.watchContractEvent({
      address: this.poolAddress,
      abi: PAYMENT_POOL_ABI,
      eventName: "Deposited",
      onLogs: (logs) => {
        for (const log of logs) {
          callback({
            user: log.args.user!,
            amount: log.args.amount!,
            timestamp: log.args.timestamp!,
            txHash: log.transactionHash!,
            blockNumber: log.blockNumber!,
          });
        }
      },
    });
  }

  /**
   * Watch for new transfer events in real-time.
   *
   * @returns Unwatch function to stop listening.
   */
  watchTransfers(callback: (event: TransferEvent) => void): () => void {
    return this.publicClient.watchContractEvent({
      address: this.poolAddress,
      abi: PAYMENT_POOL_ABI,
      eventName: "Transferred",
      onLogs: (logs) => {
        for (const log of logs) {
          callback({
            from: log.args.from!,
            to: log.args.to!,
            amount: log.args.amount!,
            refId: log.args.refId!,
            timestamp: log.args.timestamp!,
            txHash: log.transactionHash!,
            blockNumber: log.blockNumber!,
          });
        }
      },
    });
  }

  /**
   * Watch for new withdraw events in real-time.
   *
   * @returns Unwatch function to stop listening.
   */
  watchWithdrawals(callback: (event: WithdrawEvent) => void): () => void {
    return this.publicClient.watchContractEvent({
      address: this.poolAddress,
      abi: PAYMENT_POOL_ABI,
      eventName: "Withdrawn",
      onLogs: (logs) => {
        for (const log of logs) {
          callback({
            user: log.args.user!,
            to: log.args.to!,
            amount: log.args.amount!,
            timestamp: log.args.timestamp!,
            txHash: log.transactionHash!,
            blockNumber: log.blockNumber!,
          });
        }
      },
    });
  }

  // ────────────────── Utilities ────────────────────────────────────────────

  /**
   * Build the explorer URL for a transaction hash.
   */
  explorerUrl(txHash: Hash): string {
    return `${EXPLORER_TX_URL}${txHash}`;
  }

  /**
   * Wait for a transaction receipt.
   */
  async waitForTransaction(txHash: Hash) {
    return this.publicClient.waitForTransactionReceipt({ hash: txHash });
  }

  // ────────────────── Internal ─────────────────────────────────────────────

  private requireSigner(): asserts this is { walletClient: WalletClient; signerAddress: Address } {
    if (!this.walletClient || !this.signerAddress) {
      throw new Error(
        "MonadPay: A private key is required for write operations. " +
          'Pass `privateKey` in the constructor: new MonadPay({ privateKey: "0x..." })',
      );
    }
  }
}
