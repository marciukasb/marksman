import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useProject } from '../context/ProjectContext';
import { fetchFile, putFile, ensureDraftsBranch } from '../lib/github';
import { parsePost, serializePost, generateSlug } from '../lib/frontmatter';
import Button from '../components/ui/Button';
import Loader from '../components/ui/Loader';
import TextField from '../components/fields/TextField';
import TextareaField from '../components/fields/TextareaField';
import DateField from '../components/fields/DateField';
import SelectField from '../components/fields/SelectField';
import ImageField from '../components/fields/ImageField';
import MarkdownField from '../components/fields/MarkdownField';
import type { FieldConfig } from '../types';
import { fieldLabel } from '../lib/config';
import { useWorkspace } from '../context/WorkspaceContext';
import { slugify } from '../lib/slug';
import styles from './PostEditorPage.module.scss';

export default function PostEditorPage() {
  const { project, activeCollection } = useProject();
  const { addPhotos, photoSrc } = useWorkspace();
  const { slug } = useParams<{ slug?: string }>();
  const navigate = useNavigate();
  const isNew = !slug;

  const [values, setValues] = useState<Record<string, string>>(() => {
    if (!isNew || !activeCollection) return {};
    const today = new Date().toISOString().slice(0, 10);
    return Object.fromEntries(
      activeCollection.fields.filter(f => f.type === 'date').map(f => [f.name, today])
    );
  });
  const [fileSha, setFileSha] = useState<string | undefined>();
  const [loading, setLoading] = useState(!!slug);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!project || !activeCollection) { navigate('/'); return; }
    if (!isNew) loadPost();
  }, []);

  async function loadPost() {
    const path = `${activeCollection!.folder}/${slug}.md`;
    try {
      const { content, sha } = await fetchFile(project!.pat, project!.owner, project!.repo, path);
      const { data, body } = parsePost(content);
      const bodyField = activeCollection!.fields.find(f => f.type === 'markdown');
      setValues(Object.fromEntries(Object.entries({ ...data, ...(bodyField ? { [bodyField.name]: body } : {}) }).map(([k, v]) => [k, String(v)])));
      setFileSha(sha);
    } catch {
      setError('Failed to load post.');
    } finally {
      setLoading(false);
    }
  }

  function setField(name: string, value: string) {
    setValues(v => ({ ...v, [name]: value }));
  }

  async function save(draft: boolean) {
    setSaving(true);
    setError('');
    try {
      const bodyField = activeCollection!.fields.find(f => f.type === 'markdown');
      const body = bodyField ? (values[bodyField.name] ?? '') : '';
      const frontmatter = Object.fromEntries(
        Object.entries(values).filter(([k]) => k !== bodyField?.name)
      );
      const content = serializePost(frontmatter, body);
      const title = values.title ?? 'untitled';
      const postSlug = isNew ? generateSlug(title) : slug!;
      const path = `${activeCollection!.folder}/${postSlug}.md`;
      const message = `cms: ${isNew ? 'publish' : 'update'} "${title}"`;
      let branch: string | undefined;
      if (draft) {
        await ensureDraftsBranch(project!.pat, project!.owner, project!.repo, 'master');
        branch = 'cms-drafts';
      }
      let sha = fileSha;
      if (isNew) {
        try {
          const existing = await fetchFile(project!.pat, project!.owner, project!.repo, path);
          sha = existing.sha;
        } catch {
          // file doesn't exist yet, no sha needed
        }
      }
      await putFile(project!.pat, project!.owner, project!.repo, path, content, message, sha, branch);
      navigate(`/${project!.owner}/${project!.repo}/${encodeURIComponent(activeCollection!.name)}`);
    } catch (err) {
      console.error('Save failed:', err);
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Failed to save: ${msg}`);
    } finally {
      setSaving(false);
    }
  }

  function renderField(field: FieldConfig) {
    const value = values[field.name] ?? '';
    const onChange = (v: string) => setField(field.name, v);
    const label = fieldLabel(field);

    switch (field.type) {
      case 'text': return <TextField key={field.name} name={label} value={value} onChange={onChange} />;
      case 'textarea': return <TextareaField key={field.name} name={label} value={value} onChange={onChange} />;
      case 'date': return <DateField key={field.name} name={label} value={value} onChange={onChange} />;
      case 'select': return <SelectField key={field.name} name={label} value={value} options={field.options ?? []} onChange={onChange} />;
      case 'image':
      case 'markdown': {
        const folder = activeCollection!.imageFolder;
        const prefix = activeCollection!.imageUrlPrefix;
        const photoSlug = slug ?? slugify(values.title ?? '', new Date().toISOString().slice(0, 10));
        const shared = {
          key: field.name,
          name: label,
          value,
          onChange,
          photoSrc: (url: string) => photoSrc(url, folder, prefix),
          onAddFiles: (files: File[]) => addPhotos(files, photoSlug, folder, prefix),
        };
        return field.type === 'image' ? <ImageField {...shared} /> : <MarkdownField {...shared} />;
      }
      default: return null;
    }
  }

  if (!project || !activeCollection) return null;

  return (
    <div className={styles.page}>
      {error && <p className={styles.error}>{error}</p>}
      {loading ? <Loader /> : (
        <>
          <div className={styles.fields}>
            {activeCollection.fields.map(renderField)}
          </div>
          <div className={styles.actions}>
            <Button onClick={() => save(false)} loading={saving}>Publish</Button>
            <Button variant="secondary" onClick={() => save(true)} loading={saving}>Save draft</Button>
          </div>
        </>
      )}
    </div>
  );
}
