# Laya local decision plugin

`@hbar/decision-laya` provides advisory typed decisions through one managed local
Python process per Host. It exports the `decision` service and advertises the
`decision_evaluate` Agent tool. Evaluations do not change a Goal, choose a Run
model, accept a test gate, or grant workspace access.

The default checkpoint is `multilingual`. `english` and `typed-decisions` are
explicit comparison options. All results are marked `uncalibrated`; domain
accuracy and probability calibration need evaluation on held-out examples.

## Install the local runtime

Run these commands from the hbar repository. Python 3.10 or newer is required.
The runtime, wheels and weights stay outside the plugin installation directory.

```powershell
bun scripts/setup-laya.ts --runtime-directory .dev/laya-runtime --torch-platform cu128
bun scripts/package-laya.ts
bun run hbar plugins install .dev/plugin-packages/decision-laya

$decisionRuntime = (Resolve-Path '.dev/laya-runtime').Path
$decisionConfiguration = @{ id = '@hbar/decision-laya'; enabled = $true; config = @{ runtimeDirectory = $decisionRuntime } } | ConvertTo-Json -Compress
bun run hbar exec plugin.set --input-json $decisionConfiguration
```

Use `--torch-platform cpu` for a CPU deployment. `pypi` uses the platform's
standard PyTorch wheel index. `--python` selects an existing Python executable;
the installer creates its own virtual environment. Omitting `--runtime-directory`
uses `<hbar dataRoot>/runtimes/laya` from the existing path configuration.
`--torch-wheel` accepts a predownloaded local PyTorch wheel for the selected platform,
which is useful when an official wheel CDN is slow. Verify its SHA-256 against
the official index before using it. Existing dependency locks take precedence
on subsequent runs. Proxy settings apply to the setup process through the usual
`HTTPS_PROXY`/`HTTP_PROXY` environment variables.

The runtime pins Laya `0.3.20` and model revision
`55cf4c4ebb4ebe31b2550e8bdf3bd21b99753851`. Setup records exact installed package
versions in a requirements file and reuses that lock on subsequent setup runs.
The first setup pins the adapter baseline to Transformers 4.57.6, Hugging Face
Hub 0.36.0, FastAPI 0.115.12 and Pydantic 2.11.7, and preserves the selected
PyTorch build while resolving Laya dependencies. This avoids replacing a CUDA
build or resolving new major libraries implicitly. Pip is managed inside the venv.
Add comparison checkpoints with:

```powershell
bun scripts/setup-laya.ts --runtime-directory .dev/laya-runtime --torch-platform cu128 --checkpoints multilingual,english,typed-decisions
```

Only explicit setup downloads dependencies or weights. Inference uses local model
paths with Hugging Face and Transformers offline mode enabled. The managed HTTP
service binds `127.0.0.1` on an ephemeral port and authenticates requests with a
random token passed through the child's stdin. The token is not in tool input,
process arguments, evaluation events or model credentials.

`setup.lock` contains the setup process ID. If setup is interrupted by a hard
process termination, verify that the recorded process is gone before removing
that lock and retrying. A partially completed installation can be resumed.

## Agent input and the public service

The tool accepts state and 1–16 questions, with 2–8 options per choice or score.
State is limited to 32 KiB of serialized UTF-8 JSON. For example:

```json
{
  "state": { "requiredChecks": [{ "name": "unit", "exitCode": 1 }], "evidenceRevision": 3 },
  "questions": {
    "next_action": {
      "type": "choice",
      "instructions": "Which next action follows the available evidence?",
      "criteria": {
        "inspect": "Inspect the failed required check and collect evidence",
        "complete": "Declare the task complete because all required checks passed"
      }
    }
  }
}
```

`checkpoint` and `{ id, version }` `profile` are optional; they default to
`multilingual` and `generic/1`. The checkpoint must also be enabled in the plugin
configuration. `noul` questions return an affirmative probability and boolean;
the adapter executes them as neutral two-option choices. Choice labels are also
mapped to neutral labels for inference and mapped back in the result.

Other plugins declare `requires: { decision: '^1.0.0' }` and a compatible package
peer dependency on `@hbar/decision-laya`. They consume the public SDK port:

```typescript
import type { DecisionService } from '@hbar/plugin-sdk'

const decision = ctx.hbar.api.service<DecisionService>('decision')
const result = await decision.evaluate({ state: facts, questions }, signal, { sessionId, runId })
```

Session callers supply Host-owned correlation in the third argument. The Agent
tool binds it from `ToolContext` and never accepts it from model arguments.
Session-scoped evaluations write a `decision.evaluated` event through the existing
Session service. Standalone callers can omit correlation and retain the returned
result themselves. Public DTOs are in
[contracts/decision](../../packages/contracts/src/decision.ts), and the service
port is in [Plugin SDK](../../packages/plugin-sdk/src/decision.ts).

The packager emits a self-contained Host bundle and regular metadata/license
files. Workspace `node_modules` links are excluded; hbar's installer intentionally
rejects symbolic links. Use the packaged directory as the installation input.

## Result and lifecycle semantics

- `evaluated` contains typed answers and probabilities. Metadata includes the
  evaluation ID, runtime/checkpoint/model revision, profile, state/schema hashes,
  queue/elapsed time, actual device, PyTorch peak allocated/reserved memory, and
  input/question truncation flags. Memory values are `null` on CPU or when not
  reported by the backend. PyTorch memory excludes driver/context overhead.
- `confidence` is upstream distribution concentration. `answerConfidence` is
  the highest option probability. Neither is a verified domain accuracy.
  `act_probability` is discarded. `score` is an ordinal expectation and is not
  a goal completion percentage.
- `unavailable` has an explicit failure code: setup/model absence, queue overflow,
  startup/inference deadline, process failure, malformed response or audit
  confirmation failure. Consumers preserve their existing policy when advice
  is unavailable, inputs are truncated or evidence is insufficient.
- `cancelled` ends the caller's wait. An active forward pass keeps its inference
  slot until it finishes; its late result is discarded. Timeout terminates the
  owned process before releasing that slot. A later request can start a new one.
- Plugin disable, configuration changes and Host shutdown dispose the runtime,
  reject queued work and stop its process. Model loading is lazy on first use,
  then checkpoints are reused by all Sessions in that Host.

Default limits: 16 waiting evaluations, 120 s queue and startup deadlines, 10 s
inference, 2 s audit confirmation and 3 s process shutdown. All limits are bounded
configuration fields. Audit confirmation timeout cannot undo a storage write;
its event may arrive later under the same evaluation ID. `elapsedMs` measures
through inference settlement, while callers can time full audit confirmation.

Normal hbar tool selection, Workflow scope and approval rules still apply. A
Workflow using this tool includes it in its allowed tools. Evaluation consumers
retain ownership of model compatibility/budgets, Goal evidence, test exit codes
and actual sandbox permission/probe results.

## Verification and upstream

```text
bun test tests/decision-contracts.test.ts tests/decision-laya.test.ts tests/decision-laya-process.test.ts --timeout 20000
```

Normal tests use local fixture inference and temporary Host profiles. They cover
typed answers, neutral labels, invalid distributions, queue bounds, cancellation,
timeouts, crash recovery, managed installation, Agent invocation, correlated
events and disable cleanup. Real model experiments are separate from this suite.

```powershell
bun scripts/benchmark-laya.ts --runtime-directory .dev/laya-runtime --device cuda
bun scripts/verify-laya-host.ts --runtime-directory .dev/laya-runtime
```

The evaluator writes predictions and a report under `artifacts/laya/`. Its default
dataset contains 20 synthetic adaptations of repository rule/test scenarios and
100 English/Chinese, order and long-input variants. These are diagnostic fixtures,
not production task history. The deterministic baseline uses their known rule
labels. The report distinguishes raw probability calibration error from a fitted
calibration; no training or calibration fitting occurs. Use `--dataset path.jsonl`
for labelled task history in the same sample shape as `dataset.jsonl`. Related
task/Session variants must share `groupId` and a single `train`, `calibration` or
`test` split. The evaluator scores only test groups and rejects split leakage.

The Host verification uses temporary profiles: it installs the portable package,
evaluates two Sessions, runs the tool through the fixture Agent driver against
real Laya inference, checks the correlated durable event, and disables the plugin.

Plugin code follows the repository's MIT license. Laya's runtime and model family
are published as Apache-2.0; setup retains the downloaded model card and any
upstream license files. See the [model card](https://huggingface.co/convaiinnovations/laya),
[runtime](https://github.com/NandhaKishorM/laya), and
[typed-decisions limits](https://huggingface.co/convaiinnovations/laya-typed-decisions).
