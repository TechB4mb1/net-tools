/**
 * Core IP address parsing and formatting. Addresses are held as BigInt so that
 * IPv4 and IPv6 share the same arithmetic.
 */

export type IPVersion = 4 | 6;

export interface IP {
  version: IPVersion;
  value: bigint;
}

export class ParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ParseError';
  }
}

export const bitsOf = (version: IPVersion): number => (version === 4 ? 32 : 128);

export const maxValue = (version: IPVersion): bigint => (1n << BigInt(bitsOf(version))) - 1n;

/** Strict dotted-quad parser. Rejects leading zeros, which some stacks read as octal. */
export function parseIPv4(input: string): bigint {
  const s = input.trim();
  const parts = s.split('.');
  if (parts.length !== 4) throw new ParseError(`"${s}" is not a valid IPv4 address`);
  let value = 0n;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) throw new ParseError(`"${s}" is not a valid IPv4 address`);
    if (part.length > 1 && part.startsWith('0')) {
      throw new ParseError(`"${s}" has a leading zero in an octet (ambiguous: some systems read it as octal)`);
    }
    const n = Number(part);
    if (n > 255) throw new ParseError(`Octet ${n} in "${s}" is greater than 255`);
    value = (value << 8n) | BigInt(n);
  }
  return value;
}

/** RFC 4291 text parser: supports "::", embedded IPv4 tails, brackets and zone IDs (ignored). */
export function parseIPv6(input: string): bigint {
  const original = input.trim();
  let s = original;
  if (s.startsWith('[') && s.endsWith(']')) s = s.slice(1, -1);
  const zone = s.indexOf('%');
  if (zone >= 0) s = s.slice(0, zone);
  const invalid = () => new ParseError(`"${original}" is not a valid IPv6 address`);
  if (!/^[0-9a-fA-F:.]+$/.test(s) || !s.includes(':')) throw invalid();

  let tail: number[] = [];
  if (s.includes('.')) {
    const lastColon = s.lastIndexOf(':');
    const v4 = parseIPv4(s.slice(lastColon + 1));
    tail = [Number(v4 >> 16n), Number(v4 & 0xffffn)];
    s = s.slice(0, lastColon + 1);
    if (!s.endsWith('::')) s = s.slice(0, -1);
    if (s === '') throw invalid();
  }

  const halves = s.split('::');
  if (halves.length > 2) throw invalid();
  const groups = (part: string): number[] =>
    part === ''
      ? []
      : part.split(':').map((g) => {
          if (!/^[0-9a-fA-F]{1,4}$/.test(g)) throw invalid();
          return parseInt(g, 16);
        });

  const head = groups(halves[0]);
  let all: number[];
  if (halves.length === 2) {
    const rest = groups(halves[1]);
    const used = head.length + rest.length + tail.length;
    if (used > 7) throw invalid();
    all = [...head, ...new Array<number>(8 - used).fill(0), ...rest, ...tail];
  } else {
    all = [...head, ...tail];
    if (all.length !== 8) throw invalid();
  }
  return all.reduce((acc, g) => (acc << 16n) | BigInt(g), 0n);
}

export function parseIP(input: string): IP {
  const s = input.trim();
  if (s === '') throw new ParseError('Enter an IP address');
  if (s.includes(':')) return { version: 6, value: parseIPv6(s) };
  return { version: 4, value: parseIPv4(s) };
}

export function formatIPv4(value: bigint): string {
  return [24n, 16n, 8n, 0n].map((shift) => ((value >> shift) & 0xffn).toString()).join('.');
}

export function ipv6Groups(value: bigint): number[] {
  const out: number[] = [];
  for (let i = 7; i >= 0; i--) out.push(Number((value >> BigInt(i * 16)) & 0xffffn));
  return out;
}

/** Fully expanded form, e.g. 2001:0db8:0000:0000:0000:0000:0000:0001. */
export function expandIPv6(value: bigint): string {
  return ipv6Groups(value)
    .map((g) => g.toString(16).padStart(4, '0'))
    .join(':');
}

/** RFC 5952 canonical form. IPv4-mapped addresses use mixed notation (::ffff:192.0.2.1). */
export function formatIPv6(value: bigint): string {
  if (value >> 32n === 0xffffn) return `::ffff:${formatIPv4(value & 0xffffffffn)}`;
  const groups = ipv6Groups(value);
  let bestStart = -1;
  let bestLen = 0;
  for (let i = 0; i < 8; ) {
    if (groups[i] !== 0) {
      i++;
      continue;
    }
    let j = i;
    while (j < 8 && groups[j] === 0) j++;
    if (j - i > bestLen) {
      bestStart = i;
      bestLen = j - i;
    }
    i = j;
  }
  const hex = groups.map((g) => g.toString(16));
  if (bestLen < 2) return hex.join(':');
  const left = hex.slice(0, bestStart).join(':');
  const right = hex.slice(bestStart + bestLen).join(':');
  return `${left}::${right}`;
}

export function formatIP(ip: IP): string {
  return ip.version === 4 ? formatIPv4(ip.value) : formatIPv6(ip.value);
}

/** Binary string grouped by octet (IPv4) or hextet (IPv6). */
export function toBinary(ip: IP, separator = '.'): string {
  const bits = ip.value.toString(2).padStart(bitsOf(ip.version), '0');
  const size = ip.version === 4 ? 8 : 16;
  const chunks: string[] = [];
  for (let i = 0; i < bits.length; i += size) chunks.push(bits.slice(i, i + size));
  return chunks.join(separator);
}

export function toHex(ip: IP): string {
  return '0x' + ip.value.toString(16).padStart(bitsOf(ip.version) / 4, '0');
}

/** Reverse-DNS (PTR) owner name for a single address. */
export function ptrName(ip: IP): string {
  if (ip.version === 4) {
    return formatIPv4(ip.value).split('.').reverse().join('.') + '.in-addr.arpa';
  }
  return ip.value.toString(16).padStart(32, '0').split('').reverse().join('.') + '.ip6.arpa';
}
