# Chapter 6: Technology Stack

The technology stack of the VeriHire platform consists of various tools, frameworks, and technologies used to develop and deploy the system. These technologies work together to support the core functionalities of the platform, including candidate assessment, resume analysis, certificate generation, and recruitment management. The selected technologies provide scalability, efficiency, and reliability while enabling seamless interaction between different components of the system.

---

## 6.1 Frontend Technologies

Frontend technologies are responsible for designing the user interface of the system and enabling interaction between the users and the platform. The frontend provides an intuitive interface through which candidates and recruiters can access system features.

### Next.js 14

Next.js 14 is used as the primary frontend framework for developing the user interface of the VeriHire platform. It is a React-based framework that provides file-based routing through its App Router, server-side rendering capabilities, and optimised performance out of the box. Next.js allows developers to create dynamic, fast-loading web pages while maintaining a clean project structure where each route maps directly to a file in the codebase.

The App Router architecture of Next.js allows different sections of the application, such as the challenge interface, job portal, candidate dashboard, and recruiter pipeline, to be developed and managed as independent route segments. Next.js also supports both server-side and client-side rendering, enabling the platform to deliver content efficiently depending on the requirements of each page.

### Tailwind CSS and shadcn/ui

Tailwind CSS is used for styling the frontend components of the platform. It provides a utility-first approach to designing user interfaces, allowing developers to quickly apply styling directly within React components without writing separate CSS files.

shadcn/ui is used as the component library, built on top of Radix UI primitives. Radix UI provides accessible, unstyled UI components that handle complex interaction patterns such as modals, dropdown menus, and form controls. shadcn/ui combines these accessible primitives with Tailwind CSS styling to produce a consistent, modern, and responsive interface across the platform.

### Monaco Editor

The Monaco Editor is integrated into the platform to provide candidates with a professional code editing experience when completing coding challenges. Monaco is the same editor engine used in Visual Studio Code, and it provides features such as syntax highlighting, auto-completion, bracket matching, and multi-language support. This gives candidates a familiar and productive coding environment directly within the browser.

### SWR

SWR (Stale-While-Revalidate) is used for client-side data fetching throughout the frontend. It is a lightweight library that provides automatic caching, background revalidation, and loading state management. SWR ensures that the interface remains responsive by immediately displaying cached data while fetching updated information in the background.

---

## 6.2 Backend Technologies

Backend technologies manage the core logic of the system, handle data processing, and enable communication between the frontend and database.

### NestJS 10 (Node.js)

NestJS is used as the backend framework for the VeriHire platform. It is built on top of Node.js and provides a structured, modular architecture with built-in support for dependency injection, middleware, guards, and decorators. NestJS organises the backend code into independent modules, each responsible for a specific domain of the application (e.g., authentication, submissions, evaluations, certificates).

The modular architecture of NestJS is particularly well-suited for a platform with multiple user roles and complex business logic. Each module encapsulates its own controller (handling HTTP requests), service (containing business logic), and data transfer objects (defining and validating input data). This separation of concerns makes the codebase maintainable, testable, and easy to extend.

Node.js, the underlying runtime, allows the backend to handle multiple user requests concurrently through its asynchronous, event-driven architecture. This is important for a platform that involves operations such as submitting code for evaluation, polling for results, and processing file uploads.

### Prisma ORM

Prisma is used as the Object-Relational Mapping (ORM) layer for database access. Prisma generates a fully type-safe database client from a schema file, which means that all database queries are validated at compile time against the actual database structure. This eliminates an entire category of runtime errors related to incorrect column names, missing fields, or type mismatches.

The Prisma schema file serves as a single source of truth for the database structure, and the generated client is shared across the entire monorepo through a dedicated database package.

### Passport.js and JWT

Passport.js is used for handling authentication strategies, including local email/password login and OAuth integration with Google and GitHub. JSON Web Tokens (JWT) are used for stateless authentication — upon successful login, the server issues a short-lived access token (15 minutes) and a rotating refresh token (7 days). This approach allows the API to remain scalable without requiring server-side session storage.

---

## 6.3 Database Technology

### PostgreSQL (via Supabase)

PostgreSQL is used as the primary relational database for storing and managing all system data. It is a mature, open-source relational database management system known for its reliability, data integrity, and support for advanced features such as array columns, JSON fields, and full-text search.

The relational nature of PostgreSQL is well-suited for the platform's data model, which involves interconnected entities such as users, candidate profiles, challenges, submissions, evaluations, certificates, jobs, and companies. Foreign key constraints and relational queries ensure data consistency across these entities.

PostgreSQL is hosted on Supabase, a managed backend-as-a-service platform that provides a hosted PostgreSQL instance along with additional features such as S3-compatible file storage. Using Supabase simplifies infrastructure management and allows the development team to focus on application logic rather than database administration.

---

## 6.4 Artificial Intelligence and Code Execution

Artificial intelligence and sandboxed code execution are central to the VeriHire platform's automated assessment capabilities. These technologies enable the system to evaluate candidate code and analyse resumes without manual intervention.

### Groq API with Llama 3.3 70B

The Groq API is used to access the Llama 3.3 70B large language model, which powers three core AI features of the platform:

1. **Test Case Generation** — When a coding challenge does not have pre-defined test cases, the LLM generates a structured set of test cases (inputs and expected outputs) based on the challenge description.
2. **Code Evaluation Feedback** — After a candidate's code is executed and scored, the LLM generates human-readable feedback explaining the results, identifying failures, and suggesting improvements.
3. **Resume Analysis** — When a candidate uploads a resume, the LLM extracts structured information including work history (with dates), technical domains, and an initial seniority assessment.

Groq was selected because it provides fast inference speeds for large language models and offers free API access during development. The Llama 3.3 70B model was chosen for its strong performance on structured extraction and reasoning tasks.

### Judge0 CE

Judge0 Community Edition is an open-source code execution engine used to safely run untrusted candidate code in isolated containers. When a candidate submits a solution, the code is sent to Judge0 along with the test case inputs. Judge0 executes the code within strict resource limits (CPU time, memory usage) and returns the output.

This sandboxed execution approach ensures that the platform can run arbitrary code submitted by any user without risking the security or stability of the main system. Judge0 supports over 60 programming languages, allowing the platform to offer challenges in a wide variety of technologies.

---

## 6.5 Security and Certificate Technologies

### ECDSA Digital Signatures (secp256k1)

Each certificate issued by the platform is digitally signed using the Elliptic Curve Digital Signature Algorithm (ECDSA) with the secp256k1 curve — the same cryptographic standard used in blockchain systems such as Bitcoin and Ethereum. This ensures that certificates cannot be forged or tampered with after issuance.

### SHA-256 Hashing

Each certificate's content is hashed using SHA-256 to produce a unique fingerprint. Any modification to the certificate data would produce a completely different hash, making tampering detectable.

### Polygon Blockchain (Amoy Testnet)

Certificate hashes are anchored on the Polygon Amoy blockchain through a smart contract. This creates an immutable, publicly verifiable record of every certificate issued by the platform. Recruiters and employers can independently verify that a certificate is authentic by checking its hash against the blockchain record.

---

## 6.6 Development and Deployment Tools

Various development tools are used to support coding, version control, testing, and deployment of the platform.

### Turborepo and pnpm Workspaces

The entire project is managed as a monorepo using Turborepo and pnpm workspaces. This means the frontend application, backend API, and shared packages (database, types, utilities, configuration) all reside in a single repository. Turborepo orchestrates build and development tasks across workspaces, while pnpm provides efficient dependency management with strict isolation between packages.

This monorepo approach ensures that the frontend and backend always use consistent type definitions and shared utilities, reducing duplication and preventing version mismatches.

### Git and GitHub

Git is used for version control, allowing developers to track changes in the project code. GitHub is used as the repository platform where the project source code is stored and managed collaboratively. Conventional Commits are enforced through automated tooling (commitlint and husky), ensuring a clean and consistent commit history.

### Docker

Docker is used to containerise external services required for local development, including PostgreSQL, Judge0 CE, and MinIO (S3-compatible storage). Docker Compose orchestrates these services, allowing developers to start the entire local development environment with a single command.

### Railway

Railway is used as the cloud deployment platform for hosting the production instances of both the backend API and the frontend application. Railway provides automated deployments from the GitHub repository, environment variable management, and application monitoring.

---

## 6.7 Summary of Technology Stack

| Layer               | Technology                       | Purpose                                       |
| ------------------- | -------------------------------- | --------------------------------------------- |
| Frontend Framework  | Next.js 14 (React)               | Web application and user interface            |
| UI Components       | shadcn/ui + Radix UI             | Accessible, reusable interface components     |
| Styling             | Tailwind CSS                     | Utility-first CSS framework                   |
| Code Editor         | Monaco Editor                    | In-browser coding environment                 |
| Data Fetching       | SWR                              | Client-side caching and revalidation          |
| Backend Framework   | NestJS 10 (Node.js)              | Modular API with dependency injection         |
| ORM                 | Prisma 5                         | Type-safe database access                     |
| Authentication      | Passport.js + JWT                | OAuth and token-based authentication          |
| Database            | PostgreSQL (Supabase)            | Relational data storage                       |
| File Storage        | Supabase Storage (S3-compatible) | Resume and file uploads                       |
| AI / LLM            | Groq API (Llama 3.3 70B)         | Test generation, evaluation, resume analysis  |
| Code Execution      | Judge0 CE                        | Sandboxed execution of candidate code         |
| Certificate Signing | ECDSA secp256k1 + SHA-256        | Cryptographic certificate integrity           |
| Blockchain          | Polygon Amoy Testnet             | Immutable certificate verification records    |
| Monorepo Tooling    | Turborepo + pnpm                 | Build orchestration and dependency management |
| Deployment          | Railway                          | Cloud hosting for API and web application     |
| Containerisation    | Docker + Docker Compose          | Local development environment                 |
| Version Control     | Git + GitHub                     | Source code management                        |
