// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract ReserveManager is Ownable, ReentrancyGuard {
    IERC20 public immutable USDC;
    IERC20 public immutable SFIAT;
    uint256 public constant TARGET_CR_BPS = 12000; // 120%

    address public router; // authorized router address

    event RouterUpdated(address indexed oldRouter, address indexed newRouter);
    event SFMinted(address indexed to, uint256 amount, address indexed by);
    event SFBurned(address indexed from, uint256 amount, address indexed by);

    constructor(address _usdc, address _sfiat) {
        USDC = IERC20(_usdc);
        SFIAT = IERC20(_sfiat);
    }

    modifier onlyRouter() {
        require(msg.sender == router, "ReserveManager: only router");
        _;
    }

    /// @notice set the router address - owner only (multisig)
    function setRouter(address _router) external onlyOwner {
        address old = router;
        router = _router;
        emit RouterUpdated(old, _router);
    }

    /// @notice read-only helpers
    function collateralValue() public view returns (uint256) {
        return USDC.balanceOf(address(this));
    }

    function sfiatSupply() public view returns (uint256) {
        return SFIAT.totalSupply();
    }

    function collateralizationBps() public view returns (uint256) {
        uint256 coll = collateralValue();
        uint256 supply = sfiatSupply(); // sFIAT uses 18 decimals; USDC 6 decimals - convert if needed
        // convert supply (18) to 6 decimals to compare: supply / 1e12
        if (supply == 0) return type(uint256).max;
        uint256 supply6 = supply / 1e12;
        return (coll * 10000) / supply6;
    }

    /// @notice owner-only mint (legacy/admin)
    function mintSF(address to, uint256 amount) external onlyOwner {
        // Owner bypasses CR checks if needed for emergency, or we can enforce them.
        // For strictness, let's enforce them or trust owner?
        // Existing code didn't enforce strictly in provided snippet, but diagram says 'mints/burns sfiat'.
        // Let's implement basic call to sFIAT.
        
        bool success;
        (success, ) = address(SFIAT).call(abi.encodeWithSignature("mint(address,uint256)", to, amount));
        require(success, "sFIAT mint failed");
        emit SFMinted(to, amount, msg.sender);
    }

    /// @notice Router-exposed mint function - Router calls this to mint sFIAT to users
    function mintSFFromRouter(address to, uint256 amount) external onlyRouter nonReentrant {
        // CR check - ensure collateral after this mint >= TARGET_CR_BPS
        // compute supply after mint (18 decimals)
        uint256 supplyBefore = sfiatSupply();
        uint256 supplyAfter = supplyBefore + amount;
        // convert supply to USDC decimals (6) for comparison
        uint256 supplyAfter6 = supplyAfter / 1e12; // careful rounding - tests must handle
        uint256 coll = collateralValue();
        
        // If supplyAfter6 is 0 (amount very small), CR is max.
        // If supplyAfter6 > 0, check CR.
        if (supplyAfter6 > 0) {
             uint256 newCR = (coll * 10000) / supplyAfter6;
             require(newCR >= TARGET_CR_BPS, "CR under target");
        }

        // mint the sFIAT to the recipient
        bool success;
        (success, ) = address(SFIAT).call(abi.encodeWithSignature("mint(address,uint256)", to, amount));
        require(success, "sFIAT mint failed");
        emit SFMinted(to, amount, msg.sender);
    }

    /// @notice Router or owner can burn (depending on design)
    function burnSF(address from, uint256 amount) external onlyOwner {
        bool success;
        (success, ) = address(SFIAT).call(abi.encodeWithSignature("burn(address,uint256)", from, amount));
        require(success, "sFIAT burn failed");
        emit SFBurned(from, amount, msg.sender);
    }

    // Deposit/withdraw functions remain owner-only as before
    function depositUSDC(uint256 amount) external onlyOwner {
        require(USDC.transferFrom(msg.sender, address(this), amount), "deposit failed");
    }

    function withdrawUSDC(address to, uint256 amount) external onlyOwner {
        require(USDC.transfer(to, amount), "withdraw failed");
    }
}
