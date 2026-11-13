import { useEffect, useMemo, useState } from 'react';
import { Card, CopyButton, KeyValue, LineErrors, Select, TextArea, ToolHeader } from '../components/ui';
import { useQueryState } from '../hooks';
import { parseList } from '../lib/prefix';
import { formatMAC, linkLocalFromMAC, loadOuiDb, lookupVendor, MAC_STYLES, macFlags, ouiOf, parseMAC, type MacStyle, type OuiDb } from '../lib/mac';

function useOuiDb() {
  const [db, setDb] = useState<OuiDb | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    loadOuiDb()
      .then((d) => live && setDb(d))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, []);
  return { db, failed };
}

function vendorText(db: OuiDb | null, failed: boolean, bytes: Uint8Array): string {
  const f = macFlags(bytes);
  if (f.broadcast) return 'Broadcast';
  if (f.multicast) return bytes[0] === 0x01 && bytes[1] === 0x00 && bytes[2] === 0x5e ? 'IPv4 multicast' : bytes[0] === 0x33 && bytes[1] === 0x33 ? 'IPv6 multicast' : 'Multicast';
  if (f.locallyAdministered) return 'Locally administered (randomized or virtual)';
  if (failed) return 'Vendor database failed to load';
  if (!db) return 'Loading…';
  return lookupVendor(db, bytes) ?? 'Unknown / unregistered OUI';
}

export default function Mac() {
  const [text, setText] = useQueryState('q', '00:1B:63:84:45:E6\n001b.6384.45e7\n3c-22-fb-00-00-01\nfa:16:3e:12:34:56');
  const [style, setStyle] = useQueryState('style', 'colon');
  const { db, failed } = useOuiDb();

  const entries = useMemo(() => parseList(text, parseMAC), [text]);
  const ok = entries.filter((e) => e.value);
  const converted = ok.map((e) => formatMAC(e.value!, style as MacStyle)).join('\n');

  return (
    <>
      <ToolHeader title="MAC address tool">
        Converts between notations and looks up the vendor in the IEEE OUI registry (bundled; no network requests). Paste one address or a whole list.
      </ToolHeader>

      <div className="split">
        <Card title="Input">
          <TextArea label="MAC addresses" value={text} onChange={setText} rows={8} hint="Any notation: aa:bb:cc:dd:ee:ff, AA-BB-..., aabb.ccdd.eeff, aabbccddeeff" />
          <LineErrors errors={entries} />
        </Card>
        <Card title="Converted" actions={converted && <CopyButton text={converted} />}>
          <Select label="Output format" value={style} onChange={setStyle} options={MAC_STYLES.map((s) => ({ value: s.id, label: `${s.label} — ${formatMAC(new Uint8Array([0, 0x1b, 0x63, 0x84, 0x45, 0xe6]), s.id)}` }))} />
          {converted && <pre className="code">{converted}</pre>}
        </Card>
      </div>

      {ok.length === 1 && (
        <Card title="Details">
          <KeyValue
            rows={[
              ...MAC_STYLES.map((s): [string, string] => [s.label, formatMAC(ok[0].value!, s.id)]),
              ['OUI', ouiOf(ok[0].value!)],
              ['Vendor', vendorText(db, failed, ok[0].value!), ''],
              ['Unicast / multicast', macFlags(ok[0].value!).multicast ? 'Multicast (I/G bit set)' : 'Unicast', ''],
              ['Universal / local', macFlags(ok[0].value!).locallyAdministered ? 'Locally administered (U/L bit set)' : 'Universally administered', ''],
              ['IPv6 link-local (EUI-64)', linkLocalFromMAC(ok[0].value!)],
            ]}
          />
        </Card>
      )}

      {ok.length > 1 && (
        <Card title="Lookup">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>MAC</th>
                  <th>OUI</th>
                  <th>Vendor / type</th>
                  <th>IPv6 link-local (EUI-64)</th>
                </tr>
              </thead>
              <tbody>
                {ok.map((e, i) => (
                  <tr key={i}>
                    <td className="mono">{formatMAC(e.value!, style as MacStyle)}</td>
                    <td className="mono">{ouiOf(e.value!)}</td>
                    <td>{vendorText(db, failed, e.value!)}</td>
                    <td className="mono">{linkLocalFromMAC(e.value!)}</td>
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
