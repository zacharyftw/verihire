# Module 4: Certification Generation Layer

## Overview

The Certification Generation Layer creates tamper-proof digital certificates containing verified skill data, candidate information, and evaluation scores. Certificates are cryptographically secured using SHA-256 hashing and prepared for blockchain anchoring.

---

## Components

### 4.1 Certificate Generation Engine

#### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                  CERTIFICATE GENERATION ENGINE                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐    │
│  │   Verified   │     │  Certificate │     │   Template   │    │
│  │    Score     │ --> │   Builder    │ --> │   Renderer   │    │
│  │    Data      │     │              │     │              │    │
│  └──────────────┘     └──────────────┘     └──────────────┘    │
│                              │                    │             │
│                              ▼                    ▼             │
│                       ┌──────────────┐     ┌──────────────┐    │
│                       │   Identity   │     │   Visual     │    │
│                       │  Validator   │     │  Generator   │    │
│                       └──────────────┘     └──────────────┘    │
│                                                   │             │
│                                                   ▼             │
│                       ┌──────────────────────────────────────┐  │
│                       │         CRYPTOGRAPHIC LAYER          │  │
│                       │                                      │  │
│                       │  ┌─────────┐  ┌─────────┐           │  │
│                       │  │ SHA-256 │  │  Sign   │           │  │
│                       │  │  Hash   │  │ (ECDSA) │           │  │
│                       │  └─────────┘  └─────────┘           │  │
│                       └──────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

#### Certificate Data Structure

```typescript
interface Certificate {
  // Unique identifiers
  id: string;                      // UUID v4
  certificateNumber: string;       // Human-readable: VH-2026-SKILL-XXXXX
  version: string;                 // Certificate schema version
  
  // Candidate information
  candidate: {
    id: string;
    name: string;
    email: string;                 // Hashed for privacy
    profileUrl: string;
  };
  
  // Skill certification
  skill: {
    id: string;
    name: string;
    category: string;
    level: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  };
  
  // Evaluation results
  evaluation: {
    challengeId: string;
    challengeTitle: string;
    score: number;                 // 0-100
    percentile: number;            // Among all candidates
    grade: string;                 // A, B, C, D, F
    criteriaScores: CriterionScore[];
    aiScore: number;
    peerScore: number;
    confidence: number;
  };
  
  // Timestamps
  issuedAt: Date;
  expiresAt: Date;                 // Optional, skill-dependent
  evaluatedAt: Date;
  
  // Verification data
  verification: {
    hash: string;                  // SHA-256 of certificate data
    signature: string;             // ECDSA signature
    publicKey: string;             // Issuer public key
    blockchainTxId?: string;       // After blockchain anchoring
    verificationUrl: string;
  };
  
  // Metadata
  metadata: {
    issuer: string;                // "VeriHire Platform"
    issuerDid?: string;            // Decentralized identifier
    standard: string;              // "Blockcerts v2" or custom
  };
}

interface CriterionScore {
  criterion: string;
  score: number;
  weight: number;
}
```

#### Certificate Generation Pipeline

```python
class CertificateGenerator:
    def __init__(self):
        self.identity_validator = IdentityValidator()
        self.template_engine = TemplateEngine()
        self.crypto_service = CryptographicService()
        self.storage_service = CertificateStorage()
    
    async def generate_certificate(
        self,
        submission: Submission,
        aggregated_score: AggregatedScore,
        candidate: User
    ) -> Certificate:
        """
        Generate a verified, cryptographically signed certificate.
        """
        
        # 1. Validate candidate identity
        identity_verified = await self.identity_validator.verify(
            candidate=candidate,
            submission=submission
        )
        
        if not identity_verified:
            raise IdentityVerificationError("Candidate identity could not be verified")
        
        # 2. Check score threshold
        if aggregated_score.final_score < self._get_pass_threshold(submission.challenge):
            raise ScoreThresholdError("Score does not meet certification threshold")
        
        # 3. Build certificate data
        certificate_data = CertificateData(
            candidate_id=candidate.id,
            candidate_name=candidate.full_name,
            candidate_email_hash=self._hash_email(candidate.email),
            skill_id=submission.challenge.skill.id,
            skill_name=submission.challenge.skill.name,
            skill_category=submission.challenge.skill.category,
            skill_level=submission.challenge.difficulty,
            challenge_id=submission.challenge.id,
            challenge_title=submission.challenge.title,
            score=aggregated_score.final_score,
            percentile=aggregated_score.percentile,
            grade=self._score_to_grade(aggregated_score.final_score),
            criteria_scores=aggregated_score.criteria_scores,
            ai_score=aggregated_score.ai_score,
            peer_score=aggregated_score.peer_score,
            confidence=aggregated_score.confidence,
            issued_at=datetime.utcnow(),
            expires_at=self._calculate_expiry(submission.challenge.skill)
        )
        
        # 4. Generate certificate number
        certificate_number = self._generate_certificate_number(
            skill=submission.challenge.skill,
            year=datetime.utcnow().year
        )
        
        # 5. Create cryptographic hash
        certificate_hash = self.crypto_service.hash_certificate(certificate_data)
        
        # 6. Sign certificate
        signature = self.crypto_service.sign(
            data=certificate_hash,
            private_key=self._get_issuer_private_key()
        )
        
        # 7. Create verification URL
        verification_url = self._create_verification_url(certificate_number)
        
        # 8. Build final certificate
        certificate = Certificate(
            id=str(uuid.uuid4()),
            certificate_number=certificate_number,
            version="1.0",
            candidate=CandidateInfo(...),
            skill=SkillInfo(...),
            evaluation=EvaluationInfo(...),
            issued_at=certificate_data.issued_at,
            expires_at=certificate_data.expires_at,
            verification=VerificationInfo(
                hash=certificate_hash,
                signature=signature,
                public_key=self._get_issuer_public_key(),
                verification_url=verification_url
            ),
            metadata=MetadataInfo(
                issuer="VeriHire Platform",
                standard="VeriHire Certificate v1"
            )
        )
        
        # 9. Store certificate
        await self.storage_service.store(certificate)
        
        # 10. Queue for blockchain anchoring
        await self._queue_for_blockchain(certificate)
        
        return certificate
    
    def _generate_certificate_number(self, skill: Skill, year: int) -> str:
        """Generate human-readable certificate number."""
        skill_code = skill.code.upper()[:4]
        sequence = self._get_next_sequence(skill.id, year)
        return f"VH-{year}-{skill_code}-{sequence:05d}"
    
    def _score_to_grade(self, score: float) -> str:
        if score >= 90: return "A+"
        if score >= 85: return "A"
        if score >= 80: return "A-"
        if score >= 75: return "B+"
        if score >= 70: return "B"
        if score >= 65: return "B-"
        if score >= 60: return "C+"
        if score >= 55: return "C"
        if score >= 50: return "C-"
        return "F"
```

---

### 4.2 Cryptographic Service

```python
class CryptographicService:
    def __init__(self):
        self.hash_algorithm = "sha256"
        self.signature_algorithm = "ECDSA"
        self.curve = "secp256k1"  # Same as Ethereum for compatibility
    
    def hash_certificate(self, certificate_data: CertificateData) -> str:
        """
        Generate SHA-256 hash of certificate data.
        """
        # Serialize to canonical JSON (sorted keys, no whitespace)
        canonical_json = json.dumps(
            certificate_data.to_dict(),
            sort_keys=True,
            separators=(',', ':')
        )
        
        # Generate hash
        hash_bytes = hashlib.sha256(canonical_json.encode('utf-8')).digest()
        
        return hash_bytes.hex()
    
    def sign(self, data: str, private_key: bytes) -> str:
        """
        Sign data using ECDSA with secp256k1 curve.
        """
        sk = SigningKey.from_string(private_key, curve=SECP256k1)
        signature = sk.sign(
            data.encode('utf-8'),
            hashfunc=hashlib.sha256
        )
        return signature.hex()
    
    def verify_signature(
        self,
        data: str,
        signature: str,
        public_key: str
    ) -> bool:
        """
        Verify ECDSA signature.
        """
        try:
            vk = VerifyingKey.from_string(
                bytes.fromhex(public_key),
                curve=SECP256k1
            )
            return vk.verify(
                bytes.fromhex(signature),
                data.encode('utf-8'),
                hashfunc=hashlib.sha256
            )
        except BadSignatureError:
            return False
    
    def generate_keypair(self) -> tuple:
        """
        Generate new ECDSA keypair for certificate signing.
        """
        sk = SigningKey.generate(curve=SECP256k1)
        vk = sk.get_verifying_key()
        
        return (
            sk.to_string().hex(),  # Private key
            vk.to_string().hex()   # Public key
        )
```

---

### 4.3 Certificate Template System

#### Visual Certificate Template

```typescript
interface CertificateTemplate {
  id: string;
  name: string;
  category: string;  // skill category
  design: {
    background: string;       // SVG or image URL
    primaryColor: string;
    secondaryColor: string;
    font: string;
  };
  layout: {
    titlePosition: Position;
    candidateNamePosition: Position;
    skillNamePosition: Position;
    scorePosition: Position;
    datePosition: Position;
    qrCodePosition: Position;
    signaturePosition: Position;
    badgePosition: Position;
  };
  elements: TemplateElement[];
}

interface Position {
  x: number;
  y: number;
  width: number;
  height: number;
  alignment: 'left' | 'center' | 'right';
}
```

#### PDF Certificate Generation

```python
class VisualCertificateGenerator:
    def __init__(self):
        self.template_repo = TemplateRepository()
        self.qr_generator = QRCodeGenerator()
        self.pdf_engine = PDFEngine()
    
    async def generate_pdf(
        self,
        certificate: Certificate
    ) -> bytes:
        """
        Generate visual PDF certificate.
        """
        
        # 1. Select template based on skill category
        template = await self.template_repo.get_template(
            category=certificate.skill.category
        )
        
        # 2. Generate QR code for verification
        qr_code = self.qr_generator.generate(
            data=certificate.verification.verification_url,
            size=150
        )
        
        # 3. Prepare badge based on level
        badge = self._get_level_badge(certificate.skill.level)
        
        # 4. Render PDF
        pdf_content = await self.pdf_engine.render(
            template=template,
            data={
                "certificate_number": certificate.certificate_number,
                "candidate_name": certificate.candidate.name,
                "skill_name": certificate.skill.name,
                "skill_level": certificate.skill.level.title(),
                "score": f"{certificate.evaluation.score:.1f}",
                "percentile": f"Top {100 - certificate.evaluation.percentile:.0f}%",
                "grade": certificate.evaluation.grade,
                "issued_date": certificate.issued_at.strftime("%B %d, %Y"),
                "expiry_date": certificate.expires_at.strftime("%B %d, %Y") if certificate.expires_at else "No Expiry",
                "qr_code": qr_code,
                "badge": badge,
                "verification_hash": certificate.verification.hash[:16] + "..."
            }
        )
        
        return pdf_content
    
    async def generate_shareable_image(
        self,
        certificate: Certificate
    ) -> bytes:
        """
        Generate shareable image for social media.
        """
        
        template = await self.template_repo.get_social_template(
            category=certificate.skill.category
        )
        
        image = await self.image_engine.render(
            template=template,
            data={
                "candidate_name": certificate.candidate.name,
                "skill_name": certificate.skill.name,
                "level": certificate.skill.level,
                "score": certificate.evaluation.score,
                "badge": self._get_level_badge(certificate.skill.level)
            },
            format="png",
            size=(1200, 630)  # Open Graph optimal size
        )
        
        return image
```

---

### 4.4 Certificate Storage

```python
class CertificateStorage:
    def __init__(self):
        self.db = CertificateDatabase()
        self.ipfs = IPFSClient()
        self.s3 = S3Client()
    
    async def store(self, certificate: Certificate) -> StorageResult:
        """
        Store certificate in multiple locations for redundancy.
        """
        
        # 1. Store in primary database
        await self.db.save(certificate)
        
        # 2. Store certificate JSON in IPFS for decentralization
        ipfs_hash = await self.ipfs.add(
            data=certificate.to_json(),
            pin=True
        )
        
        # 3. Store PDF version in S3
        pdf_content = await self._generate_pdf(certificate)
        s3_key = f"certificates/{certificate.id}/{certificate.certificate_number}.pdf"
        await self.s3.upload(
            key=s3_key,
            data=pdf_content,
            content_type="application/pdf"
        )
        
        # 4. Store shareable image
        image_content = await self._generate_image(certificate)
        image_key = f"certificates/{certificate.id}/share.png"
        await self.s3.upload(
            key=image_key,
            data=image_content,
            content_type="image/png"
        )
        
        # 5. Update certificate with storage locations
        certificate.storage = StorageInfo(
            ipfs_hash=ipfs_hash,
            pdf_url=self.s3.get_url(s3_key),
            image_url=self.s3.get_url(image_key)
        )
        
        await self.db.update(certificate)
        
        return StorageResult(
            certificate_id=certificate.id,
            ipfs_hash=ipfs_hash,
            pdf_url=certificate.storage.pdf_url,
            image_url=certificate.storage.image_url
        )
```

---

### 4.5 Certificate Verification Service

```python
class CertificateVerificationService:
    def __init__(self):
        self.db = CertificateDatabase()
        self.crypto_service = CryptographicService()
        self.blockchain_service = BlockchainService()
    
    async def verify(
        self,
        certificate_number: str = None,
        certificate_hash: str = None
    ) -> VerificationResult:
        """
        Verify certificate authenticity through multiple checks.
        """
        
        # 1. Retrieve certificate
        if certificate_number:
            certificate = await self.db.get_by_number(certificate_number)
        elif certificate_hash:
            certificate = await self.db.get_by_hash(certificate_hash)
        else:
            raise ValueError("Must provide certificate_number or certificate_hash")
        
        if not certificate:
            return VerificationResult(
                valid=False,
                error="Certificate not found"
            )
        
        verification_steps = []
        
        # 2. Verify hash integrity
        computed_hash = self.crypto_service.hash_certificate(
            certificate.to_data()
        )
        hash_valid = computed_hash == certificate.verification.hash
        verification_steps.append(VerificationStep(
            name="Hash Integrity",
            passed=hash_valid,
            details="Certificate data has not been tampered with" if hash_valid else "Hash mismatch detected"
        ))
        
        # 3. Verify signature
        signature_valid = self.crypto_service.verify_signature(
            data=certificate.verification.hash,
            signature=certificate.verification.signature,
            public_key=certificate.verification.public_key
        )
        verification_steps.append(VerificationStep(
            name="Digital Signature",
            passed=signature_valid,
            details="Signature verified" if signature_valid else "Invalid signature"
        ))
        
        # 4. Verify blockchain anchor (if available)
        if certificate.verification.blockchain_tx_id:
            blockchain_valid = await self.blockchain_service.verify(
                tx_id=certificate.verification.blockchain_tx_id,
                expected_hash=certificate.verification.hash
            )
            verification_steps.append(VerificationStep(
                name="Blockchain Verification",
                passed=blockchain_valid,
                details="Certificate anchored on blockchain" if blockchain_valid else "Blockchain verification failed"
            ))
        
        # 5. Check expiry
        if certificate.expires_at:
            not_expired = certificate.expires_at > datetime.utcnow()
            verification_steps.append(VerificationStep(
                name="Expiry Check",
                passed=not_expired,
                details="Certificate is valid" if not_expired else "Certificate has expired"
            ))
        
        # 6. Check revocation status
        not_revoked = not await self.db.is_revoked(certificate.id)
        verification_steps.append(VerificationStep(
            name="Revocation Check",
            passed=not_revoked,
            details="Certificate is active" if not_revoked else "Certificate has been revoked"
        ))
        
        # Overall result
        all_passed = all(step.passed for step in verification_steps)
        
        return VerificationResult(
            valid=all_passed,
            certificate=certificate if all_passed else None,
            verification_steps=verification_steps,
            verified_at=datetime.utcnow()
        )
```

---

## API Specifications

### Generate Certificate API

```yaml
POST /api/v1/certificates/generate
Request:
  submissionId: string
  
Response:
  certificateId: string
  certificateNumber: string
  status: "generated" | "pending_blockchain"
  pdfUrl: string
  shareableImageUrl: string
  verificationUrl: string
```

### Verify Certificate API

```yaml
GET /api/v1/certificates/verify/{certificateNumber}
Response:
  valid: boolean
  certificate?:
    candidateName: string
    skillName: string
    skillLevel: string
    score: number
    grade: string
    issuedAt: datetime
    expiresAt: datetime
  verificationSteps:
    - name: string
      passed: boolean
      details: string
  verifiedAt: datetime
```

### Download Certificate API

```yaml
GET /api/v1/certificates/{certificateId}/download
Query:
  format: "pdf" | "json" | "image"
  
Response:
  Binary file content with appropriate Content-Type
```

---

## Data Schema

### Certificate Table

```sql
CREATE TABLE certificates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    certificate_number VARCHAR(50) UNIQUE NOT NULL,
    version VARCHAR(10) NOT NULL DEFAULT '1.0',
    
    -- Candidate reference
    candidate_id UUID NOT NULL REFERENCES users(id),
    
    -- Skill reference
    skill_id UUID NOT NULL REFERENCES skills(id),
    skill_level VARCHAR(20) NOT NULL,
    
    -- Challenge reference
    challenge_id UUID NOT NULL REFERENCES challenges(id),
    submission_id UUID NOT NULL REFERENCES submissions(id),
    
    -- Scores
    final_score DECIMAL(5,2) NOT NULL,
    percentile DECIMAL(5,2),
    grade VARCHAR(5) NOT NULL,
    ai_score DECIMAL(5,2),
    peer_score DECIMAL(5,2),
    confidence DECIMAL(5,4),
    criteria_scores JSONB,
    
    -- Verification
    hash VARCHAR(64) NOT NULL,
    signature TEXT NOT NULL,
    public_key TEXT NOT NULL,
    blockchain_tx_id VARCHAR(66),
    verification_url TEXT NOT NULL,
    
    -- Storage
    ipfs_hash VARCHAR(100),
    pdf_url TEXT,
    image_url TEXT,
    
    -- Timestamps
    issued_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE,
    revoked_at TIMESTAMP WITH TIME ZONE,
    revocation_reason TEXT,
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    
    -- Indexes
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_certificates_candidate ON certificates(candidate_id);
CREATE INDEX idx_certificates_skill ON certificates(skill_id);
CREATE INDEX idx_certificates_hash ON certificates(hash);
CREATE INDEX idx_certificates_issued ON certificates(issued_at);
```

---

## Deliverables

1. [ ] Certificate Data Model
2. [ ] Certificate Generation Engine
3. [ ] Cryptographic Service (SHA-256, ECDSA)
4. [ ] PDF Certificate Generator
5. [ ] Shareable Image Generator
6. [ ] QR Code Integration
7. [ ] Certificate Storage Service
8. [ ] Certificate Verification Service
9. [ ] Certificate Revocation System
10. [ ] API Documentation

---

*Module Owner: Backend Lead*
*Last Updated: January 2026*
