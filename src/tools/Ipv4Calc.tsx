import { useMemo } from 'react';
import { Card, CopyButton, ErrorText, Field, KeyValue, Notice, Select, Stat, ToolHeader } from '../components/ui';
import { useQueryNumber, useQueryState } from '../hooks';
import { v4Details, reverseZoneV4 } from '../lib/info';
import { formatIPv4 } from '../lib/ip';
import { formatBig, formatMaskV4, parseCIDR, prefixLast, splitPrefix } from '../lib/prefix';

const LENGTHS = Array.from({ length: 33 }, (_, i) => i);

function BitView({ value, len }: { value: bigint; len: number }) {
  const bits = value.toString(2).padStart(32, '0');
  return (
    <div className="bits mono" aria-label="Address bits; network part highlighted">
      {[0, 1, 2, 3].map((octet) => (
        <span key={octet} className="bits-octet">
          {bits
            .slice(octet * 8, octet * 8 + 8)
            .split('')
            .map((b, i) => (
              <span key={i} className={octet * 8 + i < len ? 'bit-net' : 'bit-host'}>
                {b}
              </span>
            ))}
        </span>
      ))}
    </div>
  );
}

export default function Ipv4Calc() {
  const [input, setInput] = useQueryState('q', '192.168.10.77/24');
  const [split, setSplit] = useQueryNumber('split', 0);

  const parsed = useMemo(() => {
    try {
      const c = parseCIDR(input);
      if (c.ip.version !== 4) return { error: 'That is an IPv6 address. Use the IPv6 calculator.' };
      return { c, d: v4Details(c) };
    } catch (e) {
      return { error: (e as Error).message };
    }
  }, [input]);

  const setLen = (len: number) => {
    const addr = input.split(/[\s/]/)[0];
    setInput(`${addr}/${len}`);
  };

  const c = 'c' in parsed ? parsed.c : undefined;
  const d = 'd' in parsed ? parsed.d : undefined;
  const splitLen = c && split > c.len ? split : 0;
  const subnets = c && splitLen ? splitPrefix(c.prefix, splitLen, 256) : null;

  return (
    <>
      <ToolHeader title="IPv4 subnet calculator">
        Accepts <code>10.0.0.5/24</code>, <code>10.0.0.5 255.255.255.0</code>, <code>10.0.0.5/255.255.255.0</code> or a bare address.
      </ToolHeader>

      <Card>
        <div className="row">
          <Field label="Address / prefix" value={input} onChange={setInput} placeholder="192.168.1.0/24" autoFocus />
          <div style={{ flex: '0 0 15rem' }}>
            <Select
              label="Prefix length"
              value={c?.len ?? 24}
              onChange={setLen}
              options={LENGTHS.map((l) => ({ value: l, label: `/${l}  ${formatMaskV4(l)}` }))}
            />
          </div>
        </div>
        {'error' in parsed && <ErrorText>{parsed.error}</ErrorText>}
        {c?.hostBitsSet && (
          <Notice>
            Host bits are set: {d!.address} lies inside network <span className="mono">{d!.cidr}</span>.
          </Notice>
        )}
      </Card>

      {c && d && (
        <>
          <div className="stats">
            <Stat label="Network" value={d.cidr} />
            <Stat label="Usable hosts" value={formatBig(d.usable)} sub={`${formatBig(d.total)} addresses`} />
            <Stat label="Host range" value={`${d.firstHost} – ${d.lastHost}`} />
          </div>

          <Card title="Details">
            {d.note && <Notice>{d.note}</Notice>}
            <KeyValue
              rows={[
                ['Address', d.address],
                ['Network', d.network],
                ['CIDR', d.cidr],
                ['Netmask', d.mask],
                ['Wildcard', d.wildcard],
                ['Broadcast', d.broadcast, d.broadcast === 'n/a' ? '' : undefined],
                ['First usable', d.firstHost],
                ['Last usable', d.lastHost],
                ['Total addresses', formatBig(d.total)],
                ['Usable hosts', formatBig(d.usable)],
                ['Address type', d.type, ''],
                ['Historic class', d.cls, ''],
                ['PTR name', d.ptr],
                reverseZoneV4(c.prefix) ? ['Reverse zone', reverseZoneV4(c.prefix)!] : null,
              ]}
            />
          </Card>

          <Card title="Bits">
            <div className="bit-grid">
              <span className="muted">Address</span>
              <BitView value={c.ip.value} len={c.len} />
              <span className="muted">Netmask</span>
              <BitView value={((1n << 32n) - 1n) ^ ((1n << BigInt(32 - c.len)) - 1n)} len={c.len} />
            </div>
            <p className="hint">
              <span className="bit-net">■</span> network bits ({c.len}) &nbsp; <span className="bit-host">■</span> host bits ({32 - c.len})
            </p>
          </Card>

          <Card title="Split into subnets">
            {c.len >= 32 ? (
              <p className="muted">A /32 cannot be split.</p>
            ) : (
              <>
                <div style={{ maxWidth: '16rem' }}>
                  <Select
                    label="New prefix length"
                    value={splitLen}
                    onChange={setSplit}
                    options={[
                      { value: 0, label: 'Choose…' },
                      ...LENGTHS.filter((l) => l > c.len).map((l) => ({
                        value: l,
                        label: `/${l} (${formatBig(1n << BigInt(l - c.len))} subnets)`,
                      })),
                    ]}
                  />
                </div>
                {subnets && (
                  <>
                    <p className="muted">
                      {formatBig(subnets.count)} subnets of /{splitLen}
                      {subnets.count > BigInt(subnets.subnets.length) && `, showing the first ${subnets.subnets.length}`}.
                    </p>
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>#</th>
                            <th>Subnet</th>
                            <th>Host range</th>
                            <th>Broadcast</th>
                          </tr>
                        </thead>
                        <tbody>
                          {subnets.subnets.map((s, i) => {
                            const last = prefixLast(s);
                            const small = s.len >= 31;
                            return (
                              <tr key={i}>
                                <td className="muted">{i + 1}</td>
                                <td className="mono">
                                  {formatIPv4(s.network)}/{s.len}
                                </td>
                                <td className="mono">
                                  {formatIPv4(small ? s.network : s.network + 1n)} – {formatIPv4(small ? last : last - 1n)}
                                </td>
                                <td className="mono">{small ? '—' : formatIPv4(last)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div className="actions">
                      <CopyButton
                        label="Copy list"
                        text={subnets.subnets.map((s) => `${formatIPv4(s.network)}/${s.len}`).join('\n')}
                      />
                    </div>
                  </>
                )}
              </>
            )}
          </Card>
        </>
      )}
    </>
  );
}
