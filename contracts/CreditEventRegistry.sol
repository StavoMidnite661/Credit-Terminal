// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * CreditEventRegistry
 * On-chain registry for credit events and attestations
 * Provides immutable audit trail for all value creation and spending
 */

import "@openzeppelin/contracts/access/Ownable.sol";

contract CreditEventRegistry is Ownable {
    enum CreditEventType {
        CREDIT_DEPOSITED,
        VALUE_CREATED,
        CREDIT_PROOF_ATTESTED,
        ATTESTATION_VERIFIED,
        CREDIT_UNLOCKED,
        MERCHANT_VALUE_REQUESTED,
        MERCHANT_VALUE_ISSUED,
        GIFT_CARD_CREATED,
        SPEND_AUTHORIZED,
        SPEND_EXECUTED,
        SPEND_SETTLED,
        SPEND_FAILED,
        USER_REWARD_EARNED,
        CASHBACK_ISSUED,
        BALANCE_RECONCILED,
        AUDIT_LOG_CREATED
    }
    
    struct CreditEvent {
        bytes32 eventId;
        address user;
        uint256 amount;
        CreditEventType eventType;
        bytes32 attestationHash;
        uint256 timestamp;
        string metadata; // JSON string
    }
    
    // Event ID => Event Data
    mapping(bytes32 => CreditEvent) public events;
    
    // User Address => Event IDs
    mapping(address => bytes32[]) public userEvents;
    
    // Total events recorded
    uint256 public totalEvents;
    
    event CreditEventRecorded(
        bytes32 indexed eventId,
        address indexed user,
        CreditEventType indexed eventType,
        uint256 amount,
        bytes32 attestationHash
    );
    
    event AttestationPublished(
        bytes32 indexed attestationHash,
        bytes32 indexed eventId,
        address attestor
    );
    
    /**
     * Record a credit event on-chain
     */
    function recordEvent(
        address user,
        uint256 amount,
        CreditEventType eventType,
        bytes32 attestationHash,
        string calldata metadata
    ) external returns (bytes32 eventId) {
        // Generate unique event ID
        eventId = keccak256(abi.encodePacked(
            user,
            amount,
            eventType,
            attestationHash,
            block.timestamp,
            totalEvents
        ));
        
        // Store event
        events[eventId] = CreditEvent({
            eventId: eventId,
            user: user,
            amount: amount,
            eventType: eventType,
            attestationHash: attestationHash,
            timestamp: block.timestamp,
            metadata: metadata
        });
        
        // Add to user's event list
        userEvents[user].push(eventId);
        
        // Increment counter
        totalEvents++;
        
        emit CreditEventRecorded(eventId, user, eventType, amount, attestationHash);
        
        return eventId;
    }
    
    /**
     * Publish attestation hash on-chain
     */
    function publishAttestation(
        bytes32 attestationHash,
        bytes32 eventId,
        address attestor
    ) external {
        require(events[eventId].eventId != bytes32(0), "Event not found");
        
        emit AttestationPublished(attestationHash, eventId, attestor);
    }
    
    /**
     * Get all events for a user
     */
    function getUserEvents(address user) external view returns (bytes32[] memory) {
        return userEvents[user];
    }
    
    /**
     * Get event details
     */
    function getEvent(bytes32 eventId) external view returns (CreditEvent memory) {
        return events[eventId];
    }
    
    /**
     * Get user event count
     */
    function getUserEventCount(address user) external view returns (uint256) {
        return userEvents[user].length;
    }
}
