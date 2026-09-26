# Laya decision plugin: local validation

The first version provides a general advisory decision service and Agent tool,
with a managed local Python inference process. It is usable locally; the first
effect measurements do not support automatic adoption for completion, regression
gates or access decisions.

Implementation and installation instructions are in
[the plugin README](../plugins/decision-laya/README.md). The public ports are
[contracts/decision](../packages/contracts/src/decision.ts) and
[Plugin SDK DecisionService](../packages/plugin-sdk/src/decision.ts).

## Implemented behavior

- The `decision` service and `decision_evaluate` tool accept bounded typed
  questions and return choice, binary or ordinal answers and probabilities.
  The adapter maps option keys to neutral labels, discards the unusable act
  head and marks every result `uncalibrated`.
- The Host owns one authenticated loopback process and a bounded FIFO queue.
  Caller cancellation discards late answers while retaining the forward slot.
  Deadlines and disable stop the owned process tree before resource reuse.
- Evaluations carry hashes, profile/runtime/model versions, latency, truncation
  and device/memory metadata. Session calls use Host-owned correlation and the
  existing Session service for a durable `decision.evaluated` event.
- Explicit setup creates a separate venv and downloads pinned weights outside
  the plugin package. The portable Host bundle has regular files and excludes
  workspace links, models and Python dependencies. Inference runs offline.

No domain automatically changes its model selection, Goal state, gate outcome or
permission from a model answer. The five domain families below are evaluation
scenarios, not implemented automatic domain integrations.

## Real inference experiment

Recorded at `2026-09-26T06:04:38.309Z`, on Windows x64, Ryzen 7 7700X,
31.1 GiB RAM, NVIDIA RTX 4070 Ti 12 GiB, driver 595.97, Python 3.10,
Bun 1.4.0, PyTorch 2.11.0+cu128, Laya 0.3.20, Transformers 4.57.6 and
Hugging Face Hub 0.36.0. The bundled model repository is
`convaiinnovations/laya`, revision `55cf4c4ebb4ebe31b2550e8bdf3bd21b99753851`.
All three downloaded weight files were checked against the SHA-256 values from
that revision's official Hugging Face LFS metadata.

The fixture dataset has 20 distinct scenario groups adapted from existing hbar
rules/tests. English and Chinese translations, reversed options and long-input
variants produce 100 labelled test samples. Five families cover model routing,
Goal progress, regression gates, Agent next action and sandbox access. Cases
include missing evidence, stale proof and conflicting summaries. All related
variants remain in one test group; there is no training or fitted calibration.
These are synthetic diagnostic examples, not production task history. Counts
of variants must not be interpreted as 100 independent tasks.

The baseline is the known deterministic rule label for each fixture, so its
accuracy is 100% by construction. It is not a measured human or LLM baseline.
English and typed-decisions checkpoints were tested on Chinese for diagnosis;
that does not establish supported Chinese deployment for those checkpoints.

| Checkpoint      | Correct / 100 | English | Chinese | Short / 80 | Order agreement | ECE, 5 bins | Multiclass Brier |
| --------------- | ------------: | ------: | ------: | ---------: | --------------: | ----------: | ---------------: |
| multilingual    |            51 |     56% |     46% |     50.00% |             70% |      0.1614 |           0.6683 |
| english         |            53 |     54% |     52% |     53.75% |             72% |      0.0530 |           0.5698 |
| typed-decisions |            56 |     58% |     54% |     63.75% |             82% |      0.0835 |           0.5253 |

Order agreement compares the selected semantic label for each original/reversed
pair, including long variants. All 20 long samples were correctly reported as
truncated, and no short sample was reported truncated. The typed-decisions
checkpoint scored 25% on the long samples. Even short samples and neutral labels
show errors and order sensitivity, so truncation alone does not explain the
effect gap. ECE uses raw `answerConfidence`; it is a descriptive statistic for
this small fixture set and does not certify calibrated production probabilities.

| Checkpoint      | Fresh process + first call |  Hot p50 |  Hot p95 | Peak allocated | Peak reserved | 8 callers p95 | Queue p95 |
| --------------- | -------------------------: | -------: | -------: | -------------: | ------------: | ------------: | --------: |
| multilingual    |                    21.78 s | 24.87 ms | 31.52 ms |     1523.5 MiB |      1536 MiB |     198.20 ms | 174.62 ms |
| english         |                     7.86 s | 29.28 ms | 38.53 ms |     2334.2 MiB |      2540 MiB |     235.66 ms | 207.61 ms |
| typed-decisions |                     7.84 s | 29.58 ms | 46.06 ms |     2346.7 MiB |      2622 MiB |     231.19 ms | 203.07 ms |

Each checkpoint was loaded in a fresh process, sequentially; OS file caches and
driver caches were not reset, so cold timings are not a fair ranking of cold
system startup. Hot latency measures caller end-to-end inference settlement.
These standalone calls omit Session audit confirmation. Eight simultaneous
callers used one FIFO forward slot and had zero failures. All 300 effect calls
and each checkpoint's choice/binary/score smoke request succeeded structurally.
PyTorch memory excludes driver/context overhead and other applications.

The result supports a low-cost advice/measurement role. Domain-specific adoption
needs labelled task history, grouped held-out evaluation, probability calibration
and a decision policy based on the cost of each error. Existing facts, capability
and budget filters, acceptance evidence, test exit codes, Host scope checks and
actual access probes remain authoritative.

## Deployment and engineering evidence

The real Host smoke test installed the portable package into a temporary managed
profile, configured the local runtime, evaluated two Sessions, invoked the tool
through the fixture Agent driver using real GPU inference, verified its durable
Run-correlated event and successful tool result, and disabled the plugin. The
service and tool were released. Process inspection after the experiments found
no remaining owned inference process.

Setup was rerun using its dependency lock and pinned model cache successfully.
The lock records exact versions, including the selected CUDA PyTorch build,
without tying its requirement to an absolute wheel filename. The default pip
mirror on this machine was stale; setup now uses official PyPI explicitly.
For large files the current proxy route was slow, and a verified official wheel
and ordinary process-level proxy exclusions were used. Global Python and proxy
configuration were not changed.

- All 19 contracts/runtime/process/dataset tests passed, including actual Agent
  input defaults, neutral labels, malformed/oversized responses, queue bounds,
  cancellation, deadlines, crash recovery, missing installation/model recovery,
  Windows descendant termination, correlated audit and plugin disable.
- Full repository lint passed. Changed files passed Prettier and diff checks.
- The final `bun run check` passed lint and full typecheck, then reported
  **1774 pass, 2 fail** across 334 test files. The failures were the notification
  activity markup expectation in `tests/hbar-app-ui.test.ts:191` and the saturated
  roster projection expectation in `tests/workspace-tabs-archive.test.ts:740`.
  Both are outside this change; the whole-repository gate is not green.

Generated local evidence lives in the ignored `artifacts/laya/` directory:
`report.json`, `report.md`, `dataset.jsonl`, per-checkpoint prediction JSONL and
`host-smoke.json`. Full check/test logs are `artifacts/laya-final-check.log` and
`artifacts/laya-final-tests.log`. Reproduce with the README commands. Do not put
real private task histories into Git when importing an external dataset.

Upstream sources: [model family](https://huggingface.co/convaiinnovations/laya),
[runtime](https://github.com/NandhaKishorM/laya), and
[typed-decisions scope](https://huggingface.co/convaiinnovations/laya-typed-decisions).
