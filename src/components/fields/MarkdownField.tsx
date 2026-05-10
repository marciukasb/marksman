import { useRef, useState } from 'react';
import MDEditor, { commands } from '@uiw/react-md-editor';
import { uploadImage } from '../../lib/github';
import styles from './fields.module.scss';

interface Props {
  name: string;
  value: string;
  onChange: (value: string) => void;
  pat: string;
  owner: string;
  repo: string;
  imageFolder: string;
  imageUrlPrefix?: string;
}

export default function MarkdownField({ name, value, onChange, pat, owner, repo, imageFolder, imageUrlPrefix }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const apiRef = useRef<any>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64 = (reader.result as string).split(',')[1];
        const url = await uploadImage(pat, owner, repo, imageFolder, file.name, base64, imageUrlPrefix);
        if (apiRef.current) {
          const alt = file.name.replace(/\.[^.]+$/, '');
          apiRef.current.replaceSelection(`![${alt}](${url})`);
        }
      } finally {
        setUploading(false);
        e.target.value = '';
      }
    };
    reader.onerror = () => setUploading(false);
    reader.readAsDataURL(file);
  }

  const uploadImageCommand = {
    name: 'uploadImage',
    keyCommand: 'uploadImage',
    buttonProps: { 'aria-label': 'Upload image', title: 'Upload image' },
    icon: (
      <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
        <path d="M6.002 5.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0z"/>
        <path d="M2.002 1a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V3a2 2 0 0 0-2-2h-12zm12 1a1 1 0 0 1 1 1v6.5l-3.777-1.947a.5.5 0 0 0-.577.093l-3.71 3.71-2.66-1.772a.5.5 0 0 0-.63.062L1.002 12V3a1 1 0 0 1 1-1h12z"/>
        <path d="M9.5 9.5 9 9l-1-1-1 1-.5.5V11h4V9.5z" opacity=".4"/>
        <path d="M10 7.5a.5.5 0 0 1 .5.5v2h-1V8a.5.5 0 0 1 .5-.5zm-1.5 1a.5.5 0 0 1 .354.146l.5.5-.707.707-.147-.146V10h-1V8.5a.5.5 0 0 1 .5-.5z" opacity=".6"/>
      </svg>
    ),
    execute: (_state: any, api: any) => {
      apiRef.current = api;
      fileInputRef.current?.click();
    },
  };

  return (
    <div className={styles.field} data-color-mode="dark">
      <label className={styles.label}>{name}</label>
      <MDEditor
        value={value}
        onChange={v => onChange(v ?? '')}
        height={400}
        preview="live"
        commands={[...commands.getCommands(), commands.divider, uploadImageCommand]}
      />
      <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFile} />
      {uploading && <span style={{ fontSize: '0.8rem', color: '#888' }}>Uploading image…</span>}
    </div>
  );
}
