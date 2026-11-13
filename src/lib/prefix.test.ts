import { describe, expect, it } from 'vitest';
import {
  coveringPrefix,
  formatPrefix,
  formatRange,
  mergeRanges,
  parseCIDR,
  parseList,
  parseRangeOrPrefix,
  rangeToPrefixes,
  relation,
  splitPrefix,
  summarize,
  formatCount,
} from './prefix';

const pfx = (s: string) => parseCIDR(s).prefix;
const ranges = (...s: string[]) => s.map(parseRangeOrPrefix);
const fmt = (ps: ReturnType<typeof summarize>) => ps.map(formatPrefix);

describe('parseCIDR', () => {
  it('accepts several notations', () => {
    expect(formatPrefix(pfx('10.1.2.3/24'))).toBe('10.1.2.0/24');
    expect(formatPrefix(pfx('10.1.2.3/255.255.0.0'))).toBe('10.1.0.0/16');
    expect(formatPrefix(pfx('10.1.2.3 255.255.255.252'))).toBe('10.1.2.0/30');
    expect(formatPrefix(pfx('10.1.2.3'))).toBe('10.1.2.3/32');
    expect(formatPrefix(pfx('2001:db8::1/48'))).toBe('2001:db8::/48');
  });

  it('flags host bits', () => {
    expect(parseCIDR('10.0.0.5/24').hostBitsSet).toBe(true);
    expect(parseCIDR('10.0.0.0/24').hostBitsSet).toBe(false);
  });

  it.each(['10.0.0.0/33', '10.0.0.0/255.0.255.0', '::/129', '10.0.0.0/x', '10.0.0.0/'])('rejects %j', (s) => {
    expect(() => parseCIDR(s)).toThrow();
  });
});

describe('ranges and summarization', () => {
  it('splits ranges into aligned prefixes', () => {
    expect(fmt(rangeToPrefixes(parseRangeOrPrefix('10.0.0.1 - 10.0.0.10')))).toEqual([
      '10.0.0.1/32',
      '10.0.0.2/31',
      '10.0.0.4/30',
      '10.0.0.8/31',
      '10.0.0.10/32',
    ]);
    expect(fmt(rangeToPrefixes(parseRangeOrPrefix('0.0.0.0-255.255.255.255')))).toEqual(['0.0.0.0/0']);
    expect(fmt(rangeToPrefixes(parseRangeOrPrefix('::-ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff')))).toEqual(['::/0']);
  });

  it('aggregates adjacent prefixes', () => {
    expect(fmt(summarize(ranges('192.168.0.0/24', '192.168.1.0/24', '192.168.2.0/24', '192.168.3.0/24')))).toEqual([
      '192.168.0.0/22',
    ]);
    expect(fmt(summarize(ranges('10.0.1.0/24', '10.0.0.0/24', '10.0.2.0/24')))).toEqual(['10.0.0.0/23', '10.0.2.0/24']);
    expect(fmt(summarize(ranges('10.0.0.0/8', '10.1.0.0/16')))).toEqual(['10.0.0.0/8']);
  });

  it('keeps families apart', () => {
    expect(fmt(summarize(ranges('2001:db8::/33', '10.0.0.0/25', '2001:db8:8000::/33', '10.0.0.128/25')))).toEqual([
      '10.0.0.0/24',
      '2001:db8::/32',
    ]);
  });

  it('finds the covering supernet', () => {
    expect(formatPrefix(coveringPrefix(ranges('10.0.1.0/24', '10.0.6.0/24'))!)).toBe('10.0.0.0/21');
    expect(formatPrefix(coveringPrefix(ranges('10.0.0.1'))!)).toBe('10.0.0.1/32');
    expect(formatPrefix(coveringPrefix(ranges('0.0.0.0', '128.0.0.0'))!)).toBe('0.0.0.0/0');
  });

  it('merges ranges', () => {
    const merged = mergeRanges(ranges('10.0.0.0-10.0.0.9', '10.0.0.10-10.0.0.20', '10.0.0.30'));
    expect(merged.map(formatRange)).toEqual(['10.0.0.0 - 10.0.0.20', '10.0.0.30']);
  });
});

describe('relation', () => {
  const [a, b] = ranges('10.0.0.0/16', '10.0.5.0/24');
  it('classifies', () => {
    expect(relation(a, b)).toBe('contains');
    expect(relation(b, a)).toBe('within');
    expect(relation(a, a)).toBe('equal');
    expect(relation(...(ranges('10.0.0.0-10.0.0.10', '10.0.0.5-10.0.0.20') as [never, never]))).toBe('partial');
    expect(relation(...(ranges('10.0.0.0/24', '10.0.1.0/24') as [never, never]))).toBe('disjoint');
    expect(relation(...(ranges('::/0', '0.0.0.0/0') as [never, never]))).toBe('disjoint');
  });
});

describe('splitPrefix', () => {
  it('lists subnets', () => {
    const { count, subnets } = splitPrefix(pfx('10.0.0.0/22'), 24);
    expect(count).toBe(4n);
    expect(subnets.map(formatPrefix)).toEqual(['10.0.0.0/24', '10.0.1.0/24', '10.0.2.0/24', '10.0.3.0/24']);
  });
  it('caps output but reports the true count', () => {
    const { count, subnets } = splitPrefix(pfx('2001:db8::/32'), 64, 10);
    expect(count).toBe(1n << 32n);
    expect(subnets).toHaveLength(10);
    expect(formatPrefix(subnets[1])).toBe('2001:db8:0:1::/64');
  });
});

describe('parseList', () => {
  it('splits on newlines, commas and strips comments', () => {
    const out = parseList('10.0.0.0/8, 192.168.0.0/16 # home\n\n  bogus\n', parseCIDR);
    expect(out.map((e) => e.text)).toEqual(['10.0.0.0/8', '192.168.0.0/16', 'bogus']);
    expect(out[2].error).toBeTruthy();
    expect(out[2].line).toBe(3);
  });
});

it('formats large counts', () => {
  expect(formatCount(256n)).toBe('256');
  expect(formatCount(1n << 64n)).toBe('2^64');
  expect(formatCount(16777216n)).toBe('16,777,216');
});
