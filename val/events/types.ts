// Credit Event Type Definitions
// This defines all possible credit events in the SOVR value creation network

export enum CreditEventType {
    // === Deposit Events ===
    CREDIT_DEPOSITED = 'CREDIT_DEPOSITED',
    VALUE_CREATED = 'VALUE_CREATED',

    // === Attestation Events ===
    CREDIT_PROOF_ATTESTED = 'CREDIT_PROOF_ATTESTED',
    ATTESTATION_VERIFIED = 'ATTESTATION_VERIFIED',
    CREDIT_UNLOCKED = 'CREDIT_UNLOCKED',

    // === Merchant Events ===
    MERCHANT_VALUE_REQUESTED = 'MERCHANT_VALUE_REQUESTED',
    MERCHANT_VALUE_ISSUED = 'MERCHANT_VALUE_ISSUED',
    GIFT_CARD_CREATED = 'GIFT_CARD_CREATED',

    // === Spend Events ===
    SPEND_AUTHORIZED = 'SPEND_AUTHORIZED',
    SPEND_EXECUTED = 'SPEND_EXECUTED',
    SPEND_SETTLED = 'SPEND_SETTLED',
    SPEND_FAILED = 'SPEND_FAILED',

    // === Reward Events ===
    USER_REWARD_EARNED = 'USER_REWARD_EARNED',
    CASHBACK_ISSUED = 'CASHBACK_ISSUED',

    // === Reconciliation Events ===
    BALANCE_RECONCILED = 'BALANCE_RECONCILED',
    AUDIT_LOG_CREATED = 'AUDIT_LOG_CREATED'
}

export interface CreditEvent {
    id: string;
    type: CreditEventType;
    userId: string;
    amount: bigint;
    timestamp: Date;
    attestation?: Attestation;
    metadata: Record<string, any>;
    blockNumber?: number;
    transactionHash?: string;
}

export interface Attestation {
    id: string;
    eventId: string;
    signature: string;
    attestor: string;
    timestamp: Date;
    proof: AttestationProof;
    onChainHash?: string;
}

export interface AttestationProof {
    merkleRoot: string;
    merkleProof: string[];
    eventHash: string;
    nonce: string;
}

export interface CreditBalance {
    userId: string;
    available: bigint;
    pending: bigint;
    total: bigint;
    lastUpdated: Date;
}

export interface SpendParams {
    userId: string;
    merchant: MerchantType;
    amount: number;
    metadata: {
        email?: string;
        phone?: string;
        recipientId?: string;
    };
}

export interface SpendResult {
    success: boolean;
    transactionId: string;
    value: {
        type: 'gift_card' | 'virtual_card' | 'direct_credit' | 'voucher';
        code?: string;
        url?: string;
        balance?: number;
    };
    newBalance: bigint;
    attestation: Attestation;
}

export type MerchantType = 'square' | 'stripe' | 'coinbase' | 'visa' | 'tango' | 'instacart';
