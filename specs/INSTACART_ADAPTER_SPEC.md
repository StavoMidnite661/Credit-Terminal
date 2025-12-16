# Instacart Adapter Specification

## Overview

The Instacart Adapter is a **zero-fiat-float fulfillment executor** that converts ledger authorizations into real-world grocery deliveries.

**It is NOT:**
- A payment processor
- A money transmitter
- A custody solution

**It IS:**
- A fulfillment executor
- A bridge between ledger state and real-world action

---

## Adapter Definition

```json
{
  "adapterName": "InstacartZeroFloatAdapter",
  "version": "1.0.0",
  "description": "Converts ledger authorizations into Instacart grocery fulfillment without pre-funded fiat.",
  "anchorType": "GROCERY",
  "zeroFloat": true
}
```

---

## Input Schema

```typescript
interface AdapterInput {
  // Anchor authorization event
  eventId: string;              // bytes32 hex from Anchor contract
  anchorType: 'GROCERY';
  units: bigint;                // Internal ledger units
  
  // User context
  userId: string;
  deliveryAddress: string;
  
  // Attestation (from Credit Terminal)
  attestationSignature: string; // EIP-712 signed proof
  attestorAddress: string;
  nonce: bigint;
  expiry: number;
}
```

---

## Output Schema

```typescript
interface AdapterOutput {
  // Fulfillment proof
  fulfillmentProof: string;     // Hash of delivery confirmation
  
  // Instacart specifics
  instacartOrderId?: string;    // If direct API
  giftCardCode?: string;        // If gift card route
  
  // Status
  status: 'FULFILLED' | 'FAILED' | 'PENDING';
  timestamp: string;
  
  // Error handling
  errorCode?: string;
  errorMessage?: string;
}
```

---

## Fulfillment Routes (Ranked by Preference)

### Route A: Official Gift Card API / Bulk Partner (Preferred)

```
┌─────────────────────────────────────────────────────────────┐
│                    CORPORATE GIFT CARD API                   │
│                                                              │
│  Providers:                                                  │
│  - Tango Card (https://www.tangocard.com)                   │
│  - Blackhawk Network                                         │
│  - InComm                                                    │
│  - Raise B2B                                                 │
│                                                              │
│  Benefits:                                                   │
│  ✅ On-demand issuance                                       │
│  ✅ Exact denomination                                       │
│  ✅ Net-settled (daily/weekly)                              │
│  ✅ No float required                                        │
└─────────────────────────────────────────────────────────────┘
```

**Settlement Model:**
- Cards issued per-authorization
- Settlement netted at end of billing cycle
- You pay only for what was actually fulfilled

### Route B: Third-Party Gift Card Aggregator

If direct partnership unavailable:

| Provider | API | Settlement |
|----------|-----|------------|
| Tango | REST API | Net-30 |
| Blackhawk | SOAP/REST | Weekly |
| InComm | REST | Real-time to Net-7 |
| Raise B2B | REST | Daily |

### Route C: Direct Instacart Credits (Future)

When Instacart offers direct credit API (currently limited):
- Apply credits directly to user's Instacart account
- No gift card intermediary
- Real-time fulfillment

---

## Execution Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    STEP 1: RECEIVE EVENT                         │
│                                                                  │
│   Listen for: AnchorAuthorizationCreated(eventId)               │
│   Source: Anchor Contract / Event Bus                           │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                    STEP 2: VALIDATE ATTESTATION                  │
│                                                                  │
│   - Verify EIP-712 signature                                    │
│   - Check attestor is authorized                                │
│   - Verify nonce hasn't been used                               │
│   - Check expiry hasn't passed                                  │
│   - Confirm eventId matches authorization                       │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                    STEP 3: MAP UNITS TO VALUE                    │
│                                                                  │
│   units -> fulfillment value                                    │
│                                                                  │
│   Example:                                                       │
│   100 units = $100 grocery credit                               │
│   (1 unit = $1, no exchange rate, no pricing)                  │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                    STEP 4: CALL FULFILLMENT API                  │
│                                                                  │
│   POST /api/giftcards/issue                                     │
│   {                                                              │
│     "brand": "INSTACART",                                       │
│     "amount": 100.00,                                           │
│     "currency": "USD",                                          │
│     "delivery": "EMAIL" | "DIRECT"                              │
│   }                                                              │
└───────────────────────────┬─────────────────────────────────────┘
                            │
            ┌───────────────┴───────────────┐
            │                               │
            ▼                               ▼
┌─────────────────────┐         ┌─────────────────────┐
│   SUCCESS           │         │   FAILURE           │
│                     │         │                     │
│ - Receive code      │         │ - Log error         │
│ - Generate proof    │         │ - DO NOT retry      │
│ - Call fulfill()    │         │ - Halt anchor       │
│ - Deliver to user   │         │ - Alert operators   │
└─────────────────────┘         └─────────────────────┘
```

---

## API Integration Example

### Tango Card API Call

```typescript
async function issueInstacartGiftCard(units: bigint): Promise<GiftCardResult> {
  const amount = Number(units); // 1 unit = $1
  
  const response = await fetch('https://api.tangocard.com/v2/orders', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${TANGO_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      accountIdentifier: TANGO_ACCOUNT_ID,
      amount: amount,
      campaign: 'SOVR_GROCERY',
      emailSubject: 'Your Instacart Grocery Credit',
      externalRefID: eventId,
      message: 'Grocery credit from SOVR',
      recipient: {
        email: userEmail,
        firstName: userName
      },
      reward: {
        brandName: 'Instacart',
        utid: 'U123456'  // Instacart UTID
      },
      sendEmail: true
    })
  });
  
  const result = await response.json();
  
  return {
    success: response.ok,
    giftCardCode: result.reward?.credentials?.pin,
    orderId: result.referenceOrderID,
    proofHash: hashProof(result)
  };
}
```

---

## Proof Generation

```typescript
function generateFulfillmentProof(result: GiftCardResult): string {
  const proofData = {
    eventId,
    orderId: result.orderId,
    giftCardCode: result.giftCardCode,
    amount: result.amount,
    timestamp: Date.now(),
    providerName: 'TANGO_INSTACART'
  };
  
  // Hash the proof for on-chain storage
  return ethers.utils.keccak256(
    ethers.utils.toUtf8Bytes(JSON.stringify(proofData))
  );
}
```

---

## Error Handling

### Failure Modes

| Error | Action | Anchor State |
|-------|--------|--------------|
| API Timeout | Log, do NOT retry | PENDING |
| Insufficient Provider Balance | Halt anchor | PAUSED |
| Invalid Authorization | Reject silently | UNCHANGED |
| Rate Limit | Queue, retry after cooldown | PENDING |
| Network Error | Log, single retry | PENDING → FAILED |

### Critical Rule

> **If fulfillment fails, the adapter does NOT retry blindly.**
> 
> The anchor halts automatically to protect ledger credibility.

---

## Zero-Float Mechanics

### Why No Pre-Funding Required

1. **Gift cards are inventory obligations**, not money
2. **Settlement is net-based** — you pay only for fulfilled orders
3. **Credit terms exist** — providers extend short-term credit
4. **Volume unlocks terms** — higher volume = better settlement windows

### Settlement Timeline

```
Day 1-7:   Issue gift cards per-authorization
Day 7:     Provider sends invoice for net fulfilled amount
Day 14:    Settlement via ACH (or sponsor funds)
```

**You never pre-fund.** You settle what was actually delivered.

---

## Security Considerations

### Attestation Verification (Critical)

```typescript
function verifyAttestation(input: AdapterInput): boolean {
  // 1. Recover signer from EIP-712 signature
  const signer = ethers.utils.verifyTypedData(
    DOMAIN,
    AUTHORIZATION_TYPES,
    {
      eventId: input.eventId,
      units: input.units,
      nonce: input.nonce,
      expiry: input.expiry
    },
    input.attestationSignature
  );
  
  // 2. Verify signer is authorized attestor
  if (signer.toLowerCase() !== input.attestorAddress.toLowerCase()) {
    return false;
  }
  
  // 3. Check expiry
  if (Date.now() / 1000 > input.expiry) {
    return false;
  }
  
  // 4. Check nonce hasn't been used
  if (usedNonces.has(input.nonce.toString())) {
    return false;
  }
  
  return true;
}
```

### Rate Limiting

- Max 100 authorizations per user per day
- Max $500 total value per user per day
- Anchor-wide cap monitored in real-time

---

## Monitoring & Alerts

### Key Metrics

| Metric | Alert Threshold |
|--------|-----------------|
| Fulfillment Success Rate | < 99% |
| Average Fulfillment Time | > 60s |
| Provider Balance | < $1000 |
| Daily Volume | > 80% of cap |

### Alert Actions

1. **Yellow Alert**: Notify operations team
2. **Red Alert**: Auto-pause anchor
3. **Critical**: Full system halt + escalation

---

## TypeScript Implementation Shell

```typescript
import { ethers } from 'ethers';

interface InstacartAdapter {
  // Main execution
  execute(input: AdapterInput): Promise<AdapterOutput>;
  
  // Internal methods
  validateAttestation(input: AdapterInput): boolean;
  issueGiftCard(units: bigint, userId: string): Promise<GiftCardResult>;
  generateProof(result: GiftCardResult): string;
  reportFulfillment(eventId: string, proof: string): Promise<void>;
  
  // Error handling
  handleFailure(eventId: string, error: Error): Promise<void>;
  haltAnchor(reason: string): Promise<void>;
}

class InstacartZeroFloatAdapter implements InstacartAdapter {
  private anchorContract: AnchorContract;
  private tangoClient: TangoCardClient;
  
  async execute(input: AdapterInput): Promise<AdapterOutput> {
    // 1. Validate
    if (!this.validateAttestation(input)) {
      throw new Error('Invalid attestation');
    }
    
    // 2. Issue gift card
    const result = await this.issueGiftCard(input.units, input.userId);
    
    if (!result.success) {
      await this.handleFailure(input.eventId, new Error(result.error));
      return { status: 'FAILED', errorMessage: result.error };
    }
    
    // 3. Generate proof
    const proof = this.generateProof(result);
    
    // 4. Report fulfillment to anchor
    await this.reportFulfillment(input.eventId, proof);
    
    // 5. Return result
    return {
      status: 'FULFILLED',
      fulfillmentProof: proof,
      giftCardCode: result.giftCardCode,
      instacartOrderId: result.orderId,
      timestamp: new Date().toISOString()
    };
  }
}
```

---

*Instacart Adapter Specification v1.0 — December 2024*
