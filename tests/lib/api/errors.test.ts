// Tests for ApiError class and handleApiError response helper.
// Design reference: docs/design/lld-phase-2-web-auth-db.md §2.4

import { describe, expect, it } from 'vitest';
import { ApiError, handleApiError } from '@/lib/api/errors';

describe('ApiError', () => {
  describe('Given a status code and message', () => {
    it('then it exposes statusCode and message', () => {
      const err = new ApiError(422, 'Validation failed');
      expect(err.statusCode).toBe(422);
      expect(err.message).toBe('Validation failed');
      expect(err).toBeInstanceOf(Error);
    });
  });

  describe('Given optional details', () => {
    it('then it exposes details', () => {
      const details = { field: 'email', reason: 'invalid' };
      const err = new ApiError(422, 'Validation failed', details);
      expect(err.details).toEqual(details);
    });
  });

  describe('Given no details', () => {
    it('then details is undefined', () => {
      const err = new ApiError(401, 'Unauthenticated');
      expect(err.details).toBeUndefined();
    });
  });
});

describe('handleApiError', () => {
  describe('Given an ApiError(422)', () => {
    it('then it returns a 422 response with the error message', async () => {
      const err = new ApiError(422, 'Validation failed');
      const response = handleApiError(err);
      expect(response.status).toBe(422);
      const body = await response.json();
      expect(body).toEqual({ error: 'Validation failed' });
    });
  });

  describe('Given an ApiError(422) with details', () => {
    it('then it returns a 422 response with error message and details', async () => {
      const details = { field: 'name' };
      const err = new ApiError(422, 'Validation failed', details);
      const response = handleApiError(err);
      expect(response.status).toBe(422);
      const body = await response.json();
      expect(body).toEqual({ error: 'Validation failed', details });
    });
  });

  describe('Given an unknown error', () => {
    it('then it returns a 500 response with generic message', async () => {
      const err = new Error('Something unexpected');
      const response = handleApiError(err);
      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body).toEqual({ error: 'Internal server error' });
    });
  });

  describe('Given a non-Error thrown value', () => {
    it('then it returns a 500 response with generic message', async () => {
      const response = handleApiError('string error');
      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body).toEqual({ error: 'Internal server error' });
    });
  });
});
