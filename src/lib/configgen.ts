/**
 * Generate switch/router configuration snippets from a small line-based spec.
 *
 * VLANs:  "<id> [name] [gateway/len ...]"     e.g. "10 USERS 10.0.10.1/24 2001:db8:10::1/64"
 * Ports:  "<iface> access <vlan> [description]"
 *         "<iface> trunk <vlans> [native <vlan>] [description]"   vlans: "10,20,30-32"
 * Routes: "<prefix> <next-hop>"               e.g. "0.0.0.0/0 192.168.1.1"
 */
import { formatIP, ParseError, parseIP } from './ip';
import { formatMaskV4, formatPrefix, parseCIDR, type ParsedCIDR, type Prefix } from './prefix';

export type Vendor = 'cisco-ios' | 'junos' | 'routeros';

export const VENDORS: { id: Vendor; label: string }[] = [
  { id: 'cisco-ios', label: 'Cisco IOS / IOS-XE' },
  { id: 'junos', label: 'Juniper Junos (EX/QFX, ELS)' },
  { id: 'routeros', label: 'MikroTik RouterOS v7' },
];

export interface VlanSpec {
  id: number;
  name: string;
  addresses: ParsedCIDR[];
}

export interface PortSpec {
  iface: string;
  mode: 'access' | 'trunk';
  vlans: number[];
  native?: number;
  description?: string;
}

export interface RouteSpec {
  prefix: Prefix;
  nextHop: string;
  version: 4 | 6;
}

export interface ConfigSpec {
  vlans: VlanSpec[];
  ports: PortSpec[];
  routes: RouteSpec[];
  /** RouterOS: bridge name. */
  bridge: string;
}

function vlanId(s: string): number {
  if (!/^\d+$/.test(s)) throw new ParseError(`"${s}" is not a VLAN ID`);
  const n = Number(s);
  if (n < 1 || n > 4094) throw new ParseError(`VLAN ${n} is outside 1-4094`);
  return n;
}

/** Parse "10,20,30-32" into a sorted, de-duplicated list. */
export function parseVlanList(s: string): number[] {
  const out = new Set<number>();
  for (const part of s.split(',')) {
    const t = part.trim();
    if (!t) continue;
    const m = t.match(/^(\d+)-(\d+)$/);
    if (m) {
      const a = vlanId(m[1]);
      const b = vlanId(m[2]);
      if (a > b) throw new ParseError(`VLAN range "${t}" is reversed`);
      for (let i = a; i <= b; i++) out.add(i);
    } else {
      out.add(vlanId(t));
    }
  }
  if (out.size === 0) throw new ParseError('Empty VLAN list');
  return [...out].sort((a, b) => a - b);
}

/** Compact a VLAN list back into "10,20,30-32". */
export function formatVlanList(vlans: number[]): string {
  const parts: string[] = [];
  for (let i = 0; i < vlans.length; ) {
    let j = i;
    while (j + 1 < vlans.length && vlans[j + 1] === vlans[j] + 1) j++;
    parts.push(j - i >= 2 ? `${vlans[i]}-${vlans[j]}` : vlans.slice(i, j + 1).join(','));
    i = j + 1;
  }
  return parts.join(',');
}

export function parseVlanLine(line: string): VlanSpec {
  const tokens = line.trim().split(/\s+/);
  const id = vlanId(tokens[0]);
  let name = '';
  const addresses: ParsedCIDR[] = [];
  for (const t of tokens.slice(1)) {
    if (t.includes('/')) {
      const c = parseCIDR(t);
      if (c.len === (c.ip.version === 4 ? 32 : 128)) throw new ParseError(`"${t}": give the gateway with its subnet length`);
      addresses.push(c);
    } else if (!name) {
      name = t;
    } else {
      throw new ParseError(`Unexpected "${t}" (VLAN names cannot contain spaces)`);
    }
  }
  return { id, name, addresses };
}

export function parsePortLine(line: string): PortSpec {
  const m = line.trim().match(/^(\S+)\s+(access|trunk)\s+(\S+)(.*)$/i);
  if (!m) throw new ParseError(`Use "<interface> access <vlan>" or "<interface> trunk <vlans> [native <vlan>]"`);
  const mode = m[2].toLowerCase() as 'access' | 'trunk';
  let rest = m[4].trim();
  let native: number | undefined;
  const nm = rest.match(/^native\s+(\S+)\s*(.*)$/i);
  if (nm) {
    if (mode === 'access') throw new ParseError('"native" only applies to trunk ports');
    native = vlanId(nm[1]);
    rest = nm[2];
  }
  const vlans = mode === 'access' ? [vlanId(m[3])] : parseVlanList(m[3]);
  return { iface: m[1], mode, vlans, native, description: rest.trim() || undefined };
}

export function parseRouteLine(line: string): RouteSpec {
  const tokens = line.trim().split(/\s+/);
  if (tokens.length !== 2) throw new ParseError('Use "<prefix> <next-hop>", e.g. "0.0.0.0/0 192.168.1.1"');
  const c = parseCIDR(tokens[0]);
  const nh = parseIP(tokens[1]);
  if (nh.version !== c.ip.version) throw new ParseError('Prefix and next hop must be the same IP version');
  return { prefix: c.prefix, nextHop: formatIP(nh), version: c.ip.version };
}

const addrOf = (c: ParsedCIDR) => formatIP(c.ip);
const junosVlanName = (v: VlanSpec | undefined, id: number) => (v?.name ? v.name : `vlan${id}`);
const quote = (s: string) => `"${s.replace(/"/g, "'")}"`;

function cisco(spec: ConfigSpec): string {
  const out: string[] = [];
  const hasV6 = spec.vlans.some((v) => v.addresses.some((a) => a.ip.version === 6)) || spec.routes.some((r) => r.version === 6);
  if (hasV6) out.push('ipv6 unicast-routing', '!');
  for (const v of spec.vlans) {
    out.push(`vlan ${v.id}`);
    if (v.name) out.push(` name ${v.name}`);
    out.push('!');
  }
  for (const v of spec.vlans.filter((x) => x.addresses.length)) {
    out.push(`interface Vlan${v.id}`);
    if (v.name) out.push(` description ${v.name}`);
    let firstV4 = true;
    for (const a of v.addresses) {
      if (a.ip.version === 4) {
        out.push(` ip address ${addrOf(a)} ${formatMaskV4(a.len)}${firstV4 ? '' : ' secondary'}`);
        firstV4 = false;
      } else {
        out.push(` ipv6 address ${addrOf(a)}/${a.len}`);
      }
    }
    out.push(' no shutdown', '!');
  }
  for (const p of spec.ports) {
    out.push(`interface ${p.iface}`);
    if (p.description) out.push(` description ${p.description}`);
    if (p.mode === 'access') {
      out.push(' switchport mode access', ` switchport access vlan ${p.vlans[0]}`, ' spanning-tree portfast');
    } else {
      out.push(' switchport mode trunk');
      if (p.native) out.push(` switchport trunk native vlan ${p.native}`);
      out.push(` switchport trunk allowed vlan ${formatVlanList(p.vlans)}`);
    }
    out.push(' no shutdown', '!');
  }
  for (const r of spec.routes) {
    if (r.version === 4) {
      out.push(`ip route ${formatIP({ version: 4, value: r.prefix.network })} ${formatMaskV4(r.prefix.len)} ${r.nextHop}`);
    } else {
      out.push(`ipv6 route ${formatPrefix(r.prefix)} ${r.nextHop}`);
    }
  }
  if (out[out.length - 1] === '!') out.pop();
  return out.join('\n');
}

function junos(spec: ConfigSpec): string {
  const out: string[] = [];
  const byId = new Map(spec.vlans.map((v) => [v.id, v]));
  for (const v of spec.vlans) {
    const name = junosVlanName(v, v.id);
    out.push(`set vlans ${name} vlan-id ${v.id}`);
    if (v.addresses.length) {
      out.push(`set vlans ${name} l3-interface irb.${v.id}`);
      for (const a of v.addresses) {
        out.push(`set interfaces irb unit ${v.id} family ${a.ip.version === 4 ? 'inet' : 'inet6'} address ${addrOf(a)}/${a.len}`);
      }
    }
  }
  for (const p of spec.ports) {
    const base = `set interfaces ${p.iface}`;
    if (p.description) out.push(`${base} description ${quote(p.description)}`);
    const members = p.vlans.map((id) => junosVlanName(byId.get(id), id));
    if (p.native && !p.vlans.includes(p.native)) members.push(junosVlanName(byId.get(p.native), p.native));
    if (p.native) out.push(`${base} native-vlan-id ${p.native}`);
    out.push(`${base} unit 0 family ethernet-switching interface-mode ${p.mode}`);
    out.push(`${base} unit 0 family ethernet-switching vlan members ${members.length > 1 ? `[ ${members.join(' ')} ]` : members[0]}`);
  }
  for (const r of spec.routes) {
    const rib = r.version === 6 ? 'rib inet6.0 ' : '';
    out.push(`set routing-options ${rib}static route ${formatPrefix(r.prefix)} next-hop ${r.nextHop}`);
  }
  return out.join('\n');
}

function routeros(spec: ConfigSpec): string {
  const out: string[] = [];
  const bridge = spec.bridge.trim() || 'bridge1';
  const byId = new Map(spec.vlans.map((v) => [v.id, v]));
  const ifName = (v: VlanSpec) => (v.name ? `vlan${v.id}-${v.name}` : `vlan${v.id}`);

  // Membership per VLAN.
  const allIds = new Set<number>(spec.vlans.map((v) => v.id));
  spec.ports.forEach((p) => {
    p.vlans.forEach((id) => allIds.add(id));
    if (p.native) allIds.add(p.native);
  });
  const tagged = new Map<number, string[]>();
  const untagged = new Map<number, string[]>();
  const push = (m: Map<number, string[]>, id: number, iface: string) => m.set(id, [...(m.get(id) ?? []), iface]);
  for (const p of spec.ports) {
    if (p.mode === 'access') push(untagged, p.vlans[0], p.iface);
    else {
      p.vlans.filter((id) => id !== p.native).forEach((id) => push(tagged, id, p.iface));
      if (p.native) push(untagged, p.native, p.iface);
    }
  }
  // The bridge itself must be tagged on VLANs that have a routed interface.
  spec.vlans.filter((v) => v.addresses.length).forEach((v) => tagged.set(v.id, [bridge, ...(tagged.get(v.id) ?? [])]));

  if (spec.ports.length) {
    out.push('/interface bridge port');
    for (const p of spec.ports) {
      const comment = p.description ? ` comment=${quote(p.description)}` : '';
      if (p.mode === 'access') {
        out.push(`add bridge=${bridge} interface=${p.iface} pvid=${p.vlans[0]} frame-types=admit-only-untagged-and-priority-tagged${comment}`);
      } else if (p.native) {
        out.push(`add bridge=${bridge} interface=${p.iface} pvid=${p.native} frame-types=admit-all${comment}`);
      } else {
        out.push(`add bridge=${bridge} interface=${p.iface} frame-types=admit-only-vlan-tagged${comment}`);
      }
    }
  }
  const ids = [...allIds].sort((a, b) => a - b);
  if (ids.length) {
    out.push('/interface bridge vlan');
    for (const id of ids) {
      const t = tagged.get(id);
      const u = untagged.get(id);
      const parts = [`add bridge=${bridge} vlan-ids=${id}`];
      if (t?.length) parts.push(`tagged=${t.join(',')}`);
      if (u?.length) parts.push(`untagged=${u.join(',')}`);
      const v = byId.get(id);
      if (v?.name) parts.push(`comment=${quote(v.name)}`);
      out.push(parts.join(' '));
    }
  }
  const routed = spec.vlans.filter((v) => v.addresses.length);
  if (routed.length) {
    out.push('/interface vlan');
    routed.forEach((v) => out.push(`add interface=${bridge} name=${ifName(v)} vlan-id=${v.id}`));
    const v4 = routed.flatMap((v) => v.addresses.filter((a) => a.ip.version === 4).map((a) => ({ v, a })));
    const v6 = routed.flatMap((v) => v.addresses.filter((a) => a.ip.version === 6).map((a) => ({ v, a })));
    if (v4.length) {
      out.push('/ip address');
      v4.forEach(({ v, a }) => out.push(`add address=${addrOf(a)}/${a.len} interface=${ifName(v)}`));
    }
    if (v6.length) {
      out.push('/ipv6 address');
      v6.forEach(({ v, a }) => out.push(`add address=${addrOf(a)}/${a.len} interface=${ifName(v)} advertise=yes`));
    }
  }
  const r4 = spec.routes.filter((r) => r.version === 4);
  const r6 = spec.routes.filter((r) => r.version === 6);
  if (r4.length) {
    out.push('/ip route');
    r4.forEach((r) => out.push(`add dst-address=${formatPrefix(r.prefix)} gateway=${r.nextHop}`));
  }
  if (r6.length) {
    out.push('/ipv6 route');
    r6.forEach((r) => out.push(`add dst-address=${formatPrefix(r.prefix)} gateway=${r.nextHop}`));
  }
  if (ids.length) {
    out.push(
      '# Enable VLAN filtering last, and only once your management access is on a configured VLAN.',
      `/interface bridge set [find name=${bridge}] vlan-filtering=yes`,
    );
  }
  return out.join('\n');
}

/** VLAN IDs used by ports but not declared in the VLAN list. */
export function undeclaredVlans(spec: ConfigSpec): number[] {
  const declared = new Set(spec.vlans.map((v) => v.id));
  const used = new Set<number>();
  spec.ports.forEach((p) => [...p.vlans, ...(p.native ? [p.native] : [])].forEach((id) => used.add(id)));
  return [...used].filter((id) => !declared.has(id)).sort((a, b) => a - b);
}

export function generateConfig(vendor: Vendor, input: ConfigSpec): string {
  // Declare VLANs that ports reference but the VLAN list omits, so the config is complete.
  const extra = undeclaredVlans(input).map((id): VlanSpec => ({ id, name: '', addresses: [] }));
  const spec = { ...input, vlans: [...input.vlans, ...extra].sort((a, b) => a.id - b.id) };
  switch (vendor) {
    case 'cisco-ios':
      return cisco(spec);
    case 'junos':
      return junos(spec);
    case 'routeros':
      return routeros(spec);
  }
}
