import { useRef } from 'react';
import styles from './PhotoPicker.module.scss';

interface Props {
  photos: string[];
  photoSrc: (url: string) => string;
  onPick: (url: string) => void;
  onAddFiles: (files: File[]) => void;
  onClose: () => void;
}

// Lets the author place one of the post's photos in the text, or add new ones
export default function PhotoPicker({ photos, photoSrc, onPick, onAddFiles, onClose }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.dialog} role="dialog" aria-label="Insert a photo" onClick={e => e.stopPropagation()}>
        <h2>Insert a photo</h2>
        {photos.length > 0 ? (
          <ul className={styles.grid}>
            {photos.map((url, i) => (
              <li key={url}>
                <button type="button" onClick={() => onPick(url)}>
                  <img src={photoSrc(url)} alt={`Photo ${i + 1}`} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.empty}>This post has no photos yet.</p>
        )}
        <div className={styles.actions}>
          <button type="button" onClick={() => inputRef.current?.click()}>Add new photos…</button>
          <button type="button" onClick={onClose}>Cancel</button>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={e => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = '';
            if (files.length > 0) onAddFiles(files);
          }}
        />
      </div>
    </div>
  );
}
