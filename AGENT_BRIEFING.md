# SOVR System — Agent Briefing

> **One Sentence:** We don't move money. We authorize outcomes. Ledgers record truth. Anchors fulfill reality.

---

## What You Are Building

A **self-verifying ledger system** that can interact with the real world without surrendering authority.

**You are NOT:**
- Replacing USD
- Creating a new currency
- Speculating on tokens

**You ARE:**
- Building an authorization engine
- That tells ledgers when to update
- And triggers real-world fulfillment

---

## The Five Layers

| Layer | Component | Role |
|-------|-----------|------|
| 1 | **TigerBeetle** | Truth Ledger (brainstem) |
| 2 | **Bank Master** | Legacy Translator (thin, replaceable) |
| 3 | **FinSec Processor** | Exit Valve (hands) |
| 4 | **Credit Terminal** | Authorization Engine (judgment) |
| 5 | **Studio** | Dashboard UI (face) |

---

## Core Tokens (Not Money!)

| Token | Purpose |
|-------|---------|
| **SOVR** | Permission badge — "You are allowed to spend this much" |
| **sFIAT** | Internal scoreboard — Never leaves the system |

---

## The Anchor System

**Anchor = A counterparty that honors ledger state with real-world action**

### Lifecycle

```
User Intent → Authorization → Attestation → Fulfillment → Finalization
```

### First Anchor: INSTACART

- **Why:** Solves survival liquidity (food, today)
- **Unit:** 1 unit = $1 grocery credit
- **Zero-Float:** No pre-funding required

---

## Key Operations

### 1. Authorization (Spend Intent)

```
USER_ACCOUNT → SYSTEM_BUFFER (units locked)
```

### 2. Attestation (Permission Check)

```
Credit Terminal signs: "This state transition is allowed"
```

### 3. Fulfillment (Real World)

```
Adapter calls Instacart API → Gift card issued
```

### 4. Finalization (Ledger Update)

```
ANCHOR_ACCOUNT → TREASURY (obligation cleared)
```

---

## When Fiat Becomes Optional

**Fiat is optional when:**

> At least one anchor reliably fulfills essential needs using ledger-authorized obligations instead of prepaid cash.

**The exact moment:**

```
t = first successful fulfillment where:
  - No user used a card
  - No reserve was pre-funded
  - Ledger authorization alone triggered delivery
```

---

## Integration: Studio ↔ Credit Terminal

```
Studio asks.
Credit Terminal decides.
Ledger records.
FinSec fulfills.
```

### Rules

1. **Studio NEVER embeds business logic** — only displays state
2. **Credit Terminal exposes strict interface** — authorizeSpend, attest, finalize
3. **ABIs are blueprints** — Studio can only call what ABI allows
4. **TigerBeetle is underneath** — everything resolves to ledger mutation

---

## Critical Understanding

### Money Does NOT Move

There is no bag of dollars going anywhere.

**What actually happens:**
1. One ledger records a **debit**
2. Another ledger records a **credit**
3. An authority **attests** the transition is valid

That's it.

### The Real Primitives

- Authorization
- Liability
- Settlement
- Finality

---

## File Locations

| Document | Path |
|----------|------|
| Architecture | `SOVEREIGN_STACK_ARCHITECTURE.md` |
| Anchor Contract Spec | `specs/ANCHOR_CONTRACT_SPEC.md` |
| Instacart Adapter | `specs/INSTACART_ADAPTER_SPEC.md` |
| TigerBeetle Schema | `specs/TIGERBEETLE_LEDGER_SCHEMA.md` |

---

## Next Actions

1. **Implement Anchor Contract** in Credit Terminal
2. **Connect TigerBeetle** to Credit Terminal backend
3. **Build Instacart Adapter** with Tango Card API
4. **Wire Studio UI** to display ledger state
5. **Test first fulfillment** — groceries without fiat

---

*Agent Briefing v1.0 — December 2024*
