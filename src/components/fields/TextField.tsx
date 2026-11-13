import { useId } from 'react';
import styles from './fields.module.scss';

interface Props {
  name: string;
  value: string;
  onChange: (value: string) => void;
}

export default function TextField({ name, value, onChange }: Props) {
  const id = useId();
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>{name}</label>
      <input id={id} className={styles.input} value={value} onChange={e => onChange(e.target.value)} />
    </div>
  );
}
