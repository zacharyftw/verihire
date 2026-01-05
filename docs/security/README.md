# Security Guidelines

## Overview

This document outlines the security requirements, best practices, and implementation guidelines for the VeriHire platform.

---

## Security Principles

### Defense in Depth
Multiple layers of security controls to protect against various attack vectors.

### Least Privilege
Users and services have only the minimum permissions necessary.

### Zero Trust
Verify every request, regardless of source.

### Security by Design
Security considerations integrated from the start, not bolted on.

---

## Authentication Security

### Password Requirements

```yaml
password_policy:
  min_length: 12
  require_uppercase: true
  require_lowercase: true
  require_numbers: true
  require_special: true
  max_age_days: 90
  history_count: 5
  
  # Banned patterns
  banned_patterns:
    - common passwords (top 10,000)
    - sequential characters (abc, 123)
    - repeated characters (aaa, 111)
    - user's name or email
```

### Session Management

```yaml
session_config:
  access_token_ttl: 15 minutes
  refresh_token_ttl: 7 days
  absolute_timeout: 24 hours
  idle_timeout: 30 minutes
  
  # Security flags
  secure_cookie: true
  http_only: true
  same_site: strict
  
  # Token rotation
  rotate_refresh_token: true
  revoke_on_password_change: true
  revoke_on_logout: true
```

### Multi-Factor Authentication

Required for:
- All admin accounts
- Company admin accounts
- Accessing sensitive data
- Password reset
- Account recovery

Supported methods:
- TOTP (Authenticator apps)
- SMS (fallback only)
- Email verification
- Hardware security keys (FIDO2)

---

## API Security

### Request Validation

```typescript
// Input validation middleware
const validateRequest = (schema: ZodSchema) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Validate body
      req.body = schema.parse(req.body);
      
      // Sanitize strings
      req.body = sanitizeObject(req.body);
      
      // Check content length
      if (req.headers['content-length'] > MAX_BODY_SIZE) {
        throw new Error('Request body too large');
      }
      
      next();
    } catch (error) {
      res.status(400).json({ error: 'Validation failed', details: error });
    }
  };
};
```

### Rate Limiting

```yaml
rate_limits:
  global:
    window: 60 seconds
    max_requests: 1000
    
  by_endpoint:
    /auth/login:
      window: 60 seconds
      max_requests: 5
      block_duration: 300 seconds
      
    /auth/register:
      window: 3600 seconds
      max_requests: 10
      
    /api/*:
      window: 60 seconds
      max_requests: 100
      
  by_ip:
    enabled: true
    window: 60 seconds
    max_requests: 500
```

### Security Headers

```typescript
const securityHeaders = {
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: https:",
    "connect-src 'self' https://api.verihire.com wss://ws.verihire.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'"
  ].join('; '),
  
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'X-XSS-Protection': '1; mode=block',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
  'X-Permitted-Cross-Domain-Policies': 'none'
};
```

### CORS Configuration

```typescript
const corsOptions = {
  origin: [
    'https://verihire.com',
    'https://www.verihire.com',
    'https://app.verihire.com'
  ],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
  credentials: true,
  maxAge: 86400 // 24 hours
};
```

---

## Data Protection

### Encryption at Rest

```yaml
encryption:
  algorithm: AES-256-GCM
  key_management: AWS KMS / HashiCorp Vault
  
  encrypted_fields:
    - users.password_hash
    - users.mfa_secret_encrypted
    - candidate_profiles.resume_url (path encrypted)
    - certificates.signature
    
  database:
    postgresql: TDE enabled
    backups: encrypted with separate key
```

### Encryption in Transit

```yaml
tls:
  version: "1.3"
  ciphers:
    - TLS_AES_256_GCM_SHA384
    - TLS_CHACHA20_POLY1305_SHA256
    - TLS_AES_128_GCM_SHA256
  
  certificate:
    provider: "Let's Encrypt / AWS ACM"
    auto_renewal: true
    
  hsts:
    enabled: true
    max_age: 31536000
    include_subdomains: true
    preload: true
```

### PII Handling

```yaml
pii_fields:
  - email (encrypted, hashed for lookup)
  - name
  - phone_number
  - address
  - date_of_birth
  - government_id
  
pii_requirements:
  access_logging: true
  retention_period: 3 years
  deletion_on_request: within 30 days
  anonymization: supported
  export_format: JSON
```

---

## Secure Code Execution (Sandbox)

### Container Isolation

```yaml
sandbox_config:
  runtime: gVisor / Firecracker
  
  resource_limits:
    cpu: 1 core
    memory: 512MB
    disk: 100MB
    network: disabled
    processes: 50
    
  time_limits:
    execution: 30 seconds
    compilation: 60 seconds
    
  restrictions:
    no_network: true
    no_filesystem_write: true (except /tmp)
    no_system_calls: [fork, exec, socket, ...]
    read_only_root: true
```

### Code Execution Flow

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  Submission │ -> │  Sanitizer  │ -> │   Queue     │
└─────────────┘    └─────────────┘    └─────────────┘
                                            │
                                            ▼
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Result    │ <- │  Executor   │ <- │   Sandbox   │
└─────────────┘    └─────────────┘    └─────────────┘
```

---

## Vulnerability Management

### Security Scanning

```yaml
scanning:
  sast:
    tool: SonarQube / Semgrep
    frequency: every commit
    blocking: critical/high findings
    
  dast:
    tool: OWASP ZAP
    frequency: weekly
    scope: staging environment
    
  dependency:
    tool: Snyk / Dependabot
    frequency: daily
    auto_fix: patch versions only
    
  container:
    tool: Trivy
    frequency: every build
    base_image_scan: true
    
  secrets:
    tool: GitLeaks / TruffleHog
    frequency: every commit
    pre_commit_hook: true
```

### Penetration Testing

```yaml
pentest_schedule:
  frequency: annually
  scope: full platform
  methodology: OWASP Testing Guide
  
  additional_tests:
    - api_security
    - authentication_bypass
    - authorization_flaws
    - injection_attacks
    - business_logic_flaws
```

---

## Incident Response

### Severity Levels

| Level | Description | Response Time | Examples |
|-------|-------------|---------------|----------|
| Critical | Active breach, data exposure | 15 minutes | Data leak, system compromise |
| High | Significant vulnerability | 4 hours | Auth bypass, SQL injection |
| Medium | Moderate security issue | 24 hours | XSS, information disclosure |
| Low | Minor security concern | 1 week | Missing headers, minor misconfig |

### Response Procedure

```
1. Detection & Alerting
   └─> Security team notified via PagerDuty
   
2. Triage & Assessment
   └─> Determine severity and scope
   
3. Containment
   └─> Isolate affected systems
   └─> Revoke compromised credentials
   
4. Eradication
   └─> Remove threat
   └─> Patch vulnerability
   
5. Recovery
   └─> Restore services
   └─> Verify integrity
   
6. Post-Incident
   └─> Root cause analysis
   └─> Update procedures
   └─> Stakeholder communication
```

---

## Compliance

### GDPR Requirements

- [ ] Data Processing Agreement (DPA)
- [ ] Privacy Impact Assessment
- [ ] Data Subject Rights implementation
- [ ] Breach notification procedure (72 hours)
- [ ] Data retention policies
- [ ] Consent management
- [ ] Right to erasure implementation

### SOC 2 Type II Controls

- [ ] Access control policies
- [ ] Encryption standards
- [ ] Audit logging
- [ ] Change management
- [ ] Incident response
- [ ] Vendor management
- [ ] Business continuity

---

## Security Checklist

### Pre-Deployment

- [ ] Security review completed
- [ ] Penetration testing passed
- [ ] Dependency vulnerabilities resolved
- [ ] Secrets management configured
- [ ] Logging and monitoring enabled
- [ ] Backup and recovery tested
- [ ] Incident response plan in place

### Ongoing

- [ ] Weekly vulnerability scans
- [ ] Monthly access reviews
- [ ] Quarterly security training
- [ ] Annual penetration test
- [ ] Continuous dependency monitoring
- [ ] Regular backup testing

---

*Last Updated: January 2026*
