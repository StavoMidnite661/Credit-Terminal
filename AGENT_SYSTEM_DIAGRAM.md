# SOVR Agent-Level System Diagram

This document is the canonical agent-facing diagram and operational map for the SOVR Hybrid Engine. Use it to onboard agents, coordinate deployments, prepare audits, and run incident response. It is intentionally high-fidelity: includes component boxes, sequence flows, events, attacker surfaces, governance hooks, and an operations checklist.

---

## 1) One‑Page System Map (ASCII flow)

```
+----------------+        +----------------+        +----------------------+        +-------------------+
|   End User UI  | <----> |   HybridRouter | <----> |  SOVRPrivatePool     | <----> |   Uniswap V3 Pool  |
| (CreditTerminal|        | (Coordinator)  |        |  (Peg: SOVR / USDC) |        |  (Position NFT)    |
|  + Spend UI)   |        |                |        |                      |        |                   |
+-------+--------+        +---+------------+        +---------+------------+        +-------------------+
        |                    |                          |                                  ^
        | event: SpendReq    | event: LiquidityAdded    | event: PegSeeded                 |
        v                    v                          v                                  |
+----------------+   +--------------------+     +---------------------+            +-----------------------+
|  Attestor      |   |  ReserveManager    |     |  SOVRProgrammable   |            |   Off-chain Adapters  |
|  Oracle (EIP712)|   | (sFIAT issuance)  |     |  Pool (Reward/Trust)|            |  (Square, Stripe,     |
+---+------------+   +---------+----------+     +----------+----------+            |   Coinbase, Tango)    |
    |                      |                           |                       +---+-----------------------+
    | signed proof          | mints/burns sFIAT         | bonding events        |   ^
    v                      v                           v                       |   |
+------------------+   +------------------+     +-----------------------+     |   | api calls (merchant)
| Monitoring &     |   | Ledger & Events  |     | Keepers / Guardians   |     |   |
| Attestation SAN  |   | (Event Bus)      |     | (Rebalance, Circuit   |     |   v
+------------------+   +------------------+     | Breakers, Timelocks)  |     | +---------------------+
                                                 +-----------------------+     | |  Stripe / Payment   |
                                                                                  | |   Processor         |
                                                                                  | +---------------------+
                                                                                  v
                                                                             +----------------+
                                                                             | Bank / Merchant |
                                                                             +----------------+
```

---

## 2) Narrative Sequence Flow (Detailed)

**Scenario A — User converts SOVR → sFIAT → Stripe-processed USD**

1. **User** clicks *Convert SOVR to sFIAT* in Credit Terminal.
2. **Frontend** constructs tx to `SOVRHybridRouter.addLiquidity(sovrAmount, usdcAmount)` or `mintSF` flow depending on UX choice.
3. Router pulls SOVR (transferFrom), optionally swaps small USDC via Peg or uses reserve, and calls `ReserveManager.mintSF(user, sfiatAmount)` (owner role or via Router bridge) to mint sFIAT to user.
4. Router emits `SpendRequested` or `LiquidityAdded` event to the Event Bus (on-chain events).
5. **Attestor Network (SAN)** listens; offline attestor nodes validate chain state and sign an EIP-712 attestation linking the event id → amount → recipient → nonce.
6.  **Gateway Pull (Stripe Model)**: The **USD Gateway (Studio)** proactively *pulls* an attestation from the Attestor Service (SAN) for the pending transaction.
7.  **Attestation Attachment**: The Gateway attaches the signed attestation (EIP-712) to the Stripe `PaymentIntent` metadata, binding the off-chain fiat value to the on-chain credit event.
8.  **Stripe Settlement**: User completes the credit card flow. Stripe webhook (`payment_intent.succeeded`) triggers the final settlement.
9.  **Ledger/Burn**: The Gateway receives the webhook, updates the off-chain ledger, and optionally burns sFIAT/POSCR on-chain to finalize the "spend" lifecycle.

**Key on-chain hooks:** `LiquidityAdded`, `MintSF`, `AttestationVerified`, `SettlementRecorded`.

---

## 3) Component Responsibilities (Agent View)

* **Credit Terminal (Frontend)**: UX for deposit, mint, spend. Calls Router, shows quotes, handles approvals, converts sqrtPriceX96 → human price.
* **SOVRHybridRouter**: Orchestrator. Validates inputs, transferFroms tokens, approves to pools, calls Peg / Reserve mint, emits events.
* **SOVRPrivatePool (Peg)**: Maintains 100 SOVR : 1 USDC peg. Initializes pool, mints LP NFT. Provides pool price via slot0.
* **ReserveManager**: Holds USDC collateral, enforces TARGET_CR_BPS (e.g., 120%). Mints/Burns sFIAT. Has withdraw caps, pause, circuit-breaker.
* **sFIAT**: Protocol internal USD-equivalent ERC20 (18 decimals) — 1 sFIAT ≈ $1 in-system accounting.
* **SOVRProgrammablePool**: Rewards pool; issues bonding tokens; rebalances liquidity programmatically.
* **AttestorOracle (EIP-712)**: Verifies signatures, provides sessionKey flow, prevents replay, and publishes `AttestationVerified` events.
* **Attestation Network (SAN)**: Off-chain set of signers + governance. Issues short-lived session keys or MPC/2-of-3 signatures.
* **Off-chain Adapters**: Connectors to Square, Stripe, Coinbase, Tango. Receives attestations and executes merchant-side operations.
* **Keepers/Guardians**: Automated scripts for CR monitoring, peg drift correction, and emergency pauses.
* **Monitoring & Logging**: Aggregates on-chain events + off-chain confirmations in a compliance trail.

---

## 4) Event Model (Canonical)

* `CreditDeposited(user, sovrAmount, usdcEquivalent, eventId)`
* `LiquidityAdded(user, sovrAmount, usdcAmount, tokenId)`
* `SFMinted(to, amount, reason, txRef)`
* `AttestationVerified(attestationId, signer)`
* `SettlementRequested(attestationId, adapter)`
* `SettlementCompleted(attestationId, merchantRef, gatewayRef)`
* `ReserveWithdraw(to, amount, admin)`
* `CircuitBreakTriggered(reason, crBps)`

Agents MUST log all events and correlate on-chain tx hash ↔ off-chain order ids.

---

## 5) Security / Threat Model (High-level)

### Major Attack Surfaces

1. **Compromised Attestor Key** — leads to fake attestations and unauthorized settlements.

   * *Mitigation*: Session keys, TTL, multisig root, or MPC aggregated signatures (2-of-3).
2. **Owner Key Compromise (reserve/withdraw)** — drains collateral.

   * *Mitigation*: Transfer ownership to Gnosis Safe multisig; add timelock for large withdraws; daily caps.
3. **Peg Manipulation / Tick math errors** — wrong sqrtPriceX96 initialization leading to peg mismatch.

   * *Mitigation*: Unit tests, forked integration tests, on-chain TWAP watchers.
4. **Adapter API abuse** — replay or unauthorized calls to merchant APIs.

   * *Mitigation*: HMAC between adapter and merchant; attestationID nonce; strict rate limits/kyc of adapters.

---

## 6) Governance & Ops Controls (Required)

* **Multisig Ownership**: All admin keys (owner of Router, ReserveManager, Peg) transferred to Gnosis Safe.
* **Timelocks**: Any change to Peg params, Reserve thresholds, or large withdrawals must be timelocked (24–72 hours).
* **Session Keys**: Attestation session keys must be issued by multisig and have TTL ≤ 24h.
* **Audit Hooks**: On-chain `proposeUpgrade()` events must be submitted to off-chain board and annotated.
* **Emergency Pause**: Circuit breaker auto-triggers on CR < EMERGENCY_CR_BPS and requires multisig to resume.

---

## 7) Operational Playbooks (Short)

### A. Normal Spend Flow

* Agent watches `LiquidityAdded` or `SFMinted` events. Adapter picks and processes. Attestor signs. Adapter completes merchant call. Update logs.

### B. Bank-Run Simulation

* Keeper triggers synthetic withdraws on fork. Observe `collateralizationBps()`. Ensure `mintSF` reverts when CR < TARGET.

### C. Compromised Attestor

* Revoke session keys immediately via multisig. Issue new session keys. Audit all settlements in the last 24–72 hours.

### D. Upgrading Router

* Prepare `SOVRHybridRouter_v2` as an implementation. Submit governance upgrade. Announce to community & freeze large withdrawals during upgrade window.

---

## 8) Agent Checklist (Triage & Runbook)

* [ ] Verify `deployment/BASE_ACTIVE_ADDRESSES.json` and sync all agents.
* [ ] Ensure multisig is set as owner for Router/Reserve/ProgrammablePool.
* [ ] Confirm TWAP helper deployed and frontend uses `quoteSqrtPriceX96`.
* [ ] Confirm Attestor session key policy and log rotation.
* [ ] Run `npx hardhat test test/bankrun.spec.js` on fork and validate behaviors.
* [ ] Ensure adapter HMAC keys are rotated monthly and stored in vault.

---

## 9) Diagram Legend & Notation

* **On-chain boxes**: represent smart contracts.
* **Off-chain boxes**: represent services (attestors, adapters, keeper scripts).
* **Events arrows**: show canonical event emission and consumption.
* **Governance boxes**: show multisig & timelock responsibilities.

---

## 10) Next Artifacts I Can Produce for Agents

* Formal sequence diagrams (Mermaid) for 4 major flows (mint, addLiquidity, spend/giftcard, upgrade).
* A one-page executive PDF (for legal/regulatory review).
* Gnosis Safe multisig JSON proposal templates for common ops (transferOwnership, revokeSession, upgradeProxy).
* A fully annotated postmortem template for incidents.

---

*End of document.*
