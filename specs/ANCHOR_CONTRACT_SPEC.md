# Anchor Contract Specification

## Overview

The Anchor Contract is the core primitive that converts ledger authorization into real-world obligations.

**It is NOT:**
- A token
- A liquidity pool
- Money

**It IS:**
- A promise registry with teeth

---

## Contract Interface (Solidity-Compatible)

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IEssentialFulfillmentAnchor
/// @notice Core contract to record authorized spend units and fulfillments
interface IEssentialFulfillmentAnchor {

    // =========================================================================
    // EVENTS
    // =========================================================================

    /// @notice Emitted when a spend is authorized
    event AnchorAuthorizationCreated(
        bytes32 indexed eventId,
        address indexed user,
        bytes32 anchorType,
        uint256 units,
        uint256 expiry
    );

    /// @notice Emitted when fulfillment is confirmed
    event AnchorFulfilled(
        bytes32 indexed eventId,
        bytes32 proofHash
    );

    /// @notice Emitted when authorization expires without fulfillment
    event AnchorExpired(bytes32 indexed eventId);

    /// @notice Emitted when anchor is paused (emergency)
    event AnchorPaused(bytes32 anchorType, string reason);

    // =========================================================================
    // AUTHORIZATION
    // =========================================================================

    /// @notice Authorize a spend for a specific anchor type
    /// @param user The user requesting the spend
    /// @param anchorType The type of anchor (e.g., "GROCERY", "UTILITY")
    /// @param units The number of internal ledger units
    /// @param expiry Timestamp when authorization expires
    /// @return eventId Unique identifier for this authorization
    function authorize(
        address user,
        bytes32 anchorType,
        uint256 units,
        uint256 expiry
    ) external returns (bytes32 eventId);

    // =========================================================================
    // FULFILLMENT
    // =========================================================================

    /// @notice Mark an authorization as fulfilled
    /// @param eventId The authorization event ID
    /// @param proofHash Hash of fulfillment receipt / gift card code
    function fulfill(
        bytes32 eventId,
        bytes32 proofHash
    ) external;

    // =========================================================================
    // EXPIRY / FAILURE
    // =========================================================================

    /// @notice Expire an authorization and release units back to user
    /// @param eventId The authorization event ID
    function expire(bytes32 eventId) external;

    /// @notice Emergency halt - prevents new authorizations
    /// @param anchorType The anchor type to pause
    /// @param reason The reason for pausing
    function haltAnchor(bytes32 anchorType, string calldata reason) external;

    // =========================================================================
    // VIEW FUNCTIONS
    // =========================================================================

    /// @notice Get authorization details
    function getAuthorization(bytes32 eventId) external view returns (
        address user,
        bytes32 anchorType,
        uint256 units,
        uint256 expiry,
        bool fulfilled,
        bool expired
    );

    /// @notice Check if anchor is active
    function isAnchorActive(bytes32 anchorType) external view returns (bool);

    /// @notice Get total units authorized for an anchor (not yet fulfilled)
    function getPendingUnits(bytes32 anchorType) external view returns (uint256);
}
```

---

## Anchor Types

| Anchor Type | Description | Unit Definition |
|-------------|-------------|-----------------|
| `GROCERY` | Food delivery (Instacart, etc.) | 1 unit = $1 grocery credit |
| `UTILITY` | Electric, water, gas bills | 1 unit = $1 utility credit |
| `FUEL` | Gas stations | 1 unit = $1 fuel credit |
| `MOBILE` | Phone bills, data | 1 unit = $1 telecom credit |
| `HOUSING` | Rent payments | 1 unit = $1 housing credit |
| `MEDICAL` | Healthcare, pharmacy | 1 unit = $1 medical credit |

---

## Lifecycle

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER INTENT                              │
│                    "I want groceries"                           │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                    1. AUTHORIZATION                              │
│                                                                  │
│   - Check user balance ≥ units                                  │
│   - Check anchor is ACTIVE                                      │
│   - Check issuance cap not exceeded                             │
│   - Debit user balance                                          │
│   - Credit anchor_obligation                                    │
│   - Emit AnchorAuthorizationCreated(eventId)                   │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                    2. ADAPTER EXECUTION                          │
│                                                                  │
│   - Adapter receives event                                      │
│   - Validates attestation signature                             │
│   - Calls fulfillment API (e.g., Instacart)                    │
│   - Receives delivery confirmation                              │
└───────────────────────────┬─────────────────────────────────────┘
                            │
            ┌───────────────┴───────────────┐
            │                               │
            ▼                               ▼
┌─────────────────────┐         ┌─────────────────────┐
│   3A. FULFILLMENT   │         │   3B. FAILURE       │
│                     │         │                     │
│ - Call fulfill()    │         │ - Expiry reached    │
│ - Clear obligation  │         │ - API failed        │
│ - User got goods    │         │ - Release units     │
│ - Emit Fulfilled    │         │ - Emit Expired      │
└─────────────────────┘         └─────────────────────┘
```

---

## Key Properties

### What the Anchor DOES

✅ Locks units from user ledger  
✅ Emits canonical events  
✅ Accepts fulfillment proof  
✅ Handles failures safely  

### What the Anchor DOES NOT DO

❌ Hold funds  
❌ Price anything  
❌ Touch fiat  
❌ Call Stripe  
❌ Swap tokens  

**This is pure obligation logic.**

---

## Risk Controls

### If Fulfillment Stalls

1. Anchor auto-pauses
2. No new authorizations accepted
3. Existing obligations remain valid
4. Human intervention required

### Invariant

> If the ledger says it's valid AND the anchor is ACTIVE, fulfillment MUST occur OR the system halts further issuance.

This is how trust is enforced.

---

## TypeScript Interface (for Credit Terminal)

```typescript
interface AnchorContract {
  // Authorization
  authorize(
    user: string,
    anchorType: AnchorType,
    units: bigint,
    expiry: number
  ): Promise<EventId>;

  // Fulfillment
  fulfill(eventId: EventId, proofHash: string): Promise<void>;

  // Expiry
  expire(eventId: EventId): Promise<void>;

  // Emergency
  haltAnchor(anchorType: AnchorType, reason: string): Promise<void>;

  // Queries
  getAuthorization(eventId: EventId): Promise<Authorization>;
  isAnchorActive(anchorType: AnchorType): Promise<boolean>;
  getPendingUnits(anchorType: AnchorType): Promise<bigint>;
}

type AnchorType = 'GROCERY' | 'UTILITY' | 'FUEL' | 'MOBILE' | 'HOUSING' | 'MEDICAL';

interface Authorization {
  user: string;
  anchorType: AnchorType;
  units: bigint;
  expiry: number;
  fulfilled: boolean;
  expired: boolean;
}

type EventId = string; // bytes32 hex string
```

---

*Anchor Contract Specification v1.0 — December 2024*
