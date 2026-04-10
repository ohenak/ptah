# Requirements Document

## Orchestrator Discord Commands

| Field | Detail |
|-------|--------|
| **Document ID** | REQ-orchestrator-discord-commands |
| **Parent Document** | [REQ-017 Temporal Integration Completion](../../completed/017-temporal-integration-completion/017-REQ-temporal-integration-completion.md) |
| **Version** | 1.0 |
| **Date** | 2026-04-10 |
| **Author** | Product Manager |
| **Status** | Draft |
| **Approval Date** | Pending |

---

## Naming Note

Throughout this document, `@ptah` is used **for illustration only**. The actual Discord mention that dispatches orchestrator commands is fully configurable per deployment via `ptah.config.json`. No default, fallback, or hardcoded mention name exists anywhere in the product. Deployments that prefer `@ptah-bot`, `@orchestrator`, `@ptah-prod`, or a role mention such as `@PtahOrchestrator` are fully supported.

---

## 1. Purpose

This document specifies a new **orchestrator-level Discord command surface** that allows authorized users to issue commands directly to Ptah from any Discord channel or thread. The initial command set is intentionally small: bootstrap a new feature folder (`create backlog`) and discover commands (`help`). It complements — but is strictly separate from — the existing agent-mention flow (`@pm`, `@eng`, `@qa`) used to drive already-running feature-lifecycle workflows.

**Explicitly out of scope:** any workflow-start command such as `start review REQ for <feature>`. The REQ-overwrite bug that blocks safe workflow starts is tracked as an urgent, separate bug fix in `REQ-fix-req-overwrite-on-start`. Once that fix has landed, a follow-up revision of this document may add workflow-start commands.

---

## 2. User Scenarios

### US-01: Bootstrap a new feature backlog entry from Discord

| Attribute | Detail |
|-----------|--------|
| **Description** | An authorized user has an idea for a new feature. Rather than opening the repository, creating a folder, writing `overview.md`, committing, and pushing, they type a single Discord message mentioning the orchestrator and describing the feature. |
| **Goals** | Capture the idea in the backlog as `docs/backlog/<slug>/overview.md` with minimal friction; receive confirmation with the slug and a link; know immediately if a slug collision occurred. |
| **Pain points** | Today, every new feature requires direct repository access, a local dev environment, and manual folder scaffolding. Users without that setup cannot contribute ideas to the PDLC. |
| **Key needs** | A Discord command that creates the folder, writes a meaningful `overview.md` from the description, commits, and pushes — with a predictable slug-derivation rule and slug-collision protection. |

### US-02: Discover available orchestrator commands

| Attribute | Detail |
|-----------|--------|
| **Description** | A user new to Ptah sees `@ptah` mentioned somewhere and wants to know what commands the orchestrator supports. |
| **Goals** | Get a short, accurate command list without reading source code or docs. |
| **Pain points** | Without discoverability, the command surface is effectively invisible to anyone who did not author it. |
| **Key needs** | An `@ptah help` command that returns the supported verbs and their syntax in the invoking channel or thread. |

### US-03: Reject commands from unauthorized users

| Attribute | Detail |
|-----------|--------|
| **Description** | A user who is not on the authorization allowlist sees the `@ptah` mention and tries to issue `create backlog` or `help`. |
| **Goals** | Prevent unauthorized feature creation while communicating politely that the command requires access. |
| **Pain points** | Without authorization, anyone in the Discord server could spam the backlog. |
| **Key needs** | A configurable allowlist and a clear, non-disclosing refusal message. |

### US-04: Override the auto-derived slug inline

| Attribute | Detail |
|-----------|--------|
| **Description** | A power user knows exactly what slug they want for a feature and does not want to rely on the auto-derivation rule. |
| **Goals** | Supply the slug explicitly in the same message that creates the backlog entry. |
| **Pain points** | Auto-derivation rules are useful for casual users but sometimes produce slugs that are too long or misaligned with project naming conventions. |
| **Key needs** | An inline `--slug=<slug>` argument that overrides auto-derivation and is validated against the same rules as derived slugs. |

### US-05: Configure the orchestrator mention per deployment

| Attribute | Detail |
|-----------|--------|
| **Description** | A Ptah deployment owner wants the orchestrator to respond to their preferred Discord identity — possibly a user bot named `@ptah-prod`, possibly a role named `@PtahOrchestrator`, possibly something else entirely. |
| **Goals** | Set the Discord snowflake once in `ptah.config.json` and have the orchestrator dispatch commands whenever that identity is mentioned. |
| **Pain points** | Hardcoding any specific handle would force every deployment into a single naming convention and break multi-tenant setups. |
| **Key needs** | A configuration field that accepts any valid Discord user or role snowflake, validated at startup, with no default. |

---

## 3. Assumptions and Constraints

### 3.1 Assumptions

| ID | Assumption | Impact if Wrong |
|----|-----------|-----------------|
| A-01 | The Ptah bot has permission to read messages, resolve mentions, and post replies in every channel and thread where orchestrator commands may be issued. | Without read/send permission, commands fail silently. Pre-flight validation must surface this at startup. |
| A-02 | Mentions in `discord.js` are surfaced via the `mentions.users` and `mentions.roles` sets on the received `Message`, and both user and role mentions use numeric snowflake IDs. | If the library changes mention handling, detection must be rewritten. |
| A-03 | The allowlist and orchestrator mention ID are static across a single Ptah process run — configuration hot-reload is not required for this feature. | If operators need to change the allowlist live, they must restart the process. |
| A-04 | Creating a `docs/backlog/<slug>/overview.md` on a chore branch and pushing it requires no review to be immediately usable by the PDLC because the file is not yet in the lifecycle. | If project policy requires PR review for backlog entries, the command must open a PR instead of pushing directly. |
| A-05 | The existing git workflow helpers (branch creation, commit, push) and the feature-branch naming convention from feature 018 are reusable without modification. | If they must be adapted, the blast radius widens. |

### 3.2 Constraints

| ID | Constraint | Source |
|----|-----------|--------|
| C-01 | The orchestrator mention name and snowflake ID must never be hardcoded in code, documentation, or configuration defaults. Every deployment supplies its own. | User directive: the mention must be fully configurable. |
| C-02 | The feature must not alter the semantics of agent mentions (`@pm`, `@eng`, `@qa`) or the existing workflow-start path for feature-lifecycle workflows. | Preserve REQ-017 behavior; isolate blast radius. |
| C-03 | The feature must not contain or depend on any `start review REQ` command. | User directive: separate that capability into the `fix-req-overwrite-on-start` bug fix. |
| C-04 | Command parsing must be case-insensitive for verbs and tolerate surrounding text (mentions, greetings, trailing punctuation). | Discord messages are human-authored and inconsistent. |
| C-05 | The feature must reuse the existing configuration loader, Discord client abstraction, logger, and git helpers rather than introduce parallel infrastructure. | Project consistency. |

---

## 4. Success Metrics

| Feature | Metric | How to Measure | Baseline | Target |
|---------|--------|----------------|----------|--------|
| Backlog bootstrap | Rate of new feature folders created from Discord vs manual `git` workflow | Audit of `docs/backlog/` commits authored by the orchestrator bot vs human committers | 0% | ≥ 30% of new backlog entries within 30 days of release |
| Command discovery | Percentage of new users who invoke `help` within their first session | Log analysis | n/a | ≥ 50% |
| Authorization | Rate of unauthorized command attempts that are rejected without side effects | Integration test + audit log | n/a | 100% |
| Slug quality | Rate of auto-derived slugs that survive without an inline override | Audit of `--slug=` usage | n/a | ≥ 70% |

---

## 5. Functional Requirements

Requirements are grouped by functional domain.

**Domain key:**

| Domain Code | Domain Name |
|-------------|-------------|
| OI | Orchestrator Identity |
| CP | Command Parsing |
| CB | Create Backlog |
| HP | Help |
| AZ | Authorization |
| ER | Error Reporting |

### 5.1 Orchestrator Identity (OI)

| ID | Title | Description | Acceptance Criteria | Priority | Phase | Source Scenarios | Dependencies |
|----|-------|-------------|---------------------|----------|-------|-----------------|--------------|
| REQ-OI-01 | Configurable orchestrator mention ID | The orchestrator mention must be identified exclusively by a Discord snowflake stored in `ptah.config.json` at `discord.orchestrator_mention_id`. No hardcoded name, no default, no fallback. The product must function identically whether the configured mention is a user snowflake or a role snowflake. | WHO: As a deployment owner GIVEN: `discord.orchestrator_mention_id` is set to any valid Discord snowflake in `ptah.config.json` WHEN: a user mentions that snowflake in a Discord channel or thread THEN: the orchestrator dispatches command handling against that message | P0 | 1 | [US-05] | — |
| REQ-OI-02 | Dispatch by snowflake comparison | Incoming Discord messages must be matched against the configured snowflake by comparing the `mentions.users` and `mentions.roles` sets to `orchestrator_mention_id`. No string parsing of `@name` or display-name matching is permitted. | WHO: As the orchestrator GIVEN: `orchestrator_mention_id` is configured and a message arrives WHEN: I evaluate whether the message targets the orchestrator THEN: I return true if and only if the configured snowflake is present in `mentions.users` or `mentions.roles` | P0 | 1 | [US-01], [US-02], [US-05] | [REQ-OI-01] |
| REQ-OI-03 | Disambiguation from agent mentions | A message that mentions both the orchestrator snowflake and an agent mention (`@pm`, `@eng`, `@qa`) must be routed exclusively to the orchestrator command handler. It must not also trigger the agent-mention ad-hoc directive flow. Conversely, a message that mentions an agent but not the orchestrator must continue to trigger the existing agent-mention flow unchanged. | WHO: As the orchestrator GIVEN: a message mentions the orchestrator snowflake AND an agent mention WHEN: I dispatch the message THEN: the orchestrator command handler runs and the agent-mention flow does NOT run | P0 | 1 | [US-01], [US-02] | [REQ-OI-02] |
| REQ-OI-04 | Missing config is a startup failure | If `discord.orchestrator_mention_id` is absent, empty, or not a valid snowflake shape, the Ptah process must refuse to start and report a precise configuration error naming the missing or invalid field. It must not start in a degraded mode. | WHO: As a deployment owner GIVEN: `discord.orchestrator_mention_id` is missing or invalid in `ptah.config.json` WHEN: I run `ptah start` THEN: the process exits with a non-zero code and an error naming the field | P0 | 1 | [US-05] | [REQ-OI-01] |
| REQ-OI-05 | User and role mentions are equally supported | The orchestrator mention may be either a user snowflake (a bot user) or a role snowflake (e.g. a `@PtahOrchestrator` role). The command dispatch path must not distinguish between the two. | WHO: As a deployment owner GIVEN: `orchestrator_mention_id` is set to either a user snowflake or a role snowflake WHEN: a user mentions that entity THEN: the orchestrator dispatches identically in both cases | P0 | 1 | [US-05] | [REQ-OI-02] |
| REQ-OI-06 | Snowflake shape validation at startup | At startup, `orchestrator_mention_id` must be validated to match the Discord snowflake shape (a numeric string of 17–20 digits). Validation must happen before any Discord connection is established. | WHO: As a deployment owner GIVEN: `orchestrator_mention_id` is set to a non-numeric string or a number outside the snowflake length bounds WHEN: I run `ptah start` THEN: the process exits with a validation error before attempting to connect to Discord | P0 | 1 | [US-05] | [REQ-OI-04] |
| REQ-OI-07 | No hot-reload of orchestrator mention ID | Changing `orchestrator_mention_id` must require a process restart. Configuration hot-reload is not in scope for this feature. | WHO: As a deployment owner GIVEN: `orchestrator_mention_id` changes on disk while the process is running WHEN: I do not restart the process THEN: the orchestrator continues to dispatch against the value it loaded at startup | P2 | 2 | [US-05] | [REQ-OI-01] |

### 5.2 Command Parsing (CP)

| ID | Title | Description | Acceptance Criteria | Priority | Phase | Source Scenarios | Dependencies |
|----|-------|-------------|---------------------|----------|-------|-----------------|--------------|
| REQ-CP-01 | Case-insensitive verbs | Command verbs (`create backlog`, `help`) must be matched case-insensitively. | WHO: As a user GIVEN: I type `@ptah CREATE BACKLOG "..."` or `@ptah Help` WHEN: the orchestrator parses my message THEN: the verbs are matched identically to their lowercase equivalents | P0 | 1 | [US-01], [US-02] | [REQ-OI-02] |
| REQ-CP-02 | Quoted-argument extraction | The `create backlog` command must accept a description wrapped in double quotes or single quotes, with balanced quoting required. Unbalanced or missing quotes yield a usage error. | WHO: As a user GIVEN: I type `@ptah create backlog "a thing that does X"` WHEN: the parser extracts the description THEN: the extracted string is `a thing that does X` with surrounding quotes stripped | P0 | 1 | [US-01] | [REQ-CP-01] |
| REQ-CP-03 | Inline slug override | The `create backlog` command must accept an optional `--slug=<slug>` argument placed before or after the quoted description. When present, it overrides auto-derivation. | WHO: As a user GIVEN: I type `@ptah create backlog --slug=my-thing "a thing that does X"` WHEN: the parser extracts arguments THEN: slug is `my-thing` and description is `a thing that does X` | P1 | 1 | [US-04] | [REQ-CP-02] |
| REQ-CP-04 | Tolerate surrounding text | Command parsing must tolerate leading or trailing non-command text such as greetings (`hi @ptah ...`) and trailing punctuation (`... thanks!`). Extraction must succeed as long as the verb and required arguments are present contiguously. | WHO: As a user GIVEN: I type `hey @ptah create backlog "a thing" please` WHEN: the parser runs THEN: the command is parsed successfully and surrounding text is ignored | P1 | 1 | [US-01], [US-02] | [REQ-CP-01] |
| REQ-CP-05 | Single command per message | Each Discord message is parsed as at most one orchestrator command. Chaining multiple commands in a single message is not supported and must yield a usage error naming the constraint. | WHO: As a user GIVEN: I type `@ptah help create backlog "..."` WHEN: the parser runs THEN: the parser reports a usage error explaining that only one command per message is supported | P1 | 1 | [US-01], [US-02] | [REQ-CP-01] |

### 5.3 Create Backlog (CB)

| ID | Title | Description | Acceptance Criteria | Priority | Phase | Source Scenarios | Dependencies |
|----|-------|-------------|---------------------|----------|-------|-----------------|--------------|
| REQ-CB-01 | Slug derivation rule | When no inline `--slug=` is supplied, the orchestrator must derive a slug from the description by (a) lowercasing, (b) replacing non-alphanumeric runs with a single hyphen, (c) stripping leading/trailing hyphens, (d) truncating to the first 6 tokens (hyphen-separated). If the result is empty, the request must fail with a clear error. | WHO: As a user GIVEN: description `"Add a realtime dashboard that plots workflow health"` WHEN: I omit `--slug=` THEN: the derived slug is `add-a-realtime-dashboard-that` (first 6 tokens) | P0 | 1 | [US-01] | [REQ-CP-02] |
| REQ-CB-02 | Slug collision protection | Before creating any files, the orchestrator must check whether `docs/backlog/<slug>/`, `docs/in-progress/<slug>/`, or a `completed/*-<slug>/` folder already exists. If any match is found, the command must fail with a specific error that names the existing path and does NOT overwrite anything. | WHO: As a user GIVEN: `docs/backlog/my-thing/` already exists WHEN: I issue `@ptah create backlog --slug=my-thing "..."` THEN: the orchestrator replies with a collision error naming the existing path and creates nothing | P0 | 1 | [US-01] | [REQ-CB-01] |
| REQ-CB-03 | Overview file creation | When the slug is valid and unique, the orchestrator must create `docs/backlog/<slug>/overview.md` whose body is derived from the description. The file must begin with a level-1 heading equal to a title-cased rendering of the slug (hyphens → spaces). | WHO: As a user GIVEN: a valid unique slug `add-a-realtime-dashboard` and description `"Add a realtime dashboard that plots workflow health"` WHEN: the command runs THEN: `docs/backlog/add-a-realtime-dashboard/overview.md` is created with heading `# Add A Realtime Dashboard` followed by the description | P0 | 1 | [US-01] | [REQ-CB-01], [REQ-CB-02] |
| REQ-CB-04 | Chore branch commit and push | The file creation must happen on a new chore branch named `chore/backlog-<slug>` created from the current `main`. The orchestrator must commit the new file, push the branch to the remote, and optionally open a pull request (operator configurable; default is direct push). | WHO: As a user GIVEN: the overview file was created WHEN: the orchestrator completes the command THEN: a branch `chore/backlog-<slug>` exists on the remote containing exactly one new commit that adds `docs/backlog/<slug>/overview.md` | P0 | 1 | [US-01] | [REQ-CB-03] |
| REQ-CB-05 | Discord confirmation reply | After a successful create, the orchestrator must reply in the invoking channel or thread with the slug, the repository path to the new file, and the branch name. | WHO: As a user GIVEN: the command succeeded WHEN: the orchestrator replies THEN: the reply contains the slug, the relative path `docs/backlog/<slug>/overview.md`, and the branch name `chore/backlog-<slug>` | P0 | 1 | [US-01] | [REQ-CB-04] |
| REQ-CB-06 | Description length bounds | The description must be at least 20 and at most 2000 characters after trimming. Violations must yield a specific error naming the observed and allowed bounds. | WHO: As a user GIVEN: a description shorter than 20 or longer than 2000 characters WHEN: the parser validates the description THEN: the command fails with an error naming the bounds and the observed length | P1 | 1 | [US-01] | [REQ-CP-02] |

### 5.4 Help (HP)

| ID | Title | Description | Acceptance Criteria | Priority | Phase | Source Scenarios | Dependencies |
|----|-------|-------------|---------------------|----------|-------|-----------------|--------------|
| REQ-HP-01 | Help command output | `@ptah help` must reply with the list of supported verbs and their syntax, including `create backlog "<description>" [--slug=<slug>]` and `help`. The reply must be a single Discord message. | WHO: As a user GIVEN: I am authorized WHEN: I issue `@ptah help` THEN: the reply lists every supported verb with its exact syntax | P0 | 1 | [US-02] | [REQ-OI-02] |
| REQ-HP-02 | Help requires authorization | The `help` command itself is subject to the authorization allowlist (REQ-AZ-02). Unauthorized users do not see the command list. | WHO: As an unauthorized user GIVEN: I issue `@ptah help` WHEN: the orchestrator evaluates authorization THEN: I receive the standard unauthorized reply, not the help text | P0 | 1 | [US-03] | [REQ-HP-01], [REQ-AZ-02] |

### 5.5 Authorization (AZ)

| ID | Title | Description | Acceptance Criteria | Priority | Phase | Source Scenarios | Dependencies |
|----|-------|-------------|---------------------|----------|-------|-----------------|--------------|
| REQ-AZ-01 | Allowlist configuration | Authorization is governed by an allowlist of Discord user snowflakes stored at `discord.orchestrator_command_allowlist` in `ptah.config.json`. The allowlist is a list of strings; an empty or absent list means no one is authorized and every command fails the authorization check. | WHO: As a deployment owner GIVEN: `orchestrator_command_allowlist` is set to `["1234", "5678"]` WHEN: users with those snowflakes issue commands THEN: they are authorized; all other users are not | P0 | 1 | [US-03], [US-05] | [REQ-OI-01] |
| REQ-AZ-02 | Enforcement at dispatch | Authorization must be checked before any command executes. The author's `author.id` must be present in the allowlist. Role-based authorization is not in scope for this feature. | WHO: As the orchestrator GIVEN: an incoming orchestrator-targeted message WHEN: I begin command dispatch THEN: I evaluate `author.id ∈ allowlist` and reject if false | P0 | 1 | [US-03] | [REQ-AZ-01] |
| REQ-AZ-03 | Non-disclosing refusal | Unauthorized refusals must be polite and must NOT disclose the allowlist contents, the existence of other commands, or the authorization mechanism beyond "this command requires access." | WHO: As an unauthorized user GIVEN: I issue any orchestrator command WHEN: the orchestrator rejects it THEN: the reply says roughly "Sorry, this command requires access" and contains nothing about the allowlist | P0 | 1 | [US-03] | [REQ-AZ-02] |

### 5.6 Error Reporting (ER)

| ID | Title | Description | Acceptance Criteria | Priority | Phase | Source Scenarios | Dependencies |
|----|-------|-------------|---------------------|----------|-------|-----------------|--------------|
| REQ-ER-01 | Unknown command | An orchestrator-targeted message whose parsed verb is not recognized must receive a reply that says `Unknown command. Supported: create backlog, help`. | WHO: As a user GIVEN: I type `@ptah flarble "..."` WHEN: parsing completes THEN: the reply is `Unknown command. Supported: create backlog, help` | P0 | 1 | [US-01], [US-02] | [REQ-CP-01] |
| REQ-ER-02 | Missing required arguments | A recognized verb with missing required arguments must receive a usage hint showing the full syntax. | WHO: As a user GIVEN: I type `@ptah create backlog` with no description WHEN: parsing completes THEN: the reply is a usage hint `Usage: @ptah create backlog "<description>" [--slug=<slug>]` | P0 | 1 | [US-01] | [REQ-CP-02], [REQ-CB-01] |
| REQ-ER-03 | Slug collision error | A slug collision (REQ-CB-02) must produce a reply that names the slug, the existing path, and states that no file was created. | WHO: As a user GIVEN: the slug already exists WHEN: the orchestrator rejects the request THEN: the reply names the slug, the existing path, and the words "no changes made" | P0 | 1 | [US-01] | [REQ-CB-02] |
| REQ-ER-04 | Empty or invalid slug | When slug derivation yields an empty string or inline `--slug=` fails validation, the reply must explain what is wrong and show an example of a valid slug. | WHO: As a user GIVEN: an invalid slug WHEN: validation fails THEN: the reply explains the rule and gives an example | P1 | 1 | [US-01], [US-04] | [REQ-CB-01], [REQ-CP-03] |
| REQ-ER-05 | Transient infrastructure errors | When the command fails due to a filesystem, git, or Discord API error, the orchestrator must log the error at `error` level and reply with a transient-error notice that asks the user to retry. The reply must not leak stack traces or internal paths outside `docs/`. | WHO: As a user GIVEN: a filesystem or git error during command execution WHEN: the error is caught THEN: I see a transient-error notice and the error is logged with full detail server-side | P0 | 1 | [US-01], [US-02] | [REQ-CB-04] |
| REQ-ER-06 | Description length violation | A description-length violation (REQ-CB-06) must produce a reply naming the observed and allowed bounds. | WHO: As a user GIVEN: a description outside bounds WHEN: validation fails THEN: the reply names observed length and the allowed `[20, 2000]` range | P1 | 1 | [US-01] | [REQ-CB-06] |

---

## 6. Non-Functional Requirements

| ID | Title | Description | Acceptance Criteria | Priority | Phase |
|----|-------|-------------|---------------------|----------|-------|
| REQ-NF-01 | Command response latency (non-network) | For commands that do not push to the remote (`help`, authorization-reject, parser errors), the orchestrator must reply within 5 seconds of message receipt under normal load. | Integration test timing | P1 | 1 |
| REQ-NF-02 | Command response latency (network) | For `create backlog` (which commits and pushes), the reply must arrive within 15 seconds under normal load; if git operations exceed this bound, a progress reply must acknowledge receipt. | Integration test timing | P1 | 1 |
| REQ-NF-03 | Atomicity of create backlog | If any step of `create backlog` fails (file write, commit, push), the orchestrator must leave the repository in a clean state — no dangling branches, no partially written files, no uncommitted changes on `main`. | Integration test with git-failure injection | P0 | 1 |
| REQ-NF-04 | Observability | Every dispatched orchestrator command must log a structured entry with: invoking user id, channel id, command verb, auth result, success/failure, and elapsed time. | Log inspection in integration test | P1 | 1 |
| REQ-NF-05 | Test coverage | Every functional requirement in this document must be covered by at least one automated test at unit or integration level. Coverage must be verified in the PLAN phase. | Coverage report in PLAN review | P0 | 1 |

---

## 7. Risks

| ID | Risk | Likelihood | Impact | Mitigation | Related Requirements |
|----|------|-----------|--------|------------|---------------------|
| R-01 | Agent-mention disambiguation fails in edge cases where a user mentions both an agent and the orchestrator, producing double-dispatch. | Medium | High | Comprehensive integration tests for all mention combinations; explicit ordering rule in REQ-OI-03. | [REQ-OI-03] |
| R-02 | Auto-derived slugs are of poor quality and most users fall back to `--slug=`, making the feature feel broken. | Medium | Low | Measure via Success Metrics; iterate on the derivation rule in a follow-up revision if `--slug=` usage exceeds 30%. | [REQ-CB-01] |
| R-03 | Pushing directly to main for backlog entries violates a team's PR-based workflow. | Medium | Medium | REQ-CB-04 makes PR creation operator-configurable (default off). Deployments that require PRs can flip the flag. | [REQ-CB-04] |
| R-04 | An attacker with a valid allowlist entry spams the backlog. | Low | Medium | REQ-CB-02 rejects duplicates; REQ-NF-04 logs every attempt; out-of-scope: add rate limiting in a follow-up. | [REQ-AZ-01], [REQ-CB-02] |
| R-05 | Role mentions in Discord resolve differently across guild configurations, causing REQ-OI-05 to behave inconsistently. | Low | Medium | Validate in an integration test against a throwaway guild; document the guild-level prerequisite. | [REQ-OI-05] |
| R-06 | Users expect a `start review REQ` command on this feature and file bugs when it's missing. | Medium | Low | Document the out-of-scope decision in both the overview and the help reply's future notes; track the capability in `fix-req-overwrite-on-start` plus a later follow-up. | — |

---

## 8. Requirements Summary

### By Priority

| Priority | Count | IDs |
|----------|-------|-----|
| P0 | 22 | REQ-OI-01, REQ-OI-02, REQ-OI-03, REQ-OI-04, REQ-OI-05, REQ-OI-06, REQ-CP-01, REQ-CP-02, REQ-CB-01, REQ-CB-02, REQ-CB-03, REQ-CB-04, REQ-CB-05, REQ-HP-01, REQ-HP-02, REQ-AZ-01, REQ-AZ-02, REQ-AZ-03, REQ-ER-01, REQ-ER-02, REQ-ER-03, REQ-ER-05, REQ-NF-03, REQ-NF-05 |
| P1 | 7 | REQ-CP-03, REQ-CP-04, REQ-CP-05, REQ-CB-06, REQ-ER-04, REQ-ER-06, REQ-NF-01, REQ-NF-02, REQ-NF-04 |
| P2 | 1 | REQ-OI-07 |

Note: the P0 list includes non-functional P0 entries; counts reflect all priorities across sections 5 and 6.

### By Phase

| Phase | Count | IDs |
|-------|-------|-----|
| Phase 1 | 29 | All except REQ-OI-07 |
| Phase 2 | 1 | REQ-OI-07 |

---

## 9. Approval

| Role | Name | Date | Status |
|------|------|------|--------|
| Product Owner | TBD | TBD | Pending |

---

## Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-04-10 | Product Manager | Initial requirements document. Split from the combined draft: this document covers the new feature (orchestrator mention identity + `create backlog` + `help`). The urgent REQ-overwrite bug fix is tracked separately in `REQ-fix-req-overwrite-on-start`. |

---

*End of Document*
