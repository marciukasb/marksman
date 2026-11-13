import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useProject } from '../context/ProjectContext';
import EntryEditor from '../components/editor/EntryEditor';

export default function PostEditorPage() {
  const { project, activeCollection } = useProject();
  const { slug } = useParams<{ slug?: string }>();
  const navigate = useNavigate();

  useEffect(() => {
    if (!project || !activeCollection) navigate('/');
  }, [project, activeCollection, navigate]);

  if (!project || !activeCollection) return null;

  const listPath = `/${project.owner}/${project.repo}/${encodeURIComponent(activeCollection.name)}`;
  return (
    <EntryEditor
      key={slug ?? 'new'}
      kind="post"
      scope={activeCollection.name}
      fields={activeCollection.fields}
      imageFolder={activeCollection.imageFolder}
      imageUrlPrefix={activeCollection.imageUrlPrefix}
      existingPath={slug ? `${activeCollection.folder}/${decodeURIComponent(slug)}.md` : null}
      newPostFolder={activeCollection.folder}
      onDone={() => navigate(listPath)}
    />
  );
}
