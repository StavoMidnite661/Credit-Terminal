// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

/// @title Essential Fulfillment Anchor
/// @notice Core contract to record authorized spend units and fulfillments
contract EssentialFulfillmentAnchor is Ownable, ReentrancyGuard {

    // =========================================================================
    // STRUCTS & STATE
    // =========================================================================

    struct Authorization {
        address user;
        bytes32 anchorType;
        uint256 units;
        uint256 expiry;
        bool fulfilled;
        bool expired;
        bool exists;
    }

    struct AnchorConfig {
        bool active;
        uint256 totalAuthorized;
        uint256 totalFulfilled;
    }

    // Event ID -> Authorization
    mapping(bytes32 => Authorization) public authorizations;

    // Anchor Type -> Config
    mapping(bytes32 => AnchorConfig) public anchors;

    // =========================================================================
    // EVENTS
    // =========================================================================

    event AnchorAuthorizationCreated(
        bytes32 indexed eventId,
        address indexed user,
        bytes32 anchorType,
        uint256 units,
        uint256 expiry
    );

    event AnchorFulfilled(
        bytes32 indexed eventId,
        bytes32 proofHash
    );

    event AnchorExpired(bytes32 indexed eventId);

    event AnchorPaused(bytes32 indexed anchorType, string reason);
    event AnchorActivated(bytes32 indexed anchorType);

    // =========================================================================
    // CONSTRUCTOR
    // =========================================================================

    constructor() {
        // Initialize standard anchors
        _initAnchor("GROCERY");
        _initAnchor("UTILITY");
        _initAnchor("FUEL");
        _initAnchor("MOBILE");
        _initAnchor("HOUSING");
        _initAnchor("MEDICAL");
    }

    function _initAnchor(string memory _type) internal {
        bytes32 typeHash = keccak256(abi.encodePacked(_type));
        anchors[typeHash].active = true;
        emit AnchorActivated(typeHash);
    }

    // =========================================================================
    // AUTHORIZATION
    // =========================================================================

    function authorize(
        address user,
        bytes32 anchorType,
        uint256 units,
        uint256 expiry
    ) external nonReentrant returns (bytes32 eventId) {
        require(anchors[anchorType].active, "Anchor not active");
        require(units > 0, "Units must be positive");
        require(expiry > block.timestamp, "Expiry must be in future");

        // Generate unique event ID
        eventId = keccak256(
            abi.encodePacked(
                user,
                anchorType,
                units,
                expiry,
                block.timestamp,
                block.prevrandao 
            )
        );

        require(!authorizations[eventId].exists, "Event ID collision");

        authorizations[eventId] = Authorization({
            user: user,
            anchorType: anchorType,
            units: units,
            expiry: expiry,
            fulfilled: false,
            expired: false,
            exists: true
        });

        anchors[anchorType].totalAuthorized += units;

        emit AnchorAuthorizationCreated(eventId, user, anchorType, units, expiry);
        return eventId;
    }

    // =========================================================================
    // FULFILLMENT
    // =========================================================================

    function fulfill(
        bytes32 eventId,
        bytes32 proofHash
    ) external nonReentrant {
        Authorization storage auth = authorizations[eventId];
        
        require(auth.exists, "Authorization does not exist");
        require(!auth.fulfilled, "Already fulfilled");
        require(!auth.expired, "Authorization expired");
        require(block.timestamp <= auth.expiry, "Authorization expired (time)");

        auth.fulfilled = true;
        anchors[auth.anchorType].totalFulfilled += auth.units;

        emit AnchorFulfilled(eventId, proofHash);
    }

    // =========================================================================
    // EXPIRY / FAILURE
    // =========================================================================

    function expire(bytes32 eventId) external nonReentrant {
        Authorization storage auth = authorizations[eventId];

        require(auth.exists, "Authorization does not exist");
        require(!auth.fulfilled, "Already fulfilled");
        require(!auth.expired, "Already expired");
        require(block.timestamp > auth.expiry, "Not yet expired");

        auth.expired = true;
        
        emit AnchorExpired(eventId);
    }

    // =========================================================================
    // ADMIN
    // =========================================================================

    function haltAnchor(bytes32 anchorType, string calldata reason) external onlyOwner {
        anchors[anchorType].active = false;
        emit AnchorPaused(anchorType, reason);
    }

    function activateAnchor(bytes32 anchorType) external onlyOwner {
        anchors[anchorType].active = true;
        emit AnchorActivated(anchorType);
    }

    // =========================================================================
    // VIEW FUNCTIONS
    // =========================================================================

    function getAuthorization(bytes32 eventId) external view returns (
        address user,
        bytes32 anchorType,
        uint256 units,
        uint256 expiry,
        bool fulfilled,
        bool expired
    ) {
        Authorization memory auth = authorizations[eventId];
        require(auth.exists, "Authorization does not exist");
        return (auth.user, auth.anchorType, auth.units, auth.expiry, auth.fulfilled, auth.expired);
    }

    function isAnchorActive(bytes32 anchorType) external view returns (bool) {
        return anchors[anchorType].active;
    }

    function getPendingUnits(bytes32 anchorType) external view returns (uint256) {
        return anchors[anchorType].totalAuthorized - anchors[anchorType].totalFulfilled;
    }
    
    function getAnchorTypeHash(string memory _type) external pure returns (bytes32) {
        return keccak256(abi.encodePacked(_type));
    }
}
