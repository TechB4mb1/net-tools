/** MAC address parsing, formatting and EUI-64 derivation. */
import { formatIPv6, ParseError } from './ip';

export type MacStyle = 'colon' | 'colon-upper' | 'hyphen' | 'cisco' | 'bare';

export const MAC_STYLES: { id: MacStyle; label: string }[] = [
  { id: 'colon', label: 'Linux / Unix' },
  { id: 'colon-upper', label: 'Uppercase colon' },
  { id: 'hyphen', label: 'Windows' },
  { id: 'cisco', label: 'Cisco' },
  { id: 'bare', label: 'Bare hex' },
];

/** Accepts aa:bb:cc:dd:ee:ff, AA-BB-..., aabb.ccdd.eeff, aabbccddeeff (case-insensitive). */
export function parseMAC(input: string): Uint8Array {
  const s = input.trim();
  const hex = s.replace(/[:\-.\s]/g, '');
  if (!/^[0-9a-fA-F]{12}$/.test(hex)) throw new ParseError(`"${s}" is not a valid 48-bit MAC address`);
  const bytes = new Uint8Array(6);
  for (let i = 0; i < 6; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

const hexByte = (b: number) => b.toString(16).padStart(2, '0');

export function formatMAC(bytes: Uint8Array, style: MacStyle): string {
  const pairs = Array.from(bytes, hexByte);
  switch (style) {
    case 'colon':
      return pairs.join(':');
    case 'colon-upper':
      return pairs.join(':').toUpperCase();
    case 'hyphen':
      return pairs.join('-').toUpperCase();
    case 'cisco':
      return [0, 2, 4].map((i) => pairs[i] + pairs[i + 1]).join('.');
    case 'bare':
      return pairs.join('');
  }
}

export interface MacFlags {
  multicast: boolean;
  broadcast: boolean;
  locallyAdministered: boolean;
}

export function macFlags(bytes: Uint8Array): MacFlags {
  return {
    multicast: (bytes[0] & 0x01) !== 0,
    broadcast: bytes.every((b) => b === 0xff),
    locallyAdministered: (bytes[0] & 0x02) !== 0,
  };
}

/** Upper-case 6-hex-digit OUI (first three bytes). */
export const ouiOf = (bytes: Uint8Array): string => Array.from(bytes.slice(0, 3), hexByte).join('').toUpperCase();

/** Modified EUI-64 interface identifier (RFC 4291 appendix A): flip U/L bit, insert FFFE. */
export function eui64(bytes: Uint8Array): bigint {
  const b = [bytes[0] ^ 0x02, bytes[1], bytes[2], 0xff, 0xfe, bytes[3], bytes[4], bytes[5]];
  return b.reduce((acc, x) => (acc << 8n) | BigInt(x), 0n);
}

/** SLAAC address for a /64 prefix (network value) and a MAC. */
export function eui64Address(prefix64: bigint, bytes: Uint8Array): string {
  return formatIPv6((prefix64 & ~((1n << 64n) - 1n)) | eui64(bytes));
}

export const linkLocalFromMAC = (bytes: Uint8Array): string => eui64Address(0xfe80n << 112n, bytes);

export interface OuiDb {
  names: string[];
  index: Record<string, number>;
}

let dbPromise: Promise<OuiDb> | null = null;

/** Lazily load the bundled IEEE OUI registry (a separate chunk). */
export function loadOuiDb(): Promise<OuiDb> {
  dbPromise ??= import('virtual:oui').then((m) => ({ names: m.names, index: m.index }));
  return dbPromise;
}

export function lookupVendor(db: OuiDb, bytes: Uint8Array): string | null {
  const i = db.index[ouiOf(bytes)];
  return i === undefined ? null : db.names[i];
}
