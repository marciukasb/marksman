import { describe, it, expect } from 'vitest';
import { deriveStatus, type StatusInput } from './status';

const NOW = 1_000_000_000;
const base: StatusInput = { syncing: false, pending: 0, lastSync: null, run: null, deploy: null, now: NOW };
const active = { exists: true, active: true };
const justSynced = { sha: 'c1', at: NOW - 60_000 };

describe('deriveStatus', () => {
  it('shows syncing first', () => {
    expect(deriveStatus({ ...base, syncing: true, pending: 3 })).toEqual({ kind: 'syncing', text: 'Syncing…' });
  });

  it('shows the site updating while the run has not appeared yet', () => {
    expect(deriveStatus({ ...base, lastSync: justSynced, deploy: active }).text).toBe('Updating the site…');
  });

  it('shows the site updating while the run is in progress', () => {
    const run = { status: 'in_progress', conclusion: null };
    expect(deriveStatus({ ...base, lastSync: justSynced, deploy: active, run }).kind).toBe('updating');
  });

  it('shows a failed update', () => {
    const run = { status: 'completed', conclusion: 'failure' };
    expect(deriveStatus({ ...base, lastSync: justSynced, deploy: active, run })).toEqual({ kind: 'failed', text: 'Last update failed' });
  });

  it('shows everything live after a successful run', () => {
    const run = { status: 'completed', conclusion: 'success' };
    expect(deriveStatus({ ...base, lastSync: justSynced, deploy: active, run })).toEqual({ kind: 'live', text: 'Everything is live' });
  });

  it('stops waiting for a run that never appeared after 10 minutes', () => {
    const old = { sha: 'c1', at: NOW - 11 * 60_000 };
    expect(deriveStatus({ ...base, lastSync: old, deploy: active }).kind).toBe('live');
  });

  it('says updates are off when the deploy workflow is disabled', () => {
    const deploy = { exists: true, active: false };
    expect(deriveStatus({ ...base, lastSync: justSynced, deploy })).toEqual({ kind: 'off', text: 'Saved — site updates are switched off' });
  });

  it('says updates are off when the deploy workflow is missing', () => {
    expect(deriveStatus({ ...base, lastSync: justSynced, deploy: { exists: false, active: false } }).kind).toBe('off');
  });

  it('prefers waiting changes over the switched-off notice', () => {
    expect(deriveStatus({ ...base, pending: 2, lastSync: justSynced, deploy: { exists: true, active: false } }).text).toBe('2 changes waiting');
  });

  it('counts one waiting change in the singular', () => {
    expect(deriveStatus({ ...base, pending: 1 }).text).toBe('1 change waiting');
  });

  it('is live with nothing pending and no sync yet', () => {
    expect(deriveStatus(base).kind).toBe('live');
  });
});
