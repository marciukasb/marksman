import { useRef, useState } from 'react';
import { uploadImage } from '../../lib/github';
import styles from './fields.module.scss';
import imageStyles from './ImageField.module.scss';

interface Props {
  name: string;
  value: string;
  onChange: (value: string) => void;
  pat: string;
  owner: string;
  repo: string;
  imageFolder: string;
}

export default function ImageField({ name, value, onChange, pat, owner, repo, imageFolder }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError('');
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64 = (reader.result as string).split(',')[1];
        const path = await uploadImage(pat, owner, repo, imageFolder, file.name, base64);
        onChange(path);
      } catch {
        setError('Upload failed.');
      } finally {
        setUploading(false);
      }
    };
    reader.onerror = () => {
      setError('Could not read file.');
      setUploading(false);
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className={styles.field}>
      <label className={styles.label}>{name}</label>
      <div className={imageStyles.row}>
        <input className={styles.input} value={value} onChange={e => onChange(e.target.value)} placeholder="/images/photo.png" />
        <button type="button" className={imageStyles.uploadBtn} onClick={() => inputRef.current?.click()} disabled={uploading}>
          {uploading ? 'Uploading…' : 'Upload'}
        </button>
      </div>
      <input ref={inputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFile} />
      {value && <img src={value} alt="preview" className={imageStyles.preview} />}
      {error && <span className={imageStyles.error}>{error}</span>}
    </div>
  );
}
