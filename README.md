# VeriHire

> AI-Powered Skill Certification and Hiring Platform

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue)](https://www.typescriptlang.org/)
[![Python](https://img.shields.io/badge/Python-3.11+-blue)](https://www.python.org/)
[![Node](https://img.shields.io/badge/Node-20+-green)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-9.0-orange)](https://pnpm.io/)

VeriHire is a modern hiring platform that uses AI/ML to objectively evaluate developer skills through hands-on challenges. Candidates complete real-world coding challenges that are evaluated by **CodeBERT** and **BERT** models, earn verifiable certificates, and get matched to jobs using **Neural Collaborative Filtering**.

## Why VeriHire?

- 🤖 **AI-Powered Evaluation** - CodeBERT analyzes code quality, BERT evaluates written responses
- 🎯 **Real Skills, Real Challenges** - No more whiteboard interviews or trivia questions
- 🏆 **Verifiable Certificates** - Blockchain-backed skill certifications that recruiters can trust
- 🔗 **Smart Matching** - Neural Collaborative Filtering matches candidates to jobs based on verified skills
- 👥 **Peer Review System** - Community-driven quality control with reputation scoring
- 📊 **Data-Driven Insights** - Detailed analytics for both candidates and recruiters

---

## Tech Stack

### Frontend

- **Next.js 14** - React framework with App Router
- **React 18** - UI library
- **Tailwind CSS** - Utility-first styling

### Backend

- **NestJS 10** - Node.js framework with TypeScript
- **Prisma 5** - Type-safe ORM
- **PostgreSQL** - Primary database
- **Redis** - Caching and rate limiting
- **JWT** - Authentication

### ML Service

- **FastAPI** - High-performance Python API
- **CodeBERT** - Code quality evaluation (Microsoft)
- **BERT** - Text analysis and evaluation
- **NCF** - Neural Collaborative Filtering for job matching
- **PyTorch** - ML framework

### Infrastructure

- **Docker & Docker Compose** - Containerization
- **Turborepo** - Monorepo build system
- **pnpm** - Fast, disk space efficient package manager

---

## Quick Start

### Prerequisites

- **Node.js** >= 20.0.0
- **pnpm** >= 9.0.0
- **Python** >= 3.11
- **Docker & Docker Compose**
- **PostgreSQL** 15+ (or use Docker)
- **Redis** 7+ (or use Docker)

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/verihire.git
cd verihire

# Install dependencies
pnpm install

# Set up environment variables
cp .env.example .env
# Edit .env with your configuration

# Start infrastructure (PostgreSQL, Redis)
pnpm docker:up

# Generate Prisma client and run migrations
pnpm db:generate
pnpm db:migrate

# Seed the database with initial data
pnpm db:seed

# Set up ML service
cd apps/ml
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install -r requirements.txt
cd ../..
```

### Running the Development Servers

```bash
# Start all services (API, Web, ML)
pnpm dev

# Or run individually:
pnpm --filter @verihire/api dev      # API on http://localhost:4100
pnpm --filter @verihire/web dev      # Web on http://localhost:3100
pnpm --filter @verihire/ml dev       # ML on http://localhost:4200
```

### Access Points

- **Web App**: http://localhost:3100
- **API**: http://localhost:4100
- **API Docs (Swagger)**: http://localhost:4100/docs
- **ML Service**: http://localhost:4200
- **ML Docs (Swagger)**: http://localhost:4200/docs
- **Prisma Studio**: `pnpm db:studio` → http://localhost:5555

---

## Project Structure

```
verihire/
├── apps/
│   ├── api/                 # NestJS backend API
│   ├── web/                 # Next.js frontend
│   └── ml/                  # FastAPI ML service
├── packages/
│   ├── database/            # Prisma schema and migrations
│   ├── types/               # Shared TypeScript types
│   ├── utils/               # Shared utility functions
│   └── config/              # Shared configuration (ESLint, TS)
├── docs/                    # Documentation
│   ├── api/                 # API specifications
│   ├── database/            # Database schema docs
│   ├── deployment/          # Deployment guides
│   └── security/            # Security guidelines
└── scripts/                 # Build and deployment scripts
```

---

## Key Features

### For Candidates

- **Take Skill Challenges** - Complete real-world coding, design, or written challenges
- **Get AI Feedback** - Receive detailed analysis of your code quality and approach
- **Earn Certificates** - Blockchain-verified skill certifications
- **Build Portfolio** - Showcase your verified skills to recruiters
- **Peer Review** - Review others' work and build reputation

### For Recruiters

- **Search by Verified Skills** - Find candidates with proven abilities
- **Smart Job Matching** - AI recommends best-fit candidates
- **View Detailed Profiles** - See actual work samples and scores
- **Create Custom Challenges** - Tailor assessments to your needs
- **Track Analytics** - Monitor hiring pipeline metrics

### For the Platform

- **Code Evaluation** - CodeBERT analyzes complexity, readability, maintainability, security
- **Text Evaluation** - BERT assesses coherence, depth, relevance, clarity
- **Candidate Matching** - NCF model trained on skill-job interactions
- **Review Quality Analysis** - ML detects bias and low-effort reviews
- **Fraud Detection** - Anti-cheating measures and plagiarism detection

---

## API Documentation

Full API documentation is available at:

- **Swagger UI**: http://localhost:4100/docs (when running locally)
- **Detailed Specs**: [docs/api/README.md](./docs/api/README.md)

### Quick API Examples

**Register a user:**

```bash
curl -X POST http://localhost:4100/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "dev@example.com",
    "password": "SecurePass123!",
    "firstName": "Jane",
    "lastName": "Developer",
    "role": "CANDIDATE"
  }'
```

**Evaluate code with ML:**

```bash
curl -X POST http://localhost:4200/api/v1/evaluate/code \
  -H "Content-Type: application/json" \
  -d '{
    "code": "def fibonacci(n):\n    if n <= 1:\n        return n\n    return fibonacci(n-1) + fibonacci(n-2)",
    "language": "python"
  }'
```

---

## ML Service

The ML service provides AI-powered evaluation and matching capabilities. See [apps/ml/README.md](./apps/ml/README.md) for detailed documentation.

### Test the ML Service

Once running, visit http://localhost:4200/docs for an interactive API playground.

**Code Evaluation:**

- Analyzes complexity, readability, maintainability, security
- Returns scores (0-100) and improvement suggestions
- Supports Python, JavaScript, TypeScript, Java, C++, Go

**Text Evaluation:**

- Evaluates written responses for technical depth
- Checks relevance, coherence, clarity, originality
- Used for design documents and architecture explanations

**Candidate Matching:**

- Neural Collaborative Filtering (NCF) model
- Matches candidates to jobs based on verified skills
- Considers skill scores, experience, and historical data

**Review Quality:**

- Detects low-effort or biased reviews
- Analyzes thoroughness, consistency, timing
- Protects platform integrity

---

## Development

### Available Scripts

```bash
# Development
pnpm dev                    # Start all services in dev mode
pnpm build                  # Build all packages and apps
pnpm lint                   # Lint all code
pnpm lint:fix               # Fix linting issues
pnpm typecheck              # Type check TypeScript code

# Testing
pnpm test                   # Run all tests
pnpm test:coverage          # Run tests with coverage
pnpm test:e2e               # Run end-to-end tests

# Database
pnpm db:generate            # Generate Prisma client
pnpm db:migrate             # Run database migrations
pnpm db:push                # Push schema to database (dev)
pnpm db:seed                # Seed database with test data
pnpm db:studio              # Open Prisma Studio

# Docker
pnpm docker:up              # Start PostgreSQL and Redis
pnpm docker:down            # Stop all containers
pnpm docker:logs            # View container logs

# Formatting
pnpm format                 # Format all code with Prettier
pnpm format:check           # Check formatting

# Cleanup
pnpm clean                  # Remove node_modules and build artifacts
```

### Working with the Monorepo

This is a **Turborepo** monorepo managed with **pnpm workspaces**.

**Run commands in specific workspace:**

```bash
pnpm --filter @verihire/api <command>
pnpm --filter @verihire/web <command>
pnpm --filter @verihire/database <command>
```

**Add dependencies:**

```bash
# Add to root
pnpm add -D <package>

# Add to specific workspace
pnpm --filter @verihire/api add <package>
```

**Create new workspace:**

```bash
# Apps
mkdir apps/new-app
cd apps/new-app
pnpm init

# Packages
mkdir packages/new-package
cd packages/new-package
pnpm init
```

---

## Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
# API
PORT=4100
NODE_ENV=development
API_URL=http://localhost:4100

# Database
DATABASE_URL=postgresql://verihire:verihire_dev@localhost:5432/verihire

# Redis
REDIS_URL=redis://:verihire_dev@localhost:6379

# JWT
JWT_ACCESS_SECRET=your-secret-key-here
JWT_REFRESH_SECRET=your-refresh-secret-here
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# ML Service
ML_SERVICE_URL=http://localhost:4200
ML_SERVICE_ENABLED=true

# Email (optional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password

# Frontend
NEXT_PUBLIC_API_URL=http://localhost:4100
```

---

## Testing

### Unit Tests

```bash
# Run all unit tests
pnpm test

# Run tests for specific workspace
pnpm --filter @verihire/api test

# Watch mode
pnpm --filter @verihire/api test:watch

# Coverage
pnpm test:coverage
```

### E2E Tests

```bash
# Run end-to-end tests
pnpm test:e2e
```

### Manual Testing

Use the Swagger UIs for interactive API testing:

- **Main API**: http://localhost:4100/docs
- **ML Service**: http://localhost:4200/docs

---

## Deployment

See [docs/deployment/README.md](./docs/deployment/README.md) for detailed deployment instructions.

### Quick Deploy with Docker

```bash
# Build images
docker-compose -f docker-compose.prod.yml build

# Start services
docker-compose -f docker-compose.prod.yml up -d

# View logs
docker-compose -f docker-compose.prod.yml logs -f
```

---

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

### Development Workflow

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run tests and linting (`pnpm test && pnpm lint`)
5. Commit with conventional commits (`git commit -m 'feat: add amazing feature'`)
6. Push to your fork (`git push origin feature/amazing-feature`)
7. Open a Pull Request

### Commit Convention

We use [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `style:` - Code style changes (formatting, etc.)
- `refactor:` - Code refactoring
- `test:` - Test changes
- `chore:` - Build process or auxiliary tool changes

---

## Architecture Highlights

### Authentication & Authorization

- JWT-based authentication with refresh tokens
- Role-based access control (RBAC)
- MFA support (optional)
- Rate limiting per endpoint

### Challenge System

- AI-generated challenges tailored to skill level
- Real-time code execution in sandboxed environments
- Automated evaluation with ML models
- Peer review system for quality control

### Certificate Generation

- Blockchain-backed verification (planned)
- QR code for instant verification
- PDF generation with unique certificate numbers
- Public verification endpoint

### ML Pipeline

- Model serving with FastAPI
- Lazy loading for faster startup
- Response caching with Redis
- Batch processing support
- GPU acceleration (optional)

---

## Performance

### API Response Times

- Authentication: ~50ms
- Challenge listing: ~100ms
- Code evaluation: ~2-3s (ML inference)
- Text evaluation: ~1-2s (ML inference)

### Optimizations

- Redis caching for frequently accessed data
- Database query optimization with Prisma
- Lazy loading of ML models
- CDN for static assets (production)
- Connection pooling

---

## Security

- **Authentication**: JWT with secure httpOnly cookies
- **Rate Limiting**: Prevents abuse and DDoS
- **Input Validation**: class-validator on all endpoints
- **SQL Injection**: Protected by Prisma ORM
- **XSS Protection**: Helmet.js security headers
- **CORS**: Configurable origin whitelist
- **Secrets Management**: Environment variables, never committed
- **Code Execution**: Sandboxed containers for challenge evaluation

See [docs/security/README.md](./docs/security/README.md) for detailed security guidelines.

---

## Roadmap

- [ ] Mobile app (React Native)
- [ ] Blockchain certificate verification
- [ ] Video interview integration
- [ ] More ML models (GPT integration for challenge generation)
- [ ] Real-time collaborative coding challenges
- [ ] Company profiles and branding
- [ ] Advanced analytics dashboard
- [ ] API rate limiting tiers
- [ ] Internationalization (i18n)

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## Support

- **Documentation**: [docs/](./docs/)
- **Issues**: [GitHub Issues](https://github.com/yourusername/verihire/issues)
- **Discussions**: [GitHub Discussions](https://github.com/yourusername/verihire/discussions)

---

## Acknowledgments

- **CodeBERT** - Microsoft Research
- **BERT** - Google Research
- **Neural Collaborative Filtering** - He et al., 2017
- All the amazing open-source projects we depend on

---

**Built with ❤️ by the VeriHire Team**
