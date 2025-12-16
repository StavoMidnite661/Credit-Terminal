// Universal Spend Engine - The Heart of SOVR
// Orchestrates credit spending across all merchant adapters
// Now integrated with Oracle Ledger for balance tracking

import { AttestationEngine } from './attestation';
import { CreditEvent, CreditEventType, SpendParams, SpendResult, CreditBalance } from '../events/types';
import { IMerchantValueAdapter, MerchantAdapterError } from '../merchant_triggers/adapter_interface';
import { EventLogger } from '../events/logger';
import { 
  getOracleLedgerBridge, 
  OracleLedgerBridgeService 
} from './oracle-ledger-bridge-service';
import { ORACLE_ACCOUNTS } from '../../shared/oracle-ledger-bridge';

export class InsufficientCreditError extends Error {
  constructor(available: bigint, requested: number) {
    super(`Insufficient credit: ${available} available, ${requested} requested`);
    this.name = 'InsufficientCreditError';
  }
}

export class InvalidAttestationError extends Error {
  constructor(message: string = 'Attestation verification failed') {
    super(message);
    this.name = 'InvalidAttestationError';
  }
}

export class SpendEngine {
  private attestationEngine: AttestationEngine;
  private eventLogger: EventLogger;
  private adapters: Map<string, IMerchantValueAdapter>;
  private oracleBridge: OracleLedgerBridgeService;
  
  // User balance cache (keyed by userId)
  private userBalanceCache: Map<string, { balance: CreditBalance; timestamp: number }>;
  private readonly CACHE_TTL_MS = 5000; // 5 seconds cache
  
  constructor(
    attestationEngine: AttestationEngine,
    eventLogger: EventLogger
  ) {
    this.attestationEngine = attestationEngine;
    this.eventLogger = eventLogger;
    this.adapters = new Map();
    this.oracleBridge = getOracleLedgerBridge();
    this.userBalanceCache = new Map();
  }
  
  /**
   * Register merchant adapter
   */
  registerAdapter(adapter: IMerchantValueAdapter): void {
    this.adapters.set(adapter.type, adapter);
  }
  
  /**
   * Universal spend function - the heart of SOVR
   * Converts attested credit into real-world value via merchant network
   */
  async spendCredit(params: SpendParams): Promise<SpendResult> {
    console.log(`[SpendEngine] Processing spend request for user ${params.userId}`);
    
    // 1. Check user credit balance from Oracle Ledger
    const balance = await this.getCreditBalance(params.userId);
    const requestedAmount = BigInt(Math.floor(params.amount * 1e6)); // Convert to micro-units
    
    if (balance.available < requestedAmount) {
      throw new InsufficientCreditError(balance.available, params.amount);
    }
    
    // 2. Generate attestation
    const event: CreditEvent = {
      id: this.generateEventId(),
      type: CreditEventType.SPEND_AUTHORIZED,
      userId: params.userId,
      amount: requestedAmount,
      timestamp: new Date(),
      metadata: {
        merchant: params.merchant,
        ...params.metadata
      }
    };
    
    console.log(`[SpendEngine] Generating attestation for event ${event.id}`);
    const attestation = await this.attestationEngine.attest(event);
    
    // 3. Validate attestation
    const isValid = await this.attestationEngine.verify(attestation);
    if (!isValid) {
      throw new InvalidAttestationError();
    }
    
    // 4. Get merchant adapter
    const adapter = this.adapters.get(params.merchant);
    if (!adapter) {
      throw new Error(`Merchant adapter not found: ${params.merchant}`);
    }
    
    if (!adapter.enabled) {
      throw new Error(`Merchant adapter disabled: ${params.merchant}`);
    }
    
    // 5. Call merchant adapter
    console.log(`[SpendEngine] Calling ${params.merchant} adapter`);
    let valueResponse;
    try {
      valueResponse = await adapter.issueValue({
        userId: params.userId,
        amount: params.amount,
        currency: 'USD',
        attestation,
        metadata: params.metadata
      });
    } catch (error) {
      // Log failed spend event
      await this.eventLogger.log({
        ...event,
        type: CreditEventType.SPEND_FAILED,
        metadata: {
          ...event.metadata,
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      });
      throw error;
    }
    
    if (!valueResponse.success) {
      throw new MerchantAdapterError(
        valueResponse.error?.message || 'Merchant value issuance failed',
        valueResponse.error?.code || 'UNKNOWN_ERROR',
        params.merchant,
        valueResponse.error?.details
      );
    }
    
    // 6. Log spend event (this creates journal entry in Oracle Ledger)
    await this.eventLogger.log({
      ...event,
      type: CreditEventType.SPEND_EXECUTED,
      attestation,
      metadata: {
        ...event.metadata,
        transactionId: valueResponse.transactionId,
        valueType: valueResponse.value.type
      }
    });
    
    // 7. Update balance (Oracle Ledger is source of truth)
    const newBalance = await this.updateCreditBalance(params.userId, -requestedAmount);
    
    // 8. Log settlement
    await this.eventLogger.log({
      id: this.generateEventId(),
      type: CreditEventType.SPEND_SETTLED,
      userId: params.userId,
      amount: requestedAmount,
      timestamp: new Date(),
      metadata: {
        transactionId: valueResponse.transactionId,
        merchant: params.merchant
      }
    });
    
    console.log(`[SpendEngine] Spend completed successfully: ${valueResponse.transactionId}`);
    
    // 9. Return confirmation
    return {
      success: true,
      transactionId: valueResponse.transactionId,
      value: valueResponse.value,
      newBalance: newBalance.available,
      attestation
    };
  }
  
  /**
   * Get user credit balance from Oracle Ledger
   * 
   * The user's balance is calculated from the Cash-Vault-USDC account
   * balance in Oracle Ledger, partitioned by user ID.
   * 
   * For now, we use a simplified model where each user has a virtual
   * sub-account within the main vault. In production, this would be
   * tracked separately.
   */
  async getCreditBalance(userId: string): Promise<CreditBalance> {
    // Check cache first
    const cached = this.userBalanceCache.get(userId);
    if (cached && (Date.now() - cached.timestamp) < this.CACHE_TTL_MS) {
      return cached.balance;
    }
    
    // Query Oracle Ledger for vault balance
    // In a full implementation, we'd track per-user balances in a separate table
    const vaultBalance = await this.oracleBridge.getAccountBalance(ORACLE_ACCOUNTS.CASH_VAULT_USDC);
    
    // For now, mock per-user balance as a portion of vault
    // In production: query user_balances table in Oracle Ledger
    const userBalance: CreditBalance = {
      userId,
      available: BigInt(Math.min(vaultBalance, 1000 * 100)), // Max $1000 per user
      pending: BigInt(0),
      total: BigInt(Math.min(vaultBalance, 1000 * 100)),
      lastUpdated: new Date()
    };
    
    // Cache the result
    this.userBalanceCache.set(userId, {
      balance: userBalance,
      timestamp: Date.now()
    });
    
    return userBalance;
  }
  
  /**
   * Update user credit balance via Oracle Ledger journal entry
   * 
   * Creates a journal entry that reduces the user's balance.
   */
  async updateCreditBalance(userId: string, delta: bigint): Promise<CreditBalance> {
    // Invalidate cache for this user
    this.userBalanceCache.delete(userId);
    
    // The balance update is already recorded via the SPEND_EXECUTED event
    // in the EventLogger, which creates the journal entry.
    // 
    // This method now just returns the updated balance.
    const current = await this.getCreditBalance(userId);
    const newAvailable = current.available + delta;
    
    const newBalance: CreditBalance = {
      userId,
      available: newAvailable > 0n ? newAvailable : 0n,
      pending: current.pending,
      total: (newAvailable > 0n ? newAvailable : 0n) + current.pending,
      lastUpdated: new Date()
    };
    
    // Update cache
    this.userBalanceCache.set(userId, {
      balance: newBalance,
      timestamp: Date.now()
    });
    
    return newBalance;
  }
  
  /**
   * Get pending anchor obligations from Oracle Ledger
   */
  async getPendingObligations(): Promise<Record<string, number>> {
    return this.oracleBridge.getPendingObligations();
  }
  
  /**
   * Get total vault balance from Oracle Ledger
   */
  async getVaultBalance(): Promise<number> {
    return this.oracleBridge.getAccountBalance(ORACLE_ACCOUNTS.CASH_VAULT_USDC);
  }
  
  /**
   * Generate unique event ID
   */
  private generateEventId(): string {
    return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
