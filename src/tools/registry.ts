import type { ComponentType } from 'react';
import Acl from './Acl';
import ConfigGen from './ConfigGen';
import Convert from './Convert';
import Ipv4Calc from './Ipv4Calc';
import Ipv6Calc from './Ipv6Calc';
import Mac from './Mac';
import Mtu from './Mtu';
import Overlap from './Overlap';
import Ports from './Ports';
import Summarize from './Summarize';
import Throughput from './Throughput';
import Vlsm from './Vlsm';

// Tool code is small, so it is bundled eagerly for instant navigation.
// Only the OUI vendor database (MAC tool) is loaded lazily.
export interface ToolDef {
  path: string;
  title: string;
  summary: string;
  group: 'Addressing' | 'Planning' | 'Layer 2' | 'Performance' | 'Reference & config';
  component: ComponentType;
}

export const TOOLS: ToolDef[] = [
  { path: '/ipv4', title: 'IPv4 calculator', summary: 'Network, broadcast, host range, masks and subnetting', group: 'Addressing', component: Ipv4Calc },
  { path: '/ipv6', title: 'IPv6 calculator', summary: 'Compress and expand, prefix ranges, reverse zones, EUI-64', group: 'Addressing', component: Ipv6Calc },
  { path: '/convert', title: 'Format converter', summary: 'Dotted, integer, hex, binary and IPv6-embedded forms', group: 'Addressing', component: Convert },
  { path: '/vlsm', title: 'VLSM planner', summary: 'Carve a block into subnets sized by host count', group: 'Planning', component: Vlsm },
  { path: '/summarize', title: 'Route summarizer', summary: 'Aggregate prefixes and ranges into fewest CIDRs', group: 'Planning', component: Summarize },
  { path: '/overlap', title: 'Overlap checker', summary: 'Find conflicting prefixes between two lists', group: 'Planning', component: Overlap },
  { path: '/acl', title: 'ACL & wildcard builder', summary: 'ACLs, prefix-lists and address-lists from prefixes', group: 'Planning', component: Acl },
  { path: '/mac', title: 'MAC address tool', summary: 'Format conversion and OUI vendor lookup', group: 'Layer 2', component: Mac },
  { path: '/mtu', title: 'MTU & MSS calculator', summary: 'Tunnel overhead for GRE, IPsec, VXLAN, WireGuard and more', group: 'Performance', component: Mtu },
  { path: '/throughput', title: 'Bandwidth & TCP', summary: 'Transfer time, BDP, window and loss limits', group: 'Performance', component: Throughput },
  { path: '/ports', title: 'Port reference', summary: 'Searchable well-known ports and IP protocol numbers', group: 'Reference & config', component: Ports },
  { path: '/config', title: 'Config generator', summary: 'VLAN, port and route snippets for Cisco, Junos, RouterOS', group: 'Reference & config', component: ConfigGen },
];

export const GROUPS = [...new Set(TOOLS.map((t) => t.group))];
