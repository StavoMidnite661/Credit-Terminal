/**
 * Oracle Ledger Bridge Service
 * 
 * This service provides the connection between Credit Terminal and Oracle Ledger.
 * It implements the IOracleLedgerBridge interface.
 * 
 * Credit Terminal uses this to record all financial events in the Oracle Ledger,
 * maintaining the single source of truth for all value movements.
 */

import type {
  IOracleLedgerBridge,
  CreateJournalEntryRequest,
  CreateJournalEntryResponse,
  JournalEntry,
  AnchorAuthorization,
  AnchorType,
} from '../shared/oracle-ledger-bridge';

import {
  createAnchorAuthorizationEntry,
  createAnchorFulfillmentEntry,
  createAnchorExpiryEntry,
  createAttestationEntry,
} from '../shared/oracle-ledger-bridge';

// =============================================================================
// CONFIGURATION
// =============================================================================

interface OracleLedgerConfig {
  baseUrl: string;
  apiKey?: string;
  timeout?: number;
}

const DEFAULT_CONFIG: OracleLedgerConfig = {
  baseUrl: process.env.ORACLE_LEDGER_URL || 'http://localhost:3001',
  apiKey: process.env.ORACLE_LEDGER_API_KEY,
  timeout: 30000,
};

// =============================================================================
// BRIDGE SERVICE IMPLEMENTATION
// =============================================================================

export class OracleLedgerBridgeService implements IOracleLedgerBridge {
  private config: OracleLedgerConfig;
  private journalIdCounter: number = 0;
  
  // In-memory storage for development (replace with actual API calls)
  private journalEntries: Map<string, JournalEntry> = new Map();
  private accountBalances: Map<number, number> = new Map();

  constructor(config: Partial<OracleLedgerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    // Initialize some default balances for development
    this.initializeDefaultBalances();
  }

  private initializeDefaultBalances(): void {
    // Set initial balances for key accounts (in cents)
    this.accountBalances.set(1000, 50000000);  // Cash-ODFI-LLC: $500,000
    this.accountBalances.set(1010, 25000000);  // Cash-Vault-USDC: $250,000
    this.accountBalances.set(1050, 0);         // ACH-Settlement
    this.accountBalances.set(1060, 0);         // Stripe-Clearing
    this.accountBalances.set(2500, 0);         // ANCHOR_GROCERY_OBLIGATION
    this.accountBalances.set(2501, 0);         // ANCHOR_UTILITY_OBLIGATION
    this.accountBalances.set(2502, 0);         // ANCHOR_FUEL_OBLIGATION
  }

  private generateJournalId(): string {
    this.journalIdCounter++;
    const timestamp = Date.now();
    return `JE-${timestamp}-${this.journalIdCounter.toString().padStart(4, '0')}`;
  }

  private getCurrentDate(): string {
    return new Date().toISOString().split('T')[0];
  }

  // ===========================================================================
  // JOURNAL ENTRY OPERATIONS
  // ===========================================================================

  async createJournalEntry(
    request: CreateJournalEntryRequest
  ): Promise<CreateJournalEntryResponse> {
    try {
      // Validate double-entry (debits must equal credits)
      const totalDebits = request.lines
        .filter(l => l.type === 'DEBIT')
        .reduce((sum, l) => sum + l.amount, 0);
      
      const totalCredits = request.lines
        .filter(l => l.type === 'CREDIT')
        .reduce((sum, l) => sum + l.amount, 0);

      if (totalDebits !== totalCredits) {
        return {
          success: false,
          error: `Journal entry does not balance: Debits=${totalDebits}, Credits=${totalCredits}`,
        };
      }

      // Create the journal entry
      const journalEntry: JournalEntry = {
        id: this.generateJournalId(),
        date: this.getCurrentDate(),
        description: request.description,
        lines: request.lines,
        source: request.source,
        status: request.status || 'Posted',
        txHash: request.txHash,
        blockNumber: request.blockNumber,
        eventId: request.eventId,
        attestationHash: request.attestationHash,
      };

      // Store the entry
      this.journalEntries.set(journalEntry.id, journalEntry);

      // Update account balances
      for (const line of journalEntry.lines) {
        const currentBalance = this.accountBalances.get(line.accountId) || 0;
        const adjustment = line.type === 'DEBIT' ? line.amount : -line.amount;
        this.accountBalances.set(line.accountId, currentBalance + adjustment);
      }

      console.log(`[OracleLedger] Created journal entry: ${journalEntry.id}`);
      console.log(`  Description: ${journalEntry.description}`);
      console.log(`  Source: ${journalEntry.source}`);
      console.log(`  Lines: ${journalEntry.lines.length}`);

      return {
        success: true,
        journalEntryId: journalEntry.id,
      };
    } catch (error) {
      console.error('[OracleLedger] Error creating journal entry:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async getJournalEntry(id: string): Promise<JournalEntry | null> {
    return this.journalEntries.get(id) || null;
  }

  async getJournalEntriesByEventId(eventId: string): Promise<JournalEntry[]> {
    const entries: JournalEntry[] = [];
    
    for (const entry of this.journalEntries.values()) {
      if (entry.eventId === eventId) {
        entries.push(entry);
      }
    }
    
    return entries;
  }

  // ===========================================================================
  // ACCOUNT OPERATIONS
  // ===========================================================================

  async getAccountBalance(accountId: number): Promise<number> {
    return this.accountBalances.get(accountId) || 0;
  }

  async getAccountBalances(accountIds: number[]): Promise<Record<number, number>> {
    const balances: Record<number, number> = {};
    
    for (const accountId of accountIds) {
      balances[accountId] = this.accountBalances.get(accountId) || 0;
    }
    
    return balances;
  }

  // ===========================================================================
  // ANCHOR OPERATIONS
  // ===========================================================================

  async recordAnchorAuthorization(
    auth: AnchorAuthorization
  ): Promise<CreateJournalEntryResponse> {
    console.log(`[OracleLedger] Recording anchor authorization: ${auth.eventId}`);
    console.log(`  User: ${auth.user}`);
    console.log(`  Type: ${auth.anchorType}`);
    console.log(`  Units: ${auth.units}`);

    const request = createAnchorAuthorizationEntry(auth);
    return this.createJournalEntry(request);
  }

  async recordAnchorFulfillment(
    eventId: string,
    anchorType: AnchorType,
    units: bigint,
    proofHash: string
  ): Promise<CreateJournalEntryResponse> {
    console.log(`[OracleLedger] Recording anchor fulfillment: ${eventId}`);
    console.log(`  Type: ${anchorType}`);
    console.log(`  Units: ${units}`);
    console.log(`  Proof: ${proofHash.substring(0, 16)}...`);

    const request = createAnchorFulfillmentEntry(eventId, anchorType, units, proofHash);
    return this.createJournalEntry(request);
  }

  async recordAnchorExpiry(
    eventId: string,
    anchorType: AnchorType,
    units: bigint,
    user: string
  ): Promise<CreateJournalEntryResponse> {
    console.log(`[OracleLedger] Recording anchor expiry: ${eventId}`);
    console.log(`  Type: ${anchorType}`);
    console.log(`  Units: ${units}`);
    console.log(`  User: ${user}`);

    const request = createAnchorExpiryEntry(eventId, anchorType, units, user);
    return this.createJournalEntry(request);
  }

  // ===========================================================================
  // ATTESTATION OPERATIONS
  // ===========================================================================

  async recordAttestationVerified(
    orderId: string,
    amount: number,
    recipient: string,
    attestor: string,
    txHash: string
  ): Promise<CreateJournalEntryResponse> {
    console.log(`[OracleLedger] Recording attestation: ${orderId}`);
    console.log(`  Amount: $${amount / 100}`);
    console.log(`  Recipient: ${recipient}`);
    console.log(`  Attestor: ${attestor}`);
    console.log(`  TxHash: ${txHash.substring(0, 16)}...`);

    const request = createAttestationEntry(orderId, amount, recipient, attestor, txHash);
    return this.createJournalEntry(request);
  }

  // ===========================================================================
  // HEALTH CHECK
  // ===========================================================================

  async ping(): Promise<boolean> {
    // In production, this would check connection to Oracle Ledger API
    return true;
  }

  // ===========================================================================
  // UTILITY METHODS
  // ===========================================================================

  /**
   * Get all journal entries (for debugging/monitoring)
   */
  getAllJournalEntries(): JournalEntry[] {
    return Array.from(this.journalEntries.values());
  }

  /**
   * Get summary of account balances (for debugging/monitoring)
   */
  getBalanceSummary(): Record<string, number> {
    const summary: Record<string, number> = {};
    
    for (const [accountId, balance] of this.accountBalances.entries()) {
      summary[`Account-${accountId}`] = balance;
    }
    
    return summary;
  }

  /**
   * Get pending anchor obligations across all types
   */
  async getPendingObligations(): Promise<Record<AnchorType, number>> {
    return {
      GROCERY: this.accountBalances.get(2500) || 0,
      UTILITY: this.accountBalances.get(2501) || 0,
      FUEL: this.accountBalances.get(2502) || 0,
      MOBILE: this.accountBalances.get(2503) || 0,
      HOUSING: this.accountBalances.get(2504) || 0,
      MEDICAL: this.accountBalances.get(2505) || 0,
    };
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

let bridgeInstance: OracleLedgerBridgeService | null = null;

export function getOracleLedgerBridge(
  config?: Partial<OracleLedgerConfig>
): OracleLedgerBridgeService {
  if (!bridgeInstance) {
    bridgeInstance = new OracleLedgerBridgeService(config);
  }
  return bridgeInstance;
}

export default OracleLedgerBridgeService;
