import { useMemo } from 'react';
import { Card, Checkbox, CopyButton, ErrorText, Field, LineErrors, Notice, Stat, TextArea, ToolHeader } from '../components/ui';
import { useQueryState } from '../hooks';
import { formatIPv4 } from '../lib/ip';
import { formatBig, formatMaskV4, formatPrefix, parseCIDR, parseList, prefixLast } from '../lib/prefix';
import { allocateVlsm, parseVlsmLine, type VlsmRequest } from '../lib/vlsm';

const EXAMPLE = `Engineering 100
Sales 50
Management 10
WAN link 2`;

export default function Vlsm() {
  const [base, setBase] = useQueryState('base', '192.168.0.0/24');
  const [reqText, setReqText] = useQueryState('req', EXAMPLE);
  const [p2p, setP2p] = useQueryState('p2p', '0');

  const result = useMemo(() => {
    let baseError: string | undefined;
    let prefix;
    try {
      const c = parseCIDR(base);
      if (c.ip.version !== 4) baseError = 'VLSM planning here is for IPv4. For IPv6, allocate /64s per LAN.';
      else prefix = c.prefix;
    } catch (e) {
      baseError = (e as Error).message;
    }
    let i = 0;
    const entries = parseList(reqText.replace(/,/g, ' '), (s) => parseVlsmLine(s, i++));
    const requests = entries.filter((e) => e.value).map((e) => e.value as VlsmRequest);
    let allocError: string | undefined;
    let alloc;
    if (prefix && requests.length) {
      try {
        alloc = allocateVlsm(prefix, requests, { p2p31: p2p === '1' });
      } catch (e) {
        allocError = (e as Error).message;
      }
    }
    return { baseError, prefix, entries, alloc, allocError };
  }, [base, reqText, p2p]);

  const { alloc, prefix } = result;
  const sorted = alloc ? [...alloc.allocations].sort((a, b) => (a.prefix.network < b.prefix.network ? -1 : 1)) : [];
  const csv = sorted
    .map((a) => {
      const last = prefixLast(a.prefix);
      const small = a.prefix.len >= 31;
      return [
        a.name,
        a.hosts,
        formatPrefix(a.prefix),
        formatMaskV4(a.prefix.len),
        formatIPv4(small ? a.prefix.network : a.prefix.network + 1n),
        formatIPv4(small ? last : last - 1n),
        small ? '' : formatIPv4(last),
      ].join(',');
    })
    .join('\n');

  return (
    <>
      <ToolHeader title="VLSM planner">
        Give a block and the hosts each subnet needs. Subnets are placed largest first, so every block stays aligned and the waste stays low.
      </ToolHeader>

      <Card>
        <div className="row">
          <Field label="Address block" value={base} onChange={setBase} placeholder="10.0.0.0/22" width="18rem" />
        </div>
        {result.baseError && <ErrorText>{result.baseError}</ErrorText>}
        <TextArea
          label="Subnets (name and host count, one per line)"
          value={reqText}
          onChange={setReqText}
          rows={7}
          hint={'Examples: "Sales 50", "Floor 2 users: 120", "30"'}
        />
        <LineErrors errors={result.entries} />
        <Checkbox
          label={
            <>
              Use <span className="mono">/31</span> for subnets needing 2 hosts or fewer (point-to-point links, RFC 3021)
            </>
          }
          checked={p2p === '1'}
          onChange={(v) => setP2p(v ? '1' : '0')}
        />
      </Card>

      {result.allocError && <ErrorText>{result.allocError}</ErrorText>}

      {alloc && prefix && (
        <>
          <div className="stats">
            <Stat label="Block" value={formatPrefix(prefix)} sub={`${formatBig(alloc.total)} addresses`} />
            <Stat
              label="Allocated"
              value={`${formatBig(alloc.used)} (${((Number(alloc.used) / Number(alloc.total)) * 100).toFixed(1)}%)`}
              sub={`${alloc.allocations.length} subnet${alloc.allocations.length === 1 ? '' : 's'}`}
            />
            <Stat label="Free" value={formatBig(alloc.total - alloc.used)} sub={`${alloc.free.length} block${alloc.free.length === 1 ? '' : 's'}`} />
          </div>
          <div className="usage-bar" aria-hidden>
            {sorted.map((a, i) => (
              <span
                key={i}
                className="usage-seg"
                style={{ flexGrow: Number(1n << BigInt(32 - a.prefix.len)) }}
                title={`${a.name}: ${formatPrefix(a.prefix)}`}
              />
            ))}
            <span className="usage-free" style={{ flexGrow: Number(alloc.total - alloc.used) }} />
          </div>

          {alloc.unplaced.length > 0 && (
            <Notice tone="warn">
              Did not fit: {alloc.unplaced.map((u) => `${u.name} (${u.hosts} hosts)`).join(', ')}. Use a larger block.
            </Notice>
          )}

          <Card title="Allocation" actions={<CopyButton label="Copy CSV" text={'name,hosts,subnet,mask,first,last,broadcast\n' + csv} />}>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th className="num">Needed</th>
                    <th>Subnet</th>
                    <th>Mask</th>
                    <th>Host range</th>
                    <th>Broadcast</th>
                    <th className="num">Usable</th>
                    <th className="num">Spare</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((a, i) => {
                    const last = prefixLast(a.prefix);
                    const small = a.prefix.len >= 31;
                    return (
                      <tr key={i}>
                        <td>{a.name}</td>
                        <td className="num">{a.hosts}</td>
                        <td className="mono">{formatPrefix(a.prefix)}</td>
                        <td className="mono">{formatMaskV4(a.prefix.len)}</td>
                        <td className="mono">
                          {formatIPv4(small ? a.prefix.network : a.prefix.network + 1n)} – {formatIPv4(small ? last : last - 1n)}
                        </td>
                        <td className="mono">{small ? '—' : formatIPv4(last)}</td>
                        <td className="num">{formatBig(a.usable)}</td>
                        <td className="num muted">{formatBig(a.spare)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          <Card title="Free space" actions={alloc.free.length > 0 && <CopyButton label="Copy" text={alloc.free.map(formatPrefix).join('\n')} />}>
            {alloc.free.length ? (
              <ul className="chip-list mono">
                {alloc.free.map((f, i) => (
                  <li key={i}>{formatPrefix(f)}</li>
                ))}
              </ul>
            ) : (
              <p className="muted">The block is fully allocated.</p>
            )}
          </Card>
        </>
      )}
    </>
  );
}
