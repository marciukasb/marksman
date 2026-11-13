import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useProject } from '../context/ProjectContext';
import EntryEditor from '../components/editor/EntryEditor';

export default function SingleEditorPage() {
  const { project, config } = useProject();
  const { single: name } = useParams<{ single: string }>();
  const navigate = useNavigate();
  const single = config?.singles?.find(s => s.name === decodeURIComponent(name ?? ''));

  useEffect(() => {
    if (!project || !single) navigate('/');
  }, [project, single, navigate]);

  if (!project || !single) return null;

  return (
    <EntryEditor
      key={single.name}
      kind="single"
      scope={single.name}
      fields={single.fields}
      imageFolder={single.imageFolder ?? ''}
      imageUrlPrefix={single.imageUrlPrefix}
      existingPath={single.file}
      onDone={() => navigate(`/${project.owner}/${project.repo}`)}
    />
  );
}
