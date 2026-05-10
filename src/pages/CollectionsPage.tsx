import { useNavigate } from 'react-router-dom';
import { useProject } from '../context/ProjectContext';
import styles from './CollectionsPage.module.scss';

export default function CollectionsPage() {
  const { project, config, setActiveCollection, clearProject } = useProject();
  const navigate = useNavigate();

  if (!project || !config) {
    navigate('/');
    return null;
  }

  function handleSelect(index: number) {
    const collection = config!.collections[index];
    setActiveCollection(collection);
    const encodedName = encodeURIComponent(collection.name);
    navigate(`/${project!.owner}/${project!.repo}/${encodedName}`);
  }

  return (
    <div className={styles.page}>
      <button className={styles.back} onClick={() => { clearProject(); navigate('/'); }}>← Projects</button>
      <h1 className={styles.title}>{project.label}</h1>
      <ul className={styles.list}>
        {config.collections.map((col, i) => (
          <li key={col.name}>
            <button className={styles.item} onClick={() => handleSelect(i)}>
              {col.name}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
