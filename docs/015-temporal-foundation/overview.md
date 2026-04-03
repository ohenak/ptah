# 015 Temporal Foundation

Ptah v5 replaces the custom orchestration infrastructure (state machine, thread queue, merge lock, invocation guard, question polling) with Temporal durable workflows. Simultaneously, the hardcoded PDLC phases, agent-to-phase mappings, reviewer manifests, and transition rules become configuration-driven rather than baked into TypeScript enums and switch statements.

This is the foundational milestone. After completion, Ptah runs on Temporal with crash recovery, deterministic replay, and configurable workflows — enabling it to orchestrate its own continued development.
