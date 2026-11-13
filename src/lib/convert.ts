/** Address format conversion (dotted, integer, hex, binary, IPv6 forms). */
import { expandIPv6, formatIPv4, formatIPv6, ParseError, parseIP, ptrName, toBinary, toHex, type IP } from './ip';

/**
 * Parse an address in any common notation:
 * dotted quad, decimal integer, 0x hex, 0b / 32-bit binary (dots optional), or IPv6.
 * A bare 32-digit hex string is read as IPv6.
 */
export function parseAnyAddress(input: string): IP {
  const s = input.trim();
  if (s === '') throw new ParseError('Enter an address');
  if (s.includes(':')) return parseIP(s);

  const compact = s.replace(/[\s_]/g, '');
  let value: bigint | null = null;
  if (/^0b[01.]+$/i.test(compact)) {
    value = BigInt('0b' + compact.slice(2).replace(/\./g, ''));
  } else if (/^[01]{8}(\.?[01]{8}){3}$/.test(compact)) {
    value = BigInt('0b' + compact.replace(/\./g, ''));
  } else if (/^0x[0-9a-f]+$/i.test(compact)) {
    value = BigInt(compact);
  } else if (/^[0-9a-f]{32}$/i.test(compact)) {
    return { version: 6, value: BigInt('0x' + compact) };
  } else if (/^\d+$/.test(compact)) {
    value = BigInt(compact);
  }
  if (value !== null) {
    if (value > 0xffffffffn) {
      if (value < 1n << 128n) return { version: 6, value };
      throw new ParseError('Value is too large to be an IP address');
    }
    return { version: 4, value };
  }
  return parseIP(s);
}

export interface Representation {
  label: string;
  value: string;
}

export function representations(ip: IP): Representation[] {
  if (ip.version === 4) {
    const v = ip.value;
    const reps: Representation[] = [
      { label: 'Dotted decimal', value: formatIPv4(v) },
      { label: 'Integer', value: v.toString() },
      { label: 'Hex', value: toHex(ip) },
      { label: 'Dotted hex', value: formatIPv4(v).split('.').map((o) => '0x' + Number(o).toString(16).padStart(2, '0')).join('.') },
      { label: 'Binary', value: toBinary(ip) },
      { label: 'IPv4-mapped IPv6', value: formatIPv6((0xffffn << 32n) | v) },
      { label: 'IPv4-mapped (hex)', value: `::ffff:${(v >> 16n).toString(16)}:${(v & 0xffffn).toString(16)}` },
      { label: '6to4 prefix', value: `${formatIPv6((0x2002n << 112n) | (v << 80n))}/48` },
      { label: 'NAT64 (64:ff9b::/96)', value: formatIPv6((0x64ff9bn << 96n) | v) },
      { label: 'PTR name', value: ptrName(ip) },
    ];
    return reps;
  }
  const v = ip.value;
  const reps: Representation[] = [
    { label: 'Compressed (RFC 5952)', value: formatIPv6(v) },
    { label: 'Expanded', value: expandIPv6(v) },
    { label: 'Hex', value: toHex(ip) },
    { label: 'Integer', value: v.toString() },
    { label: 'Binary', value: toBinary(ip, ':') },
    { label: 'PTR name', value: ptrName(ip) },
  ];
  if (v >> 32n === 0xffffn) reps.splice(1, 0, { label: 'Embedded IPv4 (mapped)', value: formatIPv4(v & 0xffffffffn) });
  if (v >> 32n === 0x64ff9bn << 64n) reps.splice(1, 0, { label: 'Embedded IPv4 (NAT64)', value: formatIPv4(v & 0xffffffffn) });
  if (v >> 112n === 0x2002n) reps.splice(1, 0, { label: 'Embedded IPv4 (6to4)', value: formatIPv4((v >> 80n) & 0xffffffffn) });
  return reps;
}
