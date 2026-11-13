import { useId } from 'react';
import styles from './fields.module.scss';

interface Props {
  name: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}

export default function SelectField({ name, value, options, onChange }: Props) {
  const id = useId();
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>{name}</label>
      <select id={id} className={styles.select} value={value} onChange={e => onChange(e.target.value)}>
        <option value="">— Select —</option>
        {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
      </select>
    </div>
  );
}
