# Temporal Docker Compose

Provide a production-ready Docker Compose configuration for running Temporal alongside Ptah. While feature 015 defaults to `temporal server start-dev` for local development, teams deploying Ptah in shared or CI/CD environments need a persistent Temporal deployment with PostgreSQL-backed storage, the Temporal Web UI, and configurable resource limits.
