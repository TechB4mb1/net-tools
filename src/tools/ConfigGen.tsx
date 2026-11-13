import { useMemo } from 'react';
import { Card, CodeBlock, Field, LineErrors, Notice, Select, TextArea, ToolHeader } from '../components/ui';
import { useQueryState } from '../hooks';
import { generateConfig, parsePortLine, parseRouteLine, parseVlanLine, undeclaredVlans, VENDORS, type ConfigSpec, type Vendor } from '../lib/configgen';
import type { ListEntry } from '../lib/prefix';

const VLANS = `10 USERS 10.0.10.1/24
20 VOICE 10.0.20.1/24
99 MGMT 10.0.99.1/24 2001:db8:99::1/64`;

const PORTS = `Gi1/0/1 access 10 Desk 101
Gi1/0/2 access 20 Phone 101
Gi1/0/48 trunk 10,20,99 native 99 Uplink to core`;

const ROUTES = `0.0.0.0/0 10.0.99.254
::/0 2001:db8:99::fe`;

/** Line-by-line parsing (no comma splitting: VLAN lists use commas). */
function parseLines<T>(text: string, parse: (s: string) => T): ListEntry<T>[] {
  return text.split('\n').flatMap((raw, i): ListEntry<T>[] => {
    const t = raw.replace(/#.*$/, '').trim();
    if (!t) return [];
    try {
      return [{ line: i + 1, text: t, value: parse(t) }];
    } catch (e) {
      return [{ line: i + 1, text: t, error: (e as Error).message }];
    }
  });
}

export default function ConfigGen() {
  const [vendor, setVendor] = useQueryState('vendor', 'cisco-ios');
  const [vlanText, setVlanText] = useQueryState('vlans', VLANS);
  const [portText, setPortText] = useQueryState('ports', PORTS);
  const [routeText, setRouteText] = useQueryState('routes', ROUTES);
  const [bridge, setBridge] = useQueryState('bridge', 'bridge1');

  const r = useMemo(() => {
    const vlans = parseLines(vlanText, parseVlanLine);
    const ports = parseLines(portText, parsePortLine);
    const routes = parseLines(routeText, parseRouteLine);
    const spec: ConfigSpec = {
      vlans: vlans.flatMap((e) => (e.value ? [e.value] : [])),
      ports: ports.flatMap((e) => (e.value ? [e.value] : [])),
      routes: routes.flatMap((e) => (e.value ? [e.value] : [])),
      bridge,
    };
    const dupes = spec.vlans.map((v) => v.id).filter((id, i, all) => all.indexOf(id) !== i);
    return { vlans, ports, routes, spec, dupes, undeclared: undeclaredVlans(spec), code: generateConfig(vendor as Vendor, spec) };
  }, [vendor, vlanText, portText, routeText, bridge]);

  return (
    <>
      <ToolHeader title="Config snippet generator">
        Describe VLANs, ports and static routes once, and get the matching configuration for Cisco IOS, Junos or RouterOS. Review it before you paste
        it into a device.
      </ToolHeader>

      <Card>
        <div className="row">
          <Select label="Platform" value={vendor} onChange={setVendor} options={VENDORS.map((v) => ({ value: v.id, label: v.label }))} />
          {vendor === 'routeros' && <Field label="Bridge" value={bridge} onChange={setBridge} width="12rem" />}
        </div>
      </Card>

      <div className="split three">
        <Card title="VLANs">
          <TextArea label="id [name] [gateway/len …]" value={vlanText} onChange={setVlanText} rows={6} />
          <LineErrors errors={r.vlans} />
        </Card>
        <Card title="Ports">
          <TextArea label="iface access|trunk vlans [native id] [description]" value={portText} onChange={setPortText} rows={6} />
          <LineErrors errors={r.ports} />
        </Card>
        <Card title="Static routes">
          <TextArea label="prefix next-hop" value={routeText} onChange={setRouteText} rows={6} />
          <LineErrors errors={r.routes} />
        </Card>
      </div>

      {r.dupes.length > 0 && <Notice tone="warn">VLAN {[...new Set(r.dupes)].join(', ')} is listed more than once.</Notice>}
      {r.undeclared.length > 0 && (
        <Notice>
          Ports use VLAN {r.undeclared.join(', ')}, which {r.undeclared.length === 1 ? 'is' : 'are'} not in the VLAN list. {r.undeclared.length === 1 ? 'It was' : 'They were'} added
          without a name.
        </Notice>
      )}

      <Card title="Configuration">
        <CodeBlock code={r.code} empty="Add VLANs, ports or routes to generate configuration." />
      </Card>
    </>
  );
}
