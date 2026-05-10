import styles from './fields.module.scss';

interface Props {
  name: string;
  value: string;
  onChange: (value: string) => void;
}

export default function TextareaField({ name, value, onChange }: Props) {
  return (
    <div className={styles.field}>
      <label className={styles.label}>{name}</label>
      <textarea className={styles.textarea} value={value} onChange={e => onChange(e.target.value)} />
    </div>
  );
}
