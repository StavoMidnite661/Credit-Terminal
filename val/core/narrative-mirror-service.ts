/**
 * ⚠️ NARRATIVE MIRROR SERVICE - NOT A LEDGER ⚠️ (DOCTRINE ALIGNED)
 * 
 * AUTHORITY LEVEL: ZERO
 * 
 * This service is an OBSERVER ONLY. It records cleared events from TigerBeetle.
 * It has NO clearing authority. It CANNOT override mechanical truth.
 * 
 * HIERARCHY:
 * 1. TigerBeetle = SOLE CLEARING AUTHORITY (mechanical truth)
 * 2. This service = Narrative Mirror (observation only)
 */

import type {
  INarrativeMirror,
  RecordNarrativeEntryRequest,
  RecordNarrativeEntryResponse,
  NarrativeEntry,
  AnchorAuthorization,
  AnchorType,
  NarrativeStatus,
} from '../shared/narrative-mirror-bridge';

import {
  NARRATIVE_ACCOUNTS,
  createAnchorAuthorizationEntry,
  createAnchorFulfillmentEntry,
  createAnchorExpiryObservationEntry,
  createAttestationEntry,
} from '../shared/narrative-mirror-bridge';

// =============================================================================
// CONFIGURATION
// =============================================================================

interface NarrativeMirrorConfig {
  baseUrl: string;
  apiKey?: string;
  timeout?: number;
}

const DEFAULT_CONFIG: NarrativeMirrorConfig = {
  baseUrl: process.env.NARRATIVE_MIRROR_URL || 'http://localhost:3001',
  apiKey: process.env.NARRATIVE_MIRROR_API_KEY,
  timeout: 30000,
};

// =============================================================================
// NARRATIVE MIRROR IMPLEMENTATION (OBSERVER ONLY)
// =============================================================================

export class NarrativeMirrorService implements INarrativeMirror {
  private config: NarrativeMirrorConfig;
  private narrativeIdCounter: number = 0;
  
  // Narrative storage (observation records, NOT authoritative balances)
  private narrativeRecords: Map<string, NarrativeEntry> = new Map();
  private observedBalances: Map<number, bigint> = new Map();

  constructor(config: Partial<NarrativeMirrorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.initializeObservedBalances();
  }

  private initializeObservedBalances(): void {
    // These are OBSERVED values, not authoritative
    this.observedBalances.set(NARRATIVE_ACCOUNTS.HONORING_ADAPTER_ODFI, 5000000000n);
    this.observedBalances.set(NARRATIVE_ACCOUNTS.HONORING_ADAPTER_STABLECOIN, 2500000000n);
    this.observedBalances.set(NARRATIVE_ACCOUNTS.OBSERVED_ANCHOR_GROCERY_OBLIGATION, 0n);
  }

  private generateNarrativeId(): string {
    this.narrativeIdCounter++;
    return `NM-${Date.now()}-${this.narrativeIdCounter.toString().padStart(4, '0')}`;
  }

  // ===========================================================================
  // NARRATIVE RECORDING (OBSERVATION ONLY - NEVER AUTHORITATIVE)
  // ===========================================================================

  async recordNarrativeEntry(
    request: RecordNarrativeEntryRequest
  ): Promise<RecordNarrativeEntryResponse> {
    try {
      // Validate narrative consistency (debits must equal credits for double-entry recording)
      const totalDebits = request.lines
        .filter(l => l.type === 'DEBIT')
        .reduce((sum, l) => sum + l.amount, 0n);
      
      const totalCredits = request.lines
        .filter(l => l.type === 'CREDIT')
        .reduce((sum, l) => sum + l.amount, 0n);

      if (totalDebits !== totalCredits) {
        return {
          success: false,
          error: `Narrative record does not balance: Debits=${totalDebits}, Credits=${totalCredits}`,
        };
      }

      // Record the narrative entry observation
      const narrativeEntry: NarrativeEntry = {
        id: this.generateNarrativeId(),
        date: new Date().toISOString().split('T')[0],
        description: request.description,
        lines: request.lines,
        source: request.source,
        status: request.status || 'OBSERVED',
        txHash: request.txHash,
        blockNumber: request.blockNumber,
        eventId: request.eventId,
        attestationHash: request.attestationHash,
        userId: request.userId
      };

      this.narrativeRecords.set(narrativeEntry.id, narrativeEntry);

      // Update observed balances (NOT authoritative)
      for (const line of narrativeEntry.lines) {
        const observed = this.observedBalances.get(line.accountId) || 0n;
        const delta = line.type === 'DEBIT' ? line.amount : -line.amount;
        this.observedBalances.set(line.accountId, observed + delta);
      }

      console.log(`[NARRATIVE MIRROR] Recorded cleared event observation: ${narrativeEntry.id}`);

      return {
        success: true,
        narrativeEntryId: narrativeEntry.id,
      };
    } catch (error) {
      console.error('[NARRATIVE MIRROR] Error recording event observation:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async getNarrativeEntry(id: string): Promise<NarrativeEntry | null> {
    return this.narrativeRecords.get(id) || null;
  }

  async getNarrativeEntriesByEventId(eventId: string): Promise<NarrativeEntry[]> {
    return Array.from(this.narrativeRecords.values())
      .filter(entry => entry.eventId === eventId);
  }

  // ===========================================================================
  // OBSERVED BALANCE QUERIES (READ-ONLY)
  // ===========================================================================

  async getObservedAccountBalance(accountId: number): Promise<bigint> {
    return this.observedBalances.get(accountId) || 0n;
  }

  async getObservedAccountBalances(accountIds: number[]): Promise<Record<number, bigint>> {
    const balances: Record<number, bigint> = {};
    for (const id of accountIds) {
      balances[id] = this.observedBalances.get(id) || 0n;
    }
    return balances;
  }

  // ===========================================================================
  // ANCHOR OBSERVATION RECORDING
  // ===========================================================================

  async recordAnchorAuthorization(
    auth: AnchorAuthorization
  ): Promise<RecordNarrativeEntryResponse> {
    const request = createAnchorAuthorizationEntry(auth);
    return this.recordNarrativeEntry(request);
  }

  async recordAnchorFulfillment(
    eventId: string,
    anchorType: AnchorType,
    units: bigint,
    proofHash: string
  ): Promise<RecordNarrativeEntryResponse> {
    const request = createAnchorFulfillmentEntry(eventId, anchorType, units, proofHash);
    return this.recordNarrativeEntry(request);
  }

  async recordAnchorExpiry(
    eventId: string,
    anchorType: AnchorType,
    units: bigint,
    user: string
  ): Promise<RecordNarrativeEntryResponse> {
    const request = createAnchorExpiryObservationEntry(eventId, anchorType, units, user);
    return this.recordNarrativeEntry(request);
  }

  // ===========================================================================
  // ATTESTATION OBSERVATION RECORDING
  // ===========================================================================

  async recordAttestationVerified(
    orderId: string,
    amount: bigint,
    recipient: string,
    attestor: string,
    txHash: string
  ): Promise<RecordNarrativeEntryResponse> {
    const request = createAttestationEntry(orderId, amount, recipient, attestor, txHash);
    return this.recordNarrativeEntry(request);
  }

  async ping(): Promise<boolean> {
    return true;
  }

  async getPendingObligationObservations(): Promise<Record<string, bigint>> {
    return {
      GROCERY: this.observedBalances.get(NARRATIVE_ACCOUNTS.OBSERVED_ANCHOR_GROCERY_OBLIGATION) || 0n,
      UTILITY: this.observedBalances.get(NARRATIVE_ACCOUNTS.OBSERVED_ANCHOR_UTILITY_OBLIGATION) || 0n,
      FUEL: this.observedBalances.get(NARRATIVE_ACCOUNTS.OBSERVED_ANCHOR_FUEL_OBLIGATION) || 0n,
      MOBILE: this.observedBalances.get(NARRATIVE_ACCOUNTS.OBSERVED_ANCHOR_MOBILE_OBLIGATION) || 0n,
      HOUSING: this.observedBalances.get(NARRATIVE_ACCOUNTS.OBSERVED_ANCHOR_HOUSING_OBLIGATION) || 0n,
      MEDICAL: this.observedBalances.get(NARRATIVE_ACCOUNTS.OBSERVED_ANCHOR_MEDICAL_OBLIGATION) || 0n,
    };
  }
}

let mirrorInstance: NarrativeMirrorService | null = null;

export function getNarrativeMirror(
  config?: Partial<NarrativeMirrorConfig>
): NarrativeMirrorService {
  if (!mirrorInstance) {
    mirrorInstance = new NarrativeMirrorService(config);
  }
  return mirrorInstance;
}

// Legacy export for backward compatibility (Deprecated)
// We align legacy consumers to use the new service pattern
export function getOracleLedgerBridge(
  config?: Partial<NarrativeMirrorConfig>
): NarrativeMirrorService {
  return getNarrativeMirror(config);
}

export default NarrativeMirrorService;
