/**
 * Narrative Mirror Bridge - Shared Types and Helpers (DOCTRINE ALIGNED)
 * 
 * Defines the common data structures used by services interacting with 
 * the Narrative Mirror observer layer. Strictly follows SOVR Sovereign Doctrine.
 * 
 * "Truth is mechanical, not narrative."
 * "No reversals. No payments. No manual edits."
 */

export enum AccountType {
  Asset = 'Asset',
  Liability = 'Liability',
  Equity = 'Equity',
  Income = 'Income',
  Expense = 'Expense',
}

export type NarrativeStatus = 'OBSERVED' | 'RECORDED' | 'FAILED' | 'IGNORED';

export interface NarrativeEntryLine {
  accountId: number;
  type: 'DEBIT' | 'CREDIT';
  amount: bigint;
  description?: string;
}

export interface NarrativeEntry {
  id: string;
  date: string;
  description: string;
  lines: NarrativeEntryLine[];
  source: string;
  status: NarrativeStatus;
  txHash?: string;
  blockNumber?: number;
  eventId?: string;
  attestationHash?: string;
  userId?: string;
}

export type NarrativeSource = 
  | 'CLEARING_OBSERVATION' 
  | 'ATTESTATION' 
  | 'HONORING_ATTEMPT' 
  | 'HONORING_RESULT' 
  | 'INTERSYSTEM';

export interface RecordNarrativeEntryRequest {
  description: string;
  lines: NarrativeEntryLine[];
  source: NarrativeSource | string;
  status?: NarrativeStatus;
  txHash?: string;
  blockNumber?: number;
  eventId?: string;
  attestationHash?: string;
  userId?: string;
}

export interface RecordNarrativeEntryResponse {
  success: boolean;
  narrativeEntryId?: string;
  error?: string;
}

export type AnchorType = 'GROCERY' | 'UTILITY' | 'FUEL' | 'MOBILE' | 'HOUSING' | 'MEDICAL';

export interface AnchorAuthorization {
  eventId: string;
  user: string;
  anchorType: AnchorType;
  units: bigint;
  expiry: number;
}

export interface INarrativeMirror {
  recordNarrativeEntry(request: RecordNarrativeEntryRequest): Promise<RecordNarrativeEntryResponse>;
  getNarrativeEntry(id: string): Promise<NarrativeEntry | null>;
  getNarrativeEntriesByEventId(eventId: string): Promise<NarrativeEntry[]>;
  getObservedAccountBalance(accountId: number): Promise<bigint>;
  getObservedAccountBalances(accountIds: number[]): Promise<Record<number, bigint>>;
  recordAnchorAuthorization(auth: AnchorAuthorization): Promise<RecordNarrativeEntryResponse>;
  recordAnchorFulfillment(eventId: string, anchorType: AnchorType, units: bigint, proofHash: string): Promise<RecordNarrativeEntryResponse>;
  recordAnchorExpiry(eventId: string, anchorType: AnchorType, units: bigint, user: string): Promise<RecordNarrativeEntryResponse>;
  recordAttestationVerified(orderId: string, amount: bigint, recipient: string, attestor: string, txHash: string): Promise<RecordNarrativeEntryResponse>;
  ping(): Promise<boolean>;
  getPendingObligationObservations(): Promise<Record<string, bigint>>;
}

/**
 * Account ID constants for Narrative Mirror (DOCTRINE ALIGNED)
 * Re-framed to avoid authority/custody leakage.
 */
export const NARRATIVE_ACCOUNTS = {
  // Observed State (Narrative Mirror of TigerBeetle)
  HONORING_ADAPTER_ODFI: 1000,
  HONORING_ADAPTER_STABLECOIN: 1010,
  HONORING_ADAPTER_ACH: 1050,
  HONORING_ADAPTER_CARD: 1060,
  
  // Obligations (Observed Liabilities)
  OBSERVED_AP: 2000,
  OBSERVED_ANCHOR_GROCERY_OBLIGATION: 2500,
  OBSERVED_ANCHOR_UTILITY_OBLIGATION: 2501,
  OBSERVED_ANCHOR_FUEL_OBLIGATION: 2502,
  OBSERVED_ANCHOR_MOBILE_OBLIGATION: 2503,
  OBSERVED_ANCHOR_HOUSING_OBLIGATION: 2504,
  OBSERVED_ANCHOR_MEDICAL_OBLIGATION: 2505,

  // Authorization Memos (Non-Obligation Shadow Accounts)
  ANCHOR_GROCERY_AUTHORIZATION_MEMO: 3500,
  ANCHOR_UTILITY_AUTHORIZATION_MEMO: 3501,
  ANCHOR_FUEL_AUTHORIZATION_MEMO: 3502,
  ANCHOR_MOBILE_AUTHORIZATION_MEMO: 3503,
  ANCHOR_HOUSING_AUTHORIZATION_MEMO: 3504,
  ANCHOR_MEDICAL_AUTHORIZATION_MEMO: 3505,
  
  // Equity / Income Observations
  OBSERVED_TOKEN_REALIZATION: 4000,

  // Operational Expenditure Observations
  OBSERVED_OPS_EXPENSE: 6000,
  OBSERVED_PURCHASE_EXPENSE: 6100,
  OBSERVED_ANCHOR_FULFILLMENT_EXPENSE: 6300,
} as const;

// Legacy support reference (for gradual migration if needed, but we prefer hard cut)
export const ORACLE_ACCOUNTS = NARRATIVE_ACCOUNTS;

// =============================================================================
// HELPER FUNCTIONS (DOCTRINE ALIGNED)
// =============================================================================

/**
 * Records an authorization attempt. 
 * Note: Does NOT touch obligation accounts. Clearing precedes existence.
 */
export function createAnchorAuthorizationEntry(auth: AnchorAuthorization): RecordNarrativeEntryRequest {
  const memoAccountId = getAnchorMemoAccount(auth.anchorType);
  return {
    description: `Authorization Intent: ${auth.anchorType} for ${auth.user} (${auth.units} units)`,
    source: 'HONORING_ATTEMPT',
    status: 'OBSERVED',
    lines: [
      // Memo-only: Records intent in shadow accounts
      { accountId: NARRATIVE_ACCOUNTS.OBSERVED_OPS_EXPENSE, type: 'DEBIT', amount: auth.units, description: `Authorization intent registered` },
      { accountId: memoAccountId, type: 'CREDIT', amount: auth.units, description: `Authorization memo created` },
    ],
    eventId: auth.eventId,
    userId: auth.user
  };
}

/**
 * Records the observation of a fulfilled obligation.
 */
export function createAnchorFulfillmentEntry(
  eventId: string, 
  anchorType: AnchorType, 
  units: bigint, 
  proofHash: string
): RecordNarrativeEntryRequest {
  const obligationAccountId = getAnchorObligationAccount(anchorType);
  return {
    description: `Fulfillment Observation: ${anchorType} - ${eventId}`,
    source: 'HONORING_RESULT',
    status: 'RECORDED',
    lines: [
      // Observation: DR Observed Obligation -> CR Adapter/AP
      { accountId: obligationAccountId, type: 'DEBIT', amount: units, description: `Obligation fulfillment observed` },
      { accountId: NARRATIVE_ACCOUNTS.HONORING_ADAPTER_ODFI, type: 'CREDIT', amount: units, description: `Honoring adapter settlement` },
    ],
    eventId: eventId,
    attestationHash: proofHash
  };
}

/**
 * Records the observation of an expired authorization.
 * Note: Additive, not a reversal.
 */
export function createAnchorExpiryObservationEntry(
  eventId: string, 
  anchorType: AnchorType, 
  units: bigint, 
  user: string
): RecordNarrativeEntryRequest {
  const memoAccountId = getAnchorMemoAccount(anchorType);
  return {
    description: `Authorization Expiry Observation: ${anchorType} - ${eventId}`,
    source: 'CLEARING_OBSERVATION',
    status: 'RECORDED',
    lines: [
      // Additive observation of expiry in memo accounts
      { accountId: memoAccountId, type: 'DEBIT', amount: units, description: `Authorization window closed` },
      { accountId: NARRATIVE_ACCOUNTS.OBSERVED_OPS_EXPENSE, type: 'CREDIT', amount: units, description: `Memo record adjustment` },
    ],
    eventId: eventId,
    userId: user
  };
}

/**
 * Records the observation of a verified attestation.
 */
export function createAttestationEntry(
  orderId: string, 
  amount: bigint, 
  recipient: string, 
  attestor: string, 
  txHash: string
): RecordNarrativeEntryRequest {
  return {
    description: `Attestation Verification Observed: ${orderId} for ${recipient}`,
    source: 'ATTESTATION',
    status: 'RECORDED',
    lines: [
      // Memo entry for audit trail
      { accountId: NARRATIVE_ACCOUNTS.HONORING_ADAPTER_STABLECOIN, type: 'DEBIT', amount: 0n, description: `Attestor: ${attestor}` },
      { accountId: NARRATIVE_ACCOUNTS.HONORING_ADAPTER_STABLECOIN, type: 'CREDIT', amount: 0n, description: `Tx: ${txHash}` },
    ],
    eventId: orderId,
    txHash: txHash
  };
}

function getAnchorObligationAccount(type: AnchorType): number {
  switch (type) {
    case 'GROCERY': return NARRATIVE_ACCOUNTS.OBSERVED_ANCHOR_GROCERY_OBLIGATION;
    case 'UTILITY': return NARRATIVE_ACCOUNTS.OBSERVED_ANCHOR_UTILITY_OBLIGATION;
    case 'FUEL': return NARRATIVE_ACCOUNTS.OBSERVED_ANCHOR_FUEL_OBLIGATION;
    case 'MOBILE': return NARRATIVE_ACCOUNTS.OBSERVED_ANCHOR_MOBILE_OBLIGATION;
    case 'HOUSING': return NARRATIVE_ACCOUNTS.OBSERVED_ANCHOR_HOUSING_OBLIGATION;
    case 'MEDICAL': return NARRATIVE_ACCOUNTS.OBSERVED_ANCHOR_MEDICAL_OBLIGATION;
    default: return NARRATIVE_ACCOUNTS.OBSERVED_ANCHOR_GROCERY_OBLIGATION;
  }
}

function getAnchorMemoAccount(type: AnchorType): number {
  switch (type) {
    case 'GROCERY': return NARRATIVE_ACCOUNTS.ANCHOR_GROCERY_AUTHORIZATION_MEMO;
    case 'UTILITY': return NARRATIVE_ACCOUNTS.ANCHOR_UTILITY_AUTHORIZATION_MEMO;
    case 'FUEL': return NARRATIVE_ACCOUNTS.ANCHOR_FUEL_AUTHORIZATION_MEMO;
    case 'MOBILE': return NARRATIVE_ACCOUNTS.ANCHOR_MOBILE_AUTHORIZATION_MEMO;
    case 'HOUSING': return NARRATIVE_ACCOUNTS.ANCHOR_HOUSING_AUTHORIZATION_MEMO;
    case 'MEDICAL': return NARRATIVE_ACCOUNTS.ANCHOR_MEDICAL_AUTHORIZATION_MEMO;
    default: return NARRATIVE_ACCOUNTS.ANCHOR_GROCERY_AUTHORIZATION_MEMO;
  }
}
