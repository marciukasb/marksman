import styles from './fields.module.scss';

interface Props {
  name: string;
  value: string;
  onChange: (value: string) => void;
}

export default function DateField({ name, value, onChange }: Props) {
  return (
    <div className={styles.field}>
      <label className={styles.label}>{name}</label>
      <input type="date" className={styles.input} value={value} onChange={e => onChange(e.target.value)} />
    </div>
  );
}
