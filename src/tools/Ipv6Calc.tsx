import { useMemo } from 'react';
import { Card, CopyButton, ErrorText, Field, KeyValue, Notice, Select, Stat, ToolHeader } from '../components/ui';
import { useQueryNumber, useQueryState } from '../hooks';
import { v6Details } from '../lib/info';
import { eui64Address, parseMAC } from '../lib/mac';
import { formatCount, formatPrefix, parseCIDR, splitPrefix } from '../lib/prefix';

const COMMON = [48, 52, 56, 60, 64, 72, 80, 96, 112, 120, 124, 126, 127, 128];

export default function Ipv6Calc() {
  const [input, setInput] = useQueryState('q', '2001:db8:abcd:12::1/56');
  const [split, setSplit] = useQueryNumber('split', 0);
  const [mac, setMac] = useQueryState('mac', '');

  const parsed = useMemo(() => {
    try {
      const c = parseCIDR(input);
      if (c.ip.version !== 6) return { error: 'That is an IPv4 address. Use the IPv4 calculator.' };
      return { c, d: v6Details(c) };
    } catch (e) {
      return { error: (e as Error).message };
    }
  }, [input]);

  const c = 'c' in parsed ? parsed.c : undefined;
  const d = 'd' in parsed ? parsed.d : undefined;
  const splitLen = c && split > c.len ? split : 0;
  const subnets = c && splitLen ? splitPrefix(c.prefix, splitLen, 256) : null;

  let slaac: { value?: string; error?: string } | null = null;
  if (c && mac.trim()) {
    try {
      slaac = c.len <= 64 ? { value: eui64Address(c.prefix.network, parseMAC(mac)) } : { error: 'SLAAC needs a prefix of /64 or shorter.' };
    } catch (e) {
      slaac = { error: (e as Error).message };
    }
  }

  const splitOptions = c
    ? Array.from(new Set([...COMMON, Math.min(128, c.len + 4), Math.min(128, c.len + 8)]))
        .filter((l) => l > c.len && l - c.len <= 64)
        .sort((a, b) => a - b)
    : [];

  return (
    <>
      <ToolHeader title="IPv6 calculator">
        Compresses and expands addresses, shows the prefix range and reverse zone, splits prefixes and derives EUI-64 (SLAAC) addresses.
      </ToolHeader>

      <Card>
        <Field label="Address / prefix" value={input} onChange={setInput} placeholder="2001:db8::/48" autoFocus />
        {'error' in parsed && <ErrorText>{parsed.error}</ErrorText>}
        {c?.hostBitsSet && (
          <Notice>
            Host bits are set: the address lies inside <span className="mono">{d!.cidr}</span>.
          </Notice>
        )}
      </Card>

      {c && d && (
        <>
          <div className="stats">
            <Stat label="Prefix" value={d.cidr} />
            <Stat label="Addresses" value={formatCount(d.total)} />
            <Stat label="/64 networks" value={d.subnets64 === null ? '—' : formatCount(d.subnets64)} />
          </div>

          <Card title="Details">
            <KeyValue
              rows={[
                ['Address', d.address],
                ['Expanded', d.expanded],
                ['Prefix', d.cidr],
                ['First address', d.first],
                ['Last address', d.last],
                ['Address type', d.type, ''],
                ['PTR name', d.ptr],
                d.reverseZone ? ['Reverse zone', d.reverseZone] : ['Reverse zone', 'not nibble-aligned (prefix length is not a multiple of 4)', ''],
              ]}
            />
          </Card>

          <Card title="Split prefix">
            {splitOptions.length === 0 ? (
              <p className="muted">This prefix cannot be split further.</p>
            ) : (
              <>
                <div style={{ maxWidth: '18rem' }}>
                  <Select
                    label="New prefix length"
                    value={splitLen}
                    onChange={setSplit}
                    options={[
                      { value: 0, label: 'Choose…' },
                      ...splitOptions.map((l) => ({ value: l, label: `/${l} (${formatCount(1n << BigInt(l - c.len))} subnets)` })),
                    ]}
                  />
                </div>
                {subnets && (
                  <>
                    <p className="muted">
                      {formatCount(subnets.count)} subnets of /{splitLen}
                      {subnets.count > BigInt(subnets.subnets.length) && `, showing the first ${subnets.subnets.length}`}.
                    </p>
                    <ol className="subnet-list mono">
                      {subnets.subnets.map((s, i) => (
                        <li key={i}>{formatPrefix(s)}</li>
                      ))}
                    </ol>
                    <div className="actions">
                      <CopyButton label="Copy list" text={subnets.subnets.map(formatPrefix).join('\n')} />
                    </div>
                  </>
                )}
              </>
            )}
          </Card>

          <Card title="EUI-64 / SLAAC address">
            <Field label="MAC address" value={mac} onChange={setMac} placeholder="00:1b:63:84:45:e6" width="22rem" />
            {slaac?.error && <ErrorText>{slaac.error}</ErrorText>}
            {slaac?.value && <KeyValue rows={[['SLAAC address', slaac.value]]} />}
            <p className="hint">Uses the first 64 bits of the prefix above, flips the universal/local bit and inserts ff:fe (RFC 4291).</p>
          </Card>
        </>
      )}
    </>
  );
}
