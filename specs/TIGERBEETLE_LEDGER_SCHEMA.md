# TigerBeetle Ledger Schema Specification

## Overview

TigerBeetle is the **single source of truth** for all value states in the Sovereign Stack.

**It is NOT:**
- A database
- A token ledger
- A money store

**It IS:**
- A clearing engine
- A double-entry accounting system
- An immutable state machine

---

## Core Principles

### TigerBeetle Has "Substance" When All Five Are True

1. **Finality** — Cannot be rolled back, rewritten, or "admin fixed"
2. **Deterministic Rules** — Rule-bound, reproducible, auditable
3. **Scarcity Enforcement** — Prevents double-spend, phantom balances, race conditions
4. **Independent Verification** — Others can verify state is real
5. **Redemption Path** — Path from ledger state → real-world action

### Ledger Rules (NEVER Violated)

```
✅ Double-entry (every debit has a credit)
✅ No negative balances
✅ No UPDATE operations (append-only)
✅ No DELETE operations
✅ All IDs monotonic and unique
✅ Idempotent transactions
✅ Deterministic replay
```

---

## Ledger ID Constants

Different assets live on different ledgers:

```typescript
export const LEDGER_IDS = {
  // Fiat currencies
  USD: 1,
  EUR: 2,
  GBP: 3,
  
  // Crypto assets
  ETH: 100,
  USDC: 101,
  USDT: 102,
  BTC: 103,
  
  // Platform tokens
  SOVR: 999,
  sFIAT: 998,
  
  // Anchor-specific (for tracking)
  GROCERY_OBLIGATION: 1001,
  UTILITY_OBLIGATION: 1002,
  FUEL_OBLIGATION: 1003,
} as const;
```

---

## Account Types

```typescript
export const ACCOUNT_CODES = {
  USER: 1,           // End-user wallet
  MERCHANT: 2,       // Business receiving payment
  TREASURY: 3,       // Root treasury (minting source)
  ESCROW: 4,         // Locked funds for contracts
  FEE_POOL: 5,       // Protocol fees
  ANCHOR: 6,         // Anchor obligation account
  SYSTEM_BUFFER: 7,  // Temporary holding during auth
} as const;
```

---

## Transfer Codes

```typescript
export const TRANSFER_CODES = {
  // Basic operations
  DEPOSIT: 1,
  WITHDRAWAL: 2,
  PAYMENT: 3,
  REFUND: 4,
  FEE: 5,
  
  // Anchor operations
  ANCHOR_AUTHORIZATION: 10,
  ANCHOR_FULFILLMENT: 11,
  ANCHOR_EXPIRY: 12,
  
  // Escrow operations
  ESCROW_LOCK: 20,
  ESCROW_RELEASE: 21,
  ESCROW_VOID: 22,
  
  // Settlement
  SETTLEMENT: 30,
  SETTLEMENT_REVERSAL: 31,
} as const;
```

---

## Account Schema

### TigerBeetle Native Account Structure

```typescript
interface TigerBeetleAccount {
  // 128-bit unique identifier
  id: bigint;
  
  // User data (can store external reference as hash)
  user_data_128: bigint;  // e.g., hash of userId
  user_data_64: bigint;
  user_data_32: number;
  
  // Reserved (set to 0)
  reserved: bigint;
  
  // Ledger and code
  ledger: number;   // From LEDGER_IDS
  code: number;     // From ACCOUNT_CODES
  
  // Flags
  flags: number;
  
  // Balances (managed by TigerBeetle)
  debits_pending: bigint;
  debits_posted: bigint;
  credits_pending: bigint;
  credits_posted: bigint;
  
  // Timestamp (managed by TigerBeetle)
  timestamp: bigint;
}
```

### Account Mapping Registry (PostgreSQL)

```sql
CREATE TABLE tigerbeetle_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tigerbeetle_id TEXT NOT NULL UNIQUE,  -- 128-bit as hex string
  
  -- Classification
  account_type TEXT NOT NULL,  -- 'user', 'merchant', 'treasury', 'escrow', 'anchor'
  owner_id TEXT,               -- References users.id if applicable
  
  -- TigerBeetle config
  ledger INTEGER NOT NULL,
  code INTEGER NOT NULL,
  
  -- Metadata
  name TEXT,
  status TEXT NOT NULL DEFAULT 'active',  -- 'active', 'frozen', 'closed'
  metadata JSONB,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_tb_accounts_owner ON tigerbeetle_accounts(owner_id);
CREATE INDEX idx_tb_accounts_type ON tigerbeetle_accounts(account_type);
CREATE INDEX idx_tb_accounts_ledger ON tigerbeetle_accounts(ledger);
```

---

## Transfer Schema

### TigerBeetle Native Transfer Structure

```typescript
interface TigerBeetleTransfer {
  // 128-bit unique identifier
  id: bigint;
  
  // Account references
  debit_account_id: bigint;
  credit_account_id: bigint;
  
  // Amount (in smallest unit)
  amount: bigint;
  
  // For two-phase commits
  pending_id: bigint;
  
  // User data
  user_data_128: bigint;  // e.g., hash of eventId
  user_data_64: bigint;
  user_data_32: number;
  
  // Timeout (for pending transfers)
  timeout: number;
  
  // Ledger and code
  ledger: number;
  code: number;
  
  // Flags
  flags: number;
  
  // Timestamp (managed by TigerBeetle)
  timestamp: bigint;
}
```

### Transfer Audit Log (PostgreSQL)

```sql
CREATE TABLE tigerbeetle_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tigerbeetle_transfer_id TEXT NOT NULL UNIQUE,
  
  -- Transfer details
  debit_account_id TEXT NOT NULL,
  credit_account_id TEXT NOT NULL,
  amount TEXT NOT NULL,  -- BigInt as string
  ledger INTEGER NOT NULL,
  code INTEGER NOT NULL,
  
  -- Status tracking
  status TEXT NOT NULL,  -- 'pending', 'posted', 'voided'
  pending_id TEXT,       -- For two-phase commits
  
  -- Cross-references
  related_payment_id TEXT,
  related_event_id TEXT,
  blockchain_tx_hash TEXT,
  
  -- Metadata
  metadata JSONB,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  posted_at TIMESTAMP WITH TIME ZONE,
  voided_at TIMESTAMP WITH TIME ZONE
);

-- Indexes
CREATE INDEX idx_tb_transfers_debit ON tigerbeetle_transfers(debit_account_id);
CREATE INDEX idx_tb_transfers_credit ON tigerbeetle_transfers(credit_account_id);
CREATE INDEX idx_tb_transfers_status ON tigerbeetle_transfers(status);
CREATE INDEX idx_tb_transfers_event ON tigerbeetle_transfers(related_event_id);
```

---

## Core Account Structure

```
┌─────────────────────────────────────────────────────────────────┐
│                         TREASURY                                 │
│                    (Root Minting Source)                        │
│                                                                  │
│  Ledger: SOVR (999)                                             │
│  Code: TREASURY (3)                                             │
│  Purpose: All value originates here                             │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                       USER ACCOUNTS                              │
│                                                                  │
│  Ledger: SOVR (999)                                             │
│  Code: USER (1)                                                 │
│  Purpose: Hold user spending power                              │
└──────────────────┬──────────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────────┐
│                      SYSTEM BUFFER                               │
│                                                                  │
│  Ledger: SOVR (999)                                             │
│  Code: SYSTEM_BUFFER (7)                                        │
│  Purpose: Temporary hold during authorization                   │
└──────────────────┬──────────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────────┐
│                   ANCHOR CLEARING ACCOUNTS                       │
│                                                                  │
│  - GROCERY_ANCHOR (Ledger: 1001)                                │
│  - UTILITY_ANCHOR (Ledger: 1002)                                │
│  - FUEL_ANCHOR (Ledger: 1003)                                   │
│                                                                  │
│  Code: ANCHOR (6)                                               │
│  Purpose: Track pending obligations per anchor type             │
└─────────────────────────────────────────────────────────────────┘
```

---

## Transfer Flows

### 1. Authorization (User → System Buffer)

When user initiates a spend:

```typescript
// User requests 100 units for groceries
const authTransfer = {
  id: generateId(),
  debit_account_id: userAccountId,
  credit_account_id: systemBufferId,
  amount: 100n,
  ledger: LEDGER_IDS.SOVR,
  code: TRANSFER_CODES.ANCHOR_AUTHORIZATION,
  user_data_128: hashEventId(eventId),
  flags: 0
};

await tbClient.createTransfers([authTransfer]);
```

### 2. Anchor Claim (System Buffer → Anchor Account)

After authorization is locked:

```typescript
// Move to anchor obligation
const claimTransfer = {
  id: generateId(),
  debit_account_id: systemBufferId,
  credit_account_id: groceryAnchorId,
  amount: 100n,
  ledger: LEDGER_IDS.SOVR,
  code: TRANSFER_CODES.ANCHOR_AUTHORIZATION,
  user_data_128: hashEventId(eventId),
  flags: 0
};

await tbClient.createTransfers([claimTransfer]);
```

### 3. Fulfillment (Anchor Account → Burn/System)

After real-world delivery confirmed:

```typescript
// Clear the obligation
const fulfillTransfer = {
  id: generateId(),
  debit_account_id: groceryAnchorId,
  credit_account_id: systemTreasuryId,  // Returns to treasury as "spent"
  amount: 100n,
  ledger: LEDGER_IDS.SOVR,
  code: TRANSFER_CODES.ANCHOR_FULFILLMENT,
  user_data_128: hashFulfillmentProof(proof),
  flags: 0
};

await tbClient.createTransfers([fulfillTransfer]);
```

### 4. Expiry (System Buffer → User)

If authorization expires without fulfillment:

```typescript
// Return units to user
const expiryTransfer = {
  id: generateId(),
  debit_account_id: systemBufferId,
  credit_account_id: userAccountId,
  amount: 100n,
  ledger: LEDGER_IDS.SOVR,
  code: TRANSFER_CODES.ANCHOR_EXPIRY,
  user_data_128: hashEventId(eventId),
  flags: 0
};

await tbClient.createTransfers([expiryTransfer]);
```

---

## Two-Phase Commits (For Escrow)

TigerBeetle supports pending transfers for atomic operations:

```typescript
// Phase 1: Create pending transfer (locks funds)
const pendingTransfer = {
  id: generateId(),
  debit_account_id: buyerAccountId,
  credit_account_id: escrowAccountId,
  amount: 1000n,
  ledger: LEDGER_IDS.SOVR,
  code: TRANSFER_CODES.ESCROW_LOCK,
  flags: AccountFlags.pending,
  timeout: 3600  // 1 hour
};

await tbClient.createTransfers([pendingTransfer]);

// Phase 2a: Post the transfer (finalize)
const postTransfer = {
  id: generateId(),
  pending_id: pendingTransfer.id,
  flags: AccountFlags.post_pending_transfer
};

// Phase 2b: Void the transfer (cancel)
const voidTransfer = {
  id: generateId(),
  pending_id: pendingTransfer.id,
  flags: AccountFlags.void_pending_transfer
};
```

---

## TypeScript Client Wrapper

```typescript
import { createClient, Account, Transfer, AccountFlags, TransferFlags } from 'tigerbeetle-node';

export class SovereignLedger {
  private client: ReturnType<typeof createClient>;
  
  constructor() {
    this.client = createClient({
      cluster_id: BigInt(process.env.TIGERBEETLE_CLUSTER_ID || 0),
      replica_addresses: (process.env.TIGERBEETLE_ADDRESSES || '127.0.0.1:3000').split(',')
    });
  }
  
  // =========================================================================
  // ACCOUNT OPERATIONS
  // =========================================================================
  
  async createUserAccount(userId: string): Promise<bigint> {
    const accountId = this.generateAccountId();
    
    await this.client.createAccounts([{
      id: accountId,
      user_data_128: this.hashToU128(userId),
      user_data_64: 0n,
      user_data_32: 0,
      reserved: 0n,
      ledger: LEDGER_IDS.SOVR,
      code: ACCOUNT_CODES.USER,
      flags: 0,
      debits_pending: 0n,
      debits_posted: 0n,
      credits_pending: 0n,
      credits_posted: 0n,
      timestamp: 0n
    }]);
    
    return accountId;
  }
  
  async getBalance(accountId: bigint): Promise<{ available: bigint; pending: bigint }> {
    const accounts = await this.client.lookupAccounts([accountId]);
    
    if (accounts.length === 0) {
      throw new Error('Account not found');
    }
    
    const account = accounts[0];
    const available = account.credits_posted - account.debits_posted;
    const pending = account.credits_pending - account.debits_pending;
    
    return { available, pending };
  }
  
  // =========================================================================
  // ANCHOR OPERATIONS
  // =========================================================================
  
  async authorizeAnchorSpend(
    userAccountId: bigint,
    anchorAccountId: bigint,
    units: bigint,
    eventId: string
  ): Promise<bigint> {
    const transferId = this.generateTransferId();
    
    await this.client.createTransfers([{
      id: transferId,
      debit_account_id: userAccountId,
      credit_account_id: anchorAccountId,
      amount: units,
      pending_id: 0n,
      user_data_128: this.hashToU128(eventId),
      user_data_64: 0n,
      user_data_32: 0,
      timeout: 0,
      ledger: LEDGER_IDS.SOVR,
      code: TRANSFER_CODES.ANCHOR_AUTHORIZATION,
      flags: 0,
      timestamp: 0n
    }]);
    
    return transferId;
  }
  
  async fulfillAnchorSpend(
    anchorAccountId: bigint,
    treasuryAccountId: bigint,
    units: bigint,
    proof: string
  ): Promise<bigint> {
    const transferId = this.generateTransferId();
    
    await this.client.createTransfers([{
      id: transferId,
      debit_account_id: anchorAccountId,
      credit_account_id: treasuryAccountId,
      amount: units,
      pending_id: 0n,
      user_data_128: this.hashToU128(proof),
      user_data_64: 0n,
      user_data_32: 0,
      timeout: 0,
      ledger: LEDGER_IDS.SOVR,
      code: TRANSFER_CODES.ANCHOR_FULFILLMENT,
      flags: 0,
      timestamp: 0n
    }]);
    
    return transferId;
  }
  
  // =========================================================================
  // HELPERS
  // =========================================================================
  
  private generateAccountId(): bigint {
    return BigInt('0x' + crypto.randomUUID().replace(/-/g, ''));
  }
  
  private generateTransferId(): bigint {
    return BigInt('0x' + crypto.randomUUID().replace(/-/g, ''));
  }
  
  private hashToU128(input: string): bigint {
    const hash = crypto.createHash('md5').update(input).digest('hex');
    return BigInt('0x' + hash);
  }
}

export const ledger = new SovereignLedger();
```

---

## Invariants Checklist

Before any transfer, verify:

- [ ] Source account has sufficient balance
- [ ] Target account exists and is active
- [ ] Transfer amount > 0
- [ ] Ledger IDs match between accounts
- [ ] No duplicate transfer IDs
- [ ] Authorization hasn't expired
- [ ] Attestation signature is valid

---

*TigerBeetle Ledger Schema v1.0 — December 2024*
