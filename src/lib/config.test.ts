import { describe, it, expect } from 'vitest';
import { fieldLabel, describeOpenError } from './config';

describe('fieldLabel', () => {
  it('uses the label when there is one', () => {
    expect(fieldLabel({ name: 'seimos', type: 'number', label: 'bičių šeimos' })).toBe('bičių šeimos');
  });

  it('falls back to the field name', () => {
    expect(fieldLabel({ name: 'title', type: 'text' })).toBe('title');
  });
});

describe('describeOpenError', () => {
  const err = (status: number) => Object.assign(new Error('x'), { status });

  it('explains an invalid token', () => {
    expect(describeOpenError(err(401))).toBe('Token is invalid or expired.');
  });

  it('explains missing permissions', () => {
    expect(describeOpenError(err(403))).toBe('Token lacks access — it needs Contents and Actions read/write on this repo.');
  });

  it('explains a missing repo or config', () => {
    expect(describeOpenError(err(404))).toBe('Repo or .cms.json not found. Check the owner and repo name.');
  });

  it('falls back to a general message', () => {
    expect(describeOpenError(new Error('boom'))).toBe('Could not connect: boom');
  });
});
