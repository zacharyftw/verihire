# Module 7: Data & Security Layer

## Overview

The Data & Security Layer ensures the integrity, confidentiality, and availability of all platform data. It implements encryption at rest and in transit, secure authentication mechanisms, comprehensive audit logging, and compliance with data protection regulations.

---

## Components

### 7.1 Security Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    SECURITY ARCHITECTURE                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌────────────────────────────────────────────────────────┐    │
│  │                    WAF / DDoS Protection                │    │
│  │                  (Cloudflare / AWS Shield)              │    │
│  └───────────────────────────┬────────────────────────────┘    │
│                              │                                  │
│                              ▼                                  │
│  ┌────────────────────────────────────────────────────────┐    │
│  │                    API Gateway                          │    │
│  │         Rate Limiting • Request Validation              │    │
│  └───────────────────────────┬────────────────────────────┘    │
│                              │                                  │
│                              ▼                                  │
│  ┌────────────────────────────────────────────────────────┐    │
│  │                 Authentication Layer                    │    │
│  │     JWT • OAuth 2.0 • MFA • Session Management         │    │
│  └───────────────────────────┬────────────────────────────┘    │
│                              │                                  │
│                              ▼                                  │
│  ┌────────────────────────────────────────────────────────┐    │
│  │                 Authorization Layer                     │    │
│  │              RBAC • ABAC • Permission Guards           │    │
│  └───────────────────────────┬────────────────────────────┘    │
│                              │                                  │
│                              ▼                                  │
│  ┌────────────────────────────────────────────────────────┐    │
│  │                  Application Layer                      │    │
│  │        Input Validation • Output Encoding              │    │
│  └───────────────────────────┬────────────────────────────┘    │
│                              │                                  │
│                              ▼                                  │
│  ┌────────────────────────────────────────────────────────┐    │
│  │                    Data Layer                           │    │
│  │     AES-256 Encryption • TLS 1.3 • Key Management      │    │
│  └────────────────────────────────────────────────────────┘    │
│                                                                 │
│  ┌────────────────────────────────────────────────────────┐    │
│  │                   Audit & Monitoring                    │    │
│  │     Logging • SIEM • Alerting • Compliance Reports     │    │
│  └────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

---

### 7.2 Authentication System

#### Multi-Factor Authentication

```python
from enum import Enum
from typing import Optional
import pyotp
import secrets

class AuthMethod(Enum):
    PASSWORD = "password"
    OAUTH_GOOGLE = "oauth_google"
    OAUTH_GITHUB = "oauth_github"
    OAUTH_LINKEDIN = "oauth_linkedin"
    MAGIC_LINK = "magic_link"

class MFAType(Enum):
    TOTP = "totp"
    SMS = "sms"
    EMAIL = "email"
    HARDWARE_KEY = "hardware_key"


class AuthenticationService:
    def __init__(self):
        self.user_repo = UserRepository()
        self.token_service = TokenService()
        self.mfa_service = MFAService()
        self.session_service = SessionService()
        self.audit_logger = AuditLogger()
    
    async def authenticate(
        self,
        credentials: AuthCredentials,
        client_info: ClientInfo
    ) -> AuthResult:
        """
        Authenticate user with multiple factors.
        """
        
        # 1. Primary authentication
        user = await self._primary_auth(credentials)
        if not user:
            await self.audit_logger.log_failed_auth(
                credentials.identifier,
                client_info,
                "invalid_credentials"
            )
            raise AuthenticationError("Invalid credentials")
        
        # 2. Check account status
        if user.status != "active":
            raise AuthenticationError(f"Account {user.status}")
        
        # 3. Check if MFA is required
        if user.mfa_enabled:
            if not credentials.mfa_code:
                # Return partial auth, request MFA
                temp_token = await self.token_service.create_mfa_token(user.id)
                return AuthResult(
                    requires_mfa=True,
                    mfa_token=temp_token,
                    mfa_methods=user.mfa_methods
                )
            
            # Verify MFA
            mfa_valid = await self.mfa_service.verify(
                user.id,
                credentials.mfa_code,
                credentials.mfa_method
            )
            if not mfa_valid:
                await self.audit_logger.log_failed_mfa(user.id, client_info)
                raise AuthenticationError("Invalid MFA code")
        
        # 4. Create session
        session = await self.session_service.create(
            user_id=user.id,
            client_info=client_info,
            remember_me=credentials.remember_me
        )
        
        # 5. Generate tokens
        access_token = await self.token_service.create_access_token(
            user_id=user.id,
            session_id=session.id,
            roles=user.roles
        )
        
        refresh_token = await self.token_service.create_refresh_token(
            user_id=user.id,
            session_id=session.id
        )
        
        # 6. Log successful auth
        await self.audit_logger.log_successful_auth(user.id, client_info)
        
        return AuthResult(
            success=True,
            access_token=access_token,
            refresh_token=refresh_token,
            user=user.to_safe_dict(),
            session_id=session.id
        )
    
    async def _primary_auth(self, credentials: AuthCredentials) -> Optional[User]:
        """Perform primary authentication based on method."""
        
        if credentials.method == AuthMethod.PASSWORD:
            return await self._password_auth(
                credentials.identifier,
                credentials.password
            )
        elif credentials.method in [AuthMethod.OAUTH_GOOGLE, AuthMethod.OAUTH_GITHUB]:
            return await self._oauth_auth(
                credentials.method,
                credentials.oauth_token
            )
        elif credentials.method == AuthMethod.MAGIC_LINK:
            return await self._magic_link_auth(credentials.magic_token)
        
        return None
    
    async def _password_auth(self, identifier: str, password: str) -> Optional[User]:
        """Authenticate with email/password."""
        
        user = await self.user_repo.find_by_email(identifier)
        if not user:
            # Timing attack prevention
            await self._dummy_hash_check()
            return None
        
        if not await self._verify_password(password, user.password_hash):
            return None
        
        return user


class MFAService:
    def __init__(self):
        self.db = MFADatabase()
        self.sms_service = SMSService()
        self.email_service = EmailService()
    
    async def setup_totp(self, user_id: str) -> TOTPSetupResult:
        """Set up TOTP-based MFA."""
        
        secret = pyotp.random_base32()
        
        # Store encrypted secret
        await self.db.store_mfa_secret(
            user_id=user_id,
            mfa_type=MFAType.TOTP,
            secret=self._encrypt_secret(secret)
        )
        
        # Generate QR code URI
        totp = pyotp.TOTP(secret)
        provisioning_uri = totp.provisioning_uri(
            name=await self._get_user_email(user_id),
            issuer_name="VeriHire"
        )
        
        # Generate backup codes
        backup_codes = [secrets.token_hex(4) for _ in range(10)]
        await self.db.store_backup_codes(
            user_id=user_id,
            codes=[self._hash_code(c) for c in backup_codes]
        )
        
        return TOTPSetupResult(
            secret=secret,
            provisioning_uri=provisioning_uri,
            backup_codes=backup_codes
        )
    
    async def verify(
        self,
        user_id: str,
        code: str,
        mfa_type: MFAType
    ) -> bool:
        """Verify MFA code."""
        
        if mfa_type == MFAType.TOTP:
            return await self._verify_totp(user_id, code)
        elif mfa_type == MFAType.SMS:
            return await self._verify_sms_code(user_id, code)
        elif mfa_type == MFAType.EMAIL:
            return await self._verify_email_code(user_id, code)
        
        return False
    
    async def _verify_totp(self, user_id: str, code: str) -> bool:
        """Verify TOTP code."""
        
        mfa_record = await self.db.get_mfa_secret(user_id, MFAType.TOTP)
        if not mfa_record:
            return False
        
        secret = self._decrypt_secret(mfa_record.secret)
        totp = pyotp.TOTP(secret)
        
        # Allow 1 period of drift
        return totp.verify(code, valid_window=1)
```

#### JWT Token Management

```python
import jwt
from datetime import datetime, timedelta
from typing import Dict, Any

class TokenService:
    def __init__(self, config: TokenConfig):
        self.config = config
        self.private_key = self._load_private_key()
        self.public_key = self._load_public_key()
        self.revoked_tokens = RevokedTokenStore()
    
    async def create_access_token(
        self,
        user_id: str,
        session_id: str,
        roles: List[str],
        additional_claims: Dict[str, Any] = None
    ) -> str:
        """Create a short-lived access token."""
        
        now = datetime.utcnow()
        
        payload = {
            "sub": user_id,
            "sid": session_id,
            "roles": roles,
            "type": "access",
            "iat": now,
            "exp": now + timedelta(minutes=self.config.access_token_ttl),
            "iss": "verihire",
            "jti": str(uuid.uuid4())
        }
        
        if additional_claims:
            payload.update(additional_claims)
        
        return jwt.encode(
            payload,
            self.private_key,
            algorithm="RS256"
        )
    
    async def create_refresh_token(
        self,
        user_id: str,
        session_id: str
    ) -> str:
        """Create a long-lived refresh token."""
        
        now = datetime.utcnow()
        
        payload = {
            "sub": user_id,
            "sid": session_id,
            "type": "refresh",
            "iat": now,
            "exp": now + timedelta(days=self.config.refresh_token_ttl),
            "iss": "verihire",
            "jti": str(uuid.uuid4())
        }
        
        return jwt.encode(
            payload,
            self.private_key,
            algorithm="RS256"
        )
    
    async def verify_token(self, token: str, token_type: str = "access") -> TokenPayload:
        """Verify and decode a token."""
        
        try:
            payload = jwt.decode(
                token,
                self.public_key,
                algorithms=["RS256"],
                issuer="verihire"
            )
            
            # Check token type
            if payload.get("type") != token_type:
                raise InvalidTokenError("Invalid token type")
            
            # Check if revoked
            if await self.revoked_tokens.is_revoked(payload["jti"]):
                raise InvalidTokenError("Token has been revoked")
            
            return TokenPayload(**payload)
            
        except jwt.ExpiredSignatureError:
            raise InvalidTokenError("Token has expired")
        except jwt.InvalidTokenError as e:
            raise InvalidTokenError(f"Invalid token: {str(e)}")
    
    async def refresh_tokens(self, refresh_token: str) -> TokenPair:
        """Exchange refresh token for new token pair."""
        
        payload = await self.verify_token(refresh_token, "refresh")
        
        # Revoke old refresh token (rotation)
        await self.revoked_tokens.revoke(payload.jti)
        
        # Get user roles
        user = await self.user_repo.get(payload.sub)
        
        # Create new tokens
        access_token = await self.create_access_token(
            user_id=payload.sub,
            session_id=payload.sid,
            roles=user.roles
        )
        
        new_refresh_token = await self.create_refresh_token(
            user_id=payload.sub,
            session_id=payload.sid
        )
        
        return TokenPair(
            access_token=access_token,
            refresh_token=new_refresh_token
        )
```

---

### 7.3 Authorization System

#### Role-Based Access Control (RBAC)

```python
from enum import Enum
from typing import Set, List

class Role(Enum):
    CANDIDATE = "candidate"
    RECRUITER = "recruiter"
    COMPANY_ADMIN = "company_admin"
    REVIEWER = "reviewer"
    PLATFORM_ADMIN = "platform_admin"
    SUPER_ADMIN = "super_admin"

class Permission(Enum):
    # Candidate permissions
    VIEW_CHALLENGES = "challenges:view"
    SUBMIT_SOLUTIONS = "solutions:submit"
    VIEW_OWN_PORTFOLIO = "portfolio:view_own"
    EDIT_OWN_PROFILE = "profile:edit_own"
    VIEW_OWN_CERTIFICATES = "certificates:view_own"
    
    # Reviewer permissions
    VIEW_SUBMISSIONS_FOR_REVIEW = "submissions:view_for_review"
    SUBMIT_REVIEWS = "reviews:submit"
    
    # Recruiter permissions
    SEARCH_CANDIDATES = "candidates:search"
    VIEW_CANDIDATE_PORTFOLIOS = "portfolios:view"
    VERIFY_CERTIFICATES = "certificates:verify"
    CREATE_JOBS = "jobs:create"
    MANAGE_SHORTLISTS = "shortlists:manage"
    
    # Company Admin permissions
    MANAGE_COMPANY_USERS = "company:manage_users"
    VIEW_COMPANY_ANALYTICS = "company:view_analytics"
    MANAGE_COMPANY_SETTINGS = "company:manage_settings"
    
    # Platform Admin permissions
    MANAGE_CHALLENGES = "challenges:manage"
    MANAGE_SKILLS = "skills:manage"
    VIEW_ALL_ANALYTICS = "analytics:view_all"
    MODERATE_REVIEWS = "reviews:moderate"
    
    # Super Admin permissions
    MANAGE_USERS = "users:manage"
    MANAGE_ROLES = "roles:manage"
    VIEW_AUDIT_LOGS = "audit:view"
    SYSTEM_SETTINGS = "system:settings"


# Role to permissions mapping
ROLE_PERMISSIONS: Dict[Role, Set[Permission]] = {
    Role.CANDIDATE: {
        Permission.VIEW_CHALLENGES,
        Permission.SUBMIT_SOLUTIONS,
        Permission.VIEW_OWN_PORTFOLIO,
        Permission.EDIT_OWN_PROFILE,
        Permission.VIEW_OWN_CERTIFICATES,
    },
    Role.REVIEWER: {
        Permission.VIEW_CHALLENGES,
        Permission.SUBMIT_SOLUTIONS,
        Permission.VIEW_OWN_PORTFOLIO,
        Permission.EDIT_OWN_PROFILE,
        Permission.VIEW_OWN_CERTIFICATES,
        Permission.VIEW_SUBMISSIONS_FOR_REVIEW,
        Permission.SUBMIT_REVIEWS,
    },
    Role.RECRUITER: {
        Permission.SEARCH_CANDIDATES,
        Permission.VIEW_CANDIDATE_PORTFOLIOS,
        Permission.VERIFY_CERTIFICATES,
        Permission.CREATE_JOBS,
        Permission.MANAGE_SHORTLISTS,
    },
    Role.COMPANY_ADMIN: {
        Permission.SEARCH_CANDIDATES,
        Permission.VIEW_CANDIDATE_PORTFOLIOS,
        Permission.VERIFY_CERTIFICATES,
        Permission.CREATE_JOBS,
        Permission.MANAGE_SHORTLISTS,
        Permission.MANAGE_COMPANY_USERS,
        Permission.VIEW_COMPANY_ANALYTICS,
        Permission.MANAGE_COMPANY_SETTINGS,
    },
    Role.PLATFORM_ADMIN: {
        Permission.MANAGE_CHALLENGES,
        Permission.MANAGE_SKILLS,
        Permission.VIEW_ALL_ANALYTICS,
        Permission.MODERATE_REVIEWS,
    },
    Role.SUPER_ADMIN: set(Permission),  # All permissions
}


class AuthorizationService:
    def __init__(self):
        self.db = PermissionDatabase()
    
    def has_permission(
        self,
        user: User,
        permission: Permission
    ) -> bool:
        """Check if user has a specific permission."""
        
        user_permissions = set()
        for role in user.roles:
            role_enum = Role(role)
            user_permissions.update(ROLE_PERMISSIONS.get(role_enum, set()))
        
        return permission in user_permissions
    
    def has_any_permission(
        self,
        user: User,
        permissions: List[Permission]
    ) -> bool:
        """Check if user has any of the specified permissions."""
        return any(self.has_permission(user, p) for p in permissions)
    
    def has_all_permissions(
        self,
        user: User,
        permissions: List[Permission]
    ) -> bool:
        """Check if user has all specified permissions."""
        return all(self.has_permission(user, p) for p in permissions)
    
    async def check_resource_access(
        self,
        user: User,
        resource_type: str,
        resource_id: str,
        action: str
    ) -> bool:
        """
        Check attribute-based access control (ABAC) for specific resources.
        """
        
        # Get resource ownership
        resource = await self.db.get_resource(resource_type, resource_id)
        if not resource:
            return False
        
        # Owner check
        if resource.owner_id == user.id:
            return True
        
        # Company membership check (for company resources)
        if resource.company_id and user.company_id == resource.company_id:
            if action in ["view", "edit"] and self.has_permission(
                user, Permission.MANAGE_COMPANY_SETTINGS
            ):
                return True
        
        # Public resource check
        if resource.is_public and action == "view":
            return True
        
        return False


# Decorator for route protection
def require_permission(*permissions: Permission):
    """Decorator to require specific permissions for a route."""
    
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            request = kwargs.get('request') or args[0]
            user = request.state.user
            
            auth_service = AuthorizationService()
            
            if not auth_service.has_any_permission(user, list(permissions)):
                raise HTTPException(
                    status_code=403,
                    detail="Insufficient permissions"
                )
            
            return await func(*args, **kwargs)
        
        return wrapper
    return decorator
```

---

### 7.4 Data Encryption

```python
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
import os
import base64

class EncryptionService:
    """
    Handles encryption/decryption of sensitive data using AES-256.
    """
    
    def __init__(self, key_service: KeyManagementService):
        self.key_service = key_service
    
    async def encrypt_field(
        self,
        plaintext: str,
        context: str = "default"
    ) -> EncryptedField:
        """
        Encrypt a single field with context-specific key.
        Uses AES-256-GCM for authenticated encryption.
        """
        
        # Get data encryption key (DEK)
        dek = await self.key_service.get_dek(context)
        
        # Generate random nonce
        nonce = os.urandom(12)
        
        # Encrypt
        aesgcm = AESGCM(dek)
        ciphertext = aesgcm.encrypt(
            nonce,
            plaintext.encode('utf-8'),
            context.encode('utf-8')  # Additional authenticated data
        )
        
        return EncryptedField(
            ciphertext=base64.b64encode(ciphertext).decode('utf-8'),
            nonce=base64.b64encode(nonce).decode('utf-8'),
            key_id=await self.key_service.get_current_key_id(context),
            algorithm="AES-256-GCM"
        )
    
    async def decrypt_field(
        self,
        encrypted: EncryptedField,
        context: str = "default"
    ) -> str:
        """Decrypt a field."""
        
        # Get DEK by key ID
        dek = await self.key_service.get_dek_by_id(encrypted.key_id)
        
        nonce = base64.b64decode(encrypted.nonce)
        ciphertext = base64.b64decode(encrypted.ciphertext)
        
        aesgcm = AESGCM(dek)
        plaintext = aesgcm.decrypt(
            nonce,
            ciphertext,
            context.encode('utf-8')
        )
        
        return plaintext.decode('utf-8')
    
    async def encrypt_pii(self, pii_data: Dict[str, str]) -> Dict[str, EncryptedField]:
        """Encrypt personally identifiable information."""
        
        encrypted = {}
        for field, value in pii_data.items():
            encrypted[field] = await self.encrypt_field(
                value,
                context=f"pii_{field}"
            )
        
        return encrypted


class KeyManagementService:
    """
    Manages encryption keys using envelope encryption.
    Master keys stored in HSM/KMS, data keys encrypted and stored locally.
    """
    
    def __init__(self, config: KMSConfig):
        self.config = config
        self.kms_client = self._init_kms_client()
        self.key_cache = TTLCache(maxsize=100, ttl=3600)
    
    async def get_dek(self, context: str) -> bytes:
        """Get data encryption key for a context."""
        
        cache_key = f"dek_{context}"
        
        if cache_key in self.key_cache:
            return self.key_cache[cache_key]
        
        # Get encrypted DEK from database
        encrypted_dek = await self.db.get_encrypted_dek(context)
        
        if not encrypted_dek:
            # Generate new DEK
            return await self._generate_new_dek(context)
        
        # Decrypt DEK using KMS
        dek = await self.kms_client.decrypt(
            CiphertextBlob=encrypted_dek.ciphertext,
            KeyId=self.config.master_key_id
        )
        
        self.key_cache[cache_key] = dek['Plaintext']
        return dek['Plaintext']
    
    async def _generate_new_dek(self, context: str) -> bytes:
        """Generate a new data encryption key."""
        
        # Generate DEK using KMS (envelope encryption)
        response = await self.kms_client.generate_data_key(
            KeyId=self.config.master_key_id,
            KeySpec='AES_256'
        )
        
        # Store encrypted DEK
        await self.db.store_encrypted_dek(
            context=context,
            ciphertext=response['CiphertextBlob'],
            key_id=str(uuid.uuid4())
        )
        
        return response['Plaintext']
    
    async def rotate_keys(self, context: str):
        """Rotate encryption keys for a context."""
        
        # Generate new DEK
        new_dek = await self._generate_new_dek(f"{context}_new")
        
        # Re-encrypt all data with new key (background job)
        await self._queue_reencryption(context, new_dek)
        
        # Update key metadata
        await self.db.mark_key_rotated(context)
```

---

### 7.5 Audit Logging

```python
from datetime import datetime
from typing import Optional, Dict, Any
import json

class AuditLogger:
    """
    Comprehensive audit logging for security and compliance.
    """
    
    def __init__(self):
        self.db = AuditDatabase()
        self.event_queue = EventQueue()
    
    async def log(
        self,
        event_type: str,
        actor_id: Optional[str],
        actor_type: str,
        action: str,
        resource_type: str,
        resource_id: Optional[str],
        details: Dict[str, Any],
        client_info: ClientInfo,
        outcome: str = "success"
    ):
        """Log an audit event."""
        
        event = AuditEvent(
            id=str(uuid.uuid4()),
            timestamp=datetime.utcnow(),
            event_type=event_type,
            actor_id=actor_id,
            actor_type=actor_type,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            outcome=outcome,
            details=details,
            client_ip=client_info.ip_address,
            user_agent=client_info.user_agent,
            session_id=client_info.session_id,
            request_id=client_info.request_id
        )
        
        # Async write to database
        await self.db.insert(event)
        
        # Send to SIEM if critical
        if event_type in CRITICAL_EVENTS:
            await self.event_queue.publish("security_events", event)
    
    async def log_successful_auth(self, user_id: str, client_info: ClientInfo):
        """Log successful authentication."""
        await self.log(
            event_type="authentication",
            actor_id=user_id,
            actor_type="user",
            action="login",
            resource_type="session",
            resource_id=client_info.session_id,
            details={"method": client_info.auth_method},
            client_info=client_info,
            outcome="success"
        )
    
    async def log_failed_auth(
        self,
        identifier: str,
        client_info: ClientInfo,
        reason: str
    ):
        """Log failed authentication attempt."""
        await self.log(
            event_type="authentication",
            actor_id=None,
            actor_type="unknown",
            action="login_attempt",
            resource_type="session",
            resource_id=None,
            details={
                "identifier": self._hash_identifier(identifier),
                "failure_reason": reason
            },
            client_info=client_info,
            outcome="failure"
        )
    
    async def log_data_access(
        self,
        user_id: str,
        resource_type: str,
        resource_id: str,
        action: str,
        client_info: ClientInfo
    ):
        """Log data access for compliance."""
        await self.log(
            event_type="data_access",
            actor_id=user_id,
            actor_type="user",
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            details={},
            client_info=client_info
        )
    
    async def log_permission_change(
        self,
        admin_id: str,
        target_user_id: str,
        old_roles: List[str],
        new_roles: List[str],
        client_info: ClientInfo
    ):
        """Log role/permission changes."""
        await self.log(
            event_type="permission_change",
            actor_id=admin_id,
            actor_type="admin",
            action="modify_roles",
            resource_type="user",
            resource_id=target_user_id,
            details={
                "old_roles": old_roles,
                "new_roles": new_roles
            },
            client_info=client_info
        )


class AuditQueryService:
    """Query audit logs for investigation and compliance."""
    
    def __init__(self):
        self.db = AuditDatabase()
    
    async def search(
        self,
        filters: AuditSearchFilters,
        page: int = 1,
        page_size: int = 50
    ) -> AuditSearchResult:
        """Search audit logs with filters."""
        
        query = self._build_query(filters)
        
        total = await self.db.count(query)
        events = await self.db.find(
            query,
            skip=(page - 1) * page_size,
            limit=page_size,
            sort=[("timestamp", -1)]
        )
        
        return AuditSearchResult(
            events=events,
            total=total,
            page=page,
            page_size=page_size
        )
    
    async def get_user_activity(
        self,
        user_id: str,
        start_date: datetime,
        end_date: datetime
    ) -> List[AuditEvent]:
        """Get all activity for a specific user."""
        
        return await self.db.find({
            "actor_id": user_id,
            "timestamp": {
                "$gte": start_date,
                "$lte": end_date
            }
        })
    
    async def detect_anomalies(
        self,
        user_id: str,
        time_window: timedelta = timedelta(hours=1)
    ) -> List[AnomalyAlert]:
        """Detect anomalous activity patterns."""
        
        alerts = []
        recent_events = await self._get_recent_events(user_id, time_window)
        
        # Multiple failed logins
        failed_logins = [e for e in recent_events 
                        if e.event_type == "authentication" and e.outcome == "failure"]
        if len(failed_logins) >= 5:
            alerts.append(AnomalyAlert(
                type="brute_force_attempt",
                severity="high",
                details={"failed_attempts": len(failed_logins)}
            ))
        
        # Unusual access patterns
        unique_ips = set(e.client_ip for e in recent_events)
        if len(unique_ips) > 5:
            alerts.append(AnomalyAlert(
                type="multiple_locations",
                severity="medium",
                details={"unique_ips": len(unique_ips)}
            ))
        
        return alerts
```

---

### 7.6 Data Storage Architecture

```python
class DataStorageService:
    """
    Manages data storage across multiple backends.
    """
    
    def __init__(self):
        self.postgres = PostgresClient()
        self.redis = RedisClient()
        self.elasticsearch = ElasticsearchClient()
        self.s3 = S3Client()
        self.ipfs = IPFSClient()
    
    async def store_submission(
        self,
        submission: Submission
    ) -> StorageResult:
        """
        Store a submission across appropriate backends.
        """
        
        # 1. Store metadata in PostgreSQL
        await self.postgres.insert("submissions", submission.to_db_dict())
        
        # 2. Store code/content in S3
        content_key = f"submissions/{submission.id}/content"
        await self.s3.upload(
            key=content_key,
            data=submission.content,
            encryption="AES256"
        )
        
        # 3. Index for search in Elasticsearch
        await self.elasticsearch.index(
            index="submissions",
            id=submission.id,
            body=submission.to_search_doc()
        )
        
        # 4. Cache recent submission in Redis
        await self.redis.setex(
            f"submission:{submission.id}",
            3600,  # 1 hour TTL
            submission.to_json()
        )
        
        return StorageResult(
            id=submission.id,
            storage_locations={
                "metadata": "postgresql",
                "content": f"s3://{content_key}",
                "search_index": "elasticsearch",
                "cache": "redis"
            }
        )
    
    async def store_certificate(
        self,
        certificate: Certificate
    ) -> StorageResult:
        """
        Store certificate with decentralized backup.
        """
        
        # 1. Store in PostgreSQL
        await self.postgres.insert("certificates", certificate.to_db_dict())
        
        # 2. Store PDF in S3
        pdf_key = f"certificates/{certificate.id}/certificate.pdf"
        await self.s3.upload(
            key=pdf_key,
            data=certificate.pdf_content,
            content_type="application/pdf",
            encryption="AES256"
        )
        
        # 3. Store in IPFS for decentralization
        ipfs_hash = await self.ipfs.add(
            data=certificate.to_json(),
            pin=True
        )
        
        return StorageResult(
            id=certificate.id,
            storage_locations={
                "metadata": "postgresql",
                "pdf": f"s3://{pdf_key}",
                "decentralized": f"ipfs://{ipfs_hash}"
            },
            ipfs_hash=ipfs_hash
        )


# Database connection with encryption
class SecurePostgresClient:
    def __init__(self, config: DatabaseConfig):
        self.config = config
        self.pool = None
    
    async def connect(self):
        """Establish secure database connection."""
        
        self.pool = await asyncpg.create_pool(
            host=self.config.host,
            port=self.config.port,
            user=self.config.user,
            password=self.config.password,
            database=self.config.database,
            ssl=self._get_ssl_context(),
            min_size=5,
            max_size=20,
            command_timeout=60
        )
    
    def _get_ssl_context(self):
        """Configure SSL for database connection."""
        
        ssl_context = ssl.create_default_context(
            ssl.Purpose.SERVER_AUTH,
            cafile=self.config.ca_cert_path
        )
        ssl_context.check_hostname = True
        ssl_context.verify_mode = ssl.CERT_REQUIRED
        
        if self.config.client_cert_path:
            ssl_context.load_cert_chain(
                self.config.client_cert_path,
                self.config.client_key_path
            )
        
        return ssl_context
```

---

### 7.7 Compliance & Privacy

```python
class PrivacyService:
    """
    GDPR and privacy compliance service.
    """
    
    def __init__(self):
        self.db = UserDatabase()
        self.storage = DataStorageService()
        self.audit = AuditLogger()
    
    async def export_user_data(self, user_id: str) -> DataExport:
        """
        Export all user data (GDPR Article 20 - Data Portability).
        """
        
        # Gather all user data
        user_data = {
            "profile": await self.db.get_user(user_id),
            "submissions": await self.db.get_user_submissions(user_id),
            "reviews_given": await self.db.get_user_reviews(user_id),
            "reviews_received": await self.db.get_reviews_for_user(user_id),
            "certificates": await self.db.get_user_certificates(user_id),
            "activity_log": await self.audit.get_user_activity(
                user_id,
                datetime.min,
                datetime.utcnow()
            )
        }
        
        # Create export file
        export = DataExport(
            user_id=user_id,
            data=user_data,
            format="json",
            generated_at=datetime.utcnow(),
            expires_at=datetime.utcnow() + timedelta(days=7)
        )
        
        # Store temporarily
        download_url = await self.storage.store_temp_file(
            data=export.to_json(),
            expires_in=timedelta(days=7)
        )
        
        export.download_url = download_url
        
        await self.audit.log(
            event_type="data_export",
            actor_id=user_id,
            actor_type="user",
            action="export_personal_data",
            resource_type="user_data",
            resource_id=user_id,
            details={},
            client_info=get_client_info()
        )
        
        return export
    
    async def delete_user_data(
        self,
        user_id: str,
        retain_anonymized: bool = True
    ) -> DeletionResult:
        """
        Delete user data (GDPR Article 17 - Right to Erasure).
        """
        
        deletion_tasks = []
        
        # 1. Delete or anonymize profile
        if retain_anonymized:
            deletion_tasks.append(
                self.db.anonymize_user(user_id)
            )
        else:
            deletion_tasks.append(
                self.db.delete_user(user_id)
            )
        
        # 2. Delete submissions content
        deletion_tasks.append(
            self.storage.delete_user_files(user_id)
        )
        
        # 3. Anonymize reviews (keep for platform integrity)
        deletion_tasks.append(
            self.db.anonymize_reviews(user_id)
        )
        
        # 4. Revoke certificates (blockchain remains immutable)
        deletion_tasks.append(
            self._revoke_user_certificates(user_id)
        )
        
        # 5. Delete from search index
        deletion_tasks.append(
            self.storage.elasticsearch.delete_by_query(
                index="candidates",
                body={"query": {"term": {"user_id": user_id}}}
            )
        )
        
        # Execute all deletions
        results = await asyncio.gather(*deletion_tasks, return_exceptions=True)
        
        # Log deletion
        await self.audit.log(
            event_type="data_deletion",
            actor_id=user_id,
            actor_type="user",
            action="delete_personal_data",
            resource_type="user_data",
            resource_id=user_id,
            details={"retain_anonymized": retain_anonymized},
            client_info=get_client_info()
        )
        
        return DeletionResult(
            user_id=user_id,
            deleted_at=datetime.utcnow(),
            components_deleted=["profile", "submissions", "files"],
            components_anonymized=["reviews"] if retain_anonymized else [],
            blockchain_note="Certificate hashes remain on blockchain (immutable)"
        )
    
    async def get_consent_status(self, user_id: str) -> ConsentStatus:
        """Get user's consent preferences."""
        
        return await self.db.get_consent(user_id)
    
    async def update_consent(
        self,
        user_id: str,
        consent_updates: Dict[str, bool]
    ) -> ConsentStatus:
        """Update user consent preferences."""
        
        current = await self.db.get_consent(user_id)
        
        for consent_type, granted in consent_updates.items():
            if consent_type in current.consents:
                current.consents[consent_type] = ConsentRecord(
                    granted=granted,
                    updated_at=datetime.utcnow(),
                    ip_address=get_client_ip()
                )
        
        await self.db.update_consent(user_id, current)
        
        await self.audit.log(
            event_type="consent_update",
            actor_id=user_id,
            actor_type="user",
            action="update_consent",
            resource_type="consent",
            resource_id=user_id,
            details=consent_updates,
            client_info=get_client_info()
        )
        
        return current
```

---

## Security Configurations

### Rate Limiting

```yaml
rate_limiting:
  global:
    requests_per_minute: 1000
    burst: 50
  
  endpoints:
    /api/v1/auth/login:
      requests_per_minute: 10
      burst: 5
      block_duration: 300  # 5 minutes
    
    /api/v1/auth/register:
      requests_per_minute: 5
      burst: 2
    
    /api/v1/challenges/submit:
      requests_per_minute: 10
      burst: 3
    
    /api/v1/certificates/verify:
      requests_per_minute: 100
      burst: 20
```

### Security Headers

```yaml
security_headers:
  Content-Security-Policy: "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'"
  X-Frame-Options: "DENY"
  X-Content-Type-Options: "nosniff"
  X-XSS-Protection: "1; mode=block"
  Strict-Transport-Security: "max-age=31536000; includeSubDomains"
  Referrer-Policy: "strict-origin-when-cross-origin"
  Permissions-Policy: "geolocation=(), microphone=(), camera=()"
```

---

## Deliverables

1. [ ] Authentication System (JWT, OAuth, MFA)
2. [ ] Authorization System (RBAC, ABAC)
3. [ ] Encryption Service (AES-256)
4. [ ] Key Management Service
5. [ ] Audit Logging System
6. [ ] SIEM Integration
7. [ ] Privacy/GDPR Compliance Tools
8. [ ] Rate Limiting Implementation
9. [ ] Security Monitoring Dashboard
10. [ ] Penetration Testing Report

---

*Module Owner: Security Engineer*
*Last Updated: January 2026*
