/** Tunnel / encapsulation overhead and the resulting IP MTU and TCP MSS. */

export type OuterIP = 4 | 6;

export type EspCipher = 'aes-gcm' | 'chacha20-poly1305' | 'aes-cbc-sha1' | 'aes-cbc-sha256';

export const ESP_CIPHERS: { id: EspCipher; label: string; iv: number; block: number; icv: number }[] = [
  { id: 'aes-gcm', label: 'AES-GCM (16-byte ICV)', iv: 8, block: 4, icv: 16 },
  { id: 'chacha20-poly1305', label: 'ChaCha20-Poly1305', iv: 8, block: 4, icv: 16 },
  { id: 'aes-cbc-sha1', label: 'AES-CBC + HMAC-SHA1-96', iv: 16, block: 16, icv: 12 },
  { id: 'aes-cbc-sha256', label: 'AES-CBC + HMAC-SHA256-128', iv: 16, block: 16, icv: 16 },
];

export type LayerType =
  | 'pppoe'
  | 'mpls'
  | 'gre'
  | 'gre-key'
  | 'gretap'
  | 'ipip'
  | 'vxlan'
  | 'geneve'
  | 'wireguard'
  | 'esp'
  | 'custom';

export interface Layer {
  type: LayerType;
  /** Outer IP header version for tunnels. */
  outer: OuterIP;
  /** ESP only. */
  cipher: EspCipher;
  /** ESP only: UDP 4500 encapsulation for NAT traversal. */
  natt: boolean;
  /** Custom only: bytes of overhead. */
  bytes: number;
}

export interface LayerInfo {
  type: LayerType;
  label: string;
  /** Whether the outer IP version affects the overhead. */
  hasOuter: boolean;
  describe: string;
}

export const LAYER_TYPES: LayerInfo[] = [
  { type: 'pppoe', label: 'PPPoE', hasOuter: false, describe: 'PPPoE 6 + PPP 2 bytes' },
  { type: 'mpls', label: 'MPLS label', hasOuter: false, describe: '4 bytes per label' },
  { type: 'gre', label: 'GRE', hasOuter: true, describe: 'outer IP + 4-byte GRE header' },
  { type: 'gre-key', label: 'GRE with key', hasOuter: true, describe: 'outer IP + 8-byte GRE header' },
  { type: 'gretap', label: 'GRETAP / EoGRE (L2)', hasOuter: true, describe: 'outer IP + GRE 4 + inner Ethernet 14' },
  { type: 'ipip', label: 'IP-in-IP / 6in4 / 4in6', hasOuter: true, describe: 'outer IP header only' },
  { type: 'vxlan', label: 'VXLAN', hasOuter: true, describe: 'outer IP + UDP 8 + VXLAN 8 + inner Ethernet 14' },
  { type: 'geneve', label: 'Geneve (no options)', hasOuter: true, describe: 'outer IP + UDP 8 + Geneve 8 + inner Ethernet 14' },
  { type: 'wireguard', label: 'WireGuard', hasOuter: true, describe: 'outer IP + UDP 8 + WireGuard 32' },
  { type: 'esp', label: 'IPsec ESP (tunnel mode)', hasOuter: true, describe: 'outer IP + ESP header, IV, padding, trailer and ICV' },
  { type: 'custom', label: 'Custom overhead', hasOuter: false, describe: 'fixed number of bytes' },
];

export const defaultLayer = (type: LayerType): Layer => ({ type, outer: 4, cipher: 'aes-gcm', natt: false, bytes: 0 });

const ipHeader = (v: OuterIP) => (v === 4 ? 20 : 40);

/** Largest inner packet that fits in an ESP tunnel packet of `outerMtu` bytes. */
export function espInnerMtu(outerMtu: number, layer: Layer): number {
  const c = ESP_CIPHERS.find((x) => x.id === layer.cipher)!;
  const fixed = ipHeader(layer.outer) + (layer.natt ? 8 : 0) + 8 /* SPI + seq */ + c.iv + c.icv;
  const available = outerMtu - fixed;
  // Payload + padding + pad length (1) + next header (1) must be a multiple of the block size.
  return Math.floor(available / c.block) * c.block - 2;
}

/** Inner IP MTU after applying one layer to a link/tunnel with IP MTU `mtu`. */
export function applyLayer(mtu: number, layer: Layer): number {
  const ip = ipHeader(layer.outer);
  switch (layer.type) {
    case 'pppoe':
      return mtu - 8;
    case 'mpls':
      return mtu - 4;
    case 'gre':
      return mtu - ip - 4;
    case 'gre-key':
      return mtu - ip - 8;
    case 'gretap':
      return mtu - ip - 4 - 14;
    case 'ipip':
      return mtu - ip;
    case 'vxlan':
    case 'geneve':
      return mtu - ip - 8 - 8 - 14;
    case 'wireguard':
      return mtu - ip - 8 - 32;
    case 'esp':
      return espInnerMtu(mtu, layer);
    case 'custom':
      return mtu - Math.max(0, Math.floor(layer.bytes));
  }
}

export interface MtuStep {
  layer: Layer;
  before: number;
  after: number;
}

export function computeStack(linkMtu: number, layers: Layer[]): { steps: MtuStep[]; mtu: number } {
  let mtu = linkMtu;
  const steps: MtuStep[] = [];
  for (const layer of layers) {
    const after = applyLayer(mtu, layer);
    steps.push({ layer, before: mtu, after });
    mtu = after;
  }
  return { steps, mtu };
}

/** TCP MSS for an IP MTU, assuming no IP or TCP options. */
export const mssFor = (mtu: number, ip: OuterIP): number => mtu - ipHeader(ip) - 20;

/** ICMP echo payload size that produces a packet of exactly `mtu` bytes. */
export const pingPayload = (mtu: number, ip: OuterIP): number => mtu - ipHeader(ip) - 8;
