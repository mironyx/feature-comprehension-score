import { http, HttpResponse } from 'msw';

const ANTHROPIC_API = 'https://api.anthropic.com';

/** Factory: mock a Claude messages response (question generation, scoring, etc.) */
export function mockClaudeMessages(
  responseContent: string,
  overrides: Record<string, unknown> = {},
) {
  return http.post(`${ANTHROPIC_API}/v1/messages`, () =>
    HttpResponse.json({
      id: 'msg_test_001',
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text: responseContent }],
      model: 'claude-sonnet-4-5-20250929',
      stop_reason: 'end_turn',
      usage: { input_tokens: 100, output_tokens: 50 },
      ...overrides,
    }),
  );
}

/** Factory: mock a Claude API error */
export function mockClaudeError(status: number, message: string) {
  return http.post(`${ANTHROPIC_API}/v1/messages`, () =>
    HttpResponse.json(
      {
        type: 'error',
        error: { type: 'api_error', message },
      },
      { status },
    ),
  );
}
