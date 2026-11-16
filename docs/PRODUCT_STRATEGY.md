# AI Career Passport: product strategy challenge

Research date: 2026-11-17. Status: **proposal awaiting owner approval**.

Recommendation: evolve toward a **Job Evidence Workbench for early-career developers**. Help someone choose what to improve in an existing project for one real job, using a reviewable connection between requirements, claims, and work artifacts. Resume analysis becomes an input to that decision. A general career platform and a supposedly verified skills passport are poor starting positions.

This document changes no application behavior, architecture decision, or approved engineering roadmap. The proposed sequence in section 13 is conditional. After owner approval, update [ROADMAP.md](architecture/ROADMAP.md) and record the relevant architectural decisions. This research and document were produced with AI assistance; they do not represent interviews or product experiments conducted by the owner.

## 1. Existing product critique

### What was inspected

The development baseline is `feat/career-passport-v2` at `26599da`. Reviewed the README, existing audit/roadmap/decisions, profile routes and schema, extraction/normalization/embedding/vector-search/optimization services, taxonomy seed, and frontend profile/matching flows. The production branch has a separate compatible hotfix at `40fea57`; this strategy does not imply that development security changes are already deployed. See [AUDIT.md](architecture/AUDIT.md) for the broader engineering assessment.

| Observed behavior on the development baseline | Product implication |
| --- | --- |
| PDF ingestion, project persistence, skills extraction, job suggestions, and PDFKit export exist. | Useful building blocks; preserve the repository. Their existence does not establish extraction quality or user demand. |
| `backend/src/routes/profile.routes.ts` enforces authenticated ownership and exposes profile deletion. | Essential foundations for a private evidence workspace. Account lifecycle and release security still need work. |
| `frontend/src/components/ProfileViewer.tsx` edits child state; its warning says edits are not saved. There is no profile correction endpoint. | A user cannot reliably correct the facts used by matching/export. This is more urgent than another AI feature. |
| `backend/src/models/Profile.ts` stores canonical skill names, without claim-to-source relationships or versions. | A flat list cannot distinguish a claim, a project description, a file observation, or an independently assessed ability. |
| `profileOptimizer.service.ts` asks the model for `matchScore` and metric-driven bullet rewrites, then parses JSON into a TypeScript interface. | The apparent decision is not supported by a validated scoring method; rewritten achievements can overstate facts. |
| `ProfileViewer.tsx` uses `skill.length > 5` for a demo verification indicator. | The interface manufactures credibility from string length. Remove this behavior before any evidence-oriented release. |
| `skillNormalizer.service.ts` usually invokes the LLM per skill after vector lookup; normalization failures can drop skills. | Cost and fragility increase with resume length; useful unresolved claims disappear. |
| `seedSkillTaxonomy.ts` contains a small manually curated taxonomy and deletes/recreates its target collection. | Good prototype vocabulary, inadequate coverage/versioning for broad career intelligence; destructive seeding is an operational hazard. |
| No observed user research, labeled AI quality evaluation, conversion funnel, or retention cohort in the inspected artifacts. | We have a technical prototype, not evidence of product-market fit. |

The original concept mixes document editing, career coaching, assessment, matching, and tracking. Each solves a different job for a different moment. The main output is currently advice that a general AI assistant can also generate. Adding more panels would increase maintenance without resolving why someone should return.

The most valuable product change is a narrower decision: **what should I explain better, substantiate, or actually build next for this job?** A useful answer must distinguish those three actions.

## 2. Competitor and market analysis

### Research method and limits

External browsing and the GitHub connector were available. Product capabilities below are verified against public first-party pages or repository READMEs accessed on the research date. Vendor statements establish what is advertised or documented; they do not prove accuracy, hiring outcomes, market share, or customer satisfaction. Competitors were not independently installed or benchmarked. Public open-source READMEs were inspected, not their entire implementations. No paid accounts, recruiter purchasing interviews, or candidate tests were conducted.

Market studies describe their sampled populations, often globally or in the US. They do not establish demand among Indian early-career developers. Missing functionality in a public page means **not established in this review**, not that a competitor lacks it.

### Competitive map

| Product/category | What it already does well according to first-party documentation | Remaining question or limitation relevant to our strategy |
| --- | --- | --- |
| [Jobscan](https://www.jobscan.co/jobscan-tutorial) | Resume/JD matching, skill comparisons, keyword context, tailoring with accept/reject controls, and application tracking. | Competing on matching, explanations, approval, or PDF export alone is weak. The reviewed workflow centers on application documents; repository-to-improvement feedback was not established. Its claimed outcomes were not verified here. |
| [Teal](https://help.tealhq.com/en/articles/12060992-using-the-job-matcher) | Connects saved jobs to a resume, highlights included/missing keywords, and assists bullet creation. Its [tracker](https://www.tealhq.com/tools/job-tracker) consolidates the application workflow. | Organization and tailoring are already crowded. A missing resume term still leaves open whether someone needs new experience or merely better description. |
| [Huntr](https://help.huntr.co/en/articles/12241684-job-match-score) | Documents weighted qualifications/responsibilities, required/preferred distinctions, semantic matching, and explanations pointing to resume content. | This directly invalidates the idea that explainable semantic matching is novel. Our differentiation must be the project improvement loop and careful evidence semantics, not simply explanation text. |
| [Rezi](https://www.rezi.ai/rezi-docs/the-rezi-score-explained) | Gives document feedback across content, format, optimization, best practices, and application readiness. | Another score or generated bullet is not a compelling entry point. A document-readiness rating should not become a claim about a person's competence. |
| [Eightfold](https://docs.eightfold.ai/ta-core/skills-related-insights) | Documents inferred/validated/missing skills, normalization, and evidence from multiple profile sources. | Skills intelligence and provenance are established concepts. Enterprise data/integration needs are unsuitable for our initial customer and resources. Its own documentation acknowledges extraction limitations in missing-skill designations. |
| [Gloat](https://gloat.com/platform/the-talent-marketplace/) | Connects enterprise skills and aspirations to projects, learning, mentoring, and internal roles. | A broad career operating system would invite competition with mature organizational workflows and data access we do not have. |
| [HackerRank](https://support.hackerrank.com/articles/8142080826-july-2026-release-notes) | Its July 2026 release documents repository-based Plan–Build–Review assessments and project-based content. | Real-world assessment is not vacant territory. Controlled assessment infrastructure, authorship, and evaluation rubrics are much harder than reading repository files. We should support preparation, not claim equivalent certification. |
| [roadmap.sh](https://roadmap.sh/) | Extensive role/skill roadmaps, guides, courses, and projects. | Another generic learning roadmap has little differentiation. A short task grounded in an existing project and specific requirement is a narrower hypothesis. |
| [Peerlist](https://peerlist.io/) | Aggregates work from multiple platforms, showcases projects, supports portfolio profiles, workplace verification, and a professional community. | A public developer passport alone competes with an existing identity/distribution network. We should initially help prepare work privately rather than build a social network. |
| [Credly](https://info.credly.com/) | Provides issuer-backed digital credentials and workforce skills products. | An artifact link is not an issuer-backed credential. Calling our results verified would imply authority and assessment we do not possess. |
| [Resume Intelligence](https://github.com/notcoderhuman/resume-intelligence/blob/main/README.md) | README describes deterministic resume/JD matching, requirement-level source traceability, gaps, stale-result invalidation, and optional validated AI. | Evidence-grounded matching already exists even as a small open-source project. Its adoption and actual accuracy were not established. The proposed improvement-and-reassessment loop still needs a direct user comparison. |
| [repo-to-resume](https://github.com/keananwongso/repo-to-resume/blob/main/README.md) | README describes reading stack, endpoints, tests, history, then drafting defensible bullets and tailoring a resume. | Repository-based truthful resume writing is also not novel. Commit-share attribution can be misleading; our product must not equate it with contribution or understanding. |
| [Open Career Agent](https://github.com/tuannx/open-career-agent/blob/main/README.md) | README describes a GitHub-first portfolio, evidence IDs, and a JD explorer with explicit inference limits. | Public evidence portfolios are readily reproducible. A source link alone is not a moat or an independent verification. |
| General AI assistant + spreadsheet/editor | A low-effort substitute for analysis, plans, and writing; the owner already uses an assistant to maintain this project. | Hypothesis: users will prefer a dedicated workspace only if it reduces correction effort and makes the next action clearer. Test this substitute directly; a polished report alone may lose. |

### Demand signals, with their actual scope

- The [WEF Future of Jobs 2025 report](https://www.weforum.org/publications/the-future-of-jobs-report-2025/) reports that 63% of surveyed employers identify skill gaps as a barrier to transformation. This is evidence of employer concern, not evidence that candidates will buy our app.
- The [HackerRank 2025 Developer Skills Report](https://www.hackerrank.com/reports/developer-skills-report-2025/) reports a mismatch between assessment and work: 78% of developer respondents said assessments did not align with real tasks, and 66% preferred evaluation of real-world skills. Vendor survey/platform sampling limits generalization; it does not validate repository inference.
- The [2026 Stack Overflow survey](https://survey.stackoverflow.co/2026/knowledge) reports 93% of respondents rated attribution at least somewhat important for trusting AI answers. That supports making outputs inspectable, but citations must actually support the conclusion. It is not a career-product willingness-to-pay study.
- [Burning Glass Institute and Harvard Business School, February 2024](https://www.burningglassinstitute.org/research/skills-based-hiring-the-long-road-from-pronouncements-to-practice) found that removing degree requirements often failed to produce sustained hiring change. This older study is a useful counterweight to skills-first marketing, not a current estimate of all recruitment behavior.

### Problems worth testing, rather than treating as established customer complaints

1. Candidates cannot tell whether a missing requirement means missing experience, missing explanation, or incomplete evidence.
2. Candidates have several projects but cannot choose one useful improvement for an actual opportunity.
3. Generated improvements are plausible but too broad, too expensive, or already present in the project.
4. Candidates need to explain their actual decisions and contributions in interviews, including AI assistance, without claiming sole authorship.
5. Developers with private work or little GitHub activity are disadvantaged by simplistic portfolio signals.

These are research hypotheses inferred from market patterns and our prototype, not measured frequencies. Crowded features include ATS scores, keyword lists, generic bullet rewriting, cover letters, trackers, course lists, and public project galleries. A potential opportunity is the complete cycle **inspect → clarify → improve → inspect the change**, with minimal setup. It is an execution hypothesis, not an uncontested market.

## 3. Five possible product directions

| Option | Promise and primary output | Strongest reason to choose it | Principal reason to reject or narrow it |
| --- | --- | --- | --- |
| A. AI Career Intelligence Platform | Broad profile, career guidance, job fit, and resume recommendations. | Closest to the original vision; large eventual opportunity. | Vague primary task, extensive data requirements, strong substitutes, and many outputs whose accuracy cannot be established from a resume. |
| B. Evidence-Based Skills Passport | Reusable private/public record of skill claims and supporting artifacts. | Durable evidence/provenance model and a useful portfolio artifact. | Cold-start effort and credential-authority expectations; why maintain another profile? Repository activity cannot certify proficiency. |
| C. Job Readiness and Skill Gap Engine | Analyze one role, distinguish gaps, suggest a learning plan. | Clear immediate demand hypothesis and relatively small implementation. | Readiness implies an assessment the system cannot deliver; much of matching/planning is already available. Position as requirement analysis if pursued. |
| D. Developer Career Operating System | Combine projects, learning, applications, interview prep, and career history. | Potentially repeated use across career moments. | Multiple products and integrations before proving a single benefit; high maintenance and privacy burden. |
| E. Job Evidence Workbench | Compare a real job to selected work; choose one concrete project improvement and reassess the submitted change. | Connects analysis to an observable, user-controlled action; reuses our profile and job inputs. | More effort than a scanner, copying is easy, improvement relevance is hard, and paying/returning remain unproven. |

E combines the reusable evidence records of B and the role focus of C, but its product output is a **specific improvement brief and subsequent evidence review**. If users only want a quick fit answer, C is the simpler choice. If they primarily need ongoing proof collection for a mentor, B may win. Those findings should change the direction.

## 4. Comparative scoring and assumptions

Scale: 1 = poor, 5 = mixed, 10 = strong for an independent developer serving the proposed segment. Higher cost score means cheaper/easier to operate; higher privacy score means fewer collection and inference risks. Technical depth and interview strength describe project value, not buyer demand. Scores are judgments based on desk research, **not measured market results or success probabilities**.

| Criterion | Weight | A | B | C | D | E |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Genuine user demand | 15% | 7 | 6 | 8 | 6 | 7 |
| Competitive differentiation | 15% | 2 | 5 | 3 | 3 | 6 |
| Technical depth | 5% | 8 | 8 | 7 | 8 | 8 |
| AI engineering potential | 8% | 8 | 8 | 8 | 7 | 8 |
| Real-world usefulness | 15% | 6 | 7 | 7 | 6 | 8 |
| Independent developer feasibility | 14% | 3 | 5 | 7 | 3 | 7 |
| Infrastructure/API cost | 8% | 4 | 6 | 8 | 4 | 8 |
| Privacy and trust | 10% | 4 | 5 | 7 | 4 | 8 |
| Future commercialization | 6% | 5 | 5 | 6 | 5 | 6 |
| Technical interview project | 4% | 8 | 9 | 8 | 8 | 9 |
| **Weighted /10** | **100%** | **5.05** | **6.08** | **6.69** | **4.97** | **7.33** |

Formula: sum of `(score × weight) / 100`. Decimal totals make arithmetic inspectable, not estimates precise. Product demand, usefulness, differentiation, and feasibility dominate the weights; interview appeal has little power to rescue a weak product.

Key assumptions behind E: users already have a project they can inspect; they have days rather than hours before an application; a useful brief takes under ten minutes to obtain; evidence can be useful without private-repository access; and users will return after doing a task. Its privacy/cost advantages depend on the bounded, private-by-default scope below. Expanding into whole-account/private code scanning would reduce both scores.

**Sensitivity:** lowering E's demand and differentiation by two points each reduces it to 6.73, nearly tied with C at 6.69. A small further feasibility downgrade makes C win. The recommendation is therefore a reversible experiment, not a commitment justified by a spreadsheet. Broad A/D rank poorly primarily because their scope exceeds our resources, not because career development is unimportant.

## 5. Recommended product positioning

Keep AI Career Passport as the repository/project name for now. Present the proposed product as **AI Career Passport — Job Evidence Workbench**. Do not spend time on a rebrand before validation; avoid implying that a passport is a certified credential.

Positioning: **For early-career developers with projects who are targeting a specific role, connect what the job asks for to what their work currently shows, then choose one useful improvement they can explain.**

Suggested opening copy: “See what this job asks for, what your work shows, and what to improve next.”

The initial outcome is a reviewed comparison and one feasible project task. The strongest differentiation to test is a task that reuses the user's project, names a requirement, explains why the change helps, and defines what an acceptable result would look like. It is not a dashboard, a personality assessment, or a promise of interviews.

Commercialization hypothesis: job-seeking is episodic, so first test a small fixed-price preparation pack, not an endless subscription. Test local willingness to pay at illustrative INR 199 and INR 499 after demonstrating actual value; those are experimental price points, not researched market prices. A later mentor/cohort offering might have repeat use, but only after mentors ask for it and distinct access/consent controls are justified. No employer ranking, selling applicant data, or inferred credential business in the MVP.

Defensibility would have to emerge from a useful workflow, opted-in correction data, a high-quality requirement/evidence evaluation corpus, and distribution through developer mentors. A vector database, generic model, or evidence schema is not a moat. Retention and distribution may be harder than the implementation.

## 6. Clearly defined target users

Initial segment hypothesis: English-speaking students, recent graduates, and developers with roughly 0–3 years of experience, initially recruited through Indian developer/college communities, targeting junior TypeScript/React/Node roles. They have one or two existing projects and a genuine job description. Restricting the stack makes evidence rules and recommendations testable; global reports do not validate this local segment.

The first user should be preparing an application or interview over the next one to four weeks, not applying in the next ten minutes. Accept a resume or manually entered experience; GitHub is optional. Support a private-work description with explicit self-report labeling. No public repository must never imply less ability.

Secondary research participants: mentors and engineers who review junior projects. They help judge relevance; they are not assumed buyers. Exclude recruiter screening, senior leadership coaching, all-profession career guidance, and people needing a complete first programming curriculum from the initial promise.

Recruit beyond the owner's friends and include candidates with private work, team projects, tutorials, and AI-assisted projects. Otherwise the design will overfit to highly visible solo open-source contributors.

## 7. Core user problem and workflow

Core problem: **“I have a project and a job I care about. What should I clarify or improve so I can describe relevant work honestly and specifically?”**

1. Paste one real job description. Confirm extracted requirements and required/preferred/unclear priority; preserve the original wording. Do not infer a requirement from a stereotyped role.
2. Upload the existing PDF resume or enter a short project/experience description. Review and save extracted claims before analysis. A current correction must override stale model output.
3. Optionally select one public GitHub repository. Show the exact files/snippets proposed for import, capture a commit SHA, and let the user exclude material before sending it to an inference provider. Manual evidence works without connecting an account.
4. Review suggested claim-to-artifact links. Show the observed artifact, the proposed interpretation, source type, and what the system cannot infer. Ask about contribution and understanding; keep the answers labeled self-report.
5. Show one row per job requirement with distinct claim and evidence states. Allow correction, dismissal, and an “I cannot assess this” result. An inaccessible file cannot become a gap by default.
6. Choose a next action: clarify an existing accomplishment, supply an artifact, or perform a bounded improvement. Offer at most three options; the user selects one. Do not recommend learning a technology just because a keyword was not found.
7. Save a brief with the requirement, existing project context, proposed change, definition of done, estimated effort range, and an explanation the user should be able to give. Estimates are provisional and editable.
8. Later, submit a new snippet or selected repository snapshot. Show what changed and reassess only affected evidence links. A checked task means the user reports completion; source inspection can confirm artifact presence, not proficiency or a passing test run.
9. Export a private brief with source references and caveats. Reuse the existing resume PDF path later for explicitly approved factual changes; resume layout work is not the central loop.

### Evidence states must not collapse into a readiness score

Use two axes internally: `claimState` (claimed / not stated / unclear) and `evidenceState` (linked / none found in reviewed material / insufficient / inaccessible). Record whether a link is proposed or user-reviewed. “Linked” describes a relevant source relationship, never independent skill verification.

| Display state | Meaning | Typical next action |
| --- | --- | --- |
| Supporting evidence linked | A specific artifact or contextual experience statement relates to the requirement. The source strength and limits remain visible. | Review the relationship; explain the actual contribution. |
| Claimed; supporting evidence not yet found | A skills list asserts it, but the reviewed material lacks a contextual example. | Add an example, correct the claim, or attach an artifact. |
| Not found in supplied material | Neither a claim nor usable support was found after an adequate, disclosed review. | Ask whether experience exists before suggesting new work. This is missing information, not proof of missing ability. |
| Cannot assess | Inputs are unavailable/incomplete, the requirement is ambiguous, or the attribute needs another assessment. | Clarify, gather permission, or leave unknown. |

Partial support is a caveat, not a pass. A dependency entry shows a declared dependency, not implementation. A README is authored description. A code/test file shows an artifact at a snapshot, not that tests ran or the user wrote/understands it. A successful run is a separate observation with provenance. A self-reported experience bullet has a source but is not externally corroborated. Stars, contribution streaks, languages, and commit counts never certify proficiency, seniority, authorship, or readiness.

Illustrative case: a job asks for API authorization, PostgreSQL, and operating services in production. A resume claims Express; a selected file shows an owner filter and a test file includes a cross-user scenario. The report can link these to authorization implementation while asking who contributed and whether the test ran. PostgreSQL is “not found” only within the disclosed inputs. Production incident response remains “cannot assess.” A useful task might extend the authorization test to export/delete routes with clear expected results. It should not suggest adding Kubernetes or rewriting the database simply to increase coverage.

## 8. Differentiating functionality and authentic design

- A requirement-to-claim-to-artifact trail with exact excerpts, revision IDs, explicit source type, and review history. The relationship is inspectable and disputable.
- A distinction between communication gaps, evidence gaps, and possible experience gaps. Each produces a different action.
- One realistic improvement to the existing project, with testable completion criteria and a later comparison. Reuse work rather than generate generic tutorial clones.
- A contribution/understanding note for team, tutorial, and AI-assisted projects. It is user-authored context, not automated authorship detection. Record AI assistance without pretending the user wrote generated code unaided.
- Missing and inaccessible data remain visible. No single employability percentage, anonymous comparison percentile, automatic verified badge, or hidden penalty for private work.

These individual capabilities have precedents. The hypothesis is that their focused sequence provides more value than a scanner, a standalone passport, or prompting an assistant. Only a comparative user task can establish that advantage.

Design the main screen around the job's requirement rows, a source detail pane, and one selected action. Use readable typography, neutral surfaces, restrained status color plus text, keyboard controls, and visible loading/failure/review states. Navigation can be “Job,” “Evidence,” and “Next action.” No animated score gauge, decorative chatbot, fake activity feed, or unobserved outcome statistics. Mobile users must be able to inspect the source and correct a relationship without relying on hover.

## 9. MVP scope and success criteria

The first validation artifact should be a manually prepared comparison and brief, followed by a thin private product slice only if section 12 supports it. The MVP is not the entire original six-phase platform.

Included in the proposed product MVP:

- Existing secure accounts/ownership foundation, reliable deletion, persistent review/save, and schema-validated profile/job inputs.
- One resume or manual profile, one job, and one optional public repository per analysis. Initially support the selected TypeScript/React/Node segment; other evidence remains manually reviewable.
- A small versioned skill vocabulary with aliases, unresolved terms, requirement qualifiers, and exact source references.
- User-reviewed evidence rows, four display states above, and no composite readiness score.
- One selected improvement brief, manual completion evidence, and before/after review with stale analysis invalidation.
- A plain downloadable private brief; existing saved-profile PDF stays available under its actual capabilities. Approved resume bullet rewriting can follow demonstrated demand.
- Privacy disclosure, provider consent, bounded AI work, failure recovery, and regression/evaluation fixtures accompanying the features.

Proposed launch gates, not current results: every displayed supporting link resolves to the saved revision; all cross-user endpoint tests pass; deleting a source removes its retained excerpts and invalidates dependent reports; at least 90% precision for suggested evidence relationships on a held-out labeled set with coverage/abstentions reported; and no unsupported credential/proficiency statements in the release challenge corpus. A finite clean corpus cannot guarantee zero future errors. Assess user benefit separately with the experiments below.

First-use target: a reviewed useful action within ten minutes. Measure correction time and abandonment, not just server latency. A polished feature failing this gate should be reduced, not decorated.

## 10. Features deliberately excluded

Exclude auto-apply, recruiter messaging, job scraping, a job marketplace, social feeds, public leaderboards, employer candidate ranking, salary forecasts, personality inference, “ATS pass” guarantees, and universal career coaching. Exclude generated cover letters, a template marketplace, application tracking, continuous whole-account sync, autonomous code changes, sandboxed repository execution, and complex agents from the initial MVP.

Private-repository OAuth access and automatic public sharing are excluded initially. So are verified skill credentials and generated course catalogs. Resume versioning is limited initially to the revisions required for trustworthy evidence; a full resume editor/version-management product is deferred. Do not remove the current working export merely to fit the new positioning.

## 11. Technical architecture implications

### Reuse and change incrementally

| Existing area | Proposed disposition | Reason |
| --- | --- | --- |
| React/TypeScript, Express, MongoDB | Retain modular monolith and deployments. | No scale or domain need for a rewrite, microservices, or another database. |
| Auth/session/owner middleware and tests | Retain; complete lifecycle and release gates. | Evidence records and reports are private resources with the same ownership boundary. |
| PDF parser and profile extractor | Improve contracts and correction persistence; include literal source references. | The user must be able to inspect and fix extraction, not trust a cast JSON object. Reject unsupported/unknown fields under a documented policy. |
| Profile schema | Preserve existing profile; add bounded owner-scoped source/claim/revision records incrementally. | Canonical names must not erase raw claims or provenance. Source retention is a new consent decision, not a silent reversal of the no-raw-resume policy. |
| FastEmbed/Qdrant | Keep behind a retrieval boundary; make semantic fallback nonessential. | Exact/alias lookup is sufficient for many terms. Keep the vector dependency only if it measurably improves ambiguous-term retrieval. |
| Skill normalization | Replace per-skill inference with exact/alias resolution then bounded semantic candidates; preserve unresolved terms. | Reduces cost, prevents silent loss, and exposes ambiguity. Taxonomy similarity is not skill strength. |
| Optimizer | Gradually replace monolithic score/rewrite response with validated requirements, evidence proposals, and action briefs. | Separate extraction from policy. Deterministic status rules can still be wrong if their extracted inputs are wrong; review and evaluation are required. |
| PDF generator | Retain saved-profile export; add a small brief layout if validated. | Output is useful without rebuilding a resume design system. |
| Frontend | Repair save/reload state first; replace fake verification and score-centered presentation. | A truthful workflow requires shared persisted revisions and functional controls. |
| Public slugs/destructive seed | Keep public route disabled; deprecate unsafe automatic sharing and delete/recreate seeding. | Private defaults and stable taxonomy versions prevent accidental exposure and drift. |

### Small data model, not a knowledge-graph platform

Proposed logical records (embedded or separate Mongo collections based on bounded size): `SourceRevision`, `Claim`, `JobRequirement`, `EvidenceLink`, `AnalysisRevision`, and `ImprovementBrief`. These are domain records, not separate services. Every private lookup must include owner identity and verify ownership of referenced records; opaque identifiers alone are insufficient.

A source revision records source type, selected excerpt, content hash, capture date, and locator. Repository locators include owner/repo, commit SHA, path, and line range. Resume locators refer to a retained excerpt and, only when the parser supports it, page/offset in the original extraction. Never fabricate PDF page positions from flattened text. User edits have their own revision; they cannot change the meaning of an older citation.

Store only the excerpts the user explicitly elects to retain; avoid whole-repository mirrors or silent raw-PDF retention. Explain that retained excerpts can contain personal/confidential data and can be sent to the selected model. Source deletion redacts/removes stored content, clears derived private caches, and invalidates affected reports; a hash without source content is not independently inspectable evidence. Backup/provider retention limits must be disclosed separately.

### GitHub integration: optional import, not a prerequisite

Start with a manually supplied public repository URL and allowlisted GitHub API reads; no account-wide OAuth permission is necessary to test value. User selects a bounded set of text files. Exclude secrets, environment files, lockfiles, binaries, generated/vendor content, and irrelevant large trees by default; show exclusions and review completeness. Never execute code, install dependencies, follow repository instructions, or fetch arbitrary project URLs from a document.

[GitHub's contents API](https://docs.github.com/en/rest/repos/contents) supports reading public resources without authentication and accepts a commit reference. Its [rate-limit documentation](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api) documents primary/secondary limits and response headers. Set file/byte/request budgets, cache public file content by commit, honor rate-limit responses, and surface partial import. Validate owner/repo/path/ref inputs and fix destination hosts to prevent arbitrary-URL fetching. Do not download arbitrary redirects from supplied links. Later private access, if demanded, should use selected-repository read-only GitHub App permissions with revocation/deletion, not pasted broad-scope tokens.

Repo ownership, visible commits, and selected code cannot establish personal authorship or skill. Private project descriptions remain first-class self-report evidence. User approval also does not independently verify a claim.

### AI and retrieval should earn their complexity

Use the existing provider through a small timeout/retry/schema boundary. Treat resumes, jobs, and repository content as untrusted data: no tool execution or instruction-following from sources. Models propose requirement extraction, evidence relationships, and briefs; runtime checks verify known IDs, exact excerpts, bounds, and allowed enum values. These checks establish structural integrity, not semantic truth. Ambiguous semantic relationships need user review; a valid source ID does not entail the conclusion.

Resolve aliases before embeddings. Evaluate whether Qdrant/FastEmbed improves candidate retrieval versus a small in-process alias baseline on labeled ambiguous examples. Do not index private source text globally. Owner-filter any future private index, use revision/model/taxonomy versions in cache keys, and test cross-user retrieval/deletion. If the selected vocabulary is small and semantic retrieval adds little value, disable that dependency in the user path rather than inventing a RAG use case.

An initial AI budget hypothesis is at most four generation calls for a fresh bounded case (profile extraction, JD extraction, batched evidence proposals, action brief), plus at most one repair attempt across the case. Cached reviewed inputs should skip unnecessary calls. No LLM call per skill/file. Enforce aggregate token/call limits, concurrent-work limits, cancellation, and retry ceilings. Provider failure must preserve saved reviewed material and allow manual continuation. Log IDs, timings, token counts, and safe error codes, not source content or tokens.

### Costs and implementation difficulty

Cost scores assume bounded text and optional public import. [Groq's GPT OSS 20B model page](https://console.groq.com/docs/model/openai/gpt-oss-20b) currently lists USD 0.075 per million input tokens and USD 0.30 per million output tokens. An **illustrative total across one case** of 20,000 input and 4,000 output tokens costs `20,000 × 0.075 / 1,000,000 + 4,000 × 0.30 / 1,000,000 = USD 0.0027`. At that exact workload, 1,000 cases cost USD 2.70 in generation; a full duplicate costs twice as much. This is arithmetic using published rates, not observed usage or a model-quality recommendation. Reasoning, repairs, longer files, different models, and changed pricing alter the bill; measure actual billable usage.

Fixed hosting, MongoDB, Qdrant, backups, model-download bandwidth, CPU/RAM for FastEmbed/PDF work, and maintenance may dominate generation. As a planning assumption rather than a provider quote, a USD 60 monthly fixed budget plus those 1,000 illustrative cases totals USD 62.70 before support/tax. The same fixed budget spread over 100 cases is USD 0.60 per case before inference. Avoid promising free-tier economics or a stable per-user cost. Set a proposed USD 0.05 generation budget per fresh case and an owner-controlled monthly cap, then revise from observed quality/cost data before public signup.

The hardest work is semantic relevance, contribution ambiguity, useful task design, user correction friction, and evaluation—not vector search. PDF provenance and large/messy repositories add parsing edge cases. A dependency failure must not erase claims or turn incomplete analysis into an authoritative gap.

Privacy is part of the product: no contact data is needed for project/JD comparison. Minimize/redact it before inference where possible; obtain consent for selected evidence. [Groq's retention documentation](https://console.groq.com/docs/your-data) describes reliability/abuse exceptions and configurable controls; confirm the actual organization settings before describing retention to users. Never promise zero retention from provider marketing alone.

## 12. Validation experiments with real users

All experiments below are **planned, not run**. The owner must recruit consenting participants; this document does not authorize unsolicited outreach or collection of confidential work. Use sanitized artifacts and delete research material on an agreed schedule. Sample sizes and thresholds are decision heuristics, not statistically powered hiring-outcome studies.

| Experiment | Participants and task | Proposed evidence to continue | Stop/narrow signal |
| --- | --- | --- | --- |
| Problem interviews | 10 active junior candidates, including at least 3 with private/team work. Ask for the last actual job/project decision and existing workaround before showing a concept. | At least 6 describe a recent concrete decision problem and at least 5 voluntarily bring a sanitized real case for a follow-up. | Compliments without past behavior, or the main need is finding jobs/getting referrals rather than improving project evidence. |
| Concierge comparison | 8 candidates use their own job/project. Compare a manually prepared workbench brief against their usual assistant/scanner; alternate order and use comparable tasks where possible. Observe correction effort and ask for reasons. | At least 6 choose a specific useful next action within 10 minutes; at least 5 prefer the brief for this task. Report actual counts, task differences, and reasons. | A good assistant prompt performs as well with less effort; shift toward simpler C or stop the product expansion. |
| Follow-through | Follow the same 8 candidates for 14 days. Ask for changed artifacts, not a satisfaction score alone. | At least 4 complete a relevant action and at least 3 return with evidence without repeated chasing. Separate build actions from wording-only actions. | Plans are admired but ignored; test smaller communication/evidence tasks before building more planning features. |
| Mentor usefulness | 3 engineers/mentors review 12 sanitized requirement/evidence rows and 6 briefs, with source visibility. | At least 2 would use the brief in an actual review; record wrong/overstated links and whether tasks are appropriately scoped. | Task advice adds needless technology or mistakes presence of code for personal capability. |
| Willingness to pay | Offer a clearly scoped, transparently priced manual preparation pack to 10 qualified users after they see value. Test INR 199/499 across small cohorts without implying market estimates. | At least 3 actual purchases or explicit dated commitments fulfilled after the manual service is ready; record which price and effort. | Positive survey answers without payment. Keep as a portfolio/open-source tool or reconsider buyer; do not build billing on hypothetical revenue. |
| Technical quality and fairness challenge | Build at least 50 labeled requirement/evidence pairs from consented/synthetic cases, including ambiguous terms, tutorials, team/AI-assisted work, missing files, malicious instructions, and private-only descriptions. Label with two reviewers and adjudicate disputes; keep a held-out subset. | Held-out suggested-link precision at least 90%; publish numerator/denominator, recall/coverage, abstentions, and error types. No fabricated quotations/credentials accepted in challenge fixtures. | High precision obtained by abstaining on almost everything, uneven failure on private work, or human correction taking longer than manual review. |

Also measure first-use abandonment, time spent correcting extracted facts, unsupported-link rate, task completion, voluntary return with changed evidence, token usage, and actual operating cost. “More skills detected,” a rising match score, account count, and time on dashboard are weak success measures. Interview/job outcomes can be recorded as exploratory observations only; this sample cannot establish causality.

Decision rule: do not fund the product slice until interviews and concierge work demonstrate a useful advantage. Continue toward a commercial product only if follow-through and payment evidence follow. If users primarily want phrasing help, explicitly reconsider a smaller resume/evidence tool; if none of the directions beats a general assistant, preserve the engineering portfolio and stop expanding the SaaS concept.

## 13. Prioritized development roadmap (proposed, approval required)

This is a strategy sequence, not a replacement for the existing engineering roadmap. Security work remains mandatory regardless of positioning. No phase is complete because it is described here; the current implementation does not yet provide this workflow.

| Priority | Proposed milestone | Acceptance and decision gate | Relative effort assumption |
| --- | --- | --- | --- |
| P0 | Owner approves or revises positioning; conduct problem interviews and concierge trials. | Record actual observations and pass/fail against section 12. Compare directly with an assistant; revise target user if necessary. Only then align `architecture/ROADMAP.md` and relevant decisions. | Small implementation effort; recruiting/follow-through may take weeks. |
| P1 | Trusted editable profile foundation. | Validated extraction/update contracts; reviewed facts save/reload and feed analysis/export consistently; fake verification removed; owner/delete/security tests cover all affected routes. No new GitHub feature required. | Medium; highest immediate reuse value. |
| P2 | One-job comparison from manually supplied evidence. | Versioned job requirements and source excerpts; exact/alias baseline; reviewed evidence relationships, unknowns, source locators, stale-result handling, and offline quality/fairness fixtures. A user can reach one useful action without GitHub. | Medium; semantic evaluation is the risk. |
| P3 | One improvement brief and return workflow. | User selects a scoped action with completion criteria; submits new evidence; sees an accurate changed/unchanged comparison. Pilot users complete and return at the planned thresholds. Private brief export works; no readiness score. | Medium; user value must precede extra automation. |
| P4 | Bounded public GitHub import, only if manual evidence gathering is a demonstrated bottleneck. | Selected files and SHA provenance; content preview/consent; safe host/file/request bounds; partial-import states; no execution; cross-user and prompt-injection checks. In a small comparison, import reduces preparation time without increasing misleading links. | Medium/high; optional, not an MVP blocker. |
| P5 | Small private beta and operational hardening. | Held-out evaluation targets and browser/accessibility/security/deletion checks pass; provider failure recovery, quotas, readiness/runbooks, dependency review, and cost measurements exist. Run follow-through/payment experiments. Separate authorization before production release. | Medium plus ongoing operations. |
| P6 | Expand only from observed demand. | Approved truthful resume suggestions, mentor collaboration, private repositories, or broader stacks each require a specific validated need and scoped security/evaluation acceptance criteria. Application tracking stays excluded unless it becomes the dominant evidenced need. | Unestimated until evidence exists. |

For an independent developer, complete one milestone at a time and report what was measured. Do not bind this plan to a delivery date before observing correction and evaluation effort. The interview story should explain the problem selection, rejected alternatives, provenance limitations, measured model errors, privacy boundaries, and the tradeoff between deterministic rules and model proposals. Technical sophistication comes from making a small decision trustworthy and useful, not from maximizing services or generated features.

**Owner decision requested:** approve a validation-first Job Evidence Workbench focused on one job and one project improvement, revise the segment/workflow, or choose a different direction. Approval authorizes roadmap alignment; it does not by itself validate demand or authorize an architectural rewrite or production deployment.
