import { describe, expect, it } from 'vitest';
import { expandIPv6, formatIPv4, formatIPv6, parseIP, parseIPv4, parseIPv6, ptrName, toBinary } from './ip';

describe('IPv4 parsing', () => {
  it('parses dotted quads', () => {
    expect(parseIPv4('0.0.0.0')).toBe(0n);
    expect(parseIPv4('255.255.255.255')).toBe(0xffffffffn);
    expect(parseIPv4(' 192.168.1.10 ')).toBe(0xc0a8010an);
  });

  it.each(['1.2.3', '1.2.3.4.5', '256.1.1.1', '1.2.3.-4', 'a.b.c.d', '1..2.3', '01.2.3.4', ''])('rejects %j', (s) => {
    expect(() => parseIPv4(s)).toThrow();
  });

  it('round-trips', () => {
    expect(formatIPv4(parseIPv4('10.20.30.40'))).toBe('10.20.30.40');
  });
});

describe('IPv6 parsing', () => {
  const cases: [string, string][] = [
    ['::', '::'],
    ['::1', '::1'],
    ['2001:db8::1', '2001:db8::1'],
    ['2001:0DB8:0000:0000:0000:0000:0000:0001', '2001:db8::1'],
    ['2001:db8:0:0:1:0:0:1', '2001:db8::1:0:0:1'], // first longest run wins
    ['2001:db8:0:1:1:1:1:1', '2001:db8:0:1:1:1:1:1'], // single zero group not compressed
    ['fe80::1%eth0', 'fe80::1'],
    ['[2001:db8::5]', '2001:db8::5'],
    ['::ffff:192.0.2.1', '::ffff:192.0.2.1'],
    ['::ffff:c000:201', '::ffff:192.0.2.1'],
    ['64:ff9b::192.0.2.33', '64:ff9b::c000:221'],
    ['1:2:3:4:5:6:1.2.3.4', '1:2:3:4:5:6:102:304'],
    ['1::', '1::'],
    ['1:0:0:2:0:0:0:3', '1:0:0:2::3'],
  ];
  it.each(cases)('%s -> %s', (input, expected) => {
    expect(formatIPv6(parseIPv6(input))).toBe(expected);
  });

  it.each([':::', '1:::2', '1::2::3', '12345::', ':1::', '1:2:3:4:5:6:7:8:9', '1:2:3:4:5:6:7', 'g::1', '1.2.3.4', '::1.2.3', '1:2:3:4:5:6:7:1.2.3.4'])(
    'rejects %j',
    (s) => {
      expect(() => parseIPv6(s)).toThrow();
    },
  );

  it('expands', () => {
    expect(expandIPv6(parseIPv6('2001:db8::1'))).toBe('2001:0db8:0000:0000:0000:0000:0000:0001');
  });
});

describe('helpers', () => {
  it('detects the version', () => {
    expect(parseIP('10.0.0.1').version).toBe(4);
    expect(parseIP('::1').version).toBe(6);
  });

  it('builds PTR names', () => {
    expect(ptrName(parseIP('192.0.2.5'))).toBe('5.2.0.192.in-addr.arpa');
    expect(ptrName(parseIP('2001:db8::567:89ab'))).toBe(
      'b.a.9.8.7.6.5.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.8.b.d.0.1.0.0.2.ip6.arpa',
    );
  });

  it('formats binary', () => {
    expect(toBinary(parseIP('192.168.0.1'))).toBe('11000000.10101000.00000000.00000001');
  });
});
