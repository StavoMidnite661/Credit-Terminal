# The Sovereign Stack Architecture

> **Core Principle:** Money does NOT transfer. Ledgers get updated.

---

## Table of Contents

1. [The Fundamental Truth](#1-the-fundamental-truth)
2. [The Sovereign Stack Layers](#2-the-sovereign-stack-layers)
3. [What SOVR and sFIAT Actually Are](#3-what-sovr-and-sfiat-actually-are)
4. [The Anchor System](#4-the-anchor-system)
5. [TigerBeetle Ledger Integration](#5-tigerbeetle-ledger-integration)
6. [Zero-Fiat Float Fulfillment](#6-zero-fiat-float-fulfillment)
7. [The Bootstrap Path](#7-the-bootstrap-path)
8. [When Fiat Becomes Optional](#8-when-fiat-becomes-optional)

---

## 1. The Fundamental Truth

### Money Does Not Move — Ledgers Update

There is no bag of dollars going anywhere. There are only **entries changing state across ledgers**.

Stripe. Banks. Cards. ACH. All of it:
- **State machines. Not objects.**

### What Actually Happens

1. One ledger records a **debit**
2. Another ledger records a **credit**
3. An authority **attests** that the transition is valid

That's it. That's the universe.

### The Word "Money" Smuggles False Assumptions

❌ Physical transfer  
❌ Possession  
❌ Storage  
❌ Scarcity object  

### The Real Primitives Are

✅ Authorization  
✅ Liability  
✅ Settlement  
✅ Finality  

---

## 2. The Sovereign Stack Layers

You are building a **verticalized financial system**, not an app.

> Most fintechs sit on top of banks. You are replacing the layers beneath them.

### Layer 1: TigerBeetle = The Truth Ledger (Brainstem)

The heart of the system.

- Single source of truth
- Double-entry accounting
- Immutable by design
- Fast enough for card swipes

**This is where value STATES live. Not tokens. Not money. STATE.**

> "Who owes what, to whom, and why."

If TigerBeetle says it happened — it happened.

### Layer 2: Bank Master / Ledger Server = The Translator

Exists only to speak legacy language:
- Mirrors TigerBeetle state
- Formats balances as "USD-like"
- Handles IDs, profiles, labels

**This layer must be thin and replaceable. It is NOT the authority.**

### Layer 3: FinSec Processor = The Exit Valve (Hands)

This is where life happens.

**Question it answers:** "How does ledger state become food, fuel, shelter, or services?"

It does NOT:
- Move money
- Hold money
- Custody funds

It DOES:
- Consume ledger state
- Enforce rules
- Trigger external fulfillment (gift cards, merchants, APIs)

### Layer 4: Credit Terminal = The Engine (Judgment Cortex)

The authorization engine. It decides:
- Can this user spend?
- How much?
- Has this already been spent?
- Is the attestation valid?

**It does not care about Stripe, cards, or fiat.**

It emits verdicts:
> "Yes, this state transition is allowed."

### Layer 5: Studio App = The Steering Wheel (Face)

The cockpit / dashboard / operator console.

It lets humans:
- See balances
- Initiate intents
- Sign actions
- Observe outcomes

**It does nothing authoritative.**
If the Studio disappears tomorrow, the system still works.

---

## 3. What SOVR and sFIAT Actually Are

### SOVR = Permission Badge

It does NOT mean:
- Cash
- A coin
- Spendable money

It MEANS:
> "This person has proven they are allowed to spend up to this amount."

Like a credit score, prepaid balance, or game unlock level.

### sFIAT = The Scoreboard

It:
- Keeps track of how much spending power exists
- Helps the system do math
- Never leaves the system
- Never touches Stripe or banks

### Summary

| Token | Purpose |
|-------|---------|
| SOVR | Permission / Authorization |
| sFIAT | Internal calculator / Scoreboard |

**Neither is real money.**

---

## 4. The Anchor System

### What Is An Anchor?

> A formally recognized counterparty that agrees to honor a unit of ledger credit with a real-world outcome.

An anchor is NOT:
- A market contract
- A liquidity pool
- Money

It IS:
- A **promise registry with teeth**

### Anchor Contract Responsibilities

1. **Accept a Spend Authorization**
2. **Emit a Canonical Event**
3. **Accept Fulfillment Proof**
4. **Handle Failure Safely**

### What Qualifies as an Honored Counterparty?

Must satisfy ALL four:

1. **Predictable fulfillment** — When called, it actually delivers
2. **Finite cost** — You know exactly what it costs per unit
3. **No discretion** — No human approval required per transaction
4. **Irreversibility** — Once fulfilled, cannot be clawed back

✅ Gift card issuers  
✅ Utility providers  
✅ Digital service providers  
✅ Prepaid vendors  
✅ Closed-loop merchants  

❌ Banks  
❌ Payment processors  
❌ Anything requiring underwriting  
❌ Anything reversible "pending review"  

### The Smallest Possible Honored Counterparty

> A single merchant willing to say: "If the ledger says it's valid, I will fulfill."

That's enough to start the motor.

---

## 5. TigerBeetle Ledger Integration

### TigerBeetle Has "Substance" When All Five Are True

1. **Finality** — Cannot be rolled back, rewritten, or "admin fixed"
2. **Deterministic Rules** — Rule-bound, reproducible, auditable
3. **Scarcity Enforcement** — Prevents double spending, phantom balances, race conditions
4. **Independent Verification** — Another system can verify state is real
5. **Redemption Path** — Path from ledger state → real-world action

### Core Accounts

```
USER_ACCOUNT
  - userId
  - balanceUnits
  - authorizedUnits
  - lastAuthEvent

ANCHOR_CLEARING_ACCOUNT
  - anchorType (GROCERY, UTILITIES, etc.)
  - totalAuthorized
  - totalFulfilled

SYSTEM_BUFFER
  - tempUnits
  - eventId
  - expiry
```

### Core Transactions

| Type | Debit | Credit | Metadata |
|------|-------|--------|----------|
| AUTHORIZATION | USER_ACCOUNT | SYSTEM_BUFFER | eventId, anchorType, units, expiry |
| FULFILLMENT | SYSTEM_BUFFER | ANCHOR_CLEARING_ACCOUNT | eventId, fulfillmentProof |
| EXPIRY | SYSTEM_BUFFER | USER_ACCOUNT | eventId |

### Ledger Rules (Never Violated)

- Double-entry ✅
- No negative balances ✅
- Idempotent transactions ✅
- Deterministic replay ✅

---

## 6. Zero-Fiat Float Fulfillment

### What "Zero Fiat Float" Actually Means

It does NOT mean: "No one ever pays the vendor."

It MEANS:
> The protocol does not pre-fund balances. Value is injected only AFTER fulfillment is triggered.

### How It Works

**Option A — Net-Settled Gift Card Issuer (Preferred)**
- Tango / Blackhawk / InComm / Raise B2B
- Issue cards per event
- Settlement happens daily/weekly, net of fulfilled volume

You are borrowing **fulfillment trust**, not cash.

**Option B — Sponsored Inventory Pool**
- Third party pre-holds card inventory
- You reimburse only what was actually redeemed
- No balance sits idle in your system

### Why This Is Not "Fiat"

- Gift cards are **commercial instruments**
- They are **inventory obligations**
- Not deposits
- Not money transmission

This matters legally and architecturally.

---

## 7. The Bootstrap Path

### You Don't Start With Money — You Start With Obligations That Can Be Fulfilled

### Phase 0 — Ledger Exists (TigerBeetle)
Value exists internally but has nowhere to go yet.

### Phase 1 — Single-Purpose Redemption (Non-Cash)
Pick ONE thing people already want and accept digitally:
- $25 grocery gift card
- Phone bill credit
- Utility prepay
- Fuel voucher
- Cloud credits
- Food delivery balance

### Phase 2 — Ledger → Fulfillment Adapter
When the ledger authorizes X units, perform Y real-world action.

No pricing. No exchange. No markets.

### Phase 3 — Trust Grows → More Anchors Added
Eventually: The ledger becomes more valuable than cash because it redeems more reliably.

### The First Anchor: INSTACART

**Why Instacart?**
- Solves survival liquidity: food, today
- Already accepts pre-authorized digital value (gift cards, promo credits)
- Predictable fulfillment

**Unit Definition:**
```
1 unit = $1 grocery fulfillment credit (not USD, not money, a claim on groceries)
```

---

## 8. When Fiat Becomes Optional

### Fiat Becomes Optional When:

> At least one anchor reliably fulfills essential needs using ledger-authorized obligations instead of prepaid cash.

### The Exact Moment (Very Precise)

```
t = first successful fulfillment
  where:
  - no user used a card
  - no reserve was pre-funded
  - ledger authorization alone triggered delivery
```

From that moment on:
- The ledger creates reality
- Fiat becomes a settlement artifact, not a prerequisite
- You can delay, net, sponsor, or replace settlement entirely

### Timeline of Reality

| Stage | Description |
|-------|-------------|
| Stage 0 | Fiat Required — testing, integration, credibility building |
| Stage 1 | Fiat Adjacent — fiat may settle vendor balances, users never touch it |
| Stage 2 | Fiat Invisible — vendors net obligations, clearing in bulk, fiat is backstage |
| Stage 3 | Fiat Irrelevant — vendors accept ledger units directly, utilities/food/shelter onboarded |

At Stage 3:
> Money no longer coordinates value. The ledger does.

---

## Final Agent Summary

> "We don't move money.  
> We authorize outcomes.  
> Anchors honor those outcomes.  
> The ledger keeps the truth.  
> Settlement is optional, delayed, or external.  
> Once groceries flow, the system lives."

---

## Integration: Studio ↔ Credit Terminal

### The Relationship

```
Studio asks.
Credit Terminal decides.
Ledger records.
FinSec fulfills.
```

### Rules

1. **Studio NEVER embeds business logic**
   - Never calculates balances
   - Never decides spendability
   - Never mints anything
   - Only displays state, sends signed intents, shows receipts

2. **Credit Terminal exposes a strict interface**
   - `authorizeSpend(intent)`
   - `attestStateTransition(hash)`
   - `finalizeSpend(proof)`

3. **ABIs are the "blueprints"**
   - Studio cannot invent actions
   - It can only call what the ABI allows

4. **Address Registry = single source of wiring**
   - Deployment writes contract addresses, network IDs, versions
   - Studio reads them (no hardcoding)

5. **TigerBeetle sits underneath all of it**
   - Everything resolves to: Ledger mutation or rejection

---

## What You Are Building

You are NOT trying to:
- Replace USD
- Create a new currency
- Speculate on tokens

You ARE building:
> A self-verifying ledger system that can interact with the real world without surrendering authority.

Crypto is just one input signal.

---

*Document generated from final direction.md discussions — December 2024*
