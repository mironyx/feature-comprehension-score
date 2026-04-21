# Bug report — 2026-04-21: malformed_response on tool-use assessments

[09:55:55.787] INFO (fcs/19004): pipeline: extracting artefacts
    assessmentId: "5ab898a4-791b-469f-94c2-d2eac04d54df"
    orgId: "271f61a8-12a8-4b76-ae39-547c3e03de23"
    step: "artefact_extraction"
 GET /assessments 200 in 408ms
[09:55:57.373] INFO (fcs/19004): Rubric generation: artefact summary
    fileCount: 18
    testFileCount: 10
    artefactQuality: "code_and_requirements"
    questionCount: 5
    tokenBudgetApplied: false
[Comments] - I think we need to provide more details what did we sent to the LLM
Maybe list of files and gh issues?
[09:55:57.522] INFO (fcs/19004): pipeline: llm request sent
    assessmentId: "5ab898a4-791b-469f-94c2-d2eac04d54df"
    orgId: "271f61a8-12a8-4b76-ae39-547c3e03de23"
    step: "llm_request_sent"
[09:56:24.156] INFO (fcs/19004): pipeline: tool call completed
    assessmentId: "5ab898a4-791b-469f-94c2-d2eac04d54df"
    orgId: "271f61a8-12a8-4b76-ae39-547c3e03de23"
    step: "tool_call"
    toolName: "readFile"
    argumentPath: "docs/design/lld-v2-e17-agentic-retrieval.md"
    bytesReturned: 50235
    outcome: "ok"
    toolCallCount: 1
[Comments] - strange that this file was not sent.
Actually, I found one thing we need to add. when we create assesment we should be able to send GH issues and not only pr
We can provide either GH, PRs or both.
[09:57:54.550] WARN (fcs/19004): pipeline: malformed LLM response
    assessmentId: "5ab898a4-791b-469f-94c2-d2eac04d54df"
    orgId: "271f61a8-12a8-4b76-ae39-547c3e03de23"
    step: "llm_request_sent"
    errorCode: "malformed_response"
    errorMessage: "parse error: Unexpected token 'B', \"Based on t\"... is not valid JSON"
[Comments] - this is not very informative how we can get details. 
[09:57:54.551] ERROR (fcs/19004): triggerRubricGeneration: failed
    assessmentId: "5ab898a4-791b-469f-94c2-d2eac04d54df"
    orgId: "271f61a8-12a8-4b76-ae39-547c3e03de23"
    err: {
      "type": "RubricGenerationError",
      "message": "Rubric generation failed: malformed_response",
      "stack":
          RubricGenerationError: Rubric generation failed: malformed_response
              at failGeneration (webpack-internal:///(rsc)/./src/app/api/fcs/service.ts:272:11)
              at runGeneration (webpack-internal:///(rsc)/./src/app/api/fcs/service.ts:298:48)
              at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
              at async finaliseRubric (webpack-internal:///(rsc)/./src/app/api/fcs/service.ts:309:20)
              at async triggerRubricGeneration (webpack-internal:///(rsc)/./src/app/api/fcs/service.ts:417:9)
      "llmError": {
        "type": "Object",
        "message": "parse error: Unexpected token 'B', \"Based on t\"... is not valid JSON",
        "stack":

        "code": "malformed_response",
        "retryable": false
      },
      "name": "RubricGenerationError"
    }

[Comments]

- view stuck with  Generating
- during the process button status badge was not updated and I do not see polling request in the log.
Unfortunately, I quit application after restaring I see  the status -
it says malformed_response (not user friendly) and this is not retriable which is maybe not absolutely correct.

[10:25:01.288] INFO (fcs/18176): pipeline: extracting artefacts
    assessmentId: "5ab898a4-791b-469f-94c2-d2eac04d54df"
    orgId: "271f61a8-12a8-4b76-ae39-547c3e03de23"
    step: "artefact_extraction"
 GET /assessments 200 in 427ms
[10:25:02.839] INFO (fcs/18176): Rubric generation: artefact summary
    fileCount: 18
    testFileCount: 10
    artefactQuality: "code_and_requirements"
    questionCount: 5
    tokenBudgetApplied: false
[10:25:03.003] INFO (fcs/18176): pipeline: llm request sent
    assessmentId: "5ab898a4-791b-469f-94c2-d2eac04d54df"
    orgId: "271f61a8-12a8-4b76-ae39-547c3e03de23"
    step: "llm_request_sent"
[10:25:14.878] INFO (fcs/18176): pipeline: tool call completed
    assessmentId: "5ab898a4-791b-469f-94c2-d2eac04d54df"
    orgId: "271f61a8-12a8-4b76-ae39-547c3e03de23"
    step: "tool_call"
    toolName: "listDirectory"
    argumentPath: "."
    bytesReturned: 1383
    outcome: "ok"
    toolCallCount: 1
[10:25:23.151] INFO (fcs/18176): pipeline: tool call completed
    assessmentId: "5ab898a4-791b-469f-94c2-d2eac04d54df"
    orgId: "271f61a8-12a8-4b76-ae39-547c3e03de23"
    step: "tool_call"
    toolName: "readFile"
    argumentPath: "docs/design/lld-v2-e17-agentic-retrieval.md"
    bytesReturned: 50235
    outcome: "ok"
    toolCallCount: 2
[10:26:10.008] WARN (fcs/18176): pipeline: malformed LLM response
    assessmentId: "5ab898a4-791b-469f-94c2-d2eac04d54df"
    orgId: "271f61a8-12a8-4b76-ae39-547c3e03de23"
    step: "llm_request_sent"
    errorCode: "malformed_response"
    errorMessage: "loop turn cap exceeded"
[10:26:10.008] ERROR (fcs/18176): triggerRubricGeneration: failed
    assessmentId: "5ab898a4-791b-469f-94c2-d2eac04d54df"
    orgId: "271f61a8-12a8-4b76-ae39-547c3e03de23"
    err: {
      "type": "RubricGenerationError",
      "message": "Rubric generation failed: malformed_response",
      "stack":
          RubricGenerationError: Rubric generation failed: malformed_response
              at failGeneration (webpack-internal:///(rsc)/./src/app/api/fcs/service.ts:272:11)
              at runGeneration (webpack-internal:///(rsc)/./src/app/api/fcs/service.ts:298:48)
              at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
              at async finaliseRubric (webpack-internal:///(rsc)/./src/app/api/fcs/service.ts:309:20)
              at async triggerRubricGeneration (webpack-internal:///(rsc)/./src/app/api/fcs/service.ts:417:9)
      "llmError": {
        "type": "Object",
        "message": "loop turn cap exceeded",
        "stack":

        "code": "malformed_response",
        "retryable": false
      },
      "name": "RubricGenerationError"
    }

    another attempt

     POST /api/assessments/5ab898a4-791b-469f-94c2-d2eac04d54df/retry-rubric 200 in 866ms
[10:34:36.705] INFO (fcs/18176): pipeline: extracting artefacts
    assessmentId: "5ab898a4-791b-469f-94c2-d2eac04d54df"
    orgId: "271f61a8-12a8-4b76-ae39-547c3e03de23"
    step: "artefact_extraction"
 GET /assessments 200 in 310ms
[10:34:38.027] INFO (fcs/18176): Rubric generation: artefact summary
    fileCount: 18
    testFileCount: 10
    artefactQuality: "code_and_requirements"
    questionCount: 5
    tokenBudgetApplied: false
[10:34:38.242] INFO (fcs/18176): pipeline: llm request sent
    assessmentId: "5ab898a4-791b-469f-94c2-d2eac04d54df"
    orgId: "271f61a8-12a8-4b76-ae39-547c3e03de23"
    step: "llm_request_sent"
[10:35:05.349] INFO (fcs/18176): pipeline: tool call completed
    assessmentId: "5ab898a4-791b-469f-94c2-d2eac04d54df"
    orgId: "271f61a8-12a8-4b76-ae39-547c3e03de23"
    step: "tool_call"
    toolName: "readFile"
    argumentPath: "src/lib/github/tools/path-safety.ts"
    bytesReturned: 818
    outcome: "ok"
    toolCallCount: 1
[10:35:20.683] INFO (fcs/18176): pipeline: tool call completed
    assessmentId: "5ab898a4-791b-469f-94c2-d2eac04d54df"
    orgId: "271f61a8-12a8-4b76-ae39-547c3e03de23"
    step: "tool_call"
    toolName: "readFile"
    argumentPath: "src/lib/engine/llm/tool-loop.ts"
    bytesReturned: 9465
    outcome: "ok"
    toolCallCount: 2
[10:35:28.572] INFO (fcs/18176): pipeline: tool call completed
    assessmentId: "5ab898a4-791b-469f-94c2-d2eac04d54df"
    orgId: "271f61a8-12a8-4b76-ae39-547c3e03de23"
    step: "tool_call"
    toolName: "readFile"
    argumentPath: "src/app/api/fcs/service.ts"
    bytesReturned: 26007
    outcome: "ok"
    toolCallCount: 3
[10:36:41.710] WARN (fcs/18176): pipeline: malformed LLM response
    assessmentId: "5ab898a4-791b-469f-94c2-d2eac04d54df"
    orgId: "271f61a8-12a8-4b76-ae39-547c3e03de23"
    step: "llm_request_sent"
    errorCode: "malformed_response"
    errorMessage: "parse error: Unexpected token 'B', \"Based on m\"... is not valid JSON"
[10:36:41.710] ERROR (fcs/18176): triggerRubricGeneration: failed
    assessmentId: "5ab898a4-791b-469f-94c2-d2eac04d54df"
    orgId: "271f61a8-12a8-4b76-ae39-547c3e03de23"
    err: {
      "type": "RubricGenerationError",
      "message": "Rubric generation failed: malformed_response",
      "stack":
          RubricGenerationError: Rubric generation failed: malformed_response
              at failGeneration (webpack-internal:///(rsc)/./src/app/api/fcs/service.ts:272:11)
              at runGeneration (webpack-internal:///(rsc)/./src/app/api/fcs/service.ts:298:48)
              at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
              at async finaliseRubric (webpack-internal:///(rsc)/./src/app/api/fcs/service.ts:309:20)
              at async triggerRubricGeneration (webpack-internal:///(rsc)/./src/app/api/fcs/service.ts:417:9)
      "llmError": {
        "type": "Object",
        "message": "parse error: Unexpected token 'B', \"Based on m\"... is not valid JSON",
        "stack":

        "code": "malformed_response",
        "retryable": false
      },
      "name": "RubricGenerationError"
    }