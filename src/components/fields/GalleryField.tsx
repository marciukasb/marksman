import { useRef, useState } from 'react';
import { moveItem } from '../../lib/order';
import styles from './fields.module.scss';
import galleryStyles from './GalleryField.module.scss';

interface Props {
  label: string;
  value: string[];
  onChange: (urls: string[]) => void;
  onAddFiles: (files: File[]) => void | Promise<void>;
  photoSrc: (url: string) => string;
  busy?: boolean;
  errors?: string[];
}

// Vinted-style photo strip: drop or pick photos, drag (or use the arrows) to reorder; the first is the cover
export default function GalleryField({ label, value, onChange, onAddFiles, photoSrc, busy, errors = [] }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dropActive, setDropActive] = useState(false);

  function handleDrop(e: React.DragEvent, index?: number) {
    e.preventDefault();
    setDropActive(false);
    const files = Array.from(e.dataTransfer.files ?? []);
    if (files.length > 0) {
      onAddFiles(files);
    } else if (dragFrom !== null && index !== undefined) {
      onChange(moveItem(value, dragFrom, index));
    }
    setDragFrom(null);
  }

  return (
    <div className={styles.field}>
      <label className={styles.label}>{label}</label>
      <ul className={galleryStyles.strip}>
        {value.map((url, i) => (
          <li
            key={url}
            className={`${galleryStyles.item} ${dragFrom === i ? galleryStyles.dragging : ''}`}
            draggable
            onDragStart={() => setDragFrom(i)}
            onDragOver={e => e.preventDefault()}
            onDrop={e => {
              e.stopPropagation();
              handleDrop(e, i);
            }}
          >
            <img src={photoSrc(url)} alt={`Photo ${i + 1}`} className={galleryStyles.thumb} />
            {i === 0 && <span className={galleryStyles.cover}>Cover</span>}
            <div className={galleryStyles.controls}>
              <button type="button" aria-label="Move left" disabled={i === 0} onClick={() => onChange(moveItem(value, i, i - 1))}>←</button>
              <button type="button" aria-label="Remove photo" onClick={() => onChange(value.filter((_, j) => j !== i))}>✕</button>
              <button type="button" aria-label="Move right" disabled={i === value.length - 1} onClick={() => onChange(moveItem(value, i, i + 1))}>→</button>
            </div>
          </li>
        ))}
      </ul>
      <div
        className={`${galleryStyles.drop} ${dropActive ? galleryStyles.dropActive : ''}`}
        onDragOver={e => {
          e.preventDefault();
          setDropActive(true);
        }}
        onDragLeave={() => setDropActive(false)}
        onDrop={e => handleDrop(e)}
      >
        {busy ? 'Preparing photos…' : 'Drop photos here or'}{' '}
        {!busy && (
          <button type="button" className={galleryStyles.pick} onClick={() => inputRef.current?.click()}>
            choose files
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={e => {
          const files = Array.from(e.target.files ?? []);
          if (files.length > 0) onAddFiles(files);
          e.target.value = '';
        }}
      />
      {errors.map(err => <span key={err} className={galleryStyles.error}>{err}</span>)}
    </div>
  );
}
