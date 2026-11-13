import { useMemo } from 'react';
import { Card, CopyButton, KeyValue, LineErrors, Notice, Stat, TextArea, ToolHeader } from '../components/ui';
import { useQueryState } from '../hooks';
import {
  coveringPrefix,
  formatBig,
  formatCount,
  formatPrefix,
  parseList,
  parseRangeOrPrefix,
  prefixToRange,
  rangeSize,
  summarize,
  type Range,
} from '../lib/prefix';

const EXAMPLE = `192.168.0.0/24
192.168.1.0/24
192.168.2.0/24
192.168.3.0/24
10.0.0.1 - 10.0.0.30
2001:db8:0:0::/64
2001:db8:0:1::/64`;

export default function Summarize() {
  const [text, setText] = useQueryState('q', EXAMPLE);

  const r = useMemo(() => {
    const entries = parseList(text, parseRangeOrPrefix);
    const ranges = entries.filter((e) => e.value).map((e) => e.value as Range);
    const summary = summarize(ranges);
    const total = (rs: Range[]) => rs.reduce((acc, x) => acc + rangeSize(x), 0n);
    const families = ([4, 6] as const)
      .map((v) => {
        const rs = ranges.filter((x) => x.version === v);
        if (!rs.length) return null;
        const cover = coveringPrefix(rs)!;
        const covered = total(summary.filter((p) => p.version === v).map(prefixToRange));
        return { v, cover, extra: rangeSize(prefixToRange(cover)) - covered, covered };
      })
      .filter((x) => x !== null);
    return { entries, ranges, summary, families };
  }, [text]);

  const out = r.summary.map(formatPrefix).join('\n');

  return (
    <>
      <ToolHeader title="Route summarizer">
        Collapses prefixes, addresses and ranges (<code>a - b</code>) into the fewest CIDR blocks that cover exactly the same addresses. It also shows the
        single smallest supernet, which may cover extra space.
      </ToolHeader>
      <div className="split">
        <Card title="Input">
          <TextArea label="Prefixes, addresses or ranges" value={text} onChange={setText} rows={14} hint="One per line, or separated by commas. # starts a comment." />
          <LineErrors errors={r.entries} />
        </Card>
        <Card title="Exact summary" actions={out && <CopyButton text={out} />}>
          {r.summary.length ? (
            <>
              <p className="muted">
                {r.ranges.length} entr{r.ranges.length === 1 ? 'y' : 'ies'} → {r.summary.length} prefix{r.summary.length === 1 ? '' : 'es'}
              </p>
              <pre className="code">{out}</pre>
            </>
          ) : (
            <p className="muted">Enter some prefixes.</p>
          )}
        </Card>
      </div>

      {r.families.map((f) => (
        <Card key={f.v} title={`Single covering supernet (IPv${f.v})`}>
          <div className="stats">
            <Stat label="Supernet" value={formatPrefix(f.cover)} />
            <Stat label="Addresses covered by input" value={formatCount(f.covered)} />
            <Stat label="Extra addresses included" value={formatCount(f.extra)} />
          </div>
          {f.extra > 0n ? (
            <Notice tone="warn">
              Advertising {formatPrefix(f.cover)} also attracts {formatBig(f.extra)} addresses that are not in your input. Use the exact summary if that matters.
            </Notice>
          ) : (
            <KeyValue rows={[['Result', 'The supernet matches the input exactly.', '']]} />
          )}
        </Card>
      ))}
    </>
  );
}
