# Module 5: Blockchain Verification Layer

## Overview

The Blockchain Verification Layer anchors certificate hashes on a public blockchain (Ethereum/Polygon) to create tamper-proof, independently verifiable records. This layer provides decentralized trust without storing sensitive data on-chain.

---

## Components

### 5.1 Blockchain Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                  BLOCKCHAIN VERIFICATION LAYER                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    VERIHIRE BACKEND                       │  │
│  └───────────────────────────┬──────────────────────────────┘  │
│                              │                                  │
│                              ▼                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                 BLOCKCHAIN SERVICE                        │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐       │  │
│  │  │   Queue     │  │  Contract   │  │    Gas      │       │  │
│  │  │  Manager    │  │  Interactor │  │  Optimizer  │       │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘       │  │
│  └───────────────────────────┬──────────────────────────────┘  │
│                              │                                  │
│                              ▼                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              POLYGON NETWORK (L2)                         │  │
│  │  ┌────────────────────────────────────────────────────┐  │  │
│  │  │           VeriHire Certificate Registry            │  │  │
│  │  │                 Smart Contract                     │  │  │
│  │  │                                                    │  │  │
│  │  │  • anchorCertificate(hash, metadata)              │  │  │
│  │  │  • verifyCertificate(hash) -> bool                │  │  │
│  │  │  • revokeCertificate(hash)                        │  │  │
│  │  │  • batchAnchor(hashes[], metadata[])              │  │  │
│  │  └────────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│                              │                                  │
│                              ▼                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                VERIFICATION PORTAL                        │  │
│  │       Public interface for certificate verification       │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### 5.2 Smart Contract

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

/**
 * @title VeriHireCertificateRegistry
 * @notice Stores certificate hashes for tamper-proof verification
 * @dev Uses Polygon for low-cost transactions
 */
contract VeriHireCertificateRegistry is AccessControl, Pausable, ReentrancyGuard {
    
    bytes32 public constant ISSUER_ROLE = keccak256("ISSUER_ROLE");
    bytes32 public constant REVOKER_ROLE = keccak256("REVOKER_ROLE");
    
    struct CertificateRecord {
        bytes32 hash;              // SHA-256 hash of certificate
        uint256 timestamp;         // Block timestamp when anchored
        address issuer;            // Address that anchored the certificate
        bool revoked;              // Revocation status
        uint256 revokedAt;         // Revocation timestamp
        string metadataURI;        // IPFS URI for additional metadata
    }
    
    // Certificate number => CertificateRecord
    mapping(string => CertificateRecord) public certificates;
    
    // Hash => Certificate number (for lookup by hash)
    mapping(bytes32 => string) public hashToCertificate;
    
    // Events
    event CertificateAnchored(
        string indexed certificateNumber,
        bytes32 indexed hash,
        address indexed issuer,
        uint256 timestamp,
        string metadataURI
    );
    
    event CertificateRevoked(
        string indexed certificateNumber,
        bytes32 indexed hash,
        address indexed revoker,
        uint256 timestamp,
        string reason
    );
    
    event BatchAnchored(
        uint256 count,
        address indexed issuer,
        uint256 timestamp
    );
    
    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ISSUER_ROLE, msg.sender);
        _grantRole(REVOKER_ROLE, msg.sender);
    }
    
    /**
     * @notice Anchor a single certificate hash
     * @param certificateNumber Unique certificate identifier
     * @param hash SHA-256 hash of the certificate data
     * @param metadataURI IPFS URI for certificate metadata
     */
    function anchorCertificate(
        string calldata certificateNumber,
        bytes32 hash,
        string calldata metadataURI
    ) external onlyRole(ISSUER_ROLE) whenNotPaused {
        require(bytes(certificateNumber).length > 0, "Empty certificate number");
        require(hash != bytes32(0), "Empty hash");
        require(certificates[certificateNumber].hash == bytes32(0), "Certificate already exists");
        require(bytes(hashToCertificate[hash]).length == 0, "Hash already registered");
        
        certificates[certificateNumber] = CertificateRecord({
            hash: hash,
            timestamp: block.timestamp,
            issuer: msg.sender,
            revoked: false,
            revokedAt: 0,
            metadataURI: metadataURI
        });
        
        hashToCertificate[hash] = certificateNumber;
        
        emit CertificateAnchored(
            certificateNumber,
            hash,
            msg.sender,
            block.timestamp,
            metadataURI
        );
    }
    
    /**
     * @notice Anchor multiple certificates in a single transaction
     * @param certificateNumbers Array of certificate numbers
     * @param hashes Array of certificate hashes
     * @param metadataURIs Array of metadata URIs
     */
    function batchAnchorCertificates(
        string[] calldata certificateNumbers,
        bytes32[] calldata hashes,
        string[] calldata metadataURIs
    ) external onlyRole(ISSUER_ROLE) whenNotPaused nonReentrant {
        require(
            certificateNumbers.length == hashes.length && 
            hashes.length == metadataURIs.length,
            "Array length mismatch"
        );
        require(certificateNumbers.length <= 100, "Batch too large");
        
        for (uint256 i = 0; i < certificateNumbers.length; i++) {
            require(bytes(certificateNumbers[i]).length > 0, "Empty certificate number");
            require(hashes[i] != bytes32(0), "Empty hash");
            require(certificates[certificateNumbers[i]].hash == bytes32(0), "Certificate exists");
            require(bytes(hashToCertificate[hashes[i]]).length == 0, "Hash registered");
            
            certificates[certificateNumbers[i]] = CertificateRecord({
                hash: hashes[i],
                timestamp: block.timestamp,
                issuer: msg.sender,
                revoked: false,
                revokedAt: 0,
                metadataURI: metadataURIs[i]
            });
            
            hashToCertificate[hashes[i]] = certificateNumbers[i];
            
            emit CertificateAnchored(
                certificateNumbers[i],
                hashes[i],
                msg.sender,
                block.timestamp,
                metadataURIs[i]
            );
        }
        
        emit BatchAnchored(certificateNumbers.length, msg.sender, block.timestamp);
    }
    
    /**
     * @notice Verify a certificate by its number
     * @param certificateNumber The certificate number to verify
     * @return exists Whether the certificate exists
     * @return revoked Whether the certificate is revoked
     * @return hash The certificate hash
     * @return timestamp When the certificate was anchored
     */
    function verifyCertificate(string calldata certificateNumber) 
        external 
        view 
        returns (
            bool exists,
            bool revoked,
            bytes32 hash,
            uint256 timestamp
        ) 
    {
        CertificateRecord memory cert = certificates[certificateNumber];
        exists = cert.hash != bytes32(0);
        revoked = cert.revoked;
        hash = cert.hash;
        timestamp = cert.timestamp;
    }
    
    /**
     * @notice Verify a certificate by its hash
     * @param hash The certificate hash to verify
     * @return exists Whether the certificate exists
     * @return revoked Whether the certificate is revoked
     * @return certificateNumber The certificate number
     * @return timestamp When the certificate was anchored
     */
    function verifyCertificateByHash(bytes32 hash)
        external
        view
        returns (
            bool exists,
            bool revoked,
            string memory certificateNumber,
            uint256 timestamp
        )
    {
        certificateNumber = hashToCertificate[hash];
        exists = bytes(certificateNumber).length > 0;
        
        if (exists) {
            CertificateRecord memory cert = certificates[certificateNumber];
            revoked = cert.revoked;
            timestamp = cert.timestamp;
        }
    }
    
    /**
     * @notice Revoke a certificate
     * @param certificateNumber The certificate to revoke
     * @param reason The reason for revocation
     */
    function revokeCertificate(
        string calldata certificateNumber,
        string calldata reason
    ) external onlyRole(REVOKER_ROLE) {
        CertificateRecord storage cert = certificates[certificateNumber];
        require(cert.hash != bytes32(0), "Certificate does not exist");
        require(!cert.revoked, "Certificate already revoked");
        
        cert.revoked = true;
        cert.revokedAt = block.timestamp;
        
        emit CertificateRevoked(
            certificateNumber,
            cert.hash,
            msg.sender,
            block.timestamp,
            reason
        );
    }
    
    /**
     * @notice Get full certificate record
     * @param certificateNumber The certificate number
     * @return The full certificate record
     */
    function getCertificateRecord(string calldata certificateNumber)
        external
        view
        returns (CertificateRecord memory)
    {
        return certificates[certificateNumber];
    }
    
    // Admin functions
    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }
    
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }
}
```

---

### 5.3 Blockchain Service

```python
from web3 import Web3
from eth_account import Account
import asyncio
from typing import List, Optional
import json

class BlockchainService:
    def __init__(self, config: BlockchainConfig):
        self.config = config
        self.w3 = Web3(Web3.HTTPProvider(config.rpc_url))
        self.contract = self._load_contract()
        self.account = Account.from_key(config.private_key)
        self.gas_oracle = GasOracle(config.gas_oracle_url)
        self.queue = CertificateQueue()
    
    def _load_contract(self):
        with open(self.config.abi_path) as f:
            abi = json.load(f)
        return self.w3.eth.contract(
            address=self.config.contract_address,
            abi=abi
        )
    
    async def anchor_certificate(
        self,
        certificate_number: str,
        certificate_hash: str,
        metadata_uri: str
    ) -> AnchorResult:
        """
        Anchor a single certificate to the blockchain.
        """
        try:
            # Convert hash to bytes32
            hash_bytes = bytes.fromhex(certificate_hash)
            
            # Get optimal gas price
            gas_price = await self.gas_oracle.get_optimal_gas_price()
            
            # Build transaction
            tx = self.contract.functions.anchorCertificate(
                certificate_number,
                hash_bytes,
                metadata_uri
            ).build_transaction({
                'from': self.account.address,
                'nonce': self.w3.eth.get_transaction_count(self.account.address),
                'gas': 150000,
                'gasPrice': gas_price,
                'chainId': self.config.chain_id
            })
            
            # Sign and send
            signed_tx = self.w3.eth.account.sign_transaction(tx, self.account.key)
            tx_hash = self.w3.eth.send_raw_transaction(signed_tx.rawTransaction)
            
            # Wait for confirmation
            receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
            
            if receipt['status'] == 1:
                return AnchorResult(
                    success=True,
                    tx_hash=tx_hash.hex(),
                    block_number=receipt['blockNumber'],
                    gas_used=receipt['gasUsed'],
                    timestamp=self._get_block_timestamp(receipt['blockNumber'])
                )
            else:
                return AnchorResult(
                    success=False,
                    error="Transaction reverted"
                )
                
        except Exception as e:
            return AnchorResult(
                success=False,
                error=str(e)
            )
    
    async def batch_anchor_certificates(
        self,
        certificates: List[CertificateBatchItem]
    ) -> BatchAnchorResult:
        """
        Anchor multiple certificates in a single transaction.
        More gas-efficient for high volume.
        """
        
        certificate_numbers = [c.certificate_number for c in certificates]
        hashes = [bytes.fromhex(c.hash) for c in certificates]
        metadata_uris = [c.metadata_uri for c in certificates]
        
        try:
            gas_price = await self.gas_oracle.get_optimal_gas_price()
            
            # Estimate gas for batch
            estimated_gas = self.contract.functions.batchAnchorCertificates(
                certificate_numbers,
                hashes,
                metadata_uris
            ).estimate_gas({'from': self.account.address})
            
            tx = self.contract.functions.batchAnchorCertificates(
                certificate_numbers,
                hashes,
                metadata_uris
            ).build_transaction({
                'from': self.account.address,
                'nonce': self.w3.eth.get_transaction_count(self.account.address),
                'gas': int(estimated_gas * 1.2),  # 20% buffer
                'gasPrice': gas_price,
                'chainId': self.config.chain_id
            })
            
            signed_tx = self.w3.eth.account.sign_transaction(tx, self.account.key)
            tx_hash = self.w3.eth.send_raw_transaction(signed_tx.rawTransaction)
            receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash, timeout=300)
            
            if receipt['status'] == 1:
                return BatchAnchorResult(
                    success=True,
                    tx_hash=tx_hash.hex(),
                    block_number=receipt['blockNumber'],
                    gas_used=receipt['gasUsed'],
                    certificates_anchored=len(certificates),
                    gas_per_certificate=receipt['gasUsed'] / len(certificates)
                )
            else:
                return BatchAnchorResult(
                    success=False,
                    error="Batch transaction reverted"
                )
                
        except Exception as e:
            return BatchAnchorResult(
                success=False,
                error=str(e)
            )
    
    async def verify_certificate(
        self,
        certificate_number: str = None,
        certificate_hash: str = None
    ) -> BlockchainVerificationResult:
        """
        Verify a certificate on the blockchain.
        """
        
        try:
            if certificate_number:
                result = self.contract.functions.verifyCertificate(
                    certificate_number
                ).call()
                exists, revoked, hash_bytes, timestamp = result
            elif certificate_hash:
                hash_bytes = bytes.fromhex(certificate_hash)
                result = self.contract.functions.verifyCertificateByHash(
                    hash_bytes
                ).call()
                exists, revoked, certificate_number, timestamp = result
            else:
                raise ValueError("Must provide certificate_number or certificate_hash")
            
            return BlockchainVerificationResult(
                exists=exists,
                revoked=revoked,
                certificate_number=certificate_number,
                hash=hash_bytes.hex() if isinstance(hash_bytes, bytes) else certificate_hash,
                anchored_at=datetime.fromtimestamp(timestamp) if timestamp > 0 else None,
                verified_on_chain=True
            )
            
        except Exception as e:
            return BlockchainVerificationResult(
                exists=False,
                verified_on_chain=False,
                error=str(e)
            )
    
    async def revoke_certificate(
        self,
        certificate_number: str,
        reason: str
    ) -> RevocationResult:
        """
        Revoke a certificate on the blockchain.
        """
        
        try:
            gas_price = await self.gas_oracle.get_optimal_gas_price()
            
            tx = self.contract.functions.revokeCertificate(
                certificate_number,
                reason
            ).build_transaction({
                'from': self.account.address,
                'nonce': self.w3.eth.get_transaction_count(self.account.address),
                'gas': 100000,
                'gasPrice': gas_price,
                'chainId': self.config.chain_id
            })
            
            signed_tx = self.w3.eth.account.sign_transaction(tx, self.account.key)
            tx_hash = self.w3.eth.send_raw_transaction(signed_tx.rawTransaction)
            receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
            
            return RevocationResult(
                success=receipt['status'] == 1,
                tx_hash=tx_hash.hex(),
                revoked_at=datetime.utcnow()
            )
            
        except Exception as e:
            return RevocationResult(
                success=False,
                error=str(e)
            )
```

---

### 5.4 Batch Processing Queue

```python
class CertificateAnchorQueue:
    """
    Queue certificates for batch anchoring to optimize gas costs.
    """
    
    def __init__(self, blockchain_service: BlockchainService, config: QueueConfig):
        self.blockchain = blockchain_service
        self.config = config
        self.queue = asyncio.Queue()
        self.batch_size = config.batch_size  # e.g., 50
        self.batch_interval = config.batch_interval  # e.g., 300 seconds
    
    async def enqueue(self, certificate: Certificate) -> str:
        """
        Add certificate to the anchoring queue.
        Returns a queue ticket ID for tracking.
        """
        
        ticket_id = str(uuid.uuid4())
        
        queue_item = QueueItem(
            ticket_id=ticket_id,
            certificate_number=certificate.certificate_number,
            hash=certificate.verification.hash,
            metadata_uri=f"ipfs://{certificate.storage.ipfs_hash}",
            enqueued_at=datetime.utcnow()
        )
        
        await self.queue.put(queue_item)
        
        return ticket_id
    
    async def process_batch(self):
        """
        Process queued certificates in batches.
        Called periodically or when batch size is reached.
        """
        
        batch = []
        
        while not self.queue.empty() and len(batch) < self.batch_size:
            try:
                item = self.queue.get_nowait()
                batch.append(item)
            except asyncio.QueueEmpty:
                break
        
        if not batch:
            return
        
        # Process batch
        result = await self.blockchain.batch_anchor_certificates([
            CertificateBatchItem(
                certificate_number=item.certificate_number,
                hash=item.hash,
                metadata_uri=item.metadata_uri
            )
            for item in batch
        ])
        
        if result.success:
            # Update certificates with blockchain tx
            for item in batch:
                await self._update_certificate_blockchain_info(
                    certificate_number=item.certificate_number,
                    tx_hash=result.tx_hash,
                    block_number=result.block_number
                )
                
                # Notify via webhook/event
                await self._emit_anchored_event(item, result)
        else:
            # Re-queue failed items
            for item in batch:
                await self.queue.put(item)
            
            # Alert monitoring
            await self._alert_batch_failure(result.error)
    
    async def start_processor(self):
        """
        Start the background batch processor.
        """
        
        while True:
            await asyncio.sleep(self.batch_interval)
            
            if self.queue.qsize() >= self.batch_size:
                await self.process_batch()
            elif self.queue.qsize() > 0:
                # Process smaller batch if interval elapsed
                await self.process_batch()
```

---

### 5.5 Verification Portal

```typescript
// Public verification page component
interface VerificationPageProps {
  certificateNumber?: string;
}

const CertificateVerificationPortal: React.FC<VerificationPageProps> = ({ 
  certificateNumber 
}) => {
  const [searchInput, setSearchInput] = useState(certificateNumber || '');
  const [verificationResult, setVerificationResult] = useState<VerificationResult | null>(null);
  const [loading, setLoading] = useState(false);

  const verifyCertificate = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/v1/certificates/verify/${searchInput}`);
      const result = await response.json();
      setVerificationResult(result);
    } catch (error) {
      setVerificationResult({
        valid: false,
        error: 'Verification failed. Please try again.'
      });
    }
    setLoading(false);
  };

  return (
    <div className="verification-portal">
      <header>
        <h1>VeriHire Certificate Verification</h1>
        <p>Verify the authenticity of any VeriHire skill certificate</p>
      </header>

      <div className="search-section">
        <input
          type="text"
          placeholder="Enter certificate number or hash"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
        <button onClick={verifyCertificate} disabled={loading}>
          {loading ? 'Verifying...' : 'Verify Certificate'}
        </button>
      </div>

      {verificationResult && (
        <div className={`result ${verificationResult.valid ? 'valid' : 'invalid'}`}>
          {verificationResult.valid ? (
            <ValidCertificateDisplay certificate={verificationResult.certificate} />
          ) : (
            <InvalidCertificateDisplay error={verificationResult.error} />
          )}
          
          <VerificationSteps steps={verificationResult.verificationSteps} />
          
          {verificationResult.certificate?.verification.blockchainTxId && (
            <BlockchainProof 
              txId={verificationResult.certificate.verification.blockchainTxId}
              network="Polygon"
            />
          )}
        </div>
      )}

      <QRScanner onScan={(data) => setSearchInput(data)} />
    </div>
  );
};

const BlockchainProof: React.FC<{ txId: string; network: string }> = ({ 
  txId, 
  network 
}) => {
  const explorerUrl = network === 'Polygon' 
    ? `https://polygonscan.com/tx/${txId}`
    : `https://etherscan.io/tx/${txId}`;

  return (
    <div className="blockchain-proof">
      <h3>Blockchain Verification</h3>
      <p>This certificate is anchored on the {network} blockchain.</p>
      <div className="tx-info">
        <span>Transaction: {txId.slice(0, 10)}...{txId.slice(-8)}</span>
        <a href={explorerUrl} target="_blank" rel="noopener noreferrer">
          View on {network}scan
        </a>
      </div>
    </div>
  );
};
```

---

### 5.6 Gas Optimization Strategy

```python
class GasOptimizer:
    """
    Optimize gas costs for blockchain operations.
    """
    
    def __init__(self, gas_oracle: GasOracle):
        self.gas_oracle = gas_oracle
        self.price_history = []
    
    async def get_optimal_gas_price(self) -> int:
        """
        Get optimal gas price based on current network conditions.
        """
        
        current_prices = await self.gas_oracle.get_prices()
        
        # For non-urgent operations (certificates), use slow/standard
        if not self._is_urgent():
            return current_prices['standard']
        else:
            return current_prices['fast']
    
    def calculate_batch_savings(
        self,
        single_gas: int,
        batch_gas: int,
        batch_size: int
    ) -> dict:
        """
        Calculate gas savings from batching.
        """
        
        total_single = single_gas * batch_size
        savings = total_single - batch_gas
        savings_percent = (savings / total_single) * 100
        
        return {
            'single_total': total_single,
            'batch_total': batch_gas,
            'savings': savings,
            'savings_percent': savings_percent,
            'gas_per_item': batch_gas / batch_size
        }
    
    async def should_batch(self, queue_size: int) -> bool:
        """
        Determine if batching makes economic sense.
        """
        
        current_gas_price = await self.get_optimal_gas_price()
        
        # Cost analysis
        single_tx_gas = 150000
        batch_base_gas = 80000
        batch_per_item_gas = 45000
        
        single_cost = queue_size * single_tx_gas * current_gas_price
        batch_cost = (batch_base_gas + queue_size * batch_per_item_gas) * current_gas_price
        
        return batch_cost < single_cost * 0.8  # Batch if >20% savings
```

---

## Network Configuration

### Supported Networks

| Network | Chain ID | Use Case | Avg Gas Cost |
|---------|----------|----------|--------------|
| Polygon Mainnet | 137 | Production | ~$0.01/tx |
| Polygon Mumbai | 80001 | Testing | Free |
| Ethereum Mainnet | 1 | High-value certs | ~$5-50/tx |
| Ethereum Goerli | 5 | Testing | Free |

### Configuration

```yaml
blockchain:
  primary_network: "polygon"
  
  networks:
    polygon:
      rpc_url: "${POLYGON_RPC_URL}"
      chain_id: 137
      contract_address: "${POLYGON_CONTRACT_ADDRESS}"
      explorer_url: "https://polygonscan.com"
      gas_oracle_url: "https://gasstation-mainnet.matic.network/v2"
    
    ethereum:
      rpc_url: "${ETHEREUM_RPC_URL}"
      chain_id: 1
      contract_address: "${ETHEREUM_CONTRACT_ADDRESS}"
      explorer_url: "https://etherscan.io"
      gas_oracle_url: "https://api.etherscan.io/api?module=gastracker"
  
  batch_processing:
    enabled: true
    batch_size: 50
    interval_seconds: 300
    max_retries: 3
  
  gas_limits:
    anchor_single: 150000
    anchor_batch_base: 80000
    anchor_batch_per_item: 45000
    revoke: 100000
```

---

## API Specifications

### Anchor Certificate API

```yaml
POST /api/v1/blockchain/anchor
Request:
  certificateId: string
  priority: "normal" | "high"
  
Response:
  ticketId: string
  status: "queued" | "processing" | "completed"
  estimatedCompletion: datetime
```

### Verify on Blockchain API

```yaml
GET /api/v1/blockchain/verify/{certificateNumber}
Response:
  exists: boolean
  revoked: boolean
  anchoredAt: datetime
  blockNumber: number
  transactionHash: string
  network: string
  explorerUrl: string
```

### Get Anchor Status API

```yaml
GET /api/v1/blockchain/status/{ticketId}
Response:
  ticketId: string
  status: "queued" | "processing" | "completed" | "failed"
  certificateNumber: string
  transactionHash?: string
  blockNumber?: number
  error?: string
```

---

## Deliverables

1. [ ] Smart Contract (Solidity)
2. [ ] Contract Deployment Scripts
3. [ ] Blockchain Service (Python)
4. [ ] Batch Processing Queue
5. [ ] Gas Optimization Module
6. [ ] Verification Portal
7. [ ] QR Code Scanner Integration
8. [ ] Multi-network Support
9. [ ] Monitoring Dashboard
10. [ ] API Documentation

---

*Module Owner: Blockchain Developer*
*Last Updated: January 2026*
