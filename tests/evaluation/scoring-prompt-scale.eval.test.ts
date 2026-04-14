// Adversarial evaluation tests for issue #212 — scoring prompt must specify 0–1 scale.
//
// Probes gaps in the implementation's own test suite. Failures are findings —
// do NOT fix the implementation in this file.

import { describe, it, expect, vi } from 'vitest';
import { scoreAnswer } from '@/lib/engine/scoring/score-answer';
import { scoringFixture } from '../fixtures/llm/scoring';

// ---------------------------------------------------------------------------
// Shared helper — captures the systemPrompt passed to generateStructured.
// The feature test file uses vi.fn() inline; we do the same here rather than
// duplicating via a shared fixture, because the shape is trivial.
// ---------------------------------------------------------------------------

function makeCapturingClient() {
  const generateStructured = vi.fn().mockResolvedValue({
    success: true,
    data: scoringFixture.valid,
  });
  return { client: { generateStructured }, spy: generateStructured };
}

async function captureSystemPrompt() {
  const { client, spy } = makeCapturingClient();
  await scoreAnswer({
    questionText: 'Q',
    referenceAnswer: 'A',
    participantAnswer: 'B',
    llmClient: client,
  });
  return spy.mock.calls[0][0].systemPrompt as string;
}

// ---------------------------------------------------------------------------
// AC-1: SYSTEM_PROMPT explicitly specifies the 0.0–1.0 scale
// ---------------------------------------------------------------------------

describe('AC-1: system prompt scale declaration', () => {
  it('contains the phrase "0.0 to 1.0"', async () => {
    const systemPrompt = await captureSystemPrompt();
    expect(systemPrompt).toMatch(/0\.0 to 1\.0/);
  });

  it('contains 0.0 anchor with "no comprehension" language', async () => {
    const systemPrompt = await captureSystemPrompt();
    expect(systemPrompt).toMatch(/0\.0[^\n]*(no comprehension|factually incorrect)/i);
  });

  it('contains 1.0 anchor with "complete" or "accurate" language', async () => {
    const systemPrompt = await captureSystemPrompt();
    expect(systemPrompt).toMatch(/1\.0[^\n]*(complete|accurate)/i);
  });

  it('contains all five anchor points (0.0, 0.3, 0.5, 0.8, 1.0)', async () => {
    const systemPrompt = await captureSystemPrompt();
    for (const anchor of ['0.0', '0.3', '0.5', '0.8', '1.0']) {
      expect(systemPrompt, `missing anchor ${anchor}`).toContain(anchor);
    }
  });

  it('mentions "continuous scale" or equivalent to signal decimal range to the LLM', async () => {
    const systemPrompt = await captureSystemPrompt();
    expect(systemPrompt).toMatch(/continuous scale|decimal|0\.0 to 1\.0/i);
  });
});

// ---------------------------------------------------------------------------
// AC-2: LLM is instructed NOT to use any other scale
// ---------------------------------------------------------------------------

describe('AC-2: system prompt explicitly prohibits other scales', () => {
  it('contains an instruction not to use a 1–5 scale', async () => {
    const systemPrompt = await captureSystemPrompt();
    expect(systemPrompt).toMatch(/1[–\-–]5/);
  });

  it('contains an instruction not to use a 1–10 scale', async () => {
    const systemPrompt = await captureSystemPrompt();
    expect(systemPrompt).toMatch(/1[–\-–]10/);
  });

  it('uses a prohibitive phrase ("do not", "must not", "never") alongside the other-scale warning', async () => {
    const systemPrompt = await captureSystemPrompt();
    expect(systemPrompt).toMatch(/do not|must not|never/i);
  });
});

// ---------------------------------------------------------------------------
// AC-4: regression guard — the scale constraint cannot be silently removed
// ---------------------------------------------------------------------------

describe('AC-4: regression guard — scale information cannot be accidentally stripped', () => {
  it('system prompt length is non-trivial (> 200 chars), ensuring it was not accidentally truncated', async () => {
    const systemPrompt = await captureSystemPrompt();
    expect(systemPrompt.length).toBeGreaterThan(200);
  });

  it('the score range instruction appears BEFORE the JSON format instruction', async () => {
    // If the JSON instruction appears first, an LLM may stop reading before
    // reaching the scale instruction.
    const systemPrompt = await captureSystemPrompt();
    const scaleIdx = systemPrompt.indexOf('0.0 to 1.0');
    const jsonIdx = systemPrompt.indexOf('"score"');
    expect(scaleIdx).toBeGreaterThan(-1);
    expect(jsonIdx).toBeGreaterThan(-1);
    expect(scaleIdx).toBeLessThan(jsonIdx);
  });

  it('system prompt is passed as systemPrompt field, not embedded in user prompt', async () => {
    // The scale instruction must be in systemPrompt, not the user-turn prompt,
    // so it applies as a persistent instruction regardless of input content.
    const { client, spy } = makeCapturingClient();
    await scoreAnswer({
      questionText: 'Q',
      referenceAnswer: 'A',
      participantAnswer: 'B',
      llmClient: client,
    });
    const call = spy.mock.calls[0][0];
    expect(call.systemPrompt).toMatch(/0\.0 to 1\.0/);
    // The user-turn prompt should NOT be the source of the scale instruction.
    expect(call.prompt).not.toMatch(/0\.0 to 1\.0/);
  });
});

// ---------------------------------------------------------------------------
// Boundary: prompt construction — user-supplied inputs appear in user prompt
// ---------------------------------------------------------------------------

describe('Boundary: user inputs appear in the user-turn prompt, not systemPrompt', () => {
  it('questionText appears in the user prompt', async () => {
    const { client, spy } = makeCapturingClient();
    await scoreAnswer({
      questionText: 'unique-question-text-xyz',
      referenceAnswer: 'A',
      participantAnswer: 'B',
      llmClient: client,
    });
    const call = spy.mock.calls[0][0];
    expect(call.prompt).toContain('unique-question-text-xyz');
    expect(call.systemPrompt).not.toContain('unique-question-text-xyz');
  });

  it('participantAnswer appears in the user prompt', async () => {
    const { client, spy } = makeCapturingClient();
    await scoreAnswer({
      questionText: 'Q',
      referenceAnswer: 'A',
      participantAnswer: 'unique-participant-answer-xyz',
      llmClient: client,
    });
    const call = spy.mock.calls[0][0];
    expect(call.prompt).toContain('unique-participant-answer-xyz');
  });
});

// ---------------------------------------------------------------------------
// Boundary: empty / minimal inputs do not corrupt the prompt structure
// ---------------------------------------------------------------------------

describe('Boundary: empty inputs do not strip scale instructions from system prompt', () => {
  it('systemPrompt is identical regardless of empty questionText', async () => {
    const { client: c1, spy: s1 } = makeCapturingClient();
    const { client: c2, spy: s2 } = makeCapturingClient();

    await scoreAnswer({ questionText: '', referenceAnswer: '', participantAnswer: '', llmClient: c1 });
    await scoreAnswer({ questionText: 'Q', referenceAnswer: 'R', participantAnswer: 'P', llmClient: c2 });

    const sp1 = s1.mock.calls[0][0].systemPrompt as string;
    const sp2 = s2.mock.calls[0][0].systemPrompt as string;
    expect(sp1).toBe(sp2);
  });
});
