/** Generate ACL / prefix-list / address-list lines from prefixes. */
import { formatIP } from './ip';
import { formatMaskV4, formatPrefix, formatWildcardV4, type Prefix } from './prefix';

export type AclStyle = 'cisco-standard' | 'cisco-extended' | 'cisco-prefix-list' | 'juniper-prefix-list' | 'mikrotik-address-list';

export const ACL_STYLES: { id: AclStyle; label: string }[] = [
  { id: 'cisco-standard', label: 'Cisco IOS standard ACL' },
  { id: 'cisco-extended', label: 'Cisco IOS extended ACL' },
  { id: 'cisco-prefix-list', label: 'Cisco IOS prefix-list' },
  { id: 'juniper-prefix-list', label: 'Junos prefix-list' },
  { id: 'mikrotik-address-list', label: 'MikroTik address-list' },
];

export interface AclOptions {
  style: AclStyle;
  name: string;
  action: 'permit' | 'deny';
  /** Extended ACLs: match the prefixes as source or destination. */
  match: 'source' | 'destination';
  /** Sequence numbering for prefix-lists and named ACLs (0 = omit). */
  seqStart: number;
  seqStep: number;
}

/** Cisco address/wildcard operand: "any", "host x" or "x wildcard". */
export function ciscoV4Operand(p: Prefix): string {
  if (p.len === 0) return 'any';
  const addr = formatIP({ version: 4, value: p.network });
  if (p.len === 32) return `host ${addr}`;
  return `${addr} ${formatWildcardV4(p.len)}`;
}

function ciscoV6Operand(p: Prefix): string {
  if (p.len === 0) return 'any';
  if (p.len === 128) return `host ${formatIP({ version: 6, value: p.network })}`;
  return formatPrefix(p);
}

const sanitizeName = (name: string, fallback: string) => name.trim().replace(/\s+/g, '_') || fallback;

/** Generate configuration lines. IPv4 and IPv6 prefixes are emitted in separate blocks. */
export function generateAcl(prefixes: Prefix[], opts: AclOptions): string {
  const v4 = prefixes.filter((p) => p.version === 4);
  const v6 = prefixes.filter((p) => p.version === 6);
  const name = sanitizeName(opts.name, 'NET-TOOLS');
  const numbered = /^\d+$/.test(name);
  const seq = (i: number) => (opts.seqStart > 0 ? `${opts.seqStart + i * Math.max(1, opts.seqStep)} ` : '');
  const out: string[] = [];

  switch (opts.style) {
    case 'cisco-standard':
    case 'cisco-extended': {
      const extended = opts.style === 'cisco-extended';
      const line = (p: Prefix) => {
        if (!extended) return `${opts.action} ${ciscoV4Operand(p)}`;
        const x = ciscoV4Operand(p);
        return opts.match === 'source' ? `${opts.action} ip ${x} any` : `${opts.action} ip any ${x}`;
      };
      if (v4.length) {
        if (numbered) {
          v4.forEach((p) => out.push(`access-list ${name} ${line(p)}`));
        } else {
          out.push(`ip access-list ${extended ? 'extended' : 'standard'} ${name}`);
          v4.forEach((p, i) => out.push(` ${seq(i)}${line(p)}`));
        }
      }
      if (v6.length) {
        if (out.length) out.push('!');
        // IPv6 access lists are always named and extended-style.
        out.push(`ipv6 access-list ${numbered ? `${name}-V6` : name}`);
        v6.forEach((p, i) => {
          const x = ciscoV6Operand(p);
          const body = opts.match === 'source' || !extended ? `ipv6 ${x} any` : `ipv6 any ${x}`;
          out.push(` ${opts.seqStart > 0 ? `sequence ${opts.seqStart + i * Math.max(1, opts.seqStep)} ` : ''}${opts.action} ${body}`);
        });
      }
      break;
    }
    case 'cisco-prefix-list':
      v4.forEach((p, i) => out.push(`ip prefix-list ${name} ${seq(i) ? 'seq ' + seq(i) : ''}${opts.action} ${formatPrefix(p)}`));
      v6.forEach((p, i) => out.push(`ipv6 prefix-list ${name} ${seq(i) ? 'seq ' + seq(i) : ''}${opts.action} ${formatPrefix(p)}`));
      break;
    case 'juniper-prefix-list':
      [...v4, ...v6].forEach((p) => out.push(`set policy-options prefix-list ${name} ${formatPrefix(p)}`));
      break;
    case 'mikrotik-address-list':
      if (v4.length) {
        out.push('/ip firewall address-list');
        v4.forEach((p) => out.push(`add list=${name} address=${formatPrefix(p)}`));
      }
      if (v6.length) {
        out.push('/ipv6 firewall address-list');
        v6.forEach((p) => out.push(`add list=${name} address=${formatPrefix(p)}`));
      }
      break;
  }
  return out.join('\n');
}

export interface MaskRow {
  len: number;
  mask: string;
  wildcard: string;
}

export const maskTable = (): MaskRow[] =>
  Array.from({ length: 33 }, (_, len) => ({ len, mask: formatMaskV4(len), wildcard: formatWildcardV4(len) }));
