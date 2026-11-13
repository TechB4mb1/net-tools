import { useMemo, useState } from 'react';
import { Card, Checkbox, CodeBlock, ErrorText, Field, KeyValue, LineErrors, Select, TextArea, ToolHeader } from '../components/ui';
import { useQueryNumber, useQueryState } from '../hooks';
import { ACL_STYLES, generateAcl, maskTable, type AclOptions, type AclStyle } from '../lib/acl';
import { parseIPv4 } from '../lib/ip';
import { formatMaskV4, formatWildcardV4, maskToLen, parseList, parseRangeOrPrefix, rangeToPrefixes, summarize, type Range } from '../lib/prefix';

const EXAMPLE = `10.10.0.0/16
192.168.100.0 255.255.255.0
203.0.113.7
198.51.100.10 - 198.51.100.20
2001:db8:100::/48`;

function MaskConverter() {
  const [value, setValue] = useState('0.0.0.255');
  let rows: [string, string][] | null = null;
  let error: string | undefined;
  if (value.trim()) {
    const s = value.trim().replace(/^\//, '');
    try {
      let len: number;
      if (/^\d{1,2}$/.test(s)) {
        len = Number(s);
        if (len > 32) throw new Error('Prefix length must be 0-32');
      } else {
        const v = parseIPv4(s);
        const asMask = maskToLen(4, v);
        const asWildcard = maskToLen(4, 0xffffffffn ^ v);
        if (asMask === null && asWildcard === null) throw new Error('Not a contiguous mask or wildcard');
        // An all-zeros or all-ones value is ambiguous; prefer reading it as a wildcard when it starts with 0.
        len = asMask !== null && !(s.startsWith('0') && asWildcard !== null) ? asMask : asWildcard!;
      }
      rows = [
        ['Prefix length', `/${len}`],
        ['Netmask', formatMaskV4(len)],
        ['Wildcard', formatWildcardV4(len)],
        ['Addresses', (2 ** (32 - len)).toLocaleString('en-US')],
      ];
    } catch (e) {
      error = (e as Error).message;
    }
  }
  return (
    <>
      <Field label="Mask, wildcard or /length" value={value} onChange={setValue} placeholder="255.255.240.0" width="20rem" />
      {error && <ErrorText>{error}</ErrorText>}
      {rows && <KeyValue rows={rows} />}
    </>
  );
}

export default function Acl() {
  const [text, setText] = useQueryState('q', EXAMPLE);
  const [style, setStyle] = useQueryState('style', 'cisco-standard');
  const [name, setName] = useQueryState('name', 'MGMT-ACCESS');
  const [action, setAction] = useQueryState('action', 'permit');
  const [match, setMatch] = useQueryState('match', 'source');
  const [seqStart, setSeqStart] = useQueryNumber('seq', 10);
  const [seqStep, setSeqStep] = useQueryNumber('step', 10);
  const [merge, setMerge] = useQueryState('merge', '0');
  const [showTable, setShowTable] = useState(false);

  const r = useMemo(() => {
    const entries = parseList(text, parseRangeOrPrefix);
    const ranges = entries.filter((e) => e.value).map((e) => e.value as Range);
    const prefixes = merge === '1' ? summarize(ranges) : ranges.flatMap(rangeToPrefixes);
    const opts: AclOptions = {
      style: style as AclStyle,
      name,
      action: action as 'permit' | 'deny',
      match: match as 'source' | 'destination',
      seqStart,
      seqStep,
    };
    return { entries, prefixes, code: generateAcl(prefixes, opts) };
  }, [text, style, name, action, match, seqStart, seqStep, merge]);

  const usesSeq = style === 'cisco-prefix-list' || ((style === 'cisco-standard' || style === 'cisco-extended') && !/^\d+$/.test(name.trim()));

  return (
    <>
      <ToolHeader title="ACL & wildcard builder">
        Turns a list of prefixes, addresses or ranges into ACL, prefix-list or address-list lines. Ranges are split into exact CIDR blocks.
      </ToolHeader>

      <div className="split">
        <Card title="Input">
          <TextArea label="Prefixes, addresses or ranges" value={text} onChange={setText} rows={10} />
          <LineErrors errors={r.entries} />
          <Checkbox label="Summarize before generating (fewest lines)" checked={merge === '1'} onChange={(v) => setMerge(v ? '1' : '0')} />
        </Card>
        <Card title="Options">
          <Select label="Format" value={style} onChange={setStyle} options={ACL_STYLES.map((s) => ({ value: s.id, label: s.label }))} />
          <Field label="Name or number" value={name} onChange={setName} hint="A number gives a numbered Cisco ACL (e.g. 10 or 110)." />
          <div className="row">
            <Select
              label="Action"
              value={action}
              onChange={setAction}
              options={[
                { value: 'permit', label: 'permit' },
                { value: 'deny', label: 'deny' },
              ]}
            />
            {style === 'cisco-extended' && (
              <Select
                label="Match prefixes as"
                value={match}
                onChange={setMatch}
                options={[
                  { value: 'source', label: 'source' },
                  { value: 'destination', label: 'destination' },
                ]}
              />
            )}
          </div>
          {usesSeq && (
            <div className="row">
              <Field label="First sequence (0 = none)" type="number" value={String(seqStart)} onChange={(v) => setSeqStart(Math.max(0, Number(v) || 0))} />
              <Field label="Step" type="number" value={String(seqStep)} onChange={(v) => setSeqStep(Math.max(1, Number(v) || 1))} />
            </div>
          )}
        </Card>
      </div>

      <Card title={`Output (${r.prefixes.length} prefix${r.prefixes.length === 1 ? '' : 'es'})`}>
        <CodeBlock code={r.code} empty="Enter at least one prefix." />
      </Card>

      <Card
        title="Mask ↔ wildcard"
        actions={
          <button type="button" className="link" onClick={() => setShowTable((x) => !x)}>
            {showTable ? 'Hide' : 'Show'} reference table
          </button>
        }
      >
        <MaskConverter />
        {showTable && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Length</th>
                  <th>Netmask</th>
                  <th>Wildcard</th>
                  <th className="num">Addresses</th>
                </tr>
              </thead>
              <tbody>
                {maskTable().map((m) => (
                  <tr key={m.len}>
                    <td className="mono">/{m.len}</td>
                    <td className="mono">{m.mask}</td>
                    <td className="mono">{m.wildcard}</td>
                    <td className="num">{(2 ** (32 - m.len)).toLocaleString('en-US')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
