// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

/**
 * @title AttestorOracleEIP712
 * @notice Verifies off-chain attestations signed by a designated attestor key.
 *         Used to bridge off-chain payment success (fiat/gift card) to on-chain settlement.
 */
contract AttestorOracleEIP712 is AccessControl, EIP712 {
    bytes32 public constant ATTESTOR_ROLE = keccak256("ATTESTOR_ROLE");
    
    // Typehash for EIP-712
    // struct Attestation { string orderId; uint256 amount; string recipient; uint256 timestamp; uint256 nonce; }
    bytes32 public constant ATTESTATION_TYPEHASH = keccak256("Attestation(string orderId,uint256 amount,string recipient,uint256 timestamp,uint256 nonce)");

    // Prevent replay
    mapping(string => bool) public processedOrders;

    event AttestationVerified(string orderId, uint256 amount, string recipient, address attestor);

    constructor(string memory name, string memory version) EIP712(name, version) {
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function addAttestor(address attestor) external onlyRole(DEFAULT_ADMIN_ROLE) {
        grantRole(ATTESTOR_ROLE, attestor);
    }

    function removeAttestor(address attestor) external onlyRole(DEFAULT_ADMIN_ROLE) {
        revokeRole(ATTESTOR_ROLE, attestor);
    }

    /**
     * @notice Verify an attestation and mark order as processed.
     * @param orderId unique order ID from off-chain system
     * @param amount amount verified
     * @param recipient recipient identifier (email, etc.)
     * @param timestamp timestamp of attestation
     * @param nonce random nonce
     * @param signature EIP-712 signature from an ATTESTOR_ROLE key
     */
    function verifyAttestation(
        string calldata orderId,
        uint256 amount,
        string calldata recipient,
        uint256 timestamp,
        uint256 nonce,
        bytes calldata signature
    ) external returns (bytes32 digest) {
        require(!processedOrders[orderId], "Order already processed");
        require(block.timestamp <= timestamp + 300, "Attestation expired"); // 5 min TTL

        digest = _hashTypedDataV4(keccak256(abi.encode(
            ATTESTATION_TYPEHASH,
            keccak256(bytes(orderId)),
            amount,
            keccak256(bytes(recipient)),
            timestamp,
            nonce
        )));

        address signer = ECDSA.recover(digest, signature);
        require(hasRole(ATTESTOR_ROLE, signer), "Invalid attestor signature");

        processedOrders[orderId] = true;
        emit AttestationVerified(orderId, amount, recipient, signer);
        
        // In a real system, you would now trigger the settlement logic (e.g. mint tokens, release escrow)
        // For this demo, we just emit the event.
        return digest;
    }
}
