# Testing Strategy

## Overview

VeriHire employs a comprehensive testing strategy covering unit tests, integration tests, end-to-end tests, performance tests, and security tests.

---

## Testing Pyramid

```
                    ┌───────────┐
                    │   E2E     │  ~10%
                    │   Tests   │
                ┌───┴───────────┴───┐
                │   Integration     │  ~20%
                │      Tests        │
            ┌───┴───────────────────┴───┐
            │       Unit Tests          │  ~70%
            │                           │
            └───────────────────────────┘
```

---

## Unit Testing

### Coverage Requirements

| Component | Minimum Coverage |
|-----------|------------------|
| Services | 80% |
| Utils | 90% |
| Hooks | 80% |
| Components | 70% |
| API Routes | 80% |

### Testing Frameworks

```yaml
frontend:
  framework: Jest + React Testing Library
  coverage_tool: Istanbul
  mocking: MSW (Mock Service Worker)
  
backend:
  framework: Jest (Node.js) / Pytest (Python)
  coverage_tool: nyc / coverage.py
  mocking: jest.mock / unittest.mock

ai_services:
  framework: Pytest
  fixtures: pytest-fixtures
  model_mocking: custom fixtures
```

### Example Unit Tests

```typescript
// Service unit test
describe('CertificateService', () => {
  let service: CertificateService;
  let mockCryptoService: jest.Mocked<CryptoService>;
  let mockRepository: jest.Mocked<CertificateRepository>;

  beforeEach(() => {
    mockCryptoService = createMockCryptoService();
    mockRepository = createMockRepository();
    service = new CertificateService(mockCryptoService, mockRepository);
  });

  describe('generateCertificate', () => {
    it('should generate certificate with valid hash and signature', async () => {
      const submission = createMockSubmission({ score: 85 });
      const candidate = createMockCandidate();
      
      mockCryptoService.hashCertificate.mockReturnValue('abc123hash');
      mockCryptoService.sign.mockReturnValue('signature123');
      
      const certificate = await service.generateCertificate(submission, candidate);
      
      expect(certificate.verification.hash).toBe('abc123hash');
      expect(certificate.verification.signature).toBe('signature123');
      expect(mockRepository.save).toHaveBeenCalledWith(expect.objectContaining({
        candidateId: candidate.id,
        score: 85
      }));
    });

    it('should reject submission below pass threshold', async () => {
      const submission = createMockSubmission({ score: 45 });
      const candidate = createMockCandidate();
      
      await expect(service.generateCertificate(submission, candidate))
        .rejects.toThrow('Score does not meet certification threshold');
    });
  });
});
```

```python
# Python unit test
class TestChallengeGenerator:
    @pytest.fixture
    def generator(self, mock_llm, mock_validator):
        return ChallengeGenerator(
            llm_client=mock_llm,
            quality_validator=mock_validator
        )
    
    async def test_generate_challenge_success(self, generator, mock_llm):
        mock_llm.generate.return_value = SAMPLE_CHALLENGE_RESPONSE
        
        challenge = await generator.generate_challenge(
            candidate_profile=sample_profile(),
            skill='python',
            difficulty='intermediate'
        )
        
        assert challenge.title is not None
        assert challenge.difficulty == 'intermediate'
        assert len(challenge.test_cases) >= 3
    
    async def test_regenerates_on_quality_failure(self, generator, mock_validator):
        mock_validator.validate.side_effect = [
            ValidationResult(is_valid=False, feedback="Too easy"),
            ValidationResult(is_valid=True)
        ]
        
        challenge = await generator.generate_challenge(...)
        
        assert mock_validator.validate.call_count == 2
```

---

## Integration Testing

### API Integration Tests

```typescript
describe('POST /api/v1/auth/login', () => {
  let app: INestApplication;
  let testUser: User;

  beforeAll(async () => {
    app = await createTestApp();
    testUser = await createTestUser({
      email: 'test@example.com',
      password: 'ValidPassword123!'
    });
  });

  afterAll(async () => {
    await cleanupTestData();
    await app.close();
  });

  it('should return tokens for valid credentials', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: 'test@example.com',
        password: 'ValidPassword123!'
      })
      .expect(200);

    expect(response.body).toHaveProperty('accessToken');
    expect(response.body).toHaveProperty('refreshToken');
    expect(response.body.user.email).toBe('test@example.com');
  });

  it('should return 401 for invalid password', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: 'test@example.com',
        password: 'WrongPassword'
      })
      .expect(401);

    expect(response.body.code).toBe('AUTH_INVALID_CREDENTIALS');
  });

  it('should enforce rate limiting', async () => {
    const attempts = Array(10).fill(null).map(() =>
      request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'test@example.com', password: 'wrong' })
    );

    const responses = await Promise.all(attempts);
    const rateLimited = responses.filter(r => r.status === 429);
    
    expect(rateLimited.length).toBeGreaterThan(0);
  });
});
```

### Database Integration Tests

```typescript
describe('CertificateRepository', () => {
  let repository: CertificateRepository;
  let db: TestDatabase;

  beforeAll(async () => {
    db = await createTestDatabase();
    repository = new CertificateRepository(db);
  });

  beforeEach(async () => {
    await db.truncate(['certificates']);
  });

  it('should save and retrieve certificate', async () => {
    const certificate = createTestCertificate();
    
    await repository.save(certificate);
    const retrieved = await repository.findByNumber(certificate.certificateNumber);
    
    expect(retrieved).toMatchObject({
      id: certificate.id,
      certificateNumber: certificate.certificateNumber,
      score: certificate.score
    });
  });

  it('should find certificates by candidate', async () => {
    const candidateId = 'candidate-123';
    await repository.save(createTestCertificate({ candidateId }));
    await repository.save(createTestCertificate({ candidateId }));
    await repository.save(createTestCertificate({ candidateId: 'other' }));
    
    const certificates = await repository.findByCandidateId(candidateId);
    
    expect(certificates).toHaveLength(2);
  });
});
```

---

## End-to-End Testing

### E2E Test Scenarios

```typescript
// Using Playwright
describe('Candidate Challenge Flow', () => {
  test('complete challenge and receive certificate', async ({ page }) => {
    // Login
    await page.goto('/login');
    await page.fill('[data-testid="email"]', 'candidate@test.com');
    await page.fill('[data-testid="password"]', 'TestPassword123!');
    await page.click('[data-testid="login-button"]');
    
    await expect(page).toHaveURL('/dashboard');
    
    // Navigate to challenges
    await page.click('[data-testid="challenges-nav"]');
    await page.waitForSelector('[data-testid="challenge-card"]');
    
    // Start a challenge
    await page.click('[data-testid="challenge-card"]:first-child');
    await page.click('[data-testid="start-challenge"]');
    
    // Complete the coding challenge
    const editor = page.locator('.monaco-editor');
    await editor.click();
    await page.keyboard.type('function solution(n) { return n * 2; }');
    
    // Submit
    await page.click('[data-testid="submit-solution"]');
    
    // Wait for evaluation
    await page.waitForSelector('[data-testid="evaluation-complete"]', {
      timeout: 120000
    });
    
    // Verify results
    const score = await page.textContent('[data-testid="score-value"]');
    expect(parseInt(score)).toBeGreaterThanOrEqual(0);
    
    // Check certificate generated
    await page.goto('/certificates');
    await expect(page.locator('[data-testid="certificate-card"]')).toBeVisible();
  });
});

describe('Recruiter Search Flow', () => {
  test('search candidates by skills and shortlist', async ({ page }) => {
    await loginAsRecruiter(page);
    
    // Search
    await page.goto('/recruiter/candidates');
    await page.fill('[data-testid="skill-search"]', 'Python');
    await page.click('[data-testid="skill-option-python"]');
    await page.fill('[data-testid="min-score"]', '70');
    await page.click('[data-testid="search-button"]');
    
    // Verify results
    await page.waitForSelector('[data-testid="candidate-card"]');
    const candidates = await page.locator('[data-testid="candidate-card"]').count();
    expect(candidates).toBeGreaterThan(0);
    
    // View profile
    await page.click('[data-testid="candidate-card"]:first-child');
    await expect(page.locator('[data-testid="verified-badge"]')).toBeVisible();
    
    // Add to shortlist
    await page.click('[data-testid="shortlist-button"]');
    await expect(page.locator('[data-testid="shortlist-success"]')).toBeVisible();
    
    // Verify in shortlist
    await page.goto('/recruiter/shortlist');
    await expect(page.locator('[data-testid="shortlisted-candidate"]')).toBeVisible();
  });
});
```

---

## Performance Testing

### Load Testing Configuration

```yaml
# k6 configuration
scenarios:
  baseline:
    executor: constant-vus
    vus: 50
    duration: 5m
    
  stress:
    executor: ramping-vus
    startVUs: 0
    stages:
      - duration: 2m
        target: 100
      - duration: 5m
        target: 100
      - duration: 2m
        target: 200
      - duration: 5m
        target: 200
      - duration: 2m
        target: 0
        
  spike:
    executor: ramping-vus
    startVUs: 0
    stages:
      - duration: 10s
        target: 500
      - duration: 1m
        target: 500
      - duration: 10s
        target: 0

thresholds:
  http_req_duration:
    - p(95) < 500
    - p(99) < 1000
  http_req_failed:
    - rate < 0.01
  http_reqs:
    - rate > 100
```

### Performance Test Script

```javascript
// k6 load test
import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';

const users = new SharedArray('users', function () {
  return JSON.parse(open('./test-users.json'));
});

export default function () {
  const user = users[Math.floor(Math.random() * users.length)];
  
  // Login
  const loginRes = http.post(`${BASE_URL}/api/v1/auth/login`, JSON.stringify({
    email: user.email,
    password: user.password
  }), { headers: { 'Content-Type': 'application/json' } });
  
  check(loginRes, {
    'login successful': (r) => r.status === 200,
    'has access token': (r) => r.json('accessToken') !== undefined
  });
  
  const token = loginRes.json('accessToken');
  const authHeaders = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };
  
  // Search candidates
  const searchRes = http.post(`${BASE_URL}/api/v1/recruiter/candidates/search`, 
    JSON.stringify({ skills: [{ name: 'Python', minScore: 60 }] }),
    { headers: authHeaders }
  );
  
  check(searchRes, {
    'search successful': (r) => r.status === 200,
    'search < 500ms': (r) => r.timings.duration < 500
  });
  
  sleep(1);
}
```

### Performance Targets

| Endpoint | p50 | p95 | p99 |
|----------|-----|-----|-----|
| GET /api/health | 10ms | 50ms | 100ms |
| POST /auth/login | 100ms | 300ms | 500ms |
| GET /candidates/search | 200ms | 500ms | 1000ms |
| POST /submissions/evaluate | 30s | 60s | 90s |
| GET /certificates/verify | 50ms | 150ms | 300ms |

---

## Security Testing

### OWASP Top 10 Testing

```yaml
security_tests:
  injection:
    - sql_injection
    - nosql_injection
    - command_injection
    - xss_stored
    - xss_reflected
    
  authentication:
    - brute_force
    - session_fixation
    - credential_stuffing
    - jwt_manipulation
    
  authorization:
    - idor
    - privilege_escalation
    - horizontal_privilege
    - broken_function_level
    
  data_exposure:
    - sensitive_data_exposure
    - error_message_disclosure
    - api_enumeration
    
  misconfiguration:
    - security_headers
    - cors_misconfiguration
    - default_credentials
```

---

## Test Automation

### CI/CD Pipeline Tests

```yaml
# GitHub Actions workflow
test:
  runs-on: ubuntu-latest
  
  services:
    postgres:
      image: postgres:16
      env:
        POSTGRES_PASSWORD: test
      ports:
        - 5432:5432
    redis:
      image: redis:7
      ports:
        - 6379:6379
  
  steps:
    - uses: actions/checkout@v4
    
    - name: Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version: '20'
        cache: 'pnpm'
    
    - name: Install dependencies
      run: pnpm install
    
    - name: Run unit tests
      run: pnpm test:unit --coverage
    
    - name: Run integration tests
      run: pnpm test:integration
      env:
        DATABASE_URL: postgresql://postgres:test@localhost:5432/test
        REDIS_URL: redis://localhost:6379
    
    - name: Upload coverage
      uses: codecov/codecov-action@v3
      with:
        files: ./coverage/lcov.info
    
    - name: Run E2E tests
      run: pnpm test:e2e
```

---

## Test Data Management

### Fixtures

```typescript
// Test data factory
export const createTestUser = (overrides?: Partial<User>): User => ({
  id: faker.string.uuid(),
  email: faker.internet.email(),
  firstName: faker.person.firstName(),
  lastName: faker.person.lastName(),
  userType: 'candidate',
  status: 'active',
  createdAt: new Date(),
  ...overrides
});

export const createTestChallenge = (overrides?: Partial<Challenge>): Challenge => ({
  id: faker.string.uuid(),
  title: faker.lorem.sentence(),
  description: faker.lorem.paragraphs(2),
  difficulty: 'intermediate',
  type: 'coding',
  timeLimitMinutes: 60,
  ...overrides
});
```

---

*Last Updated: January 2026*
