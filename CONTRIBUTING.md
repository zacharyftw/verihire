# Contributing to VeriHire

Thank you for your interest in contributing to VeriHire! This document provides guidelines and instructions for contributing.

---

## Code of Conduct

We are committed to providing a welcoming and inclusive environment. Please read and follow our Code of Conduct.

---

## Getting Started

### Prerequisites

- Node.js 20+
- Python 3.11+
- Docker & Docker Compose
- pnpm 8+
- PostgreSQL 16
- Redis 7

### Development Setup

```bash
# Clone the repository
git clone https://github.com/verihire/verihire.git
cd verihire

# Install dependencies
pnpm install

# Copy environment files
cp .env.example .env

# Start infrastructure
docker-compose up -d postgres redis elasticsearch

# Run database migrations
pnpm db:migrate

# Seed development data
pnpm db:seed

# Start development servers
pnpm dev
```

---

## Development Workflow

### Branch Naming

```
feature/   - New features (feature/add-skill-badges)
fix/       - Bug fixes (fix/login-redirect)
refactor/  - Code refactoring (refactor/auth-service)
docs/      - Documentation (docs/api-endpoints)
test/      - Test additions (test/certificate-service)
chore/     - Maintenance tasks (chore/update-deps)
```

### Commit Messages

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(auth): add OAuth2 login with Google
fix(challenges): correct time limit calculation
docs(api): update authentication endpoints
test(certificates): add unit tests for generation
refactor(db): optimize candidate search query
chore(deps): update dependencies
```

### Pull Request Process

1. Create a branch from `main`
2. Make your changes with tests
3. Run `pnpm lint` and `pnpm test`
4. Push and create a PR
5. Fill out the PR template
6. Wait for CI to pass
7. Request review from maintainers

---

## Code Standards

### TypeScript/JavaScript

```typescript
// Use explicit types
function calculateScore(submission: Submission): number {
  // Implementation
}

// Prefer const over let
const config = loadConfig();

// Use async/await over callbacks
async function fetchData(): Promise<Data> {
  const response = await api.get('/data');
  return response.data;
}

// Document complex functions
/**
 * Generates a certificate for a successful submission.
 * @param submission - The evaluated submission
 * @param candidate - The candidate who submitted
 * @returns The generated certificate
 * @throws {ScoreThresholdError} If score is below threshold
 */
async function generateCertificate(
  submission: Submission,
  candidate: Candidate
): Promise<Certificate> {
  // Implementation
}
```

### Python

```python
# Use type hints
def evaluate_submission(submission: Submission) -> EvaluationResult:
    """
    Evaluate a candidate submission.
    
    Args:
        submission: The submission to evaluate
        
    Returns:
        The evaluation result with scores and feedback
        
    Raises:
        EvaluationError: If evaluation fails
    """
    pass

# Use dataclasses for data structures
@dataclass
class ChallengeConfig:
    skill_id: str
    difficulty: str
    time_limit: int = 60
```

### React Components

```tsx
// Use functional components with TypeScript
interface CandidateCardProps {
  candidate: Candidate;
  onSelect: (id: string) => void;
  selected?: boolean;
}

export const CandidateCard: React.FC<CandidateCardProps> = ({
  candidate,
  onSelect,
  selected = false
}) => {
  return (
    <div 
      className={cn('card', { selected })}
      onClick={() => onSelect(candidate.id)}
    >
      {/* Component content */}
    </div>
  );
};
```

---

## Testing Guidelines

### Unit Tests

- Test one thing per test
- Use descriptive test names
- Mock external dependencies
- Aim for 80% coverage

```typescript
describe('CertificateService', () => {
  describe('generateCertificate', () => {
    it('should generate certificate for passing score', async () => {
      // Arrange
      const submission = createSubmission({ score: 85 });
      
      // Act
      const certificate = await service.generateCertificate(submission);
      
      // Assert
      expect(certificate.score).toBe(85);
      expect(certificate.hash).toBeDefined();
    });
    
    it('should reject submission below threshold', async () => {
      const submission = createSubmission({ score: 45 });
      
      await expect(service.generateCertificate(submission))
        .rejects.toThrow(ScoreThresholdError);
    });
  });
});
```

### Integration Tests

- Test API endpoints end-to-end
- Use test database
- Clean up after tests

### E2E Tests

- Test critical user flows
- Run in CI before merge
- Use realistic test data

---

## Documentation

### Code Documentation

- Document all public APIs
- Include examples for complex functions
- Keep README files up to date

### API Documentation

- Update OpenAPI spec for API changes
- Include request/response examples
- Document error codes

---

## Review Process

### What We Look For

- [ ] Code follows style guidelines
- [ ] Tests are included and passing
- [ ] Documentation is updated
- [ ] No security vulnerabilities
- [ ] Performance is acceptable
- [ ] Error handling is appropriate

### Review Timeline

- Initial review: 1-2 business days
- Follow-up reviews: Same day when possible

---

## Release Process

1. Features merged to `main`
2. Automated tests run
3. Deploy to staging
4. QA validation
5. Create release tag
6. Deploy to production

---

## Getting Help

- GitHub Issues for bugs and features
- Discussions for questions
- Slack for real-time chat

---

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

*Thank you for contributing to VeriHire!*
