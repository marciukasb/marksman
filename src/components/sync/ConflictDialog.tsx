import { useWorkspace } from '../../context/WorkspaceContext';
import styles from './ConflictDialog.module.scss';

const REASONS = {
  changed: 'was changed on GitHub after you started editing it',
  exists: 'already exists on GitHub',
  deleted: 'was deleted on GitHub',
};

export default function ConflictDialog() {
  const { conflicts, resolveConflict, dismissConflicts } = useWorkspace();
  if (conflicts.length === 0) return null;

  return (
    <div className={styles.backdrop}>
      <div className={styles.dialog} role="dialog" aria-label="Sync conflicts">
        <h2>Nothing was synced</h2>
        <p>These posts need a decision first. Everything else is still waiting safely.</p>
        <ul className={styles.list}>
          {conflicts.map(c => (
            <li key={c.key}>
              <strong>{c.title}</strong> {REASONS[c.reason]}.
              <div className={styles.actions}>
                <button onClick={() => resolveConflict(c.key, 'mine')}>Use mine</button>
                <button onClick={() => resolveConflict(c.key, 'theirs')}>Use GitHub's</button>
              </div>
            </li>
          ))}
        </ul>
        <button className={styles.later} onClick={dismissConflicts}>Decide later</button>
      </div>
    </div>
  );
}
