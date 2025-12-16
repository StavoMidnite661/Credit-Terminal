# SOVR Hybrid Engine V2

**A cryptographically verified credit engine for value creation and attestation.**

---

## Overview

SOVR is a **value creation and attestation network** that transforms attested credit into real-world value via merchant integrations. This is **not a crypto project** - it's a closed-loop credit system with cryptographic verification.

### Core Components

1. **Smart Contracts** (`/contracts/`)
   - SOVRHybridRouter_v2 - Production router with TWAP oracle
   - CreditEventRegistry - On-chain event logging
   - TWAPHelper - Price oracle
   - SOVRPrivatePool - Liquidity management
   - ReserveManager - Collateral management
   - sFIAT - Stablecoin

2. **Value Attestation Layer** (`/val/`)
   - Attestation engine with cryptographic signing
   - Universal spend engine
   - Merchant adapters (Square, Tango, Coinbase, Stripe)
   - Credit event system (16 event types)

3. **Frontend** (`/frontend/`)
   - Credit Terminal UI
   - Swap interface
   - Pool management
   - Wallet integration

---

## Quick Start

### Installation

```bash
npm install
```

### Environment Setup

Copy `.env.example` to `.env` and configure:

```bash
DEPLOYER_PRIVATE_KEY=your_private_key
BASE_RPC=https://mainnet.base.org
SOVR_TOKEN=0x65e75d0fc656a2e81ef17e9a2a8da58d82390422
```

### Compile Contracts

```bash
npx hardhat compile
```

### Run Tests

```bash
npx hardhat test
```

### Deploy Frontend

```bash
cd frontend
npm install
npm run dev
```

---

## Deployed Contracts (Base Mainnet)

| Contract | Address | Purpose |
|----------|---------|---------|
| SOVR Token | `0x65e75d0fc656a2e81ef17e9a2a8da58d82390422` | Value token |
| sFIAT | `0x2c98e9c8ba005dc690d98e2e31a4811c094e0be3` | Stablecoin |
| ReserveManager | `0xed3db8f97024a3be5f5ae22f27024e5e94fad64a` | Collateral |
| SOVRPrivatePool | `0x18d4a13a0116b360efddb72aa626721cfa2a8228` | Liquidity pool |
| SOVRProgrammablePool | `0x4f9b7a45b5234ca1cc96980d2cb0f49768d26622` | Programmable pool |
| SOVRHybridRouter V2 | `0xf682bd9789c0a66f2cb82ecc13fc6b43d7b58830` | Main router |
| AttestorOracle | `0xaca71bc598139d9167414ae666f7cd9377b871f7` | Attestation |
| TWAPHelper | `0xa3620e31fb37b7de32fadf5c476d93c080fe3ad4` | Price oracle |

---

## Architecture

```
User → Studio (USD Gateway)
  ↓
Attestor (SAN) [Pull Sig]
  ↓
Stripe (PaymentIntent + Metadata)
  ↓
Settlement Webhook → Ledger & Burn sFIAT
```

### Value Flow

1. User Authorizes Payment → Studio requests Attestation
2. Attestor Signs → Studio binds signature to Stripe Payment
3. Stripe processes transaction → Webhook triggers settlement
4. Gateway updates Ledger → Burns sFIAT/POSCR on-chain
5. Event logged → Blockchain record created

---

## Key Features

✅ **Cryptographic Attestation** - EIP-191 compliant signatures  
✅ **TWAP Oracle** - Manipulation-resistant pricing  
✅ **Merchant Agnostic** - Works with any payment provider  
✅ **Immutable Audit Trail** - On-chain event registry  
✅ **Real-World Value** - Instant gift card delivery  
✅ **No Crypto Knowledge Required** - Users spend credit, not tokens  

---

## Development

### Project Structure

```
sovr_hybrid_engineV2/
├── contracts/          # Smart contracts (8 production files)
├── val/                # Value Attestation Layer
│   ├── core/          # Attestation & spend engines
│   ├── events/        # Event types & logging
│   ├── adapters/      # Merchant integrations
│   └── merchant_triggers/  # Adapter interfaces
├── frontend/          # React UI
├── scripts/           # Deployment scripts
├── test/              # Test suite
├── deployment/        # Deployment records
└── archive/           # Obsolete files (preserved)
```

### Adding a Merchant Adapter

1. Create adapter in `/val/adapters/`
2. Implement `IMerchantValueAdapter` interface
3. Register in `VALSystem` constructor
4. Add to Credit Terminal UI

Example:

```typescript
export class MyAdapter implements IMerchantValueAdapter {
  async issueValue(request: ValueRequest): Promise<ValueResponse> {
    // Call merchant API
    // Return gift card/value
  }
}
```

---

## Testing

### Unit Tests

```bash
npx hardhat test
```

### Integration Tests

```bash
npx hardhat test test/hybrid.spec.js
```

### Frontend Tests

```bash
cd frontend
npm test
```

---

## Deployment

### Deploy Router V2

```bash
npx hardhat run scripts/deploy_router_v2.js --network base
```

### Verify Deployment

```bash
npx hardhat run scripts/verify_deployment.js --network base
```

---

## Security

- ✅ ReentrancyGuard on all user functions
- ✅ Exact token approvals (no infinite approvals)
- ✅ Input validation everywhere
- ✅ Event logging for all state changes
- ✅ TWAP oracle for price feeds
- ✅ 24-hour attestation validity

---

## Documentation

- [VAL Implementation Plan](./archive/docs/val_implementation_plan.md)
- [Router V2 Deployment](./deployment/router_v2_deployment.md)
- [SOVR Narrative](./SOVR_NARRATIVE.md)

---

## Support

For issues or questions:
- Check deployment artifacts in `/deployment/`
- Review contract source in `/contracts/`
- Test locally: `npx hardhat node --fork $BASE_RPC`

---

## License

MIT

---

**Built with ❤️ by the SOVR Empire**

*This is a value creation machine, not a crypto project.*
