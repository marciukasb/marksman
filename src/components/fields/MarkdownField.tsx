import MDEditor from '@uiw/react-md-editor';
import styles from './fields.module.scss';

interface Props {
  name: string;
  value: string;
  onChange: (value: string) => void;
}

export default function MarkdownField({ name, value, onChange }: Props) {
  return (
    <div className={styles.field} data-color-mode="dark">
      <label className={styles.label}>{name}</label>
      <MDEditor
        value={value}
        onChange={v => onChange(v ?? '')}
        height={400}
        preview="live"
      />
    </div>
  );
}
