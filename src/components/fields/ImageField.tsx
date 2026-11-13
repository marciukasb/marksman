import { useRef, useState } from 'react';
import styles from './fields.module.scss';
import imageStyles from './ImageField.module.scss';

interface Props {
  name: string;
  value: string;
  onChange: (value: string) => void;
  onAddFiles: (files: File[]) => Promise<{ urls: string[]; errors: string[] }>;
  photoSrc: (url: string) => string;
}

// Single image (e.g. Ember's thumbnail). Photos stay local until Sync.
export default function ImageField({ name, value, onChange, onAddFiles, photoSrc }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    setError('');
    const { urls, errors } = await onAddFiles([file]);
    if (urls[0]) onChange(urls[0]);
    setError(errors[0] ?? '');
    setBusy(false);
  }

  return (
    <div className={styles.field}>
      <label className={styles.label}>{name}</label>
      <div className={imageStyles.row}>
        <input className={styles.input} value={value} onChange={e => onChange(e.target.value)} placeholder="/images/photo.jpg" />
        <button type="button" className={imageStyles.uploadBtn} onClick={() => inputRef.current?.click()} disabled={busy}>
          {busy ? 'Preparing…' : 'Choose photo'}
        </button>
      </div>
      <input ref={inputRef} type="file" accept="image/*" hidden onChange={handleFile} />
      {value && <img src={photoSrc(value)} alt="preview" className={imageStyles.preview} />}
      {error && <span className={imageStyles.error}>{error}</span>}
    </div>
  );
}
