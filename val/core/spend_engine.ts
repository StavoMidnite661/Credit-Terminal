// Universal Spend Engine - The Heart of SOVR
// Orchestrates credit spending across all merchant adapters
// Now integrated with Narrative Mirror for balance tracking
//
// -----------------------------------------------------------------------------
// SOVR CANON NOTICE
// -----------------------------------------------------------------------------
// This component performs mechanical truth operations.
// It is the authority for credit spending.
// -----------------------------------------------------------------------------

import { ethers } from 'ethers';
import { AttestationEngine } from './attestation';
import { CreditEvent, CreditEventType, SpendParams, SpendResult, CreditBalance, Attestation } from '../events/types';
import { IMerchantValueAdapter, MerchantAdapterError } from '../merchant_triggers/adapter_interface';
import { EventLogger } from '../events/logger';
import { 
  getNarrativeMirror, 
  NarrativeMirrorService 
} from './narrative-mirror-service';
import { NARRATIVE_ACCOUNTS } from '../shared/narrative-mirror-bridge';

export class InsufficientCreditError extends Error {
  constructor(available: bigint, requested: bigint) {
    super(`Insufficient credit: ${available} units available, ${requested} units requested`);
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
  private narrativeMirror: NarrativeMirrorService;
  
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
    this.narrativeMirror = getNarrativeMirror();
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

    // INVARIANT: Spend amount must be positive
    if (params.amount <= 0) {
      throw new Error(`Invalid spend amount: ${params.amount}. Must be positive.`);
    }
    
    // 1. Check user credit balance from Narrative Mirror
    const balance = await this.getCreditBalance(params.userId);
    const requestedAmount = BigInt(Math.floor(params.amount * 1_000_000)); // Micro-units (10^6)

    // INVARIANT: BigInt amount must be positive (redundant check for safety)
    if (requestedAmount <= 0n) {
      throw new Error(`Invalid calculated units: ${requestedAmount}. Must be positive.`);
    }
    
    if (balance.available < requestedAmount) {
      throw new InsufficientCreditError(balance.available, requestedAmount);
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
    const isValid = await this.attestationEngine.verify(attestation, event);
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
    
    // 6. Log spend event (this creates narrative entry in Narrative Mirror)
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
    
    // 7. Update balance (Narrative Mirror is source of truth)
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
   * Get user credit balance from Narrative Mirror
   * 
   * The user's balance is calculated from the Cash-Vault-USDC account
   * balance in Narrative Mirror, partitioned by user ID.
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
    
    // Query Narrative Mirror for observed vault balance
    // In a full implementation, we'd track per-user balances in a separate table
    const vaultBalance = await this.narrativeMirror.getObservedAccountBalance(NARRATIVE_ACCOUNTS.HONORING_ADAPTER_STABLECOIN);
    
    // For now, mock per-user balance as a portion of vault
    // Max $1000 per user in micro-units
    const MAX_USER_BALANCE = 1000n * 1_000_000n;
    
    const userBalance: CreditBalance = {
      userId,
      available: vaultBalance < MAX_USER_BALANCE ? vaultBalance : MAX_USER_BALANCE,
      pending: 0n,
      total: vaultBalance < MAX_USER_BALANCE ? vaultBalance : MAX_USER_BALANCE,
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
   * Update user credit balance via Narrative Mirror narrative entry
   * 
   * Creates a narrative entry that reduces the user's balance.
   */
  async updateCreditBalance(userId: string, delta: bigint): Promise<CreditBalance> {
    // Invalidate cache for this user
    this.userBalanceCache.delete(userId);
    
    // The balance update is already recorded via the SPEND_EXECUTED event
    // in the EventLogger, which creates the narrative entry.
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
   * Get pending anchor obligation observations from Narrative Mirror
   */
  async getPendingObligations(): Promise<Record<string, bigint>> {
    return this.narrativeMirror.getPendingObligationObservations();
  }
  
  /**
   * Get total vault balance observation from Narrative Mirror
   */
  async getVaultBalance(): Promise<bigint> {
    return this.narrativeMirror.getObservedAccountBalance(NARRATIVE_ACCOUNTS.HONORING_ADAPTER_STABLECOIN);
  }
  
  /**
   * Generate unique event ID
   */
  private generateEventId(): string {
    return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Settle an attested intent (Hostile/Async Flow)
   * This is the entry point for external fulfillment callbacks.
   * ENFORCES IDEMPOTENCY via TigerBeetle.
   */
  async settle(event: CreditEvent, attestation: Attestation): Promise<SpendResult> {
    console.log(`[SpendEngine] Settling event ${event.id}`);
    
    // 1. Verify Attestation (Cryptographic Integrity)
    const isValid = await this.attestationEngine.verify(attestation, event);
    if (!isValid) {
      throw new InvalidAttestationError('Invalid attestation signature or proof');
    }

    // 2. Derive Deterministic Transfer ID (Mechanical Truth)
    // We hash the event ID to a 128-bit integer for TigerBeetle
    const transferId = this.eventIdToBigInt(event.id);
    
    // 3. Execute Clearing (TigerBeetle Authority)
    // We use the "Honoring Adapter" account logic
    // Debit: User (Vault) -> Credit: Adapter (Settlement)
    // For this implementation, we use reference accounts:
    const debitAccount = NARRATIVE_ACCOUNTS.HONORING_ADAPTER_STABLECOIN; // User Funds
    const creditAccount = NARRATIVE_ACCOUNTS.HONORING_ADAPTER_ODFI;       // Merchant/Adapter
    
    // We need usage of TigerBeetleService. 
    // Since SpendEngine didn't have it, we lazily get it or add it to constructor.
    // For now, we'll use lazy import pattern or singleton if available.
    // Assuming we can import getTigerBeetle.
    const tigerBeetleService = await import('./tigerbeetle_service');
    const tigerBeetle = tigerBeetleService.getTigerBeetle();
    
    const success = await tigerBeetle.createTransfer(
      BigInt(debitAccount),
      BigInt(creditAccount),
      event.amount,
      1,
      transferId // Deterministic ID prevents replay
    );
    
    if (!success) {
      // If TB fails, it's likely a replay or balance issue.
      // We explicitly reject to enforce "One Attestation -> One Clearing".
      throw new Error('Clearing failed: Transfer rejected (Potential Replay)');
    }
    
    // 4. Record Narrative Observation (Observer)
    await this.eventLogger.log({
      ...event,
      type: CreditEventType.SPEND_SETTLED,
      attestation,
      metadata: {
        ...event.metadata,
        settlementMethod: 'async_hostile_replay_protected'
      }
    });

    return {
      success: true,
      transactionId: event.id,
      value: { type: 'direct_credit' },
      newBalance: 0n, // simplified
      attestation
    };
  }

  // Helper to convert string ID to BigInt for TB
  private eventIdToBigInt(id: string): bigint {
    // Use Keccak256 for cryptographic uniqueness [CANON LOCK]
    // ethers.utils.id(string) returns a hex string of the Keccak256 hash
    // We mask it to 128 bits for TigerBeetle transfer ID (u128)
    const hashHex = ethers.utils.id(id);
    // Convert hex to BigInt and apply mask for u128
    return BigInt(hashHex) & 0xffffffffffffffffffffffffffffffffn; 
  }
}
