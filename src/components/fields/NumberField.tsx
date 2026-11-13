import { useId } from 'react';
import styles from './fields.module.scss';

interface Props {
  label: string;
  value: number | undefined;
  onChange: (value: number | undefined) => void;
}

export default function NumberField({ label, value, onChange }: Props) {
  const id = useId();
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>{label}</label>
      <input
        id={id}
        type="number"
        className={styles.input}
        value={value ?? ''}
        onChange={e => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
      />
    </div>
  );
}
