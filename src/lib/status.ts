export type StatusKind = 'syncing' | 'updating' | 'failed' | 'waiting' | 'live' | 'off';

export interface StatusInput {
  syncing: boolean;
  pending: number;
  lastSync: { sha: string; at: number } | null;
  run: { status: string; conclusion: string | null } | null;
  deploy: { exists: boolean; active: boolean } | null;
  now: number;
}

// How long to keep saying "Updating" while GitHub hasn't registered the deploy run yet
const RUN_GRACE_MS = 10 * 60_000;

const waiting = (n: number) => `${n} ${n === 1 ? 'change' : 'changes'} waiting`;

export function deriveStatus(s: StatusInput): { kind: StatusKind; text: string } {
  if (s.syncing) return { kind: 'syncing', text: 'Syncing…' };

  if (s.lastSync && s.deploy) {
    if (s.deploy.exists && s.deploy.active) {
      const runPending = !s.run && s.now - s.lastSync.at < RUN_GRACE_MS;
      if (runPending || (s.run && s.run.status !== 'completed')) {
        return { kind: 'updating', text: 'Updating the site…' };
      }
      if (s.run && s.run.conclusion !== 'success') return { kind: 'failed', text: 'Last update failed' };
    } else if (s.pending === 0) {
      return { kind: 'off', text: 'Saved — site updates are switched off' };
    }
  }

  if (s.pending > 0) return { kind: 'waiting', text: waiting(s.pending) };
  return { kind: 'live', text: 'Everything is live' };
}
