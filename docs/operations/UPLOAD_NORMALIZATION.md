# Resume normalization stall: maintenance fix

Date: 2026-11-17. Target: deployed `main`. This is a reliability patch, not approval or implementation of a new product direction.

## What the previous logs established

`skill_extraction_complete count=48` means raw skill extraction returned. The next stage previously included model initialization/download, embedding, Qdrant, and per-skill Groq calls without distinct progress events. That log alone cannot establish which dependency was stalled on Render.

Source inspection confirmed:

- FastEmbed 2.1.1 downloads files with no application timeout; initialization was lazy on the first upload. A rejected initialization stayed cached until process restart.
- Qdrant's client default timeout was 300 seconds.
- Non-fast-path skills each requested a Groq completion in batches of five, with `max_tokens: 50`. Forty-eight skills could require dozens of requests, including SDK retries; reasoning tokens also consume the completion budget.
- Individual failures were converted to null and could silently save a reduced skills list.

## Changes

- Embed the skills in one pass with small internal batches, then use one Qdrant `queryBatch` request. The current [Qdrant batch query API](https://api.qdrant.tech/api-reference/search/query-batch-points) accepts vectors and returns points per input query. A finite transport timeout also applies.
- Exact case-insensitive candidate names skip inference. All remaining skills use one Groq JSON-object request with a 4096-token completion budget, bounded request time, no SDK retries, and low reasoning effort for GPT OSS models. [Groq documents reasoning controls here](https://console.groq.com/docs/reasoning). Similarity alone no longer bypasses equivalence checking.
- Validate complete index coverage, duplicate indices, offered-candidate membership, null decisions, and completion status. Invented names, incomplete/malformed responses, empty taxonomies, and dependency failures abort before persistence.
- Bound skill extraction to 25 seconds, embedding to 30 seconds, Qdrant to 10 seconds, and batch canonicalization to 20 seconds. These are application wait budgets for the skill pipeline, not a latency guarantee for parsing, profile extraction, MongoDB, or the entire upload.
- Return HTTP 503 with `SKILL_PIPELINE_UNAVAILABLE`, a safe stage name/message, and `Retry-After: 30` on pipeline failure. The response preserves the existing successful profile contract.
- Emit stage start/completion/failure, elapsed milliseconds, and counts without source text or skill names.
- Retry rejected model initialization. FastEmbed has no initialization cancellation API; a timed-out caller stops waiting, but shared initialization can continue. An expired caller does not start inference when that initialization later completes. Timers cannot isolate a blocked event loop or prevent an OS memory kill.
- Add `prepare:embeddings` and run it in the Docker image build. It downloads the model into the runtime cache, exercises one synthetic embedding, verifies 384 finite dimensions, and fails the build on error or a two-minute deadline. It uses no database, Groq key, or personal data.

The legacy successful response still returns canonical skills only. An explicit null decision means no equivalent taxonomy candidate; unresolved raw claims are not yet represented in that API. This patch does not certify competence, validate overall AI quality, or add the development branch's authentication changes to production.

## Render rollout and diagnosis

For a Docker service using `backend/Dockerfile`, the new build automatically prepares the model. Look for `embedding_cache_ready dimensions=384` in build logs. Normal builds need network access to Hugging Face; a failed download should fail deployment rather than wait inside an upload.

For a native Node service with root directory `backend`, use this build command:

```sh
npm ci && npm run build && npm run prepare:embeddings
```

Keep the start command `npm start`. Optional `FASTEMBED_CACHE_DIR` must refer to the same path during preparation and runtime. A runtime-only persistent mount can hide files prepared into an image; prepare that mounted cache separately or use the image's default `local_cache` path. No Qdrant reseed or database deletion is required by this patch.

Confirm the deployed Git SHA before retrying an upload. Expected runtime events:

```text
skill_stage_started stage=extraction
skill_extraction_complete count=...
skill_stage_started stage=embedding
embedding_model_loading
skill_stage_complete stage=embedding duration_ms=...
skill_stage_started stage=qdrant
skill_stage_complete stage=qdrant duration_ms=...
skill_stage_started stage=canonicalization
skill_stage_complete stage=canonicalization duration_ms=...
skill_normalization_complete raw_count=... canonical_count=...
```

Model loading appears only on the first initialization in a process; canonicalization is skipped when all candidate names match exactly. On failure, the last `skill_stage_failed stage=... code=...` identifies the boundary to inspect. Check model preparation/cache/download and memory for embedding failures, Qdrant URL/key/collection availability for search failures, and provider model access/quota for extraction/canonicalization failures. Never post API keys or full resume/provider payloads in diagnostic logs.

## Verification

Run from `backend`:

```sh
npm test
npm run typecheck
npm run typecheck:tests
npm run build
npm run prepare:embeddings
npm audit --audit-level=moderate
```

Tests preload synthetic provider configuration instead of inheriting live credentials. They cover 48-skill batching, exact-name behavior, malformed/truncated/out-of-candidate selections, stalled dependencies, shared initialization/retry/cancellation, and real synthetic-PDF HTTP uploads with provider/database doubles. The upload tests check successful persistence input and a safe 503 with no persistence on dependency failure. They do not establish live Groq/Qdrant behavior or real Mongo persistence.

Recorded local results: 21/21 tests passed, application and test TypeScript checks passed, the production TypeScript build passed, and `npm audit --audit-level=moderate` reported zero known backend dependency vulnerabilities. These results do not replace deployment verification.

Local model checks exercised the actual FastEmbed/ONNX runtime: approximately 0.8 seconds using an existing cache, and 9.3 seconds including download into a new isolated cache on this Windows machine. These are single observations, not Render performance benchmarks or user latency promises. Docker Desktop's Linux engine was unavailable, so the Docker image itself could not be built locally. Production deployment and end-to-end normalization must be confirmed separately.

## Follow-up: instance restarts after the model loads

Subsequent Render logs showed model initialization completed and the instance restarted before the embedding stage finished. The owner confirmed a 512 MB instance, with no explicit OOM reason shown. This is consistent with memory exhaustion, but a host event or metrics are needed to confirm the actual restart cause. The Qdrant compatibility warning occurs separately; these logs stop before the Qdrant stage.

The previous implementation padded each skill to the SDK's default 512-token length and processed eight together. The follow-up uses a 64-token maximum for short skill names, caps inference at one skill per batch, and admits only one inference operation per process. Overlapping inference returns a retryable 503 rather than allocating another native workload or queuing indefinitely. The admission slot is released after native inference settles, including failure/cancellation paths. Aggregate progress and RSS logs help distinguish a stall from continued processing without logging skill text.

The same BGE Small EN v1.5 model and 384 dimensions are retained. This is a resource configuration change, not a switch to an incompatible embedding model. Long inputs may be truncated at the new token bound; this service is for short skill names, not resume passages.

Manual local observations with 48 synthetic skill names, the app modules loaded, an existing model cache, and no live database or LLM calls:

| Configuration | Observed elapsed time | Process peak RSS |
| --- | ---: | ---: |
| Prior 512-token padding, batch eight | 19.6 seconds | 543 MiB |
| New 64-token padding, batch one | 3.2 seconds | 360 MiB |

These are single Windows observations, not Render measurements or a guarantee that every 512 MB deployment will fit. Real PDF parsing, database connections, native runtime differences, and other requests add memory. A six-skill synthetic comparison yielded minimum cosine similarity 1.0 between the two configurations; it does not prove compatibility for every input or establish matching quality.

To repeat the current real-model memory check after building:

```sh
node test/manual/embeddingMemory.mjs
```

The script installs synthetic test configuration before loading app modules, uses only known synthetic skill names, and reports baseline/final/peak process memory. It does not start the HTTP server or connect to MongoDB. The Qdrant client may emit a compatibility-probe warning against the test loopback address; it never uses the configured production cluster.

An independent security issue was visible in the supplied startup logs: the legacy database success log printed the full connection URI. Success, retry, and disconnect logging now omit connection strings and raw driver errors. Regression tests verify this behavior. Previously exposed credentials must still be rotated: in [Atlas database user management](https://www.mongodb.com/docs/atlas/security-add-mongodb-users/), edit the database user's password, then update the corresponding Render `MONGODB_URI` and any local secret configuration. Removing a log statement does not invalidate old passwords or erase existing logs. Never paste the replacement password or connection string into an issue or chat.

Follow-up local checks passed: 26/26 tests, application/test TypeScript checks, production build, and the real-model smoke/vector checks above. Tests additionally cover model settings, a hard batch cap, shared initialization with busy inference rejection, admission release after failure, a safe busy HTTP response with no write, and safe database success/retry/disconnect logs. Deployment and a real upload on the updated Render instance remain to be verified.
