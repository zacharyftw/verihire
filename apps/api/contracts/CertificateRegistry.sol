// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract CertificateRegistry {
    mapping(string => bytes32) public certificates;
    mapping(string => uint256) public timestamps;
    
    event CertificateAnchored(
        string indexed certificateNumber,
        bytes32 hash,
        uint256 timestamp
    );
    
    function anchor(string memory certificateNumber, bytes32 hash) external {
        require(certificates[certificateNumber] == bytes32(0), "Certificate already anchored");
        require(hash != bytes32(0), "Invalid hash");
        
        certificates[certificateNumber] = hash;
        timestamps[certificateNumber] = block.timestamp;
        
        emit CertificateAnchored(certificateNumber, hash, block.timestamp);
    }
    
    function verify(string memory certificateNumber) external view returns (bytes32, uint256) {
        return (certificates[certificateNumber], timestamps[certificateNumber]);
    }
}
