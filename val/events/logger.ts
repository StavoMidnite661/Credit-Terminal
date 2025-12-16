// Event Logger - Records all credit events to Oracle Ledger
// Provides audit trail and event history

import { CreditEvent, CreditEventType } from './types';
import { 
  getOracleLedgerBridge,
  OracleLedgerBridgeService 
} from '../core/oracle-ledger-bridge-service';
import type { 
  AnchorType,
  CreateJournalEntryRequest,
  JournalSource 
} from '../../shared/oracle-ledger-bridge';
import { ORACLE_ACCOUNTS } from '../../shared/oracle-ledger-bridge';

/**
 * Maps Credit Event types to Oracle Ledger journal sources
 */
const EVENT_TO_SOURCE: Record<CreditEventType, JournalSource> = {
  [CreditEventType.CREDIT_DEPOSITED]: 'CHAIN',
  [CreditEventType.VALUE_CREATED]: 'CHAIN',
  [CreditEventType.CREDIT_PROOF_ATTESTED]: 'ATTESTATION',
  [CreditEventType.ATTESTATION_VERIFIED]: 'ATTESTATION',
  [CreditEventType.CREDIT_UNLOCKED]: 'CHAIN',
  [CreditEventType.MERCHANT_VALUE_REQUESTED]: 'PAYMENT',
  [CreditEventType.MERCHANT_VALUE_ISSUED]: 'PAYMENT',
  [CreditEventType.GIFT_CARD_CREATED]: 'PURCHASE',
  [CreditEventType.SPEND_AUTHORIZED]: 'PAYMENT',
  [CreditEventType.SPEND_EXECUTED]: 'PAYMENT',
  [CreditEventType.SPEND_SETTLED]: 'PAYMENT',
  [CreditEventType.SPEND_FAILED]: 'PAYMENT',
  [CreditEventType.USER_REWARD_EARNED]: 'CHAIN',
  [CreditEventType.CASHBACK_ISSUED]: 'CHAIN',
  [CreditEventType.BALANCE_RECONCILED]: 'INTERCOMPANY',
  [CreditEventType.AUDIT_LOG_CREATED]: 'CHAIN',
};

export class EventLogger {
  private events: CreditEvent[] = [];
  private oracleBridge: OracleLedgerBridgeService;
  
  constructor() {
    this.oracleBridge = getOracleLedgerBridge();
  }
  
  /**
   * Log a credit event and record to Oracle Ledger
   */
  async log(event: CreditEvent): Promise<void> {
    console.log(`[EventLogger] ${event.type}: ${event.userId} - ${event.amount}`);
    
    // Store event locally
    this.events.push(event);
    
    // Create journal entry in Oracle Ledger
    const journalRequest = this.createJournalRequest(event);
    
    if (journalRequest) {
      const result = await this.oracleBridge.createJournalEntry(journalRequest);
      
      if (result.success) {
        console.log(`[EventLogger] Oracle Ledger journal created: ${result.journalEntryId}`);
      } else {
        console.error(`[EventLogger] Oracle Ledger journal failed: ${result.error}`);
      }
    }
  }
  
  /**
   * Create journal request from credit event
   */
  private createJournalRequest(event: CreditEvent): CreateJournalEntryRequest | null {
    const source = EVENT_TO_SOURCE[event.type];
    const amount = Number(event.amount);
    
    // Different event types create different journal entries
    switch (event.type) {
      case CreditEventType.CREDIT_DEPOSITED:
        // User deposits value
        // DR: Cash-Vault-USDC (asset increases)
        // CR: Token-Realization (income)
        return {
          description: `Credit deposited by ${event.userId}: ${amount / 100} USD`,
          source,
          status: 'Posted',
          lines: [
            { accountId: ORACLE_ACCOUNTS.CASH_VAULT_USDC, type: 'DEBIT', amount },
            { accountId: ORACLE_ACCOUNTS.TOKEN_REALIZATION, type: 'CREDIT', amount },
          ],
          eventId: event.id,
        };
        
      case CreditEventType.SPEND_AUTHORIZED:
        // Spend is authorized (hold placed)
        // No journal entry yet - just logging
        return {
          description: `Spend authorized for ${event.userId}: ${amount / 100} USD at ${event.metadata?.merchant}`,
          source,
          status: 'Pending',
          lines: [
            // Memo entry (zero-value for audit trail)
            { accountId: ORACLE_ACCOUNTS.CASH_VAULT_USDC, type: 'DEBIT', amount: 0 },
            { accountId: ORACLE_ACCOUNTS.CASH_VAULT_USDC, type: 'CREDIT', amount: 0 },
          ],
          eventId: event.id,
        };
        
      case CreditEventType.SPEND_EXECUTED:
        // Spend is executed
        // DR: Ops-Expense (expense increases)
        // CR: Cash-ODFI-LLC (cash decreases)
        return {
          description: `Spend executed for ${event.userId}: ${amount / 100} USD at ${event.metadata?.merchant}`,
          source,
          status: 'Posted',
          lines: [
            { accountId: ORACLE_ACCOUNTS.OPS_EXPENSE, type: 'DEBIT', amount },
            { accountId: ORACLE_ACCOUNTS.CASH_ODFI_LLC, type: 'CREDIT', amount },
          ],
          eventId: event.id,
        };
        
      case CreditEventType.SPEND_SETTLED:
        // Spend is settled (confirmed)
        // Confirmation only - no balance change
        return {
          description: `Spend settled for ${event.userId}: ${amount / 100} USD - Transaction ${event.metadata?.transactionId}`,
          source,
          status: 'Posted',
          lines: [
            // Memo entry (zero-value for audit trail)
            { accountId: ORACLE_ACCOUNTS.CASH_ODFI_LLC, type: 'DEBIT', amount: 0 },
            { accountId: ORACLE_ACCOUNTS.CASH_ODFI_LLC, type: 'CREDIT', amount: 0 },
          ],
          eventId: event.id,
        };
        
      case CreditEventType.SPEND_FAILED:
        // Spend failed - reversal or logging only
        return {
          description: `Spend failed for ${event.userId}: ${amount / 100} USD - ${event.metadata?.error}`,
          source,
          status: 'Posted',
          lines: [
            // Memo entry (zero-value for audit trail)
            { accountId: ORACLE_ACCOUNTS.OPS_EXPENSE, type: 'DEBIT', amount: 0 },
            { accountId: ORACLE_ACCOUNTS.OPS_EXPENSE, type: 'CREDIT', amount: 0 },
          ],
          eventId: event.id,
        };
        
      case CreditEventType.GIFT_CARD_CREATED:
        // Gift card purchased
        // DR: Purchase-Expense (expense)
        // CR: AP (we owe the gift card provider)
        return {
          description: `Gift card created for ${event.userId}: ${amount / 100} USD`,
          source,
          status: 'Posted',
          lines: [
            { accountId: ORACLE_ACCOUNTS.PURCHASE_EXPENSE, type: 'DEBIT', amount },
            { accountId: ORACLE_ACCOUNTS.AP, type: 'CREDIT', amount },
          ],
          eventId: event.id,
        };
        
      case CreditEventType.CASHBACK_ISSUED:
        // Cashback issued to user
        // DR: Ops-Expense (expense)
        // CR: Cash-Vault-USDC (user balance increases)
        return {
          description: `Cashback issued to ${event.userId}: ${amount / 100} USD`,
          source,
          status: 'Posted',
          lines: [
            { accountId: ORACLE_ACCOUNTS.OPS_EXPENSE, type: 'DEBIT', amount },
            { accountId: ORACLE_ACCOUNTS.CASH_VAULT_USDC, type: 'CREDIT', amount },
          ],
          eventId: event.id,
        };
        
      case CreditEventType.ATTESTATION_VERIFIED:
        // Attestation verified on-chain
        // No balance change - audit only
        return {
          description: `Attestation verified for event ${event.id}`,
          source,
          status: 'Posted',
          lines: [
            { accountId: ORACLE_ACCOUNTS.CASH_VAULT_USDC, type: 'DEBIT', amount: 0 },
            { accountId: ORACLE_ACCOUNTS.CASH_VAULT_USDC, type: 'CREDIT', amount: 0 },
          ],
          eventId: event.id,
          txHash: event.transactionHash,
          blockNumber: event.blockNumber,
        };
        
      default:
        // Other events - log only with memo entry
        return {
          description: `${event.type}: ${event.userId} - ${amount / 100} USD`,
          source,
          status: 'Posted',
          lines: [
            { accountId: ORACLE_ACCOUNTS.CASH_VAULT_USDC, type: 'DEBIT', amount: 0 },
            { accountId: ORACLE_ACCOUNTS.CASH_VAULT_USDC, type: 'CREDIT', amount: 0 },
          ],
          eventId: event.id,
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
   * Get Oracle Ledger journal entries for an event
   */
  async getJournalEntriesForEvent(eventId: string) {
    return this.oracleBridge.getJournalEntriesByEventId(eventId);
  }
  
  /**
   * Get Oracle Ledger balance for an account
   */
  async getOracleBalance(accountId: number): Promise<number> {
    return this.oracleBridge.getAccountBalance(accountId);
  }
}
