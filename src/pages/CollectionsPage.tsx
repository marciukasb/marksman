import { useNavigate } from 'react-router-dom';
import { useProject } from '../context/ProjectContext';
import styles from './CollectionsPage.module.scss';

export default function CollectionsPage() {
  const { project, config } = useProject();
  const navigate = useNavigate();

  if (!project || !config) {
    navigate('/');
    return null;
  }

  return (
    <div className={styles.page}>
      <p className={styles.hint}>Select a collection from the sidebar.</p>
    </div>
  );
}
