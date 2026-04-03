# Requirements Document

## Temporal Docker Compose Deployment

| Field | Detail |
|-------|--------|
| **Document ID** | REQ-018 |
| **Parent Document** | [REQ-015 — Temporal Foundation](../015-temporal-foundation/015-REQ-temporal-foundation.md) |
| **Version** | 1.0 |
| **Date** | April 2, 2026 |
| **Author** | Product Manager |
| **Status** | Draft |
| **Approval Date** | Pending |

---

## 1. Purpose

Provide a production-ready Docker Compose configuration for running the Temporal server alongside Ptah.

Feature 015 (Temporal Foundation) defaults to `temporal server start-dev` — a single-binary, in-memory Temporal server ideal for local development. However, this mode has critical limitations:

- **No persistence.** Workflow history is lost when the process stops. A restart means all in-flight workflows vanish.
- **No Web UI.** The dev server does not include the Temporal Web UI, so the observability benefits described in [REQ-TF-04](../015-temporal-foundation/015-REQ-temporal-foundation.md) and [REQ-NF-15-02](../015-temporal-foundation/015-REQ-temporal-foundation.md) are unavailable.
- **Not suitable for shared environments.** Multiple developers or CI runners cannot share a dev server reliably.

This feature provides a Docker Compose stack that runs Temporal with PostgreSQL-backed persistence, the Temporal Web UI, and production-appropriate defaults. It is the recommended deployment for teams, CI/CD pipelines, and any environment where workflow durability matters.

**Depends on:** Feature 015 (Temporal Foundation) — this feature provides the deployment infrastructure; feature 015 provides the Ptah integration that runs on it.

---

## 2. User Scenarios

### US-37: Developer Starts Temporal with One Command for Persistent Local Development

| Attribute | Detail |
|-----------|--------|
| **Description** | A developer wants a local Temporal server with persistent storage so that restarting the server does not lose workflow history. They run `docker compose up -d` from the Ptah project root and have a fully operational Temporal environment with PostgreSQL storage and the Web UI. |
| **Goals** | One-command startup. Persistent workflow history across restarts. Web UI for observability. No manual server configuration. |
| **Pain points** | `temporal server start-dev` loses all state on restart — the developer must re-migrate features and lose execution history. Setting up Temporal with persistence from scratch requires understanding Temporal's auto-setup images, schema management, and networking. |
| **Key needs** | Docker Compose file in the project. PostgreSQL for persistence. Temporal Web UI exposed on a known port. Health checks so `ptah start` can wait for readiness. |

### US-38: CI Pipeline Runs Ptah with Ephemeral Temporal Infrastructure

| Attribute | Detail |
|-----------|--------|
| **Description** | A CI/CD pipeline needs to run Ptah integration tests or automated feature development. It starts Temporal via Docker Compose as a service, runs Ptah against it, and tears everything down after the job. The Temporal state is ephemeral (destroyed with the containers) but durable within the job. |
| **Goals** | Temporal as a CI service. Clean start per job. No state leaking between runs. Fast startup. |
| **Pain points** | `temporal server start-dev` works for CI but loses state mid-job if the process is restarted (e.g., OOM). Docker Compose with PostgreSQL provides durability within the job without complexity. |
| **Key needs** | Docker Compose profiles or separate CI config. Fast container startup. Configurable resource limits. |

### US-39: Team Runs Shared Temporal Server for Collaborative Development

| Attribute | Detail |
|-----------|--------|
| **Description** | A small team of 2-5 developers shares a single Temporal server running on a dev server or cloud VM. Multiple Ptah instances (one per developer's repo) connect to the shared Temporal, each using a different namespace or task queue. They can see each other's workflows in the Web UI. |
| **Goals** | Shared Temporal infrastructure. Namespace-based isolation. Centralized observability via Web UI. |
| **Pain points** | Each developer running their own Temporal locally leads to fragmented visibility — no one can see the team's overall progress. |
| **Key needs** | Docker Compose suitable for deployment on a shared server. Configurable namespaces. Network-accessible ports. |

---

## 3. Scope Boundaries

### 3.1 In Scope

- Docker Compose file for Temporal server + PostgreSQL + Web UI
- `ptah init` generates the Docker Compose file in the project
- Health check configuration so Ptah can verify Temporal readiness
- Configuration for resource limits (memory, CPU)
- Documentation for local, CI, and shared-server deployment modes
- `ptah temporal up` / `ptah temporal down` convenience commands

### 3.2 Out of Scope

- Kubernetes / Helm chart deployment — teams needing Kubernetes should use the official Temporal Helm chart
- Temporal Cloud setup — already supported in REQ-NF-15-01 via config
- Custom Temporal server plugins or advanced admin configuration
- Multi-cluster Temporal deployment

### 3.3 Assumptions

| ID | Assumption | Impact if Wrong |
|----|-----------|-----------------|
| A-18 | Docker and Docker Compose are available on target machines (developers, CI runners) | Ptah falls back to `temporal server start-dev` for environments without Docker |
| A-19 | Temporal's `auto-setup` Docker image handles schema migrations automatically | May need manual schema setup steps; document alternative |
| A-20 | PostgreSQL is an acceptable persistence backend for all deployment sizes in scope | For very large deployments, teams may need Cassandra; out of scope |

---

## 4. Requirements

### Domain: DC — Docker Compose Deployment

#### REQ-DC-01: Docker Compose Stack Definition

| Attribute | Detail |
|-----------|--------|
| **Description** | Provide a `docker-compose.temporal.yaml` file in the project root that defines three services: (1) `temporal` — the Temporal server using the official `temporalio/auto-setup` image with PostgreSQL configuration, (2) `temporal-db` — PostgreSQL for workflow persistence, (3) `temporal-ui` — the Temporal Web UI. The compose file uses named volumes for database persistence across restarts. |
| **Acceptance Criteria** | **Who:** Developer **Given:** A Ptah project with `docker-compose.temporal.yaml` **When:** They run `docker compose -f docker-compose.temporal.yaml up -d` **Then:** Three containers start. Temporal is accessible at `localhost:7233`. The Web UI is accessible at `localhost:8233`. PostgreSQL persists data in a named volume. Restarting the stack preserves all workflow history. |
| **Priority** | P0 |
| **Source Stories** | US-37, US-38 |
| **Dependencies** | None |

#### REQ-DC-02: ptah init Generates Docker Compose File

| Attribute | Detail |
|-----------|--------|
| **Description** | `ptah init` generates `docker-compose.temporal.yaml` alongside `ptah.config.json` and `ptah.workflow.yaml`. The generated file matches REQ-DC-01. If the file already exists, it is not overwritten (idempotent). |
| **Acceptance Criteria** | **Who:** Developer **Given:** A fresh repository **When:** They run `ptah init` **Then:** `docker-compose.temporal.yaml` is created in the project root with the Temporal + PostgreSQL + Web UI stack definition. Running `ptah init` again does not overwrite the file. |
| **Priority** | P0 |
| **Source Stories** | US-37 |
| **Dependencies** | REQ-DC-01 |

#### REQ-DC-03: Health Check and Readiness Verification

| Attribute | Detail |
|-----------|--------|
| **Description** | The Docker Compose stack includes health checks for all three services. The Temporal server health check verifies gRPC readiness on port 7233. PostgreSQL checks use `pg_isready`. The Temporal UI checks HTTP readiness. `ptah start` verifies Temporal connectivity before starting the Worker — if the server is not reachable, it prints a helpful error message suggesting `docker compose -f docker-compose.temporal.yaml up -d`. |
| **Acceptance Criteria** | **Who:** Developer **Given:** The Docker Compose stack is NOT running **When:** They run `ptah start` **Then:** The Orchestrator detects that Temporal is unreachable at the configured address and prints: `Cannot connect to Temporal at localhost:7233. Start the Temporal server with: docker compose -f docker-compose.temporal.yaml up -d` |
| **Priority** | P0 |
| **Source Stories** | US-37 |
| **Dependencies** | REQ-DC-01, REQ-NF-15-01 (from REQ-015) |

#### REQ-DC-04: Convenience Commands

| Attribute | Detail |
|-----------|--------|
| **Description** | Ptah provides convenience CLI commands: `ptah temporal up` (starts the Docker Compose stack in detached mode), `ptah temporal down` (stops the stack), `ptah temporal status` (shows container status and Temporal server version). These commands are thin wrappers around `docker compose -f docker-compose.temporal.yaml`. |
| **Acceptance Criteria** | **Who:** Developer **Given:** `docker-compose.temporal.yaml` exists in the project **When:** They run `ptah temporal up` **Then:** The Temporal stack starts in detached mode. `ptah temporal status` shows all three containers as healthy. `ptah temporal down` stops and removes the containers (volumes preserved). |
| **Priority** | P1 |
| **Source Stories** | US-37 |
| **Dependencies** | REQ-DC-01 |

#### REQ-DC-05: CI-Optimized Configuration

| Attribute | Detail |
|-----------|--------|
| **Description** | The Docker Compose file supports a `ci` profile (`docker compose --profile ci`) that disables the Web UI (unnecessary overhead in CI), reduces PostgreSQL memory allocation, and skips named volumes (ephemeral storage per job). This produces a lighter stack suitable for CI runners with limited resources. |
| **Acceptance Criteria** | **Who:** CI pipeline **Given:** A CI job running Ptah integration tests **When:** The pipeline runs `docker compose -f docker-compose.temporal.yaml --profile ci up -d` **Then:** Only `temporal` and `temporal-db` start (no Web UI). Containers use reduced resource limits. No named volumes — all state is ephemeral. |
| **Priority** | P1 |
| **Source Stories** | US-38 |
| **Dependencies** | REQ-DC-01 |

#### REQ-DC-06: Configurable Namespace and Ports

| Attribute | Detail |
|-----------|--------|
| **Description** | The Docker Compose file uses environment variables for key configuration: `TEMPORAL_PORT` (default 7233), `TEMPORAL_UI_PORT` (default 8233), `TEMPORAL_NAMESPACE` (default `default`), `POSTGRES_PASSWORD` (default `temporal`). This allows teams to customize ports for shared-server deployments or to avoid conflicts with other services. |
| **Acceptance Criteria** | **Who:** Developer **Given:** A shared server running other services on port 7233 **When:** They run `TEMPORAL_PORT=7234 TEMPORAL_UI_PORT=8234 docker compose -f docker-compose.temporal.yaml up -d` **Then:** Temporal starts on port 7234 and the Web UI on 8234. Setting `temporal.address: "shared-server:7234"` in `ptah.config.json` connects Ptah to this instance. |
| **Priority** | P1 |
| **Source Stories** | US-39 |
| **Dependencies** | REQ-DC-01 |

### Domain: NF — Non-Functional

#### REQ-NF-18-01: Docker Compose Version Compatibility

| Attribute | Detail |
|-----------|--------|
| **Description** | The Docker Compose file is compatible with Docker Compose V2 (the `docker compose` CLI plugin, not the legacy `docker-compose` binary). It uses Compose file format version 3.8 or later. The file is validated against the Compose specification. |
| **Acceptance Criteria** | **Who:** Developer **Given:** Docker Engine 24+ with Compose V2 plugin **When:** They run `docker compose -f docker-compose.temporal.yaml config` **Then:** The file validates without errors. |
| **Priority** | P0 |
| **Source Stories** | US-37, US-38, US-39 |
| **Dependencies** | REQ-DC-01 |

#### REQ-NF-18-02: Startup Time

| Attribute | Detail |
|-----------|--------|
| **Description** | The full Docker Compose stack (Temporal + PostgreSQL + Web UI) reaches a healthy state within 60 seconds on a machine with Docker images already pulled. First-run startup (including image pulls) is not time-bounded but should complete within 5 minutes on a 50 Mbps connection. |
| **Acceptance Criteria** | **Who:** Developer **Given:** Docker images are already cached locally **When:** They run `docker compose -f docker-compose.temporal.yaml up -d` **Then:** All three services report healthy within 60 seconds. |
| **Priority** | P1 |
| **Source Stories** | US-37, US-38 |
| **Dependencies** | REQ-DC-01 |

---

## 5. Risks

| ID | Risk | Likelihood | Impact | Mitigation |
|----|------|-----------|--------|------------|
| R-20 | Temporal `auto-setup` image may have breaking changes between versions | Low | Med | Pin image versions in the compose file; document upgrade path |
| R-21 | Docker not available in all CI environments (e.g., some serverless CI runners) | Med | Med | Document fallback to `temporal server start-dev` for Docker-less environments; feature 015 already supports this |
| R-22 | Named volumes may accumulate stale workflow data over time | Low | Low | Document `docker volume prune` for cleanup; `ptah temporal down --volumes` flag |

---

## 6. Requirements Summary

### By Priority

| Priority | Count | IDs |
|----------|-------|-----|
| P0 | 4 | REQ-DC-01, REQ-DC-02, REQ-DC-03, REQ-NF-18-01 |
| P1 | 4 | REQ-DC-04, REQ-DC-05, REQ-DC-06, REQ-NF-18-02 |

### By Domain

| Domain | Count | IDs |
|--------|-------|-----|
| DC — Docker Compose Deployment | 6 | REQ-DC-01 through REQ-DC-06 |
| NF — Non-Functional | 2 | REQ-NF-18-01, REQ-NF-18-02 |

**Total: 8 requirements (4 P0, 4 P1)**

---

## 7. Approval

| Role | Name | Date | Status |
|------|------|------|--------|
| Product Owner | — | — | Pending |

---

## Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | April 2, 2026 | Product Manager | Initial requirements document. 8 requirements across 2 domains. |

---

*End of Document*
