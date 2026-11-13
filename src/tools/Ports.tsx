import { useMemo } from 'react';
import { Card, Field, Select, ToolHeader } from '../components/ui';
import { useQueryState } from '../hooks';
import { PORTS, PROTOCOL_NUMBERS, type PortEntry } from '../data/ports';

const portText = (p: PortEntry['port']) => (Array.isArray(p) ? `${p[0]}–${p[1]}` : String(p));
const firstPort = (p: PortEntry['port']) => (Array.isArray(p) ? p[0] : p);

function matches(e: PortEntry, q: string): boolean {
  if (!q) return true;
  if (/^\d+$/.test(q)) {
    const n = Number(q);
    return Array.isArray(e.port) ? n >= e.port[0] && n <= e.port[1] : String(e.port).startsWith(q);
  }
  const s = q.toLowerCase();
  return e.service.toLowerCase().includes(s) || e.description.toLowerCase().includes(s);
}

export default function Ports() {
  const [query, setQuery] = useQueryState('q', '');
  const [proto, setProto] = useQueryState('proto', 'any');

  const rows = useMemo(() => {
    const q = query.trim();
    return PORTS.filter((e) => matches(e, q) && (proto === 'any' || e.proto.includes(proto))).sort((a, b) => firstPort(a.port) - firstPort(b.port));
  }, [query, proto]);

  const protoRows = PROTOCOL_NUMBERS.filter((p) => {
    const q = query.trim().toLowerCase();
    return !q || String(p.num) === q || p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q);
  });

  return (
    <>
      <ToolHeader title="Port & protocol reference">Search by port number, service or keyword. A number inside a range (like 50000) finds the range.</ToolHeader>
      <Card>
        <div className="row">
          <Field label="Search" value={query} onChange={setQuery} placeholder="443, radius, vpn…" mono={false} autoFocus />
          <div style={{ flex: '0 0 10rem' }}>
            <Select
              label="Transport"
              value={proto}
              onChange={setProto}
              options={[
                { value: 'any', label: 'Any' },
                { value: 'TCP', label: 'TCP' },
                { value: 'UDP', label: 'UDP' },
              ]}
            />
          </div>
        </div>
      </Card>

      <Card title={`Ports (${rows.length})`}>
        {rows.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th className="num">Port</th>
                  <th>Transport</th>
                  <th>Service</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e, i) => (
                  <tr key={i}>
                    <td className="num mono">{portText(e.port)}</td>
                    <td>{e.proto}</td>
                    <td className="mono">{e.service}</td>
                    <td>{e.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">No matching ports.</p>
        )}
      </Card>

      {protoRows.length > 0 && (
        <Card title="IP protocol numbers">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th className="num">Number</th>
                  <th>Protocol</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                {protoRows.map((p) => (
                  <tr key={p.num}>
                    <td className="num mono">{p.num}</td>
                    <td className="mono">{p.name}</td>
                    <td>{p.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}
