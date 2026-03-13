# User Questions (Phase 5)

Human-in-the-loop escalation pipeline. When a skill emits `ROUTE_TO_USER`, the orchestrator posts the question to `#open-questions`, pauses the thread, and resumes when the human answers (Pattern B). Supports polling for pending answers.
