import type { ReactNode } from 'react';
import { Card, Field, KeyValue, Notice, Select, Stat, ToolHeader } from '../components/ui';
import { useQueryState } from '../hooks';
import {
  bdpBytes,
  formatBytes,
  formatDuration,
  formatRate,
  mathisRate,
  RATE_UNITS,
  requiredRate,
  SIZE_UNITS,
  transferSeconds,
  unit,
  windowLimitedRate,
  windowScale,
} from '../lib/throughput';

const num = (s: string): number => {
  const n = Number(s.replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? n : NaN;
};

function UnitInput({
  label,
  value,
  onValue,
  unitId,
  onUnit,
  units,
}: {
  label: string;
  value: string;
  onValue: (v: string) => void;
  unitId: string;
  onUnit: (v: string) => void;
  units: typeof SIZE_UNITS;
}) {
  return (
    <div className="row tight">
      <Field label={label} value={value} onChange={onValue} />
      <div style={{ flex: '0 0 8rem' }}>
        <Select label="Unit" value={unitId} onChange={onUnit} options={units.map((u) => ({ value: u.id, label: u.label }))} />
      </div>
    </div>
  );
}

function Result({ ok, children }: { ok: boolean; children: ReactNode }) {
  return ok ? <>{children}</> : <p className="muted">Enter positive numbers to see results.</p>;
}

function TransferTime() {
  const [size, setSize] = useQueryState('size', '50');
  const [sizeUnit, setSizeUnit] = useQueryState('su', 'GB');
  const [rate, setRate] = useQueryState('rate', '200');
  const [rateUnit, setRateUnit] = useQueryState('ru', 'Mbps');
  const [eff, setEff] = useQueryState('eff', '95');
  const [target, setTarget] = useQueryState('target', '60');

  const bytes = num(size) * unit(SIZE_UNITS, sizeUnit).factor;
  const bps = num(rate) * unit(RATE_UNITS, rateUnit).factor;
  const e = Math.min(100, num(eff) || 100) / 100;
  const t = transferSeconds(bytes, bps, e);
  const minutes = num(target);
  const ok = Number.isFinite(t);

  return (
    <Card title="Transfer time">
      <div className="split">
        <UnitInput label="Data size" value={size} onValue={setSize} unitId={sizeUnit} onUnit={setSizeUnit} units={SIZE_UNITS} />
        <UnitInput label="Link rate" value={rate} onValue={setRate} unitId={rateUnit} onUnit={setRateUnit} units={RATE_UNITS} />
      </div>
      <Field label="Efficiency (%)" value={eff} onChange={setEff} width="12rem" hint="Protocol overhead: ~95% for TCP over Ethernet, lower for VPNs or lossy links." />
      <Result ok={ok}>
        <div className="stats">
          <Stat label="Time to transfer" value={formatDuration(t)} sub={`${formatBytes(bytes)} at ${formatRate(bps * e)} effective`} />
          <Stat label="Data per hour" value={formatBytes((bps * e * 3600) / 8)} />
          <Stat label="Data per day" value={formatBytes((bps * e * 86400) / 8)} />
        </div>
      </Result>
      <Field label="Finish within (minutes)" value={target} onChange={setTarget} width="16rem" />
      {Number.isFinite(bytes) && Number.isFinite(minutes) && (
        <p>
          Needs at least <strong className="mono">{formatRate(requiredRate(bytes, minutes * 60, e))}</strong> to move {formatBytes(bytes)} in {formatDuration(minutes * 60)}.
        </p>
      )}
    </Card>
  );
}

function RateConverter() {
  const [value, setValue] = useQueryState('cv', '1');
  const [from, setFrom] = useQueryState('cu', 'Gbps');
  const bps = num(value) * unit(RATE_UNITS, from).factor;
  return (
    <Card title="Rate converter">
      <UnitInput label="Rate" value={value} onValue={setValue} unitId={from} onUnit={setFrom} units={RATE_UNITS} />
      <Result ok={Number.isFinite(bps)}>
        <KeyValue
          rows={RATE_UNITS.map((u): [string, string] => {
            const v = bps / u.factor;
            return [u.label, Number(v.toPrecision(6)).toLocaleString('en-US', { maximumFractionDigits: 6 })];
          })}
        />
      </Result>
    </Card>
  );
}

function TcpPerformance() {
  const [bw, setBw] = useQueryState('bw', '1');
  const [bwUnit, setBwUnit] = useQueryState('bwu', 'Gbps');
  const [rtt, setRtt] = useQueryState('rtt', '80');
  const [win, setWin] = useQueryState('win', '64');
  const [winUnit, setWinUnit] = useQueryState('winu', 'KiB');
  const [mss, setMss] = useQueryState('mss', '1460');
  const [loss, setLoss] = useQueryState('loss', '0.01');

  const bps = num(bw) * unit(RATE_UNITS, bwUnit).factor;
  const rttS = num(rtt) / 1000;
  const winBytes = num(win) * unit(SIZE_UNITS, winUnit).factor;
  const bdp = bdpBytes(bps, rttS);
  const scale = windowScale(bdp);
  const winRate = windowLimitedRate(winBytes, rttS);
  const lossFrac = num(loss) / 100;
  const mathis = mathisRate(num(mss), rttS, lossFrac);

  return (
    <Card title="TCP performance">
      <div className="split">
        <UnitInput label="Path bandwidth" value={bw} onValue={setBw} unitId={bwUnit} onUnit={setBwUnit} units={RATE_UNITS} />
        <Field label="Round-trip time (ms)" value={rtt} onChange={setRtt} />
      </div>
      <Result ok={Number.isFinite(bdp)}>
        <div className="stats">
          <Stat label="Bandwidth-delay product" value={formatBytes(bdp, true)} sub="Window needed to fill the path" />
          <Stat label="Window scale needed" value={scale === null ? '> 14 (exceeds TCP max)' : String(scale)} sub="RFC 7323 shift count" />
        </div>
      </Result>

      <h3>Window-limited throughput</h3>
      <UnitInput label="TCP window" value={win} onValue={setWin} unitId={winUnit} onUnit={setWinUnit} units={SIZE_UNITS} />
      <Result ok={Number.isFinite(winRate)}>
        <p>
          A single flow with a {formatBytes(winBytes, true)} window over {rtt} ms tops out at <strong className="mono">{formatRate(winRate)}</strong>
          {Number.isFinite(bps) && winRate < bps && <>, which is {((winRate / bps) * 100).toFixed(1)}% of the path bandwidth</>}.
        </p>
      </Result>

      <h3>Loss-limited throughput (Mathis)</h3>
      <div className="row">
        <Field label="MSS (bytes)" value={mss} onChange={setMss} />
        <Field label="Packet loss (%)" value={loss} onChange={setLoss} />
      </div>
      <Result ok={Number.isFinite(mathis)}>
        <p>
          Upper bound for one loss-based TCP flow (Reno-style): <strong className="mono">{formatRate(mathis)}</strong>.
        </p>
        <Notice>
          Rate ≤ (MSS / RTT) × 1.22 / √loss. Modern congestion control (CUBIC, BBR) can do better, but this is a good sanity check for why a long, lossy
          path is slow.
        </Notice>
      </Result>
    </Card>
  );
}

export default function Throughput() {
  return (
    <>
      <ToolHeader title="Bandwidth & TCP calculator">Transfer times, rate conversions, bandwidth-delay product, and what limits a single TCP flow.</ToolHeader>
      <TransferTime />
      <TcpPerformance />
      <RateConverter />
    </>
  );
}
