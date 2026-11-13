/**
 * Prefix (CIDR) and range arithmetic shared by the calculators, summarizer,
 * overlap checker and ACL builder.
 */
import { bitsOf, formatIP, formatIPv4, maxValue, ParseError, parseIP, parseIPv4, type IP, type IPVersion } from './ip';

/** A normalized prefix: `network` has no host bits set. */
export interface Prefix {
  version: IPVersion;
  network: bigint;
  len: number;
}

/** An inclusive address range. */
export interface Range {
  version: IPVersion;
  start: bigint;
  end: bigint;
}

export interface ParsedCIDR {
  ip: IP;
  len: number;
  /** True when the entered address had host bits set (e.g. 10.0.0.5/24). */
  hostBitsSet: boolean;
  prefix: Prefix;
}

export const hostMask = (version: IPVersion, len: number): bigint => (1n << BigInt(bitsOf(version) - len)) - 1n;

export const netMask = (version: IPVersion, len: number): bigint => maxValue(version) ^ hostMask(version, len);

export const blockSize = (version: IPVersion, len: number): bigint => 1n << BigInt(bitsOf(version) - len);

export function makePrefix(version: IPVersion, value: bigint, len: number): Prefix {
  return { version, network: value & netMask(version, len), len };
}

export const prefixLast = (p: Prefix): bigint => p.network | hostMask(p.version, p.len);

export const prefixToRange = (p: Prefix): Range => ({ version: p.version, start: p.network, end: prefixLast(p) });

export function formatPrefix(p: Prefix): string {
  return `${formatIP({ version: p.version, value: p.network })}/${p.len}`;
}

export function formatRange(r: Range): string {
  const a = formatIP({ version: r.version, value: r.start });
  const b = formatIP({ version: r.version, value: r.end });
  return r.start === r.end ? a : `${a} - ${b}`;
}

/** Prefix length for a contiguous netmask, or null if the mask is not contiguous. */
export function maskToLen(version: IPVersion, mask: bigint): number | null {
  const bits = bitsOf(version);
  const inverted = maxValue(version) ^ mask;
  // A contiguous mask inverts to 2^n - 1.
  if ((inverted & (inverted + 1n)) !== 0n) return null;
  return bits - inverted.toString(2).replace(/^0+/, '').length;
}

/** Parse a dotted-quad netmask (255.255.255.0) or wildcard (0.0.0.255) into a length. */
export function parseV4Mask(input: string, allowWildcard = false): number {
  const value = parseIPv4(input);
  const len = maskToLen(4, value);
  if (len !== null) return len;
  if (allowWildcard) {
    const wl = maskToLen(4, maxValue(4) ^ value);
    if (wl !== null) return wl;
  }
  throw new ParseError(`"${input.trim()}" is not a contiguous netmask`);
}

function parseLength(version: IPVersion, raw: string, original: string): number {
  const s = raw.trim();
  if (/^\d{1,3}$/.test(s)) {
    const len = Number(s);
    if (len > bitsOf(version)) throw new ParseError(`Prefix length /${len} is too long for IPv${version} in "${original}"`);
    return len;
  }
  if (version === 4 && s.includes('.')) return parseV4Mask(s);
  throw new ParseError(`"${raw}" is not a valid prefix length in "${original}"`);
}

/**
 * Parse "addr/len", "addr/255.255.255.0", "addr 255.255.255.0" or a bare address
 * (treated as a host route).
 */
export function parseCIDR(input: string): ParsedCIDR {
  const s = input.trim();
  if (s === '') throw new ParseError('Enter an address or prefix');
  let addrPart = s;
  let lenPart: string | null = null;
  if (s.includes('/')) {
    const i = s.indexOf('/');
    addrPart = s.slice(0, i);
    lenPart = s.slice(i + 1);
  } else if (/\s/.test(s)) {
    const parts = s.split(/\s+/);
    if (parts.length !== 2) throw new ParseError(`Cannot parse "${s}"`);
    [addrPart, lenPart] = parts;
  }
  const ip = parseIP(addrPart);
  const len = lenPart === null ? bitsOf(ip.version) : parseLength(ip.version, lenPart, s);
  const prefix = makePrefix(ip.version, ip.value, len);
  return { ip, len, prefix, hostBitsSet: prefix.network !== ip.value };
}

/** Parse a prefix, a single address, or a range "a - b" / "a-b" into a Range. */
export function parseRangeOrPrefix(input: string): Range {
  const s = input.trim();
  const dash = s.match(/^([^\s-]+)\s*-\s*([^\s-]+)$/);
  if (dash) {
    const a = parseIP(dash[1]);
    const b = parseIP(dash[2]);
    if (a.version !== b.version) throw new ParseError(`Range "${s}" mixes IPv4 and IPv6`);
    if (a.value > b.value) throw new ParseError(`Range "${s}" ends before it starts`);
    return { version: a.version, start: a.value, end: b.value };
  }
  return prefixToRange(parseCIDR(s).prefix);
}

export interface ListEntry<T> {
  line: number;
  text: string;
  value?: T;
  error?: string;
}

/**
 * Split multi-line input into entries. Entries are separated by newlines,
 * commas or semicolons; "#" starts a comment.
 */
export function parseList<T>(text: string, parse: (s: string) => T): ListEntry<T>[] {
  const out: ListEntry<T>[] = [];
  text.split('\n').forEach((rawLine, idx) => {
    const line = rawLine.replace(/#.*$/, '');
    for (const piece of line.split(/[,;]/)) {
      const t = piece.trim();
      if (!t) continue;
      try {
        out.push({ line: idx + 1, text: t, value: parse(t) });
      } catch (e) {
        out.push({ line: idx + 1, text: t, error: (e as Error).message });
      }
    }
  });
  return out;
}

/** Decompose an inclusive range into the minimal list of aligned prefixes. */
export function rangeToPrefixes(r: Range): Prefix[] {
  const bits = bitsOf(r.version);
  const out: Prefix[] = [];
  let start = r.start;
  while (start <= r.end) {
    let k = 0;
    while (k < bits && ((start >> BigInt(k)) & 1n) === 0n) k++;
    while (k > 0 && start + (1n << BigInt(k)) - 1n > r.end) k--;
    out.push({ version: r.version, network: start, len: bits - k });
    start += 1n << BigInt(k);
  }
  return out;
}

/** Sort and merge overlapping or adjacent ranges (per address family). */
export function mergeRanges(ranges: Range[]): Range[] {
  const sorted = [...ranges].sort((a, b) =>
    a.version !== b.version ? a.version - b.version : a.start < b.start ? -1 : a.start > b.start ? 1 : 0,
  );
  const out: Range[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && last.version === r.version && r.start <= last.end + 1n) {
      if (r.end > last.end) last.end = r.end;
    } else {
      out.push({ ...r });
    }
  }
  return out;
}

/** Exact aggregation: the fewest prefixes covering exactly the same addresses. */
export function summarize(ranges: Range[]): Prefix[] {
  return mergeRanges(ranges).flatMap(rangeToPrefixes);
}

/** Smallest single prefix covering every given range (may include extra space). */
export function coveringPrefix(ranges: Range[]): Prefix | null {
  if (ranges.length === 0) return null;
  const version = ranges[0].version;
  let lo = ranges[0].start;
  let hi = ranges[0].end;
  for (const r of ranges) {
    if (r.version !== version) throw new ParseError('Cannot cover a mix of IPv4 and IPv6');
    if (r.start < lo) lo = r.start;
    if (r.end > hi) hi = r.end;
  }
  const bits = bitsOf(version);
  const diff = lo ^ hi;
  const len = diff === 0n ? bits : bits - diff.toString(2).length;
  return makePrefix(version, lo, len);
}

export const rangeSize = (r: Range): bigint => r.end - r.start + 1n;

export type Relation = 'equal' | 'contains' | 'within' | 'partial' | 'disjoint';

/** How range `a` relates to range `b`. */
export function relation(a: Range, b: Range): Relation {
  if (a.version !== b.version || a.end < b.start || b.end < a.start) return 'disjoint';
  if (a.start === b.start && a.end === b.end) return 'equal';
  if (a.start <= b.start && a.end >= b.end) return 'contains';
  if (b.start <= a.start && b.end >= a.end) return 'within';
  return 'partial';
}

export function rangeContains(r: Range, ip: IP): boolean {
  return r.version === ip.version && ip.value >= r.start && ip.value <= r.end;
}

/** Split a prefix into subnets of `newLen`, returning at most `limit` of them. */
export function splitPrefix(p: Prefix, newLen: number, limit = 256): { count: bigint; subnets: Prefix[] } {
  if (newLen < p.len || newLen > bitsOf(p.version)) return { count: 0n, subnets: [] };
  const count = 1n << BigInt(newLen - p.len);
  const step = blockSize(p.version, newLen);
  const subnets: Prefix[] = [];
  for (let i = 0n; i < count && i < BigInt(limit); i++) {
    subnets.push({ version: p.version, network: p.network + i * step, len: newLen });
  }
  return { count, subnets };
}

export const formatMaskV4 = (len: number): string => formatIPv4(netMask(4, len));
export const formatWildcardV4 = (len: number): string => formatIPv4(hostMask(4, len));

/** Format a BigInt with thousands separators. */
export function formatBig(n: bigint): string {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** Human-friendly count: exact up to 2^53, otherwise "2^n" notation. */
export function formatCount(n: bigint): string {
  if (n > 0n && (n & (n - 1n)) === 0n && n > 1n << 48n) return `2^${n.toString(2).length - 1}`;
  return formatBig(n);
}
