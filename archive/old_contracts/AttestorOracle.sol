// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "@openzeppelin/contracts/access/AccessControl.sol";
contract AttestorOracle is AccessControl {
    bytes32 public constant ATTESTOR = keccak256("ATTESTOR");
    mapping(bytes32 => bool) public attestationUsed;
    event AttestationVerified(bytes32 id, address attestor);
    function verifyAttestation(bytes memory payload, bytes memory sig, address expectedSigner) public returns (bytes32) {
        bytes32 id = keccak256(payload);
        require(!attestationUsed[id], "replay");
        bytes32 pref = prefixed(keccak256(payload));
        address signer = recover(pref, sig);
        require(signer == expectedSigner, "bad signer");
        attestationUsed[id] = true;
        emit AttestationVerified(id, signer);
        return id;
    }
    function prefixed(bytes32 hash) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", hash));
    }
    function recover(bytes32 hash, bytes memory sig) internal pure returns (address) {
        require(sig.length == 65, "siglen");
        bytes32 r; bytes32 s; uint8 v;
        assembly { r := mload(add(sig, 32)) s := mload(add(sig, 64)) v := byte(0, mload(add(sig, 96))) }
        return ecrecover(hash, v, r, s);
    }
}
