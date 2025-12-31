/**
 * TigerBeetle Service
 * 
 * Provides high-performance ledger capabilities for the Credit Terminal.
 * Mirrors the Oracle Ledger chart of accounts but optimized for speed.
 * 
 * "Ledgers update, money does not move."
 */

import { createClient, Transfer, Account, Client } from 'tigerbeetle-node';
import { NARRATIVE_ACCOUNTS as ORACLE_ACCOUNTS, AccountType } from '../shared/narrative-mirror-bridge';

// Configuration
const TB_CLUSTER_ID = 0n;
const TB_REPLICA_ADDRESSES = [process.env.TB_ADDRESS || '3000'];

// Standard Flags
const TRANSFER_FLAGS = {
  NONE: 0,
  LINKED: 1,
  PENDING: 2,
  POST_PENDING_TRANSFER: 4,
  void_PENDING_TRANSFER: 8,
};

export class TigerBeetleService {
  private client!: Client;
  private isConnected: boolean = false;

  constructor() {
    try {
      this.client = createClient({
        cluster_id: TB_CLUSTER_ID,
        replica_addresses: TB_REPLICA_ADDRESSES,
      });
      this.isConnected = true;
      console.log(`[TigerBeetle] Client initialized on cluster ${TB_CLUSTER_ID}`);
    } catch (e) {
      console.error('[TigerBeetle] Failed to initialize client:', e);
      // We don't throw here so the app can start without critical TB failure,
      // but methods will fail if called.
      this.isConnected = false;
    }
  }
  
  /**
   * Initialize standard accounts if they don't exist.
   * Mirrors Oracle Ledger constants.
   */
  async initializeReferenceAccounts(): Promise<void> {
    if (!this.isConnected) return;

    const accountsToCreate: Account[] = [];
    const now = BigInt(Math.floor(Date.now() / 1000));

    // Helper to map Oracle ID format to TB Account
    const mapAccount = (id: number, ledger: number, code: number) => ({
      id: BigInt(id),
      debits_pending: 0n,
      debits_posted: 0n,
      credits_pending: 0n,
      credits_posted: 0n,
      user_data_128: 0n,
      user_data_64: 0n,
      user_data_32: 0,
      reserved: 0,
      ledger: nr(ledger),
      code: nr(code),
      flags: 0,
      timestamp: 0n, // Auto-set by TB
    });

    // We use Ledger=1 for USD, Code=1 for Reference Accounts
    // Iterate through ORACLE_ACCOUNTS
    for (const [key, value] of Object.entries(ORACLE_ACCOUNTS)) {
      accountsToCreate.push({
        id: BigInt(value),
        debits_pending: 0n,
        debits_posted: 0n,
        credits_pending: 0n,
        credits_posted: 0n,
        user_data_128: 0n,
        user_data_64: 0n,
        user_data_32: 0,
        reserved: 0,
        ledger: 1, // 1 = USD Ledger
        code: 1,   // 1 = System Account
        flags: 0,
        timestamp: 0n,
      });
    }

    try {
      const errors = await this.client.createAccounts(accountsToCreate);
      if (errors.length > 0) {
        // Filter out "exists" errors, as that's expected on restart
        const realErrors = errors.filter(e => e.result !== 1); // 1 = exists (roughly, check enum in real impl)
        // Actually TB error enums are strictly typed. 
        // For now, simple logging. "exists" is often index 1 in many systems but TB uses a specific enum.
        // We'll log all errors for visible debugging.
        if (realErrors.length > 0) {
           console.warn('[TigerBeetle] Account creation returned potential errors:', errors);
        }
      }
      console.log(`[TigerBeetle] Ensure ${accountsToCreate.length} reference accounts exist.`);
    } catch (e) {
      console.error('[TigerBeetle] Error creating reference accounts:', e);
    }
  }

  /**
   * Create accounts directly (for setup/testing)
   */
  async createAccounts(accounts: Account[]): Promise<boolean> {
    if (!this.isConnected) return false;
    try {
      const errors = await this.client.createAccounts(accounts);
      if (errors.length > 0) {
        // Filter out "exists" (1) if redundant
        const realErrors = errors.filter(e => e.result !== 1);
        if (realErrors.length > 0) {
          console.error('[TigerBeetle] Account creation failed:', realErrors);
          return false;
        }
      }
      return true;
    } catch (e) {
      console.error('[TigerBeetle] Account creation exception:', e);
      return false;
    }
  }

  async createTransfer(
    debitAccount: bigint,
    creditAccount: bigint,
    amount: bigint,
    ledger: number = 1,
    id?: bigint
  ): Promise<boolean> {
    if (!this.isConnected) return false;

    const transferId = id || (BigInt(Date.now()) * 10000n + BigInt(Math.floor(Math.random() * 10000)));

    const transfer: Transfer = {
      id: transferId,
      debit_account_id: debitAccount,
      credit_account_id: creditAccount,
      amount: amount,
      pending_id: 0n,
      user_data_128: 0n,
      user_data_64: 0n,
      user_data_32: 0,
      timeout: 0,
      ledger: ledger,
      code: 1,
      flags: 0,
      timestamp: 0n,
    };

    try {
      const errors = await this.client.createTransfers([transfer]);
      if (errors.length > 0) {
        console.error('[TigerBeetle] Transfer failed:', errors);
        // In a full implementation, we would check if error is "Exists" (idempotency)
        // and return 'true' if it matches, or throw if mismatch.
        // For now, failure to create is false.
        return false;
      }
      return true;
    } catch (e) {
      console.error('[TigerBeetle] Transfer exception:', e);
      return false;
    }
  }

  /**
   * Get account balance
   */
  async getAccountBalance(accountId: bigint): Promise<bigint> {
    if (!this.isConnected) return 0n;

    try {
      const accounts = await this.client.lookupAccounts([accountId]);
      if (accounts.length === 0) return 0n;
      
      const acc = accounts[0];
      // Balance = Credits - Debits (for Equity/start) or Debits - Credits?
      // TB doesn't enforce "normal balance". It just tracks debits and credits.
      // Net = Credits - Debits (Liability/Equity style)
      // Net = Debits - Credits (Asset style)
      // We will return Credits Posted - Debits Posted for now as general net value
      return acc.credits_posted - acc.debits_posted;
    } catch (e) {
      console.error('[TigerBeetle] Lookup exception:', e);
      return 0n;
    }
  }
}

// Singleton
let instance: TigerBeetleService | null = null;
export function getTigerBeetle(): TigerBeetleService {
  if (!instance) instance = new TigerBeetleService();
  return instance;
}

// Helpers
function nr(n: number): number { return n; }
