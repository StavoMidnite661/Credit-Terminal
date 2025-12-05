// Universal Spend Engine - The Heart of SOVR
// Orchestrates credit spending across all merchant adapters

import { AttestationEngine } from './attestation';
import { CreditEvent, CreditEventType, SpendParams, SpendResult, CreditBalance } from '../events/types';
import { IMerchantValueAdapter, MerchantAdapterError } from '../merchant_triggers/adapter_interface';
import { EventLogger } from '../events/logger';

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
  
  constructor(
    attestationEngine: AttestationEngine,
    eventLogger: EventLogger
  ) {
    this.attestationEngine = attestationEngine;
    this.eventLogger = eventLogger;
    this.adapters = new Map();
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
    
    // 1. Check user credit balance
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
    
    // 6. Log spend event
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
    
    // 7. Update balance
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
   * Get user credit balance
   */
  private async getCreditBalance(userId: string): Promise<CreditBalance> {
    // TODO: Implement actual balance fetching from database
    // For now, return mock balance
    return {
      userId,
      available: BigInt(1000 * 1e6), // $1000 in micro-units
      pending: BigInt(0),
      total: BigInt(1000 * 1e6),
      lastUpdated: new Date()
    };
  }
  
  /**
   * Update user credit balance
   */
  private async updateCreditBalance(userId: string, delta: bigint): Promise<CreditBalance> {
    // TODO: Implement actual balance update in database
    // For now, return updated mock balance
    const current = await this.getCreditBalance(userId);
    const newAvailable = current.available + delta;
    
    return {
      userId,
      available: newAvailable,
      pending: current.pending,
      total: newAvailable + current.pending,
      lastUpdated: new Date()
    };
  }
  
  /**
   * Generate unique event ID
   */
  private generateEventId(): string {
    return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
