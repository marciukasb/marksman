import { useId } from 'react';
import styles from './fields.module.scss';

interface Props {
  name: string;
  value: string;
  onChange: (value: string) => void;
}

export default function TextareaField({ name, value, onChange }: Props) {
  const id = useId();
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>{name}</label>
      <textarea id={id} className={styles.textarea} value={value} onChange={e => onChange(e.target.value)} />
    </div>
  );
}
