import { describe, expect, it } from 'vitest';
import { generateAcl, type AclOptions } from './acl';
import { generateConfig, parsePortLine, parseRouteLine, parseVlanLine, parseVlanList, formatVlanList } from './configgen';
import { parseAnyAddress, representations } from './convert';
import { classify, reverseZoneV4, reverseZoneV6, v4Details, v6Details } from './info';
import { formatIP, parseIP } from './ip';
import { eui64Address, formatMAC, linkLocalFromMAC, macFlags, ouiOf, parseMAC } from './mac';
import { computeStack, defaultLayer, espInnerMtu, mssFor, pingPayload, type Layer } from './mtu';
import { formatPrefix, parseCIDR } from './prefix';
import { bdpBytes, formatDuration, formatRate, mathisRate, transferSeconds, windowLimitedRate, windowScale } from './throughput';
import { allocateVlsm, lengthForHosts, parseVlsmLine } from './vlsm';

describe('subnet details', () => {
  it('IPv4 /24', () => {
    const d = v4Details(parseCIDR('192.168.10.77/24'));
    expect(d).toMatchObject({
      network: '192.168.10.0',
      broadcast: '192.168.10.255',
      firstHost: '192.168.10.1',
      lastHost: '192.168.10.254',
      mask: '255.255.255.0',
      wildcard: '0.0.0.255',
      total: 256n,
      usable: 254n,
      type: 'Private (RFC 1918)',
      cls: 'C',
    });
  });
  it('IPv4 /31 and /32', () => {
    expect(v4Details(parseCIDR('10.0.0.1/31'))).toMatchObject({ firstHost: '10.0.0.0', lastHost: '10.0.0.1', usable: 2n });
    expect(v4Details(parseCIDR('10.0.0.1/32'))).toMatchObject({ firstHost: '10.0.0.1', lastHost: '10.0.0.1', usable: 1n });
  });
  it('IPv6', () => {
    const d = v6Details(parseCIDR('2001:db8:abcd:12::1/56'));
    expect(d).toMatchObject({
      network: '2001:db8:abcd::',
      last: '2001:db8:abcd:ff:ffff:ffff:ffff:ffff',
      subnets64: 256n,
      type: 'Documentation',
    });
    expect(reverseZoneV6(parseCIDR('2001:db8::/32').prefix)).toBe('8.b.d.0.1.0.0.2.ip6.arpa');
    expect(reverseZoneV6(parseCIDR('2001:db8::/33').prefix)).toBeNull();
    expect(reverseZoneV4(parseCIDR('10.20.0.0/16').prefix)).toBe('20.10.in-addr.arpa');
  });
  it('classifies special ranges', () => {
    expect(classify(parseIP('100.64.1.1'))).toMatch(/CGNAT/);
    expect(classify(parseIP('8.8.8.8'))).toBe('Public');
    expect(classify(parseIP('255.255.255.255'))).toBe('Limited broadcast');
    expect(classify(parseIP('2001:db8::1'))).toBe('Documentation');
    expect(classify(parseIP('2606:4700::1'))).toBe('Global unicast');
    expect(classify(parseIP('fd00::1'))).toMatch(/Unique local/);
  });
});

describe('VLSM', () => {
  it('sizes subnets', () => {
    expect(lengthForHosts(50)).toBe(26);
    expect(lengthForHosts(62)).toBe(26);
    expect(lengthForHosts(63)).toBe(25);
    expect(lengthForHosts(2)).toBe(30);
    expect(lengthForHosts(2, { p2p31: true })).toBe(31);
    expect(lengthForHosts(1)).toBe(30);
  });

  it('allocates largest first with aligned blocks', () => {
    const r = allocateVlsm(parseCIDR('192.168.0.0/24').prefix, [
      { name: 'Link', hosts: 2 },
      { name: 'Sales', hosts: 50 },
      { name: 'Eng', hosts: 100 },
      { name: 'Mgmt', hosts: 10 },
    ]);
    expect(r.allocations.map((a) => `${a.name} ${formatPrefix(a.prefix)}`)).toEqual([
      'Eng 192.168.0.0/25',
      'Sales 192.168.0.128/26',
      'Mgmt 192.168.0.192/28',
      'Link 192.168.0.208/30',
    ]);
    expect(r.free.map(formatPrefix)).toEqual(['192.168.0.212/30', '192.168.0.216/29', '192.168.0.224/27']);
    expect(r.unplaced).toEqual([]);
    expect(r.used).toBe(212n);
  });

  it('reports what does not fit', () => {
    const r = allocateVlsm(parseCIDR('10.0.0.0/26').prefix, [
      { name: 'A', hosts: 40 },
      { name: 'B', hosts: 40 },
      { name: 'C', hosts: 5 },
    ]);
    expect(r.allocations.map((a) => a.name)).toEqual(['A']);
    expect(r.unplaced.map((u) => u.name)).toEqual(['B', 'C']);
  });

  it('parses request lines', () => {
    expect(parseVlsmLine('Sales 50', 0)).toEqual({ name: 'Sales', hosts: 50 });
    expect(parseVlsmLine('Floor 2 Users: 120', 0)).toEqual({ name: 'Floor 2 Users', hosts: 120 });
    expect(parseVlsmLine('30', 2)).toEqual({ name: 'Subnet 3', hosts: 30 });
    expect(parseVlsmLine('30 Lab', 0)).toEqual({ name: 'Lab', hosts: 30 });
  });
});

describe('MAC', () => {
  const mac = parseMAC('00:1B:63:84:45:E6');
  it('parses all notations', () => {
    for (const s of ['00-1b-63-84-45-e6', '001b.6384.45e6', '001B638445E6']) expect(parseMAC(s)).toEqual(mac);
    expect(() => parseMAC('00:1b:63:84:45')).toThrow();
  });
  it('formats', () => {
    expect(formatMAC(mac, 'cisco')).toBe('001b.6384.45e6');
    expect(formatMAC(mac, 'hyphen')).toBe('00-1B-63-84-45-E6');
    expect(ouiOf(mac)).toBe('001B63');
  });
  it('flags', () => {
    expect(macFlags(parseMAC('01:00:5e:00:00:01')).multicast).toBe(true);
    expect(macFlags(parseMAC('02:00:00:00:00:01')).locallyAdministered).toBe(true);
    expect(macFlags(parseMAC('ff:ff:ff:ff:ff:ff')).broadcast).toBe(true);
  });
  it('derives EUI-64 addresses', () => {
    expect(linkLocalFromMAC(mac)).toBe('fe80::21b:63ff:fe84:45e6');
    expect(eui64Address(parseCIDR('2001:db8:1:2::/64').prefix.network, mac)).toBe('2001:db8:1:2:21b:63ff:fe84:45e6');
  });
});

describe('converter', () => {
  it('reads many notations', () => {
    for (const s of ['192.168.1.1', '3232235777', '0xC0A80101', '11000000.10101000.00000001.00000001', '0b11000000101010000000000100000001']) {
      expect(formatIP(parseAnyAddress(s))).toBe('192.168.1.1');
    }
    expect(parseAnyAddress('20010db8000000000000000000000001').version).toBe(6);
  });
  it('lists representations', () => {
    const reps = Object.fromEntries(representations(parseAnyAddress('192.0.2.1')).map((r) => [r.label, r.value]));
    expect(reps['IPv4-mapped IPv6']).toBe('::ffff:192.0.2.1');
    expect(reps['6to4 prefix']).toBe('2002:c000:201::/48');
    expect(reps['NAT64 (64:ff9b::/96)']).toBe('64:ff9b::c000:201');
    const v6 = representations(parseAnyAddress('2002:c000:201::1'));
    expect(v6.find((r) => r.label === 'Embedded IPv4 (6to4)')?.value).toBe('192.0.2.1');
  });
});

describe('MTU', () => {
  const layer = (over: Partial<Layer> & Pick<Layer, 'type'>): Layer => ({ ...defaultLayer(over.type), ...over });
  it('fixed overheads', () => {
    expect(computeStack(1500, [layer({ type: 'pppoe' })]).mtu).toBe(1492);
    expect(computeStack(1500, [layer({ type: 'gre' })]).mtu).toBe(1476);
    expect(computeStack(1500, [layer({ type: 'vxlan' })]).mtu).toBe(1450);
    expect(computeStack(1500, [layer({ type: 'wireguard', outer: 6 })]).mtu).toBe(1420);
    expect(computeStack(1500, [layer({ type: 'pppoe' }), layer({ type: 'gre' })]).mtu).toBe(1468);
  });
  it('ESP padding', () => {
    // 1500 - 20 - 8 - 8 (IV) - 16 (ICV) = 1448; already a multiple of 4 -> 1446.
    expect(espInnerMtu(1500, layer({ type: 'esp', cipher: 'aes-gcm' }))).toBe(1446);
    // 1500 - 20 - 8 - 16 - 12 = 1444 -> floor to 16 = 1440 -> 1438.
    expect(espInnerMtu(1500, layer({ type: 'esp', cipher: 'aes-cbc-sha1' }))).toBe(1438);
    // NAT-T adds 8: 1436 -> 1424 -> 1422.
    expect(espInnerMtu(1500, layer({ type: 'esp', cipher: 'aes-cbc-sha1', natt: true }))).toBe(1422);
  });
  it('MSS and ping sizes', () => {
    expect(mssFor(1500, 4)).toBe(1460);
    expect(mssFor(1500, 6)).toBe(1440);
    expect(pingPayload(1500, 4)).toBe(1472);
    expect(pingPayload(1500, 6)).toBe(1452);
  });
});

describe('throughput', () => {
  it('computes transfer time', () => {
    expect(transferSeconds(1e9, 1e9)).toBe(8);
    expect(formatDuration(3661)).toBe('1h 1m 1s');
    expect(formatDuration(0.25)).toBe('250 ms');
  });
  it('computes BDP and windows', () => {
    expect(bdpBytes(1e9, 0.1)).toBe(12_500_000);
    expect(windowLimitedRate(65535, 0.1)).toBeCloseTo(5_242_800);
    expect(windowScale(65535)).toBe(0);
    expect(windowScale(12_500_000)).toBe(8);
    expect(formatRate(5_242_800)).toBe('5.24 Mbit/s');
  });
  it('Mathis bound', () => {
    expect(mathisRate(1460, 0.1, 0.01) / 1e6).toBeCloseTo(1.43, 2);
  });
});

describe('ACL', () => {
  const prefixes = ['10.0.0.0/8', '192.0.2.1/32', '2001:db8::/32'].map((s) => parseCIDR(s).prefix);
  const base: AclOptions = { style: 'cisco-standard', name: 'MGMT', action: 'permit', match: 'source', seqStart: 10, seqStep: 10 };
  it('Cisco standard (named)', () => {
    expect(generateAcl(prefixes, base)).toBe(
      [
        'ip access-list standard MGMT',
        ' 10 permit 10.0.0.0 0.255.255.255',
        ' 20 permit host 192.0.2.1',
        '!',
        'ipv6 access-list MGMT',
        ' sequence 10 permit ipv6 2001:db8::/32 any',
      ].join('\n'),
    );
  });
  it('Cisco numbered extended, destination', () => {
    expect(generateAcl(prefixes.slice(0, 1), { ...base, style: 'cisco-extended', name: '110', match: 'destination' })).toBe(
      'access-list 110 permit ip any 10.0.0.0 0.255.255.255',
    );
  });
  it('prefix lists and address lists', () => {
    expect(generateAcl(prefixes, { ...base, style: 'cisco-prefix-list', seqStart: 5, seqStep: 5 })).toBe(
      ['ip prefix-list MGMT seq 5 permit 10.0.0.0/8', 'ip prefix-list MGMT seq 10 permit 192.0.2.1/32', 'ipv6 prefix-list MGMT seq 5 permit 2001:db8::/32'].join('\n'),
    );
    expect(generateAcl(prefixes.slice(0, 1), { ...base, style: 'juniper-prefix-list' })).toBe('set policy-options prefix-list MGMT 10.0.0.0/8');
    expect(generateAcl(prefixes.slice(2), { ...base, style: 'mikrotik-address-list' })).toBe(
      '/ipv6 firewall address-list\nadd list=MGMT address=2001:db8::/32',
    );
  });
});

describe('config generator', () => {
  it('parses VLAN lists', () => {
    expect(parseVlanList('30-32,10, 20,10')).toEqual([10, 20, 30, 31, 32]);
    expect(formatVlanList([10, 20, 30, 31, 32, 40, 41])).toBe('10,20,30-32,40,41');
    expect(() => parseVlanList('4095')).toThrow();
  });

  const spec = {
    vlans: [parseVlanLine('10 USERS 10.0.10.1/24'), parseVlanLine('20 VOICE')],
    ports: [parsePortLine('ge-0/0/1 access 10 Desk 12'), parsePortLine('ge-0/0/47 trunk 10,20 native 99')],
    routes: [parseRouteLine('0.0.0.0/0 10.0.10.254')],
    bridge: 'bridge1',
  };

  it('parses lines', () => {
    expect(spec.ports[0]).toEqual({ iface: 'ge-0/0/1', mode: 'access', vlans: [10], native: undefined, description: 'Desk 12' });
    expect(spec.ports[1]).toMatchObject({ mode: 'trunk', vlans: [10, 20], native: 99 });
    expect(() => parsePortLine('gi0/1 access 10 native 5')).toThrow();
    expect(() => parseRouteLine('10.0.0.0/8 2001:db8::1')).toThrow();
  });

  it('Cisco IOS', () => {
    const out = generateConfig('cisco-ios', spec);
    expect(out).toContain('vlan 99\n!');
    expect(out).toContain('interface Vlan10\n description USERS\n ip address 10.0.10.1 255.255.255.0\n no shutdown');
    expect(out).toContain(' switchport trunk native vlan 99\n switchport trunk allowed vlan 10,20');
    expect(out).toContain('ip route 0.0.0.0 0.0.0.0 10.0.10.254');
  });

  it('Junos', () => {
    const out = generateConfig('junos', spec);
    expect(out).toContain('set vlans USERS l3-interface irb.10');
    expect(out).toContain('set interfaces irb unit 10 family inet address 10.0.10.1/24');
    expect(out).toContain('set interfaces ge-0/0/1 description "Desk 12"');
    expect(out).toContain('set interfaces ge-0/0/47 unit 0 family ethernet-switching vlan members [ USERS VOICE vlan99 ]');
    expect(out).toContain('set vlans vlan99 vlan-id 99');
  });

  it('RouterOS', () => {
    const out = generateConfig('routeros', spec);
    expect(out).toContain('add bridge=bridge1 vlan-ids=10 tagged=bridge1,ge-0/0/47 untagged=ge-0/0/1 comment="USERS"');
    expect(out).toContain('add bridge=bridge1 vlan-ids=99 untagged=ge-0/0/47');
    expect(out).toContain('add interface=bridge1 name=vlan10-USERS vlan-id=10');
    expect(out.trim().endsWith('vlan-filtering=yes')).toBe(true);
  });
});
