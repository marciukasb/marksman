import { useRef, useState } from 'react';
import MDEditor, { commands, type ICommand, type TextAreaTextApi } from '@uiw/react-md-editor';
import { insertAt } from '../../lib/order';
import PhotoPicker from './PhotoPicker';
import styles from './fields.module.scss';

interface Props {
  name: string;
  value: string;
  onChange: (value: string) => void;
  photoSrc: (url: string) => string;
  onAddFiles: (files: File[]) => Promise<{ urls: string[]; errors: string[] }>;
  // Present when the collection has a gallery field: inline photos come from (and go into) it
  galleryPhotos?: string[];
  onAddToGallery?: (urls: string[]) => void;
}

const imageMarkdown = (urls: string[]) => urls.map(url => `![](${url})`).join('\n\n');

export default function MarkdownField({ name, value, onChange, photoSrc, onAddFiles, galleryPhotos, onAddToGallery }: Props) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<TextAreaTextApi | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  async function addFiles(files: File[]): Promise<string[]> {
    setBusy(true);
    const result = await onAddFiles(files);
    setBusy(false);
    setErrors(result.errors);
    if (result.urls.length > 0) onAddToGallery?.(result.urls);
    return result.urls;
  }

  function insertFromPicker(urls: string[]) {
    setPickerOpen(false);
    if (urls.length > 0) apiRef.current?.replaceSelection(imageMarkdown(urls));
  }

  // Photos dropped or pasted straight into the text land at the cursor
  async function handleFiles(e: React.DragEvent | React.ClipboardEvent, files: File[]) {
    const images = files.filter(f => f.type.startsWith('image/'));
    if (images.length === 0) return;
    e.preventDefault();
    const cursor = wrapperRef.current?.querySelector('textarea')?.selectionStart ?? value.length;
    const urls = await addFiles(images);
    if (urls.length > 0) onChange(insertAt(value, cursor, `\n\n${imageMarkdown(urls)}\n\n`));
  }

  const insertPhotoCommand: ICommand = {
    name: 'insertPhoto',
    keyCommand: 'insertPhoto',
    buttonProps: { 'aria-label': 'Insert photo', title: 'Insert photo' },
    icon: (
      <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
        <path d="M6.002 5.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0z" />
        <path d="M2.002 1a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V3a2 2 0 0 0-2-2h-12zm12 1a1 1 0 0 1 1 1v6.5l-3.777-1.947a.5.5 0 0 0-.577.093l-3.71 3.71-2.66-1.772a.5.5 0 0 0-.63.062L1.002 12V3a1 1 0 0 1 1-1h12z" />
      </svg>
    ),
    execute: (_state, api) => {
      apiRef.current = api;
      setPickerOpen(true);
    },
  };

  return (
    <div
      ref={wrapperRef}
      className={styles.field}
      data-color-mode="dark"
      onDropCapture={e => handleFiles(e, Array.from(e.dataTransfer.files ?? []))}
      onPasteCapture={e => handleFiles(e, Array.from(e.clipboardData.files ?? []))}
    >
      <label className={styles.label}>{name}</label>
      <MDEditor
        value={value}
        onChange={v => onChange(v ?? '')}
        height={400}
        preview="live"
        commands={[...commands.getCommands().filter(c => c.name !== 'image'), commands.divider, insertPhotoCommand]}
        previewOptions={{
          components: {
            img: ({ src, alt }) => <img src={src ? photoSrc(src) : src} alt={alt ?? ''} style={{ maxWidth: '100%' }} />,
          },
        }}
      />
      {busy && <span style={{ fontSize: '0.8rem', color: '#888' }}>Preparing photos…</span>}
      {errors.map(err => <span key={err} style={{ fontSize: '0.8rem', color: '#e05555' }}>{err}</span>)}
      {pickerOpen && (
        <PhotoPicker
          photos={galleryPhotos ?? []}
          photoSrc={photoSrc}
          onPick={url => insertFromPicker([url])}
          onAddFiles={async files => insertFromPicker(await addFiles(files))}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}
