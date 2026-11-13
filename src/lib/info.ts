/** Subnet details and address-type classification for the calculators. */
import { formatIP, formatIPv4, parseIP, ptrName, type IP } from './ip';
import { blockSize, formatMaskV4, formatWildcardV4, makePrefix, prefixLast, type ParsedCIDR, type Prefix } from './prefix';

interface SpecialBlock {
  prefix: Prefix;
  label: string;
}

function block(cidr: string, label: string): SpecialBlock {
  const [addr, len] = cidr.split('/');
  const ip = parseIP(addr);
  return { prefix: makePrefix(ip.version, ip.value, Number(len)), label };
}

// IANA special-purpose registries (RFC 6890 and updates).
const V4_SPECIAL: SpecialBlock[] = [
  block('0.0.0.0/8', '"This network" (RFC 791)'),
  block('10.0.0.0/8', 'Private (RFC 1918)'),
  block('100.64.0.0/10', 'Shared address space / CGNAT (RFC 6598)'),
  block('127.0.0.0/8', 'Loopback'),
  block('169.254.0.0/16', 'Link-local (APIPA)'),
  block('172.16.0.0/12', 'Private (RFC 1918)'),
  block('192.0.0.0/24', 'IETF protocol assignments'),
  block('192.0.2.0/24', 'Documentation (TEST-NET-1)'),
  block('192.88.99.0/24', '6to4 relay anycast (deprecated)'),
  block('192.168.0.0/16', 'Private (RFC 1918)'),
  block('198.18.0.0/15', 'Benchmarking (RFC 2544)'),
  block('198.51.100.0/24', 'Documentation (TEST-NET-2)'),
  block('203.0.113.0/24', 'Documentation (TEST-NET-3)'),
  block('224.0.0.0/4', 'Multicast'),
  block('240.0.0.0/4', 'Reserved (future use)'),
  block('255.255.255.255/32', 'Limited broadcast'),
];

const V6_SPECIAL: SpecialBlock[] = [
  block('::/128', 'Unspecified'),
  block('::1/128', 'Loopback'),
  block('::ffff:0:0/96', 'IPv4-mapped'),
  block('64:ff9b::/96', 'NAT64 well-known prefix (RFC 6052)'),
  block('64:ff9b:1::/48', 'Local-use NAT64 (RFC 8215)'),
  block('100::/64', 'Discard-only (RFC 6666)'),
  block('2000::/3', 'Global unicast'),
  block('2001::/32', 'Teredo'),
  block('2001:db8::/32', 'Documentation'),
  block('2002::/16', '6to4'),
  block('3fff::/20', 'Documentation (RFC 9637)'),
  block('fc00::/7', 'Unique local (ULA)'),
  block('fe80::/10', 'Link-local'),
  block('ff00::/8', 'Multicast'),
];

/** Most specific special-purpose label for an address. */
export function classify(ip: IP): string {
  const table = ip.version === 4 ? V4_SPECIAL : V6_SPECIAL;
  let best: SpecialBlock | null = null;
  for (const b of table) {
    if (ip.value >= b.prefix.network && ip.value <= prefixLast(b.prefix) && (!best || b.prefix.len > best.prefix.len)) {
      best = b;
    }
  }
  if (best) return best.label;
  return ip.version === 4 ? 'Public' : 'Reserved / unassigned';
}

export function v4Class(value: bigint): string {
  const first = Number(value >> 24n);
  if (first < 128) return 'A';
  if (first < 192) return 'B';
  if (first < 224) return 'C';
  if (first < 240) return 'D (multicast)';
  return 'E (reserved)';
}

export interface V4Details {
  address: string;
  network: string;
  cidr: string;
  len: number;
  mask: string;
  wildcard: string;
  broadcast: string;
  firstHost: string;
  lastHost: string;
  total: bigint;
  usable: bigint;
  type: string;
  cls: string;
  ptr: string;
  note?: string;
}

export function v4Details(c: ParsedCIDR): V4Details {
  const p = c.prefix;
  const last = prefixLast(p);
  const total = blockSize(4, p.len);
  let first = p.network + 1n;
  let lastHost = last - 1n;
  let usable = total - 2n;
  let note: string | undefined;
  if (p.len === 32) {
    first = lastHost = p.network;
    usable = 1n;
    note = 'Host route (/32): a single address';
  } else if (p.len === 31) {
    first = p.network;
    lastHost = last;
    usable = 2n;
    note = 'Point-to-point link (/31, RFC 3021): both addresses are usable';
  }
  return {
    address: formatIPv4(c.ip.value),
    network: formatIPv4(p.network),
    cidr: `${formatIPv4(p.network)}/${p.len}`,
    len: p.len,
    mask: formatMaskV4(p.len),
    wildcard: formatWildcardV4(p.len),
    broadcast: p.len >= 31 ? 'n/a' : formatIPv4(last),
    firstHost: formatIPv4(first),
    lastHost: formatIPv4(lastHost),
    total,
    usable,
    type: classify(c.ip),
    cls: v4Class(c.ip.value),
    ptr: ptrName(c.ip),
    note,
  };
}

export interface V6Details {
  address: string;
  expanded: string;
  network: string;
  cidr: string;
  first: string;
  last: string;
  total: bigint;
  subnets64: bigint | null;
  type: string;
  ptr: string;
  reverseZone: string | null;
}

/** Nibble-aligned reverse zone (e.g. 8.b.d.0.1.0.0.2.ip6.arpa for 2001:db8::/32). */
export function reverseZoneV6(p: Prefix): string | null {
  if (p.len % 4 !== 0) return null;
  const nibbles = p.network.toString(16).padStart(32, '0').slice(0, p.len / 4);
  return (nibbles ? nibbles.split('').reverse().join('.') + '.' : '') + 'ip6.arpa';
}

/** Classful-boundary reverse zone for IPv4 (/8, /16, /24). */
export function reverseZoneV4(p: Prefix): string | null {
  if (p.len % 8 !== 0 || p.len === 32) return null;
  const octets = formatIPv4(p.network).split('.').slice(0, p.len / 8);
  return (octets.length ? octets.reverse().join('.') + '.' : '') + 'in-addr.arpa';
}

export function v6Details(c: ParsedCIDR): V6Details {
  const p = c.prefix;
  const fmt = (value: bigint) => formatIP({ version: 6, value });
  return {
    address: fmt(c.ip.value),
    expanded: c.ip.value.toString(16).padStart(32, '0').match(/.{4}/g)!.join(':'),
    network: fmt(p.network),
    cidr: `${fmt(p.network)}/${p.len}`,
    first: fmt(p.network),
    last: fmt(prefixLast(p)),
    total: blockSize(6, p.len),
    subnets64: p.len <= 64 ? 1n << BigInt(64 - p.len) : null,
    type: classify(c.ip),
    ptr: ptrName(c.ip),
    reverseZone: reverseZoneV6(p),
  };
}
