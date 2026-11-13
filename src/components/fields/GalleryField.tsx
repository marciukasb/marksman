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

  const pick = () => inputRef.current?.click();
  const empty = value.length === 0;

  return (
    <div className={styles.field}>
      <label className={styles.label}>{label}</label>
      <div
        role="group"
        aria-label="Photo drop area"
        className={`${galleryStyles.area} ${empty ? galleryStyles.empty : ''} ${dropActive ? galleryStyles.dropActive : ''}`}
        onDragOver={e => {
          e.preventDefault();
          if (e.dataTransfer.types.includes('Files')) setDropActive(true);
        }}
        onDragLeave={e => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropActive(false);
        }}
        onDrop={e => handleDrop(e)}
      >
        {empty ? (
          <div className={galleryStyles.start}>
            <button type="button" className={galleryStyles.upload} onClick={pick} disabled={busy}>
              {busy ? 'Preparing photos…' : '+ Upload photos'}
            </button>
            <span>or drag them here</span>
          </div>
        ) : (
          <div className={galleryStyles.tiles}>
            <button type="button" className={galleryStyles.add} onClick={pick} disabled={busy} aria-label="Add more photos">
              {busy ? <span className={galleryStyles.addBusy}>Preparing photos…</span> : '+'}
            </button>
            <ul className={galleryStyles.strip}>
              {value.map((url, i) => (
                <li
                  key={url}
                  className={`${galleryStyles.item} ${dragFrom === i ? galleryStyles.dragging : ''}`}
                  draggable
                  onDragStart={() => setDragFrom(i)}
                  onDragEnd={() => setDragFrom(null)}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => {
                    e.stopPropagation();
                    handleDrop(e, i);
                  }}
                >
                  <img src={photoSrc(url)} alt={`Photo ${i + 1}`} className={galleryStyles.thumb} draggable={false} />
                  {i === 0 && <span className={galleryStyles.cover}>Cover</span>}
                  <button type="button" className={galleryStyles.remove} aria-label="Remove photo" onClick={() => onChange(value.filter((_, j) => j !== i))}>✕</button>
                  <div className={galleryStyles.controls}>
                    <button type="button" aria-label="Move left" disabled={i === 0} onClick={() => onChange(moveItem(value, i, i - 1))}>←</button>
                    <button type="button" aria-label="Move right" disabled={i === value.length - 1} onClick={() => onChange(moveItem(value, i, i + 1))}>→</button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
        {!empty && <p className={galleryStyles.hint}>Drag to change the order. The first photo is the cover. Drop more photos anywhere in this box.</p>}
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
