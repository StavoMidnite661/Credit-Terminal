# Project Breakdown

## 1. High-level Snapshot
The repo contains a full SOVR Hybrid Engine implementation:
- **contracts/**: Production-ready Solidity contracts.
- **scripts/**: Deploy and seed scripts.
- **test/**: Bankrun and other test suites.
- **frontend/**: React app with Swap, Pool, Explore pages.
- **attestor-adapter/**: Node.js off-ramp adapter.
- **keepers/**: Monitoring scripts.

## 2. Key Files & Mapping
- `contracts/SOVRPrivatePool.sol`: Peg pool manager, sqrtPriceX96, seed liquidity.
- `contracts/SOVRProgrammablePool.sol`: Programmable liquidity positions.
- `contracts/SOVRHybridRouter.sol`: Top-level API for dApp, routing, settlement.
- `contracts/sFIAT.sol`: Synthetic fiat ERC20.
- `contracts/ReserveManager.sol`: Collateral management, CR enforcement.
- `contracts/AttestorOracleEIP712.sol`: Off-chain attestation verification.

## 3. Implementation Status
**Implemented:**
- Peg initialization math.
- NonfungiblePositionManager interactions.
- ReserveManager CR enforcement.
- AttestorOracle with session keys.
- Router orchestration.

**Mock / UI-only:**
- Add Liquidity modal UI (needs wiring).
- Real-time position tracking (likely mock data).
- Off-ramp adapters (demo only).

## 4. Immediate Health Checks
1. `npm ci`
2. `npx hardhat compile`
3. `npx hardhat test`
4. `npx hardhat node --fork $ALCHEMY_URL` & deploy scripts.
5. `cd frontend && npm run dev`

## 5. Security Checklist
- [ ] Verify `initialize(sqrtPriceX96)` token order.
- [ ] Confirm tick spacing alignment.
- [ ] Ensure owner-only access control.
- [ ] Harden AttestorOracle (session keys, nonces).
- [ ] Implement withdraw caps & timelocks.
- [ ] Add `nonReentrant` guards.

## 6. Next Steps
1. Run test suite & fix failing tests.
2. Transfer ownership to multisig.
3. Wire UI → Router (Add Liquidity Modal).
4. Run static analysis (Slither).
5. Simulate mass off-ramp scenarios.
