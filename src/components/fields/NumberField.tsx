import styles from './fields.module.scss';

interface Props {
  label: string;
  value: number | undefined;
  onChange: (value: number | undefined) => void;
}

export default function NumberField({ label, value, onChange }: Props) {
  return (
    <div className={styles.field}>
      <label className={styles.label}>{label}</label>
      <input
        type="number"
        className={styles.input}
        value={value ?? ''}
        onChange={e => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
      />
    </div>
  );
}
