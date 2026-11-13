import { useEffect, useRef, useState } from 'react';
import { useBlocker } from 'react-router-dom';
import { useProject } from '../../context/ProjectContext';
import { useWorkspace } from '../../context/WorkspaceContext';
import { fetchFile, listFiles } from '../../lib/github';
import { parsePost } from '../../lib/frontmatter';
import { slugify, uniqueSlug } from '../../lib/slug';
import { referencedPhotos } from '../../lib/photos';
import { fieldLabel } from '../../lib/config';
import { entryKey, getEntry, keepWorkSafe, saveEntry, workspaceId } from '../../lib/workspace';
import Button from '../ui/Button';
import Loader from '../ui/Loader';
import TextField from '../fields/TextField';
import TextareaField from '../fields/TextareaField';
import DateField from '../fields/DateField';
import SelectField from '../fields/SelectField';
import NumberField from '../fields/NumberField';
import ImageField from '../fields/ImageField';
import GalleryField from '../fields/GalleryField';
import MarkdownField from '../fields/MarkdownField';
import type { EntryState, FieldConfig, FieldValue } from '../../types';
import styles from './EntryEditor.module.scss';

interface Props {
  kind: 'post' | 'single';
  scope: string;
  fields: FieldConfig[];
  imageFolder: string;
  imageUrlPrefix?: string;
  // Repo path of the file being edited; null for a post that doesn't exist yet
  existingPath: string | null;
  // Folder new posts are created in
  newPostFolder?: string;
  onDone: () => void;
}

interface Meta {
  path: string | null;
  slug: string | null;
  baseSha: string | null;
  livePhotos: string[];
}

const today = () => new Date().toISOString().slice(0, 10);
const snapshot = (data: Record<string, FieldValue>, body: string) => JSON.stringify({ data, body });

export default function EntryEditor({ kind, scope, fields, imageFolder, imageUrlPrefix, existingPath, newPostFolder, onDone }: Props) {
  const { project, repoInfo } = useProject();
  const { entries, refresh, addPhotos, photoSrc } = useWorkspace();
  const galleryField = fields.find(f => f.type === 'gallery');

  const [data, setData] = useState<Record<string, FieldValue>>({});
  const [body, setBody] = useState('');
  const [meta, setMeta] = useState<Meta>({ path: existingPath, slug: null, baseSha: null, livePhotos: [] });
  const [loaded, setLoaded] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // Photos still being shrunk; saving now would leave them out of the post
  const [photoWork, setPhotoWork] = useState(0);
  const [photoErrors, setPhotoErrors] = useState<string[]>([]);
  const leaving = useRef(false);

  useEffect(() => {
    if (!project || !repoInfo) return;
    let cancelled = false;
    const finish = (d: Record<string, FieldValue>, b: string, m: Meta) => {
      if (cancelled) return;
      setData(d);
      setBody(b);
      setMeta(m);
      setLoaded(snapshot(d, b));
      setLoading(false);
    };
    (async () => {
      if (!existingPath) {
        const dates = Object.fromEntries(fields.filter(f => f.type === 'date').map(f => [f.name, today()]));
        return finish(dates, '', { path: null, slug: null, baseSha: null, livePhotos: [] });
      }
      let local;
      try {
        local = await getEntry(entryKey(workspaceId(project), existingPath));
      } catch {
        if (!cancelled) {
          setError("Couldn't read saved work on this computer. Try reloading the page.");
          setLoading(false);
        }
        return;
      }
      if (local) {
        return finish(local.data, local.body, { path: local.path, slug: local.slug, baseSha: local.baseSha, livePhotos: local.livePhotos });
      }
      const slug = kind === 'post' ? existingPath.split('/').pop()!.replace(/\.md$/, '') : null;
      try {
        const { content, sha } = await fetchFile(project.pat, project.owner, project.repo, existingPath, repoInfo.defaultBranch);
        const parsed = parsePost(content);
        const livePhotos = referencedPhotos(parsed.data, parsed.body, fields);
        finish(parsed.data, parsed.body, { path: existingPath, slug, baseSha: sha, livePhotos });
      } catch (err) {
        // A single entry that doesn't exist yet starts empty
        if (kind === 'single' && (err as { status?: number }).status === 404) {
          return finish({}, '', { path: existingPath, slug: null, baseSha: null, livePhotos: [] });
        }
        if (!cancelled) {
          setError('Failed to load this post from GitHub.');
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [project, repoInfo, existingPath, kind, fields]);

  const dirty = !loading && snapshot(data, body) !== loaded;

  const blocker = useBlocker(({ currentLocation, nextLocation }) =>
    dirty && !leaving.current && currentLocation.pathname !== nextLocation.pathname);

  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    if (window.confirm('You have unsaved changes. Leave without saving?')) blocker.proceed();
    else blocker.reset();
  }, [blocker]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  function setField(name: string, value: FieldValue | undefined) {
    setData(d => {
      const next = { ...d };
      if (value === undefined) delete next[name];
      else next[name] = value;
      return next;
    });
  }

  const photoSlug = () => meta.slug ?? slugify(String(data.title ?? ''), today());

  async function trackedAddPhotos(files: File[]) {
    setPhotoWork(n => n + 1);
    try {
      return await addPhotos(files, photoSlug(), imageFolder, imageUrlPrefix);
    } finally {
      setPhotoWork(n => n - 1);
    }
  }

  async function addGalleryFiles(files: File[]) {
    if (!galleryField) return;
    const { urls, errors } = await trackedAddPhotos(files);
    setPhotoErrors(errors);
    setData(d => ({ ...d, [galleryField.name]: [...((d[galleryField.name] as string[]) ?? []), ...urls] }));
  }

  async function newPostPath(): Promise<{ path: string; slug: string }> {
    const base = slugify(String(data.title ?? ''), today());
    // Offline, only local names are checked; a clash with GitHub shows up as a conflict at Sync
    const live = await listFiles(project!.pat, project!.owner, project!.repo, newPostFolder!)
      .then(files => files.map(f => f.name.replace(/\.md$/, '')))
      .catch(() => [] as string[]);
    const local = entries.filter(e => e.scope === scope && e.slug).map(e => e.slug!);
    const slug = uniqueSlug(base, new Set([...live, ...local]));
    return { path: `${newPostFolder}/${slug}.md`, slug };
  }

  async function save(state: EntryState) {
    if (!project) return;
    setSaving(true);
    setError('');
    try {
      const { path, slug } = meta.path ? { path: meta.path, slug: meta.slug } : await newPostPath();
      await saveEntry({
        key: entryKey(workspaceId(project), path),
        projectId: workspaceId(project),
        kind,
        scope,
        path,
        slug,
        state,
        baseSha: meta.baseSha,
        livePhotos: meta.livePhotos,
        data,
        body,
        updatedAt: Date.now(),
      });
      void keepWorkSafe();
      leaving.current = true;
      await refresh();
      onDone();
    } catch (err) {
      setError(`Couldn't save on this computer: ${err instanceof Error ? err.message : String(err)}`);
      setSaving(false);
    }
  }

  function renderField(field: FieldConfig) {
    const label = fieldLabel(field);
    const value = data[field.name];
    const text = typeof value === 'string' || typeof value === 'number' ? String(value) : '';
    const onText = (v: string) => setField(field.name, v);
    const src = (url: string) => photoSrc(url, imageFolder, imageUrlPrefix);
    const addFiles = trackedAddPhotos;

    switch (field.type) {
      case 'text': return <TextField key={field.name} name={label} value={text} onChange={onText} />;
      case 'textarea': return <TextareaField key={field.name} name={label} value={text} onChange={onText} />;
      case 'date': return <DateField key={field.name} name={label} value={text} onChange={onText} />;
      case 'select': return <SelectField key={field.name} name={label} value={text} options={field.options ?? []} onChange={onText} />;
      case 'number':
        return <NumberField key={field.name} label={label} value={typeof value === 'number' ? value : undefined} onChange={v => setField(field.name, v)} />;
      case 'image':
        return <ImageField key={field.name} name={label} value={text} onChange={onText} photoSrc={src} onAddFiles={addFiles} />;
      case 'gallery':
        return (
          <GalleryField
            key={field.name}
            label={label}
            value={Array.isArray(value) ? value : []}
            onChange={urls => setField(field.name, urls)}
            onAddFiles={addGalleryFiles}
            photoSrc={src}
            busy={photoWork > 0}
            errors={photoErrors}
          />
        );
      case 'markdown':
        return (
          <MarkdownField
            key={field.name}
            name={label}
            value={body}
            onChange={setBody}
            photoSrc={src}
            onAddFiles={addFiles}
            galleryPhotos={galleryField && Array.isArray(data[galleryField.name]) ? (data[galleryField.name] as string[]) : undefined}
            onAddToGallery={galleryField
              ? urls => setData(d => ({ ...d, [galleryField.name]: [...((d[galleryField.name] as string[]) ?? []), ...urls] }))
              : undefined}
          />
        );
      default: return null;
    }
  }

  if (loading) return <Loader />;

  // The photo strip goes first: add photos, then write
  const ordered = [...fields.filter(f => f.type === 'gallery'), ...fields.filter(f => f.type !== 'gallery')];

  return (
    <div className={styles.page}>
      {error && <p className={styles.error}>{error}</p>}
      <div className={styles.fields}>{ordered.map(renderField)}</div>
      <div className={styles.actions}>
        <Button onClick={() => save('submitted')} loading={saving} disabled={photoWork > 0}>Submit</Button>
        <Button variant="secondary" onClick={() => save('draft')} loading={saving} disabled={photoWork > 0}>Save draft</Button>
        {photoWork > 0 && <span className={styles.note}>Preparing photos…</span>}
      </div>
    </div>
  );
}
