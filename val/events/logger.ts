// Event Logger - Records all credit events to Narrative Mirror
// Provides audit trail and event history (SOVEREIGN DOCTRINE ALIGNED)

import { CreditEvent, CreditEventType } from './types';
import { 
  getNarrativeMirror,
  NarrativeMirrorService 
} from '../core/narrative-mirror-service';
import type { 
  RecordNarrativeEntryRequest,
  NarrativeSource,
  NarrativeEntry 
} from '../shared/narrative-mirror-bridge';
import { NARRATIVE_ACCOUNTS } from '../shared/narrative-mirror-bridge';

/**
 * Maps Credit Event types to Narrative Mirror sources (DOCTRINE ALIGNED)
 * Removed 'PAYMENT' and 'PURCHASE' semantics.
 */
const EVENT_TO_SOURCE: Record<CreditEventType, NarrativeSource> = {
  [CreditEventType.CREDIT_DEPOSITED]: 'CLEARING_OBSERVATION',
  [CreditEventType.VALUE_CREATED]: 'CLEARING_OBSERVATION',
  [CreditEventType.CREDIT_PROOF_ATTESTED]: 'ATTESTATION',
  [CreditEventType.ATTESTATION_VERIFIED]: 'ATTESTATION',
  [CreditEventType.CREDIT_UNLOCKED]: 'CLEARING_OBSERVATION',
  [CreditEventType.MERCHANT_VALUE_REQUESTED]: 'HONORING_ATTEMPT',
  [CreditEventType.MERCHANT_VALUE_ISSUED]: 'HONORING_RESULT',
  [CreditEventType.GIFT_CARD_CREATED]: 'HONORING_RESULT',
  [CreditEventType.SPEND_AUTHORIZED]: 'HONORING_ATTEMPT',
  [CreditEventType.SPEND_EXECUTED]: 'HONORING_RESULT',
  [CreditEventType.SPEND_SETTLED]: 'HONORING_RESULT',
  [CreditEventType.SPEND_FAILED]: 'HONORING_RESULT',
  [CreditEventType.USER_REWARD_EARNED]: 'CLEARING_OBSERVATION',
  [CreditEventType.CASHBACK_ISSUED]: 'HONORING_RESULT',
  [CreditEventType.BALANCE_RECONCILED]: 'INTERSYSTEM',
  [CreditEventType.AUDIT_LOG_CREATED]: 'CLEARING_OBSERVATION',
};

export class EventLogger {
  private events: CreditEvent[] = [];
  private narrativeMirror: NarrativeMirrorService;
  
  constructor() {
    this.narrativeMirror = getNarrativeMirror();
  }
  
  async log(event: CreditEvent): Promise<void> {
    console.log(`[EventLogger] ${event.type}: ${event.userId} - ${event.amount} units`);
    this.events.push(event);
    
    // Create narrative entry in Narrative Mirror
    const narrativeRequest = this.createNarrativeRequest(event);
    
    if (narrativeRequest) {
      const result = await this.narrativeMirror.recordNarrativeEntry(narrativeRequest);
      if (!result.success) {
        console.error(`[EventLogger] Narrative Mirror recording failed: ${result.error}`);
      }
    }
  }
  
  /**
   * Create narrative request from credit event.
   * NOTE: Does NOT compute authoritative balances. Observations only.
   */
  private createNarrativeRequest(event: CreditEvent): RecordNarrativeEntryRequest | null {
    const source = EVENT_TO_SOURCE[event.type];
    const amount = event.amount; // bigint (micro-units)
    const displayAmount = (Number(amount) / 1_000_000).toFixed(2);
    
    switch (event.type) {
      case CreditEventType.CREDIT_DEPOSITED:
        return {
          description: `Credit Deposit Observed for ${event.userId}: ${displayAmount} USD`,
          source,
          status: 'RECORDED',
          lines: [
            { accountId: NARRATIVE_ACCOUNTS.HONORING_ADAPTER_STABLECOIN, type: 'DEBIT', amount },
            { accountId: NARRATIVE_ACCOUNTS.OBSERVED_TOKEN_REALIZATION, type: 'CREDIT', amount },
          ],
          eventId: event.id,
          userId: event.userId
        };
        
      case CreditEventType.SPEND_AUTHORIZED:
        // Authorization is an intent observation
        const memoAccountId = NARRATIVE_ACCOUNTS.ANCHOR_GROCERY_AUTHORIZATION_MEMO;
        return {
          description: `Authorization Intent Observed for ${event.userId}: ${displayAmount} USD at ${event.metadata?.merchant}`,
          source,
          status: 'OBSERVED',
          lines: [
            { accountId: NARRATIVE_ACCOUNTS.OBSERVED_OPS_EXPENSE, type: 'DEBIT', amount: amount },
            { accountId: memoAccountId, type: 'CREDIT', amount: amount },
          ],
          eventId: event.id,
          userId: event.userId
        };
        
      case CreditEventType.SPEND_EXECUTED:
        return {
          description: `Fulfillment Observation for ${event.userId}: ${displayAmount} USD at ${event.metadata?.merchant}`,
          source,
          status: 'RECORDED',
          lines: [
            { accountId: NARRATIVE_ACCOUNTS.OBSERVED_OPS_EXPENSE, type: 'DEBIT', amount },
            { accountId: NARRATIVE_ACCOUNTS.HONORING_ADAPTER_ODFI, type: 'CREDIT', amount },
          ],
          eventId: event.id,
          userId: event.userId
        };
        
      case CreditEventType.SPEND_SETTLED:
        return {
          description: `Settlement Observation for ${event.userId}: ${displayAmount} USD - ${event.metadata?.transactionId}`,
          source,
          status: 'RECORDED',
          lines: [
            { accountId: NARRATIVE_ACCOUNTS.HONORING_ADAPTER_ODFI, type: 'DEBIT', amount: 0n },
            { accountId: NARRATIVE_ACCOUNTS.HONORING_ADAPTER_ODFI, type: 'CREDIT', amount: 0n },
          ],
          eventId: event.id,
          userId: event.userId
        };
        
      case CreditEventType.SPEND_FAILED:
        return {
          description: `Failure Observation for ${event.userId}: ${displayAmount} USD - ${event.metadata?.error}`,
          source,
          status: 'FAILED',
          lines: [
            { accountId: NARRATIVE_ACCOUNTS.OBSERVED_OPS_EXPENSE, type: 'DEBIT', amount: 0n },
            { accountId: NARRATIVE_ACCOUNTS.OBSERVED_OPS_EXPENSE, type: 'CREDIT', amount: 0n },
          ],
          eventId: event.id,
          userId: event.userId
        };
        
      case CreditEventType.GIFT_CARD_CREATED:
        return {
          description: `Reward Issuance Observed for ${event.userId}: ${displayAmount} USD`,
          source,
          status: 'RECORDED',
          lines: [
            { accountId: NARRATIVE_ACCOUNTS.OBSERVED_PURCHASE_EXPENSE, type: 'DEBIT', amount },
            { accountId: NARRATIVE_ACCOUNTS.OBSERVED_AP, type: 'CREDIT', amount },
          ],
          eventId: event.id,
          userId: event.userId
        };
        
      case CreditEventType.ATTESTATION_VERIFIED:
        return {
          description: `Attestation Verification Observed for event ${event.id}`,
          source,
          status: 'RECORDED',
          lines: [
            { accountId: NARRATIVE_ACCOUNTS.HONORING_ADAPTER_STABLECOIN, type: 'DEBIT', amount: 0n },
            { accountId: NARRATIVE_ACCOUNTS.HONORING_ADAPTER_STABLECOIN, type: 'CREDIT', amount: 0n },
          ],
          eventId: event.id,
          txHash: event.transactionHash,
          blockNumber: event.blockNumber,
        };
        
      default:
        return {
          description: `${event.type} Observed: ${event.userId} - ${displayAmount} USD`,
          source,
          status: 'OBSERVED',
          lines: [
            { accountId: NARRATIVE_ACCOUNTS.HONORING_ADAPTER_STABLECOIN, type: 'DEBIT', amount: 0n },
            { accountId: NARRATIVE_ACCOUNTS.HONORING_ADAPTER_STABLECOIN, type: 'CREDIT', amount: 0n },
          ],
          eventId: event.id,
          userId: event.userId
        };
    }
  }

  /**
   * Get events for user
   */
  async getEventsForUser(userId: string): Promise<CreditEvent[]> {
    return this.events.filter(e => e.userId === userId);
  }
  
  /**
   * Get events by type
   */
  async getEventsByType(type: string): Promise<CreditEvent[]> {
    return this.events.filter(e => e.type === type);
  }
  
  /**
   * Get Narrative Mirror entries for an event
   */
  async getNarrativeEntriesForEvent(eventId: string) {
    return this.narrativeMirror.getNarrativeEntriesByEventId(eventId);
  }
  
  /**
   * Get Narrative Mirror observed balance for an account
   */
  async getObservedBalance(accountId: number): Promise<bigint> {
    return this.narrativeMirror.getObservedAccountBalance(accountId);
  }
}
