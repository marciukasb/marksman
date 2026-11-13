import { useWorkspace } from '../../context/WorkspaceContext';
import ConflictDialog from './ConflictDialog';
import styles from './SyncBar.module.scss';

export default function SyncBar() {
  const { status, runUrl, pendingCount, syncing, sync, syncError } = useWorkspace();

  return (
    <div className={styles.bar}>
      {syncError && <span className={styles.error}>{syncError}</span>}
      {status.kind === 'failed' && runUrl ? (
        <a className={`${styles.status} ${styles[status.kind]}`} href={runUrl} target="_blank" rel="noreferrer">
          {status.text}
        </a>
      ) : (
        <span className={`${styles.status} ${styles[status.kind]}`}>{status.text}</span>
      )}
      <button className={styles.syncBtn} onClick={sync} disabled={syncing || pendingCount === 0}>
        {syncing ? 'Syncing…' : 'Sync'}
      </button>
      <ConflictDialog />
    </div>
  );
}
