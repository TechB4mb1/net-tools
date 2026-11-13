/** Variable-length subnet mask (VLSM) allocation for IPv4. */
import { ParseError } from './ip';
import { blockSize, makePrefix, prefixLast, rangeToPrefixes, type Prefix } from './prefix';

export interface VlsmRequest {
  name: string;
  hosts: number;
}

export interface VlsmAllocation {
  name: string;
  hosts: number;
  prefix: Prefix;
  usable: bigint;
  /** Usable addresses that were not requested. */
  spare: bigint;
}

export interface VlsmResult {
  allocations: VlsmAllocation[];
  /** Requests that did not fit in the base block. */
  unplaced: VlsmRequest[];
  /** Remaining free space as aligned prefixes. */
  free: Prefix[];
  used: bigint;
  total: bigint;
}

export interface VlsmOptions {
  /** Use /31 for links needing at most 2 hosts (RFC 3021). */
  p2p31?: boolean;
}

/** Smallest IPv4 prefix length giving at least `hosts` usable addresses. */
export function lengthForHosts(hosts: number, opts: VlsmOptions = {}): number {
  if (!Number.isInteger(hosts) || hosts < 1) throw new ParseError('Host count must be a whole number of at least 1');
  if (opts.p2p31 && hosts <= 2) return 31;
  const needed = BigInt(hosts) + 2n; // network + broadcast
  let k = 0;
  while (1n << BigInt(k) < needed) k++;
  if (k > 32) throw new ParseError(`${hosts} hosts do not fit in IPv4`);
  return 32 - k;
}

export const usableHosts = (len: number): bigint => (len === 32 ? 1n : len === 31 ? 2n : blockSize(4, len) - 2n);

/**
 * Allocate subnets largest-first. Because every block is a power of two and
 * blocks are placed in descending size order, each one is naturally aligned.
 */
export function allocateVlsm(base: Prefix, requests: VlsmRequest[], opts: VlsmOptions = {}): VlsmResult {
  if (base.version !== 4) throw new ParseError('VLSM planning is for IPv4 blocks');
  const sized = requests.map((r, order) => ({ ...r, order, len: lengthForHosts(r.hosts, opts) }));
  sized.sort((a, b) => a.len - b.len || a.order - b.order);

  const baseLast = prefixLast(base);
  let cursor = base.network;
  const allocations: VlsmAllocation[] = [];
  const unplaced: VlsmRequest[] = [];
  for (const r of sized) {
    const size = blockSize(4, r.len);
    if (r.len < base.len || cursor + size - 1n > baseLast) {
      unplaced.push({ name: r.name, hosts: r.hosts });
      continue;
    }
    const usable = usableHosts(r.len);
    allocations.push({
      name: r.name,
      hosts: r.hosts,
      prefix: makePrefix(4, cursor, r.len),
      usable,
      spare: usable - BigInt(r.hosts),
    });
    cursor += size;
  }
  const total = blockSize(4, base.len);
  const used = cursor - base.network;
  const free = cursor <= baseLast ? rangeToPrefixes({ version: 4, start: cursor, end: baseLast }) : [];
  return { allocations, unplaced, free, used, total };
}

/** Parse lines like "Sales 50", "Sales: 50" or "50 Sales". */
export function parseVlsmLine(line: string, index: number): VlsmRequest {
  const t = line.trim();
  let m = t.match(/^(.*?)[\s:=,]+(\d+)$/);
  if (m && m[1]) return { name: m[1].trim(), hosts: Number(m[2]) };
  m = t.match(/^(\d+)(?:[\s:=,]+(.*))?$/);
  if (m) return { name: m[2]?.trim() || `Subnet ${index + 1}`, hosts: Number(m[1]) };
  throw new ParseError(`Cannot read "${t}": use "name hosts", e.g. "Sales 50"`);
}
