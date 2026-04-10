import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { logger } from '@/lib/logger';
import { emitSigninEvent } from './signin-events';

describe('emitSigninEvent', () => {
  let infoSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    infoSpy = vi.spyOn(logger, 'info').mockImplementation(() => logger);
  });

  afterEach(() => {
    infoSpy.mockRestore();
  });

  it('emits signin.success with the given payload', () => {
    emitSigninEvent('success', {
      user_id: 'user-123',
      github_user_id: 42,
      matched_org_count: 2,
    });

    expect(infoSpy).toHaveBeenCalledTimes(1);
    expect(infoSpy).toHaveBeenCalledWith(
      {
        event: 'signin.success',
        user_id: 'user-123',
        github_user_id: 42,
        matched_org_count: 2,
      },
      'sign-in outcome',
    );
  });

  it('emits signin.no_access with matched_org_count 0', () => {
    emitSigninEvent('no_access', {
      user_id: 'user-456',
      github_user_id: 99,
      matched_org_count: 0,
    });

    expect(infoSpy).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'signin.no_access', matched_org_count: 0 }),
      'sign-in outcome',
    );
  });

  it('emits signin.error when user_id and github_user_id are null', () => {
    emitSigninEvent('error', {
      user_id: null,
      github_user_id: null,
      matched_org_count: 0,
    });

    expect(infoSpy).toHaveBeenCalledWith(
      {
        event: 'signin.error',
        user_id: null,
        github_user_id: null,
        matched_org_count: 0,
      },
      'sign-in outcome',
    );
  });

  it('includes the event field on every emission', () => {
    const outcomes = ['success', 'no_access', 'error'] as const;
    for (const outcome of outcomes) {
      emitSigninEvent(outcome, { user_id: null, github_user_id: null, matched_org_count: 0 });
    }

    expect(infoSpy).toHaveBeenCalledTimes(3);
    const events = infoSpy.mock.calls.map((call) => (call[0] as { event: string }).event);
    expect(events).toEqual(['signin.success', 'signin.no_access', 'signin.error']);
  });
});
