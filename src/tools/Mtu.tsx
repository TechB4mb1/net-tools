import { Card, Checkbox, CodeBlock, Field, Select, Stat, ToolHeader } from '../components/ui';
import { useQueryState } from '../hooks';
import { computeStack, defaultLayer, ESP_CIPHERS, LAYER_TYPES, mssFor, pingPayload, type EspCipher, type Layer, type LayerType } from '../lib/mtu';

/** Layers are kept in the URL as "type.outer.cipher.natt.bytes" joined by "~". */
function encode(layers: Layer[]): string {
  return layers.map((l) => [l.type, l.outer, l.cipher, l.natt ? 1 : 0, l.bytes].join('.')).join('~');
}

function decode(s: string): Layer[] {
  if (!s) return [];
  return s.split('~').flatMap((part) => {
    const [type, outer, cipher, natt, bytes] = part.split('.');
    if (!LAYER_TYPES.some((t) => t.type === type)) return [];
    return [
      {
        type: type as LayerType,
        outer: outer === '6' ? 6 : 4,
        cipher: ESP_CIPHERS.some((c) => c.id === cipher) ? (cipher as EspCipher) : 'aes-gcm',
        natt: natt === '1',
        bytes: Math.max(0, Number(bytes) || 0),
      } satisfies Layer,
    ];
  });
}

const layerInfo = (t: LayerType) => LAYER_TYPES.find((x) => x.type === t)!;

export default function Mtu() {
  const [linkText, setLinkText] = useQueryState('mtu', '1500');
  const [layersText, setLayersText] = useQueryState('l', 'pppoe.4.aes-gcm.0.0~esp.4.aes-gcm.1.0');
  const layers = decode(layersText);
  const setLayers = (ls: Layer[]) => setLayersText(encode(ls));
  const update = (i: number, patch: Partial<Layer>) => setLayers(layers.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const move = (i: number, d: -1 | 1) => {
    const ls = [...layers];
    [ls[i], ls[i + d]] = [ls[i + d], ls[i]];
    setLayers(ls);
  };

  const link = Math.floor(Number(linkText));
  const valid = Number.isFinite(link) && link >= 68 && link <= 65535;
  const { steps, mtu } = computeStack(valid ? link : 1500, layers);
  const tooSmall = mtu < 1280;

  const mss4 = mssFor(mtu, 4);
  const mss6 = mssFor(mtu, 6);
  const commands = [
    `# Verify the path MTU (don't fragment, ${mtu}-byte packets)`,
    `ping -M do -s ${pingPayload(mtu, 4)} <host>        # Linux`,
    `ping -f -l ${pingPayload(mtu, 4)} <host>           # Windows`,
    `ping -D -s ${pingPayload(mtu, 4)} <host>           # macOS`,
    `ping -6 -M do -s ${pingPayload(mtu, 6)} <host>     # Linux, IPv6`,
    '',
    '# Clamp TCP MSS on the tunnel interface',
    `ip tcp adjust-mss ${mss4}                      ! Cisco IOS (IPv4)`,
    `ipv6 tcp adjust-mss ${mss6}                    ! Cisco IOS (IPv6)`,
    `set security flow tcp-mss all-tcp mss ${mss4}          # Junos SRX`,
    `/ip firewall mangle add chain=forward protocol=tcp tcp-flags=syn action=change-mss new-mss=${mss4} passthrough=yes   # RouterOS`,
    `iptables -t mangle -A FORWARD -p tcp --tcp-flags SYN,RST SYN -j TCPMSS --set-mss ${mss4}   # Linux`,
  ].join('\n');

  return (
    <>
      <ToolHeader title="MTU & MSS calculator">
        Stack encapsulations on top of a link to find the inner IP MTU, the TCP MSS to clamp to, and the ping sizes to verify the path.
      </ToolHeader>

      <Card title="Encapsulation stack">
        <Field label="Underlying link IP MTU (bytes)" value={linkText} onChange={setLinkText} width="16rem" hint="1500 for standard Ethernet, 9000 or 9216 for jumbo frames." />
        {!valid && <p className="error">Enter an MTU between 68 and 65535.</p>}

        <ol className="layers">
          {layers.map((l, i) => {
            const info = layerInfo(l.type);
            const step = steps[i];
            return (
              <li key={i} className="layer">
                <div className="layer-main">
                  <Select
                    label={`Layer ${i + 1}`}
                    value={l.type}
                    onChange={(type) => update(i, { ...defaultLayer(type), outer: l.outer })}
                    options={LAYER_TYPES.map((t) => ({ value: t.type, label: t.label }))}
                  />
                  {info.hasOuter && (
                    <Select
                      label="Outer IP"
                      value={l.outer}
                      onChange={(outer) => update(i, { outer })}
                      options={[
                        { value: 4, label: 'IPv4' },
                        { value: 6, label: 'IPv6' },
                      ]}
                    />
                  )}
                  {l.type === 'esp' && (
                    <Select label="Cipher" value={l.cipher} onChange={(cipher) => update(i, { cipher })} options={ESP_CIPHERS.map((c) => ({ value: c.id, label: c.label }))} />
                  )}
                  {l.type === 'custom' && <Field label="Bytes" type="number" value={String(l.bytes)} onChange={(v) => update(i, { bytes: Math.max(0, Number(v) || 0) })} />}
                </div>
                <div className="layer-side">
                  {l.type === 'esp' && <Checkbox label="NAT-T (UDP 4500)" checked={l.natt} onChange={(natt) => update(i, { natt })} />}
                  <span className="mono layer-result">
                    {step.before} − {step.before - step.after} = <strong>{step.after}</strong>
                  </span>
                  <span className="layer-buttons">
                    <button type="button" className="icon" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">
                      ↑
                    </button>
                    <button type="button" className="icon" onClick={() => move(i, 1)} disabled={i === layers.length - 1} aria-label="Move down">
                      ↓
                    </button>
                    <button type="button" className="icon" onClick={() => setLayers(layers.filter((_, j) => j !== i))} aria-label="Remove layer">
                      ✕
                    </button>
                  </span>
                </div>
                <div className="hint">{info.describe}</div>
              </li>
            );
          })}
        </ol>
        <div className="actions">
          <button type="button" onClick={() => setLayers([...layers, defaultLayer('gre')])}>
            + Add layer
          </button>
          {layers.length > 0 && (
            <button type="button" className="link" onClick={() => setLayers([])}>
              Clear
            </button>
          )}
        </div>
        <p className="hint">Layers apply outermost first: layer 1 sits directly on the link, and each later layer runs inside the one before it.</p>
      </Card>

      <div className="stats">
        <Stat label="Inner IP MTU" value={mtu} sub={`${valid ? link : 1500} − ${(valid ? link : 1500) - mtu} bytes of overhead`} />
        <Stat label="TCP MSS (IPv4)" value={mss4} sub="MTU − 20 IP − 20 TCP" />
        <Stat label="TCP MSS (IPv6)" value={mss6} sub="MTU − 40 IP − 20 TCP" />
      </div>
      {tooSmall && <p className="notice notice-warn">The inner MTU is below 1280 bytes, the minimum IPv6 requires. IPv6 will not work over this path without fragmentation in the tunnel.</p>}

      <Card title="Verify and clamp">
        <CodeBlock code={commands} />
      </Card>
    </>
  );
}
