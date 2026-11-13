import { useCallback, useState } from 'react';
import { DEFAULT_VALUES, fillCommand, type Cmd, type PlaceholderValues, type Task } from '../data/troubleshooting';
import { readHash } from '../hooks';
import { CopyButton, Field } from './ui';

export type Os = 'both' | 'windows' | 'debian';

const STORAGE_PREFIX = 'net-tools:ts:';

function storageGet(key: string): string | null {
  try {
    return window.localStorage.getItem(STORAGE_PREFIX + key);
  } catch {
    return null;
  }
}

function storageSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(STORAGE_PREFIX + key, value);
  } catch {
    /* storage unavailable */
  }
}

/**
 * Like useQueryState, but also remembered in localStorage so the values carry
 * over between the command reference and the checklist.
 */
function useSharedValue(key: string, defaultValue: string): [string, (v: string) => void] {
  const [value, setValue] = useState(() => readHash().params.get(key) ?? storageGet(key) ?? defaultValue);
  const update = useCallback(
    (v: string) => {
      setValue(v);
      storageSet(key, v);
      const { path, params } = readHash();
      if (v === defaultValue) params.delete(key);
      else params.set(key, v);
      const qs = params.toString();
      window.history.replaceState(null, '', `#${path}${qs ? `?${qs}` : ''}`);
    },
    [key, defaultValue],
  );
  return [value, update];
}

export function useTroubleshootingInputs() {
  const [os, setOs] = useSharedValue('os', 'both');
  const [host, setHost] = useSharedValue('host', DEFAULT_VALUES.host);
  const [port, setPort] = useSharedValue('port', DEFAULT_VALUES.port);
  const [gateway, setGateway] = useSharedValue('gw', DEFAULT_VALUES.gateway);
  const [iface, setIface] = useSharedValue('iface', DEFAULT_VALUES.iface);
  const [adapter, setAdapter] = useSharedValue('adapter', DEFAULT_VALUES.adapter);
  const values: PlaceholderValues = { host, port, gateway, iface, adapter };
  const setters: Record<keyof PlaceholderValues, (v: string) => void> = {
    host: setHost,
    port: setPort,
    gateway: setGateway,
    iface: setIface,
    adapter: setAdapter,
  };
  const safeOs: Os = os === 'windows' || os === 'debian' ? os : 'both';
  return { os: safeOs, setOs: (v: Os) => setOs(v), values, setters };
}

export function OsToggle({ os, onChange }: { os: Os; onChange: (os: Os) => void }) {
  const options: { id: Os; label: string }[] = [
    { id: 'both', label: 'Both' },
    { id: 'windows', label: 'Windows' },
    { id: 'debian', label: 'Debian' },
  ];
  return (
    <div className="field">
      <span className="field-label" id="os-label">
        Operating system
      </span>
      <div className="segmented" role="radiogroup" aria-labelledby="os-label">
        {options.map((o) => (
          <button key={o.id} type="button" role="radio" aria-checked={os === o.id} className={os === o.id ? 'on' : undefined} onClick={() => onChange(o.id)}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function PlaceholderFields({
  os,
  values,
  setters,
}: {
  os: Os;
  values: PlaceholderValues;
  setters: Record<keyof PlaceholderValues, (v: string) => void>;
}) {
  return (
    <div className="placeholder-grid">
      <Field label="Target host" value={values.host} onChange={setters.host} placeholder={DEFAULT_VALUES.host} />
      <Field label="Port" value={values.port} onChange={setters.port} placeholder={DEFAULT_VALUES.port} />
      <Field label="Gateway" value={values.gateway} onChange={setters.gateway} placeholder={DEFAULT_VALUES.gateway} />
      {os !== 'windows' && <Field label="Debian interface" value={values.iface} onChange={setters.iface} placeholder={DEFAULT_VALUES.iface} />}
      {os !== 'debian' && <Field label="Windows adapter" value={values.adapter} onChange={setters.adapter} placeholder={DEFAULT_VALUES.adapter} />}
    </div>
  );
}

function CommandLine({ c, platform, values }: { c: Cmd; platform: 'windows' | 'debian'; values: PlaceholderValues }) {
  const text = fillCommand(c.cmd, values);
  const root = platform === 'debian' && /(^|\s|&&\s*)sudo\s/.test(c.cmd);
  return (
    <li className="cmd">
      <div className="cmd-line">
        <code className="cmd-text">{text}</code>
        <CopyButton text={text} />
      </div>
      {(c.ps || c.admin || root || c.pkg || c.note) && (
        <div className="cmd-meta">
          {c.ps && <span className="tag tag-ps">PowerShell</span>}
          {(c.admin || root) && <span className="tag tag-admin">{platform === 'windows' ? 'Run as admin' : 'root'}</span>}
          {c.pkg && (
            <span className="tag tag-pkg" title={`sudo apt install ${c.pkg}`}>
              apt install {c.pkg}
            </span>
          )}
          {c.note && <span className="cmd-note">{c.note}</span>}
        </div>
      )}
    </li>
  );
}

export function TaskCommands({ task, os, values, showTitle = true }: { task: Task; os: Os; values: PlaceholderValues; showTitle?: boolean }) {
  const platforms = (os === 'both' ? ['windows', 'debian'] : [os]) as ('windows' | 'debian')[];
  return (
    <div className="task">
      {showTitle && <h3>{task.title}</h3>}
      <div className={`task-cols ${platforms.length === 2 ? 'two' : ''}`}>
        {platforms.map((p) => (
          <div key={p} className="task-col">
            {platforms.length === 2 && <div className={`os-label os-${p}`}>{p === 'windows' ? 'Windows' : 'Debian'}</div>}
            <ul className="cmd-list">
              {task[p].map((c, i) => (
                <CommandLine key={i} c={c} platform={p} values={values} />
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
