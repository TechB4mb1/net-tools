import { useMemo } from 'react';
import { Card, ErrorText, Field, LineErrors, Notice, TextArea, ToolHeader } from '../components/ui';
import { useQueryState } from '../hooks';
import { parseIP } from '../lib/ip';
import { parseList, parseRangeOrPrefix, rangeContains, relation, type ListEntry, type Range, type Relation } from '../lib/prefix';

const A_EXAMPLE = `10.0.0.0/16      # HQ
10.1.0.0/16      # Branch
172.16.0.0/20
192.168.50.0/24`;

const B_EXAMPLE = `10.0.128.0/24    # Partner VPN
172.16.8.0/22
192.168.60.0/24`;

/** Entries are shown as typed (comments are already stripped). */
const label = (e: ListEntry<Range>): string => e.text;

const REL_TEXT: Record<Exclude<Relation, 'disjoint'>, string> = {
  equal: 'identical to',
  contains: 'contains',
  within: 'is inside',
  partial: 'partially overlaps',
};

interface Hit {
  a: ListEntry<Range>;
  b: ListEntry<Range>;
  rel: Exclude<Relation, 'disjoint'>;
}

export default function Overlap() {
  const [aText, setAText] = useQueryState('a', A_EXAMPLE);
  const [bText, setBText] = useQueryState('b', B_EXAMPLE);
  const [lookup, setLookup] = useQueryState('ip', '');

  const r = useMemo(() => {
    const a = parseList(aText, parseRangeOrPrefix);
    const b = parseList(bText, parseRangeOrPrefix);
    const okA = a.filter((e) => e.value);
    const okB = b.filter((e) => e.value);
    const hits: Hit[] = [];
    if (okB.length) {
      for (const x of okA)
        for (const y of okB) {
          const rel = relation(x.value!, y.value!);
          if (rel !== 'disjoint') hits.push({ a: x, b: y, rel });
        }
    } else {
      for (let i = 0; i < okA.length; i++)
        for (let j = i + 1; j < okA.length; j++) {
          const rel = relation(okA[i].value!, okA[j].value!);
          if (rel !== 'disjoint') hits.push({ a: okA[i], b: okA[j], rel });
        }
    }
    return { a, b, okA, okB, hits };
  }, [aText, bText]);

  const lookupResult = useMemo(() => {
    if (!lookup.trim()) return null;
    try {
      const ip = parseIP(lookup);
      return {
        inA: r.okA.filter((e) => rangeContains(e.value!, ip)),
        inB: r.okB.filter((e) => rangeContains(e.value!, ip)),
      };
    } catch (e) {
      return { error: (e as Error).message };
    }
  }, [lookup, r]);

  const mode = r.okB.length ? 'between lists A and B' : 'within list A';

  return (
    <>
      <ToolHeader title="Overlap checker">
        Finds overlapping prefixes between two lists, for example your LAN plan against a partner's VPN networks or a cloud VPC. Leave list B empty to
        check list A against itself.
      </ToolHeader>

      <div className="split">
        <Card title="List A">
          <TextArea label="Prefixes or ranges" value={aText} onChange={setAText} rows={9} />
          <LineErrors errors={r.a} />
        </Card>
        <Card title="List B (optional)">
          <TextArea label="Prefixes or ranges" value={bText} onChange={setBText} rows={9} />
          <LineErrors errors={r.b} />
        </Card>
      </div>

      <Card title={`Overlaps ${mode}`}>
        {r.hits.length === 0 ? (
          <Notice>No overlaps found.</Notice>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{r.okB.length ? 'List A' : 'Entry'}</th>
                  <th>Relation</th>
                  <th>{r.okB.length ? 'List B' : 'Entry'}</th>
                </tr>
              </thead>
              <tbody>
                {r.hits.map((h, i) => (
                  <tr key={i}>
                    <td className="mono">
                      {label(h.a)} <span className="muted">(line {h.a.line})</span>
                    </td>
                    <td>
                      <span className={`badge badge-${h.rel}`}>{REL_TEXT[h.rel]}</span>
                    </td>
                    <td className="mono">
                      {label(h.b)} <span className="muted">(line {h.b.line})</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Which entries contain an address?">
        <Field label="IP address" value={lookup} onChange={setLookup} placeholder="10.0.128.15" width="22rem" />
        {lookupResult && 'error' in lookupResult && <ErrorText>{lookupResult.error}</ErrorText>}
        {lookupResult && 'inA' in lookupResult && (
          <ul className="plain">
            <li>
              <strong>List A:</strong>{' '}
              {lookupResult.inA!.length ? <span className="mono">{lookupResult.inA!.map(label).join(', ')}</span> : <span className="muted">no match</span>}
            </li>
            {r.okB.length > 0 && (
              <li>
                <strong>List B:</strong>{' '}
                {lookupResult.inB!.length ? <span className="mono">{lookupResult.inB!.map(label).join(', ')}</span> : <span className="muted">no match</span>}
              </li>
            )}
          </ul>
        )}
      </Card>
    </>
  );
}
