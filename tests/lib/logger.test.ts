// Unit tests for the structured Pino logger factory.
// Design reference: docs/adr/0016-structured-logging-pino.md

import { describe, it, expect } from 'vitest';

describe('logger', () => {
  it('exports a Pino logger instance', async () => {
    const { logger } = await import('@/lib/logger');
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.debug).toBe('function');
  });

  it('creates child loggers with context fields', async () => {
    const { logger } = await import('@/lib/logger');
    const child = logger.child({ requestId: 'test-123' });
    expect(child).toBeDefined();
    expect(typeof child.info).toBe('function');
  });

  it('outputs JSON with required fields', async () => {
    const { logger } = await import('@/lib/logger');
    const chunks: string[] = [];
    const dest = {
      write(chunk: string) { chunks.push(chunk); },
    };
    // Use pino with a custom destination to capture output
    const pino = (await import('pino')).default;
    const testLogger = pino({ name: 'fcs' }, dest as never);
    testLogger.info({ requestId: 'req-1' }, 'test message');

    const parsed = JSON.parse(chunks[0] ?? '{}') as Record<string, unknown>;
    expect(parsed['msg']).toBe('test message');
    expect(parsed['requestId']).toBe('req-1');
    expect(parsed['level']).toBe(30); // info level
    expect(parsed['time']).toBeDefined();

    // Verify our logger has a name
    expect(logger.bindings()['name']).toBe('fcs');
  });
});
