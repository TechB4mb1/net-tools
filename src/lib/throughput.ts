/** Bandwidth, transfer time and TCP performance calculations. */

export interface Unit {
  id: string;
  label: string;
  /** Multiplier to the base unit (bytes for sizes, bits/s for rates). */
  factor: number;
}

export const SIZE_UNITS: Unit[] = [
  { id: 'B', label: 'B', factor: 1 },
  { id: 'KB', label: 'KB', factor: 1e3 },
  { id: 'MB', label: 'MB', factor: 1e6 },
  { id: 'GB', label: 'GB', factor: 1e9 },
  { id: 'TB', label: 'TB', factor: 1e12 },
  { id: 'KiB', label: 'KiB', factor: 2 ** 10 },
  { id: 'MiB', label: 'MiB', factor: 2 ** 20 },
  { id: 'GiB', label: 'GiB', factor: 2 ** 30 },
  { id: 'TiB', label: 'TiB', factor: 2 ** 40 },
];

export const RATE_UNITS: Unit[] = [
  { id: 'bps', label: 'bit/s', factor: 1 },
  { id: 'Kbps', label: 'Kbit/s', factor: 1e3 },
  { id: 'Mbps', label: 'Mbit/s', factor: 1e6 },
  { id: 'Gbps', label: 'Gbit/s', factor: 1e9 },
  { id: 'Tbps', label: 'Tbit/s', factor: 1e12 },
  { id: 'Bps', label: 'B/s', factor: 8 },
  { id: 'KBps', label: 'KB/s', factor: 8e3 },
  { id: 'MBps', label: 'MB/s', factor: 8e6 },
  { id: 'GBps', label: 'GB/s', factor: 8e9 },
  { id: 'MiBps', label: 'MiB/s', factor: 8 * 2 ** 20 },
];

export const unit = (list: Unit[], id: string): Unit => list.find((u) => u.id === id) ?? list[0];

/** Seconds to move `bytes` at `bps`, with protocol efficiency 0-1. */
export const transferSeconds = (bytes: number, bps: number, efficiency = 1): number => (bytes * 8) / (bps * efficiency);

/** Rate (bit/s) needed to move `bytes` in `seconds`. */
export const requiredRate = (bytes: number, seconds: number, efficiency = 1): number => (bytes * 8) / seconds / efficiency;

/** Bandwidth-delay product in bytes. */
export const bdpBytes = (bps: number, rttSeconds: number): number => (bps * rttSeconds) / 8;

/** Maximum single-flow TCP throughput (bit/s) for a window size and RTT. */
export const windowLimitedRate = (windowBytes: number, rttSeconds: number): number => (windowBytes * 8) / rttSeconds;

/** Smallest TCP window-scale shift so that 65535 << shift >= bytes (max 14, RFC 7323). */
export function windowScale(bytes: number): number | null {
  for (let s = 0; s <= 14; s++) if (65535 * 2 ** s >= bytes) return s;
  return null;
}

/**
 * Mathis et al. upper bound for a single Reno-style flow:
 * rate <= (MSS / RTT) * (C / sqrt(p)), C = sqrt(3/2).
 */
export const mathisRate = (mssBytes: number, rttSeconds: number, lossFraction: number): number =>
  ((mssBytes * 8) / rttSeconds) * (Math.sqrt(1.5) / Math.sqrt(lossFraction));

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds)) return '∞';
  if (seconds < 1e-3) return `${(seconds * 1e6).toPrecision(3)} µs`;
  if (seconds < 1) return `${(seconds * 1e3).toPrecision(3)} ms`;
  if (seconds < 60) return `${Number(seconds.toPrecision(3))} s`;
  const units: [string, number][] = [
    ['d', 86400],
    ['h', 3600],
    ['m', 60],
    ['s', 1],
  ];
  let rest = Math.round(seconds);
  const parts: string[] = [];
  for (const [u, n] of units) {
    const q = Math.floor(rest / n);
    if (q > 0) parts.push(`${q}${u}`);
    rest -= q * n;
  }
  return parts.join(' ');
}

const fmtNum = (n: number) => (n >= 100 ? n.toFixed(0) : n >= 10 ? n.toFixed(1) : n.toFixed(2)).replace(/\.0+$|(\.\d*?)0+$/, '$1');

export function formatRate(bps: number): string {
  if (!Number.isFinite(bps)) return '∞';
  const steps: [string, number][] = [
    ['Tbit/s', 1e12],
    ['Gbit/s', 1e9],
    ['Mbit/s', 1e6],
    ['Kbit/s', 1e3],
  ];
  for (const [u, f] of steps) if (bps >= f) return `${fmtNum(bps / f)} ${u}`;
  return `${fmtNum(bps)} bit/s`;
}

export function formatBytes(bytes: number, binary = false): string {
  const base = binary ? 1024 : 1000;
  const units = binary ? ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB'] : ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  let i = 0;
  let v = bytes;
  while (v >= base && i < units.length - 1) {
    v /= base;
    i++;
  }
  return `${fmtNum(v)} ${units[i]}`;
}
