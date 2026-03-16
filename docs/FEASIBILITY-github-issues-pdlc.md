# Feasibility Analysis: GitHub Issues + Projects as PDLC Platform

**Date:** 2026-03-14
**Author:** Product Manager
**Status:** Research Complete

---

## 1. Executive Summary

This analysis evaluates whether GitHub Issues, Milestones, and Projects v2 can replace the current file-based system for storing and managing PDLC artifacts (REQ, FSPEC, TSPEC, PLAN, PROPERTIES) and conducting cross-reviews.

**Verdict: Not recommended as a full replacement. Feasible as a complementary tracking layer.**

The current file-based system is superior for structured document authoring, version control, and AI agent workflows. GitHub Issues/Projects can add value as a **tracking and visibility layer** on top of the existing file-based artifacts, but replacing the files themselves would introduce significant trade-offs with minimal benefit.

---

## 2. Current System Analysis

### What We Have Today

| Dimension | Current File-Based System |
|-----------|--------------------------|
| **Storage** | Markdown files in `docs/{NNN}-{feature}/` directories |
| **Versioning** | Full git history — every edit is a diffable commit |
| **Structure** | Standardized templates with consistent sections and ID conventions |
| **Traceability** | `traceability-matrix.md` mapping US → REQ → FSPEC → TSPEC → PLAN → PROPERTIES |
| **Reviews** | `CROSS-REVIEW-{role}-{doc-type}.md` files committed to feature branches |
| **Automation** | AI agents (PM, BE, FE, QA) read/write files directly via tools |
| **Search** | Grep/glob across all artifacts; git blame for authorship |
| **Size** | No practical limits — documents can be as large as needed |

### Artifacts by Type and Typical Size

| Artifact | Typical Size (chars) | Structured Sections | Machine-Readable IDs |
|----------|---------------------|---------------------|---------------------|
| REQ | 15,000–40,000 | 10+ sections | REQ-{DOMAIN}-{NN} |
| FSPEC | 10,000–30,000 | 8+ sections | FSPEC-{DOMAIN}-{NN} |
| TSPEC | 20,000–50,000 | 10+ sections | Module specs, interfaces |
| PLAN | 5,000–20,000 | Task tables, dependencies | Task IDs, status emojis |
| PROPERTIES | 10,000–30,000 | Category-grouped properties | PROP-{DOMAIN}-{NN} |
| CROSS-REVIEW | 3,000–10,000 | Findings, questions, verdict | F-01, Q-01 |
| Traceability Matrix | 5,000–15,000 | Multi-level mapping tables | All IDs cross-referenced |

---

## 3. GitHub Platform Capabilities (As of March 2026)

### 3.1 GitHub Issues

| Capability | Detail | Adequacy for PDLC |
|-----------|--------|-------------------|
| Body size | 65,536 characters max | Insufficient for large TSPEC/REQ docs (some exceed this) |
| Markdown | Full GFM + Mermaid + LaTeX | Adequate |
| Labels | Free-form with colors | Good for categorization |
| Assignees | Multiple per issue | Adequate |
| Cross-refs | `#issue-number` auto-linking | Works within repo |
| Search | Semantic search (Jan 2026) | Good but inconsistent for deep content |
| Comments | 65,536 chars each | Adequate for reviews |
| Timeline | Edit history visible | Not diffable like git |

### 3.2 GitHub Issue Forms (Templates)

| Capability | Detail | Adequacy for PDLC |
|-----------|--------|-------------------|
| Structured input | YAML-defined forms with text, textarea, dropdown, checkboxes | Provides structure at creation time |
| Required fields | Enforced in web UI only | **API bypasses validation entirely** |
| Output format | Flattened to markdown in issue body | **Not machine-readable** — requires regex parsing |
| Customization | Per-template layout | One template per artifact type feasible |

### 3.3 GitHub Issue Fields (Public Preview — March 12, 2026)

| Capability | Detail | Adequacy for PDLC |
|-----------|--------|-------------------|
| Field types | Single select, text, number, date | Good for metadata |
| Org limit | 25 fields max | Tight — we'd need: artifact type, status, phase, priority, feature, linked-to, reviewer, etc. |
| Default fields | Priority, Effort, Start date, Target date | Partially overlaps our needs |
| API support | Full REST + GraphQL | Enables automation |
| Maturity | **Public preview, not GA** | Risk of breaking changes |

### 3.4 GitHub Projects v2

| Capability | Detail | Adequacy for PDLC |
|-----------|--------|-------------------|
| Custom fields | 50 per project (incl. system fields) | Sufficient for tracking |
| Views | Table, Board, Roadmap, Hierarchy | Good for visibility |
| Items | 50,000 per project | More than sufficient |
| Automation | Built-in + Actions integration | Workflow triggers feasible |
| API | GraphQL only; **cannot create fields via API** | Limitation for setup automation |

### 3.5 Sub-Issues

| Capability | Detail | Adequacy for PDLC |
|-----------|--------|-------------------|
| Nesting | 8 levels, 50 children per parent | Could model Feature → REQ → FSPEC → TSPEC hierarchy |
| Cross-repo | Supported | Not needed (single repo) |
| Progress | Parent shows % closed children | Useful for feature completion tracking |

### 3.6 Milestones

| Capability | Detail | Adequacy for PDLC |
|-----------|--------|-------------------|
| Grouping | Issues + PRs per milestone | Maps to release phases |
| Limit | **1 milestone per issue** | Cannot assign to both phase AND release |
| Scope | Repo-level only | Adequate for single repo |

---

## 4. Evaluation: GitHub Issues as Document Storage

### 4.1 Critical Gaps

#### Gap 1: Document Size Limits (BLOCKER)
- **Issue body limit: 65,536 characters**
- Our TSPEC documents regularly reach 40,000–50,000+ characters
- REQ documents with many requirements can exceed 40,000 characters
- The traceability matrix grows with each feature and will eventually exceed this limit
- **Splitting a single specification across multiple issues destroys document coherence and makes cross-referencing painful**

#### Gap 2: No Diffable Version History (HIGH)
- Issue edits overwrite the body; timeline shows *that* an edit occurred but not a readable diff
- The current system provides full `git diff` and `git blame` on every line of every artifact
- For regulated or auditable workflows, this is a significant regression
- **Cross-reviews rely on comparing specific document versions — "did you address finding F-03?" requires seeing what changed**

#### Gap 3: AI Agent Workflow Incompatibility (HIGH)
- Our AI agents (PM, BE, FE, QA skills) use file-based tools: `Read`, `Write`, `Edit`, `Grep`, `Glob`
- Migrating to Issues would require every agent to use GitHub API calls instead
- API rate limits (1,000 req/hr in Actions, 5,000 via PAT) constrain automated workflows
- Issue form validation is bypassed by API — agents creating issues won't get structure enforcement
- **The entire skill system and CLAUDE.md instructions would need rewriting**

#### Gap 4: Traceability Matrix Cannot Be an Issue (HIGH)
- The traceability matrix is a living document updated by multiple agents across multiple features
- It cross-references every US, REQ, FSPEC, TSPEC, PLAN, and PROPERTIES ID
- As an issue, it would be a single body that grows without bound and has merge conflict problems when multiple agents update it simultaneously
- **No native "relational" view exists** — Projects v2 custom fields can approximate but cannot replace a purpose-built matrix

#### Gap 5: Review Workflow Regression (MEDIUM)
- Current: CROSS-REVIEW files are committed to feature branches, reviewed in PR diffs, and versioned
- GitHub alternative: Issue comments for reviews — but comments are append-only, cannot be structured, and are not diffable
- Pull Request reviews are designed for code, not specification documents stored as issues
- **No way to "request changes" on an issue body the way you can on a PR**

### 4.2 What GitHub Issues Do Better

| Advantage | Detail |
|-----------|--------|
| **Visibility** | Issues appear in project boards, roadmaps, and dashboards — non-engineers can track progress without navigating file trees |
| **Notifications** | Built-in @mention, subscription, and notification system |
| **Discussion** | Comment threads allow asynchronous discussion on specific artifacts |
| **External access** | Stakeholders without IDE/git access can view and comment on issues |
| **Status tracking** | Open/closed state + custom fields provide clear lifecycle tracking |
| **Cross-linking** | `#123` references auto-link issues, PRs, and commits |
| **Mobile access** | GitHub mobile app for on-the-go review |

---

## 5. Alternative Architectures Evaluated

### Option A: Full Migration to GitHub Issues (NOT RECOMMENDED)

Store all PDLC artifacts as GitHub Issues. Each REQ, FSPEC, TSPEC, PLAN, PROPERTIES = one issue.

| Pros | Cons |
|------|------|
| Single platform | 65K char limit blocks large docs |
| Built-in notifications | No diffable version history |
| Project board visibility | Breaks all AI agent workflows |
| External stakeholder access | Traceability matrix cannot be an issue |
| | Review workflow regresses |
| | Massive migration effort |
| | Lock-in to GitHub's evolving feature set |

**Verdict: Infeasible.** The character limit alone is a blocker, and the version history regression is unacceptable for a specification-driven workflow.

### Option B: GitHub Issues as Tracking Layer + File-Based Documents (RECOMMENDED)

Keep all artifacts as markdown files in `docs/`. Create GitHub Issues as **lightweight pointers** to track status, assignments, and discussions.

**How it works:**

```
GitHub Issue #42: "REQ: Auto Feature Bootstrap (009)"
├── Labels: [artifact/REQ] [phase/009] [status/approved] [priority/P0]
├── Assignee: PM
├── Milestone: Phase 9 - Auto Feature Bootstrap
├── Body: Link to docs/009-auto-feature-bootstrap/009-REQ-PTAH-auto-feature-bootstrap.md
├── Sub-issues:
│   ├── #43: "FSPEC: Auto Feature Bootstrap (009)" → links to FSPEC file
│   ├── #44: "TSPEC: Auto Feature Bootstrap (009)" → links to TSPEC file
│   ├── #45: "PLAN: Auto Feature Bootstrap (009)" → links to PLAN file
│   └── #46: "PROPERTIES: Auto Feature Bootstrap (009)" → links to PROPERTIES file
└── Comments: Discussion, questions, review summaries
```

**GitHub Project board view:**

| Feature | REQ | FSPEC | TSPEC | PLAN | PROPERTIES | Status |
|---------|-----|-------|-------|------|------------|--------|
| 009 - Auto Bootstrap | Approved | Approved | In Progress | — | — | Specifying |
| 010 - Parallel Dev | Draft | — | — | — | — | Discovery |

| Pros | Cons |
|------|------|
| Best of both worlds | Two systems to maintain |
| Files retain full git history | Sync overhead (file changes must update issue status) |
| AI agents continue working as-is | Requires automation to keep in sync |
| Stakeholders get dashboard visibility | Initial setup effort |
| Discussion happens in issues; specs stay in files | |
| No migration needed — additive only | |

**Sync automation:** A GitHub Action on push could:
1. Detect changes to `docs/{NNN}-*/` files
2. Update corresponding issue labels/status
3. Post a comment with the commit link and change summary

### Option C: GitHub Projects as Pure Dashboard (LIGHTWEIGHT ALTERNATIVE)

Don't create issues per artifact. Instead, create one issue per **feature** and use Projects v2 custom fields to track artifact statuses.

```
Issue #42: "Feature 009: Auto Feature Bootstrap"
├── Project fields:
│   ├── REQ Status: Approved
│   ├── FSPEC Status: Approved
│   ├── TSPEC Status: In Progress
│   ├── PLAN Status: Not Started
│   ├── PROPERTIES Status: Not Started
│   └── Phase: 9
└── Body: Links to all artifact files
```

| Pros | Cons |
|------|------|
| Minimal overhead | Less granular tracking |
| Single issue per feature | Cannot assign different reviewers per artifact |
| Easy to maintain | No sub-issue hierarchy |
| Project board gives instant overview | Discussion threads mix all artifact types |

---

## 6. Recommendation

### Primary Recommendation: Option B (Tracking Layer)

Implement GitHub Issues as a **tracking and visibility layer** while keeping all document authoring and storage in the existing file-based system.

**Phase 1 — Minimal Setup:**
1. Create label taxonomy: `artifact/REQ`, `artifact/FSPEC`, `artifact/TSPEC`, `artifact/PLAN`, `artifact/PROPERTIES`, `status/draft`, `status/in-review`, `status/approved`, `phase/001`–`phase/010`
2. Create issue templates for each artifact type (lightweight — just title, labels, and a link to the file)
3. Create a GitHub Project board with table view showing all features and their artifact statuses
4. Manually create issues for existing features (backfill)

**Phase 2 — Automation:**
1. GitHub Action to auto-create tracking issues when new artifact files are committed
2. GitHub Action to update issue labels when artifact status changes in the file
3. Bot comments on issues when cross-reviews are committed

**Phase 3 — Review Integration:**
1. Use issue comments for lightweight review discussion
2. Keep CROSS-REVIEW files for formal structured feedback (committed to git)
3. Link PRs to tracking issues for full traceability

### What NOT to Do
- Do not move document content into issue bodies
- Do not abandon file-based storage
- Do not rewrite AI agent skills to use GitHub API
- Do not use Milestones as the primary organizational unit (1-per-issue limit is too restrictive)

---

## 7. Effort Estimate

| Phase | Effort | Dependencies |
|-------|--------|-------------|
| Phase 1: Labels + Templates + Board | ~2 hours manual setup | None |
| Phase 2: Sync Automation | ~1-2 days engineering | GitHub Actions knowledge |
| Phase 3: Review Integration | ~1 day engineering | Phase 2 |
| Backfill existing features | ~1 hour | Phase 1 |

---

## 8. Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Issue Fields feature is in public preview — may change | Medium | Don't depend on Issue Fields initially; use labels |
| Sync drift between files and issues | Medium | Automated sync via GitHub Actions; periodic audit |
| Team must learn two systems | Low | Issues layer is optional for daily work; files remain authoritative |
| GitHub API rate limits constrain automation | Low | Batch operations; use webhooks not polling |

---

## 9. Comparison Matrix

| Dimension | File-Based (Current) | Full GitHub Issues (Option A) | Hybrid Tracking (Option B) |
|-----------|---------------------|-------------------------------|---------------------------|
| Document authoring | Excellent | Poor (size limits, no diff) | Excellent (unchanged) |
| Version history | Excellent (git diff/blame) | Poor (no readable diffs) | Excellent (unchanged) |
| AI agent compatibility | Excellent | Poor (requires rewrite) | Excellent (unchanged) |
| Stakeholder visibility | Poor (requires git access) | Excellent | Good (dashboard + links) |
| Status tracking | Manual (doc headers) | Excellent (native) | Good (synced labels) |
| Notifications | None | Excellent | Good (issue subscriptions) |
| Traceability | Excellent (matrix file) | Poor (no relational view) | Good (matrix + issue links) |
| Search | Good (grep) | Good (semantic search) | Good (both available) |
| Discussion/async review | Okay (commit comments) | Excellent (issue threads) | Good (issue comments + review files) |
| Setup effort | Zero (already exists) | Very High | Low–Medium |
| Migration risk | None | Very High | None (additive) |

---

## 10. Conclusion

GitHub Issues and Projects v2 have evolved significantly and now offer real value for **tracking, visibility, and stakeholder communication**. However, they remain fundamentally unsuitable as a **document authoring and storage platform** for structured specifications due to:

1. **65K character limit** — hard blocker for large specifications
2. **No diffable version history** — unacceptable for specification-driven development
3. **AI agent incompatibility** — would require rewriting the entire skill system
4. **Flattened structure** — issue forms lose machine-readability when rendered

The recommended path is **Option B: Hybrid Tracking Layer** — keep files as the authoritative source of truth, add GitHub Issues/Projects as a lightweight tracking and visibility dashboard. This gives stakeholders the accessibility they need while preserving the engineering rigor of the current system.
