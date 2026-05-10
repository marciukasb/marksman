import styles from './Button.module.scss';

type Variant = 'primary' | 'secondary' | 'danger';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  loading?: boolean;
}

export default function Button({ variant = 'primary', loading, children, disabled, ...props }: ButtonProps) {
  return (
    <button
      className={`${styles.button} ${styles[variant]}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? 'Loading…' : children}
    </button>
  );
}
