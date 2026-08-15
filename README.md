# System Design Sandbox

[![CI](https://github.com/pferdosali/requirements-were-unclear/actions/workflows/ci.yml/badge.svg)](https://github.com/pferdosali/requirements-were-unclear/actions/workflows/ci.yml)

A personal sandbox for practicing end-to-end system design, architecture, and implementation.

The goal of this repository is not to build production systems, but to improve engineering judgment by taking a problem from idea to deployment while documenting decisions, tradeoffs, and lessons learned along the way.

Projects in this repository may use mock integrations, simplified implementations, or experimental technologies when appropriate for learning.

---

## Objectives

- Practice system design and architecture
- Improve technical writing and design documentation
- Explore new technologies and frameworks
- Experiment with cloud-native architectures
- Build production-style implementations
- Learn deployment and operational best practices

---

## Development Process

Each project follows the same lifecycle.

### Stage 1: Blueprint

Create a high-level system design document.

Focus areas:

- Problem definition
- Requirements
- Architecture
- Datastore strategy
- Security approach
- Reliability approach
- Open questions and assumptions

Deliverable:
- [x] [PAS document](https://github.com/pferdosali/requirements-were-unclear/blob/main/docs/DocBridge_Blueprint_PAS_1.md)
- [x] [Design Diagram](https://app.eraser.io/workspace/sVskwriHEh502mT8DiIp)
- [x] [Low Fidelity UI mockups](https://rem-genius-52349022.figma.site/)

---

### Stage 2: Technical Design

Expand the blueprint into a detailed technical design.

Focus areas:

- Technology selection
- Data models
- API contracts
- Component responsibilities
- Failure handling
- Testing strategy

Deliverable:

```text
/docs/technical-design.md
```

---

### Stage 3: Implementation

Build the system.

Focus areas:

- Production-quality code
- Maintainability
- Testing
- Security
- Reliability

Deliverable:

```text
/implementation
```

---

### Stage 4: Hosting

Deploy the system and document the deployment process.

Focus areas:

- Infrastructure
- CI/CD
- Monitoring
- Operational readiness

Deliverable:

```text
/deployment
```

---

## Repository Structure

```text
requirements-were-unclear/
├── .github/
│   └── workflows/
│       └── ci.yml              # GitHub Actions CI pipeline
├── docs/
│   ├── DocBridge_Blueprint_PAS_1.md
│   ├── Technical Design Document (TDD).md
│   └── Diagrams/
├── implementation/
│   ├── api/                    # Express API (TypeScript)
│   │   ├── src/
│   │   │   ├── app.ts
│   │   │   ├── server.ts
│   │   │   ├── middleware/     # Auth (mock → Cognito)
│   │   │   ├── routes/        # health, upload, jobs, submit
│   │   │   ├── services/      # team, upload, job, task, queue
│   │   │   ├── worker/        # SQS consumer, task processor, retry
│   │   │   ├── types/         # Queue message interfaces
│   │   │   └── db/            # Pool + migrations
│   │   └── tests/             # Jest (45 tests)
│   └── infra/                  # AWS CDK (7 stacks)
│       ├── bin/infra.ts
│       └── lib/
│           ├── networking-stack.ts
│           ├── auth-stack.ts
│           ├── storage-stack.ts
│           ├── messaging-stack.ts
│           ├── routing-stack.ts
│           ├── compute-stack.ts
│           └── edge-stack.ts
├── latest_updates.md
└── README.md
```

---

## Current Projects

### DocBridge

A document upload orchestration platform that enables users to upload files once and distribute them to multiple destinations while providing status tracking, validation, retries, and auditing.

Current Status:

```text
Stage 3 - Implementation
```

Progress:

| Epic | Status |
|------|--------|
| #9 Infrastructure as Code | ✅ Complete (CDK synth, not deployed) |
| #1 Authentication & User Access | ✅ Complete |
| #2 File Upload & S3 Storage | ✅ Complete |
| #3 Job and Task Metadata | ✅ Complete |
| CI Pipeline | ✅ Complete (GitHub Actions) |
| #4 Queue-Based Processing | ✅ Complete |
| #5 Worker Execution & Retry | ✅ Complete |
| #6 Destination Routing | ✅ Complete |
| #7 Status Tracking UI | ✅ Complete |
| #8 Audit Logging & Observability | ✅ Complete |
| #10 CI/CD and Deployment | 🔜 Next |

Stack: TypeScript, Express, PostgreSQL, AWS CDK, S3, SQS, ECS Fargate, React

---

### CI Pipeline

The project uses GitHub Actions for continuous integration:

- **API Job:** TypeScript compile → Jest (24 tests) → coverage report
- **Infra Job:** TypeScript compile → CDK synth (CloudFormation validation)
- **Triggers:** Push to `main`, all PRs
- **Config:** [`.github/workflows/ci.yml`](.github/workflows/ci.yml)

---

### Next Up: Epic #10 — CI/CD and Deployment

Deploy the system to AWS and automate the pipeline:

1. CDK deploy to dev environment
2. GitHub Actions CD (deploy on merge to main)
3. Docker image build + ECR push
4. Operational readiness

---

## Disclaimer

This repository is intended for learning, experimentation, and professional development.

Designs, code, and infrastructure decisions may evolve as new information, technologies, and lessons are discovered.
