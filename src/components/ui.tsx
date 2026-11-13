import { useId, useState, type ReactNode } from 'react';

export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      setTimeout(() => setDone(false), 1200);
    } catch {
      /* clipboard unavailable (e.g. insecure context) */
    }
  };
  return (
    <button type="button" className="copy" onClick={copy} title={`Copy ${text.length > 40 ? '' : text}`} aria-label={label}>
      {done ? 'Copied' : label}
    </button>
  );
}

export function ToolHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="tool-header">
      <h1>{title}</h1>
      {children && <p className="lede">{children}</p>}
    </header>
  );
}

export function Card({ title, children, actions }: { title?: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="card">
      {(title || actions) && (
        <div className="card-head">
          {title && <h2>{title}</h2>}
          {actions && <div className="card-actions">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

interface FieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: ReactNode;
  mono?: boolean;
  width?: string;
  type?: 'text' | 'number';
  autoFocus?: boolean;
}

export function Field({ label, value, onChange, placeholder, hint, mono = true, width, type = 'text', autoFocus }: FieldProps) {
  const id = useId();
  return (
    <div className="field" style={width ? { maxWidth: width } : undefined}>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type={type}
        className={mono ? 'mono' : undefined}
        value={value}
        placeholder={placeholder}
        spellCheck={false}
        autoComplete="off"
        autoCapitalize="off"
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

export function TextArea({
  label,
  value,
  onChange,
  placeholder,
  rows = 8,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  hint?: ReactNode;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <textarea
        id={id}
        className="mono"
        rows={rows}
        wrap="off"
        value={value}
        placeholder={placeholder}
        spellCheck={false}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

export function Select<T extends string | number>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        value={String(value)}
        onChange={(e) => {
          const opt = options.find((o) => String(o.value) === e.target.value);
          if (opt) onChange(opt.value);
        }}
      >
        {options.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function Checkbox({ label, checked, onChange }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="checkbox">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

export type KVRow = [label: string, value: ReactNode, copy?: string];

/** Two-column key/value list with per-row copy buttons. */
export function KeyValue({ rows }: { rows: (KVRow | null | false)[] }) {
  return (
    <dl className="kv">
      {rows.filter(Boolean).map((row) => {
        const [label, value, copy] = row as KVRow;
        const copyText = copy ?? (typeof value === 'string' ? value : undefined);
        return (
          <div className="kv-row" key={label}>
            <dt>{label}</dt>
            <dd>
              <span className="mono">{value}</span>
              {copyText && <CopyButton text={copyText} />}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  return (
    <p className="error" role="alert">
      {children}
    </p>
  );
}

export function Notice({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'warn' }) {
  return <p className={`notice notice-${tone}`}>{children}</p>;
}

export function LineErrors({ errors }: { errors: { line: number; text: string; error?: string }[] }) {
  const bad = errors.filter((e) => e.error);
  if (!bad.length) return null;
  return (
    <ul className="line-errors" role="alert">
      {bad.map((e, i) => (
        <li key={i}>
          <span className="mono">Line {e.line}:</span> {e.error}
        </li>
      ))}
    </ul>
  );
}

export function CodeBlock({ code, empty = 'Nothing to show yet.' }: { code: string; empty?: string }) {
  if (!code) return <p className="muted">{empty}</p>;
  return (
    <div className="code-wrap">
      <pre className="code">{code}</pre>
      <div className="code-copy">
        <CopyButton text={code} />
      </div>
    </div>
  );
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value mono">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

export function Row({ children }: { children: ReactNode }) {
  return <div className="row">{children}</div>;
}
