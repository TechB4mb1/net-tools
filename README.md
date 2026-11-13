# Net Tools

A toolkit for everyday network tasks. It runs entirely in the browser: nothing you type leaves the page, so it is safe to paste internal addressing plans into it.

## Tools

| Tool | What it does |
| --- | --- |
| **IPv4 calculator** | Network, broadcast, host range, mask and wildcard, address type, PTR and reverse zone, bit view, and splitting a block into subnets. Handles /31 (RFC 3021) and /32. |
| **IPv6 calculator** | RFC 5952 compression and full expansion, prefix range, address type, nibble PTR and reverse zone, prefix splitting, and EUI-64 (SLAAC) addresses from a MAC. |
| **Format converter** | Dotted, integer, hex and binary forms, IPv4-mapped, 6to4 and NAT64 forms, and the IPv4 address embedded in an IPv6 one. |
| **VLSM planner** | Sizes subnets from host counts and allocates them largest first, so every block stays aligned. Shows leftover space, can export CSV, and can use /31 for point-to-point links. |
| **Route summarizer** | Collapses prefixes, addresses and `a - b` ranges into the fewest exact CIDR blocks. Also shows the single smallest covering supernet and how many extra addresses it pulls in. |
| **Overlap checker** | Compares list A against list B, or list A against itself, and labels each overlap as identical, contains, inside or partial. Also tells you which entries contain a given address. |
| **ACL & wildcard builder** | Cisco standard and extended ACLs, Cisco prefix-lists, Junos prefix-lists and MikroTik address-lists, for IPv4 and IPv6. Includes a mask ↔ wildcard converter and a reference table. |
| **MAC address tool** | Bulk conversion between notations, IEEE OUI vendor lookup from bundled data, multicast and locally-administered flags, and the EUI-64 link-local address. |
| **MTU & MSS calculator** | Stack PPPoE, MPLS, GRE, GRETAP, IP-in-IP, VXLAN, Geneve, WireGuard, IPsec ESP (exact padding per cipher, with optional NAT-T) or a custom overhead. Gives the inner MTU, IPv4/IPv6 MSS, ping test commands and MSS-clamp configuration. |
| **Bandwidth & TCP** | Transfer time and the rate needed to hit a deadline, bandwidth-delay product, window-scale factor, window-limited and loss-limited (Mathis) throughput, and a rate unit converter. |
| **Port reference** | Searchable list of well-known ports and IP protocol numbers. |
| **Config generator** | VLANs and their gateway interfaces, access and trunk ports, and static routes, generated for Cisco IOS, Junos (ELS) or RouterOS v7 from short line-based input. |

The current inputs are stored in the URL hash (for example `#/ipv4?q=10.0.0.0/22`), so you can bookmark or share any calculation.

## Development

Requires Node.js 20.19 or newer.

```sh
npm install
npm run dev        # dev server
npm test           # unit tests (Vitest)
npm run build      # type-check and build static files into dist/
npm run preview    # serve the production build
```

The build is a static site with relative asset paths and hash routing. You can host `dist/` anywhere: GitHub Pages, S3, nginx, or an internal web server.

## Deployment

`.github/workflows/deploy.yml` tests, builds and publishes the site to GitHub Pages on every push to `main`. You can also run it by hand from the Actions tab. One-time setup: in **Settings → Pages**, set **Source** to **GitHub Actions**.

## Layout

```
src/
  lib/          Pure logic, no React: ip, prefix, info, vlsm, mac, mtu, throughput, acl, configgen, convert (+ tests)
  data/         Port and protocol reference data
  tools/        One React component per tool, plus registry.ts (navigation)
  components/   Shared UI pieces
```

All address math uses `BigInt`, so IPv4 and IPv6 share the same code. The IEEE OUI registry comes from the [`oui-data`](https://github.com/silverwind/oui-data) package. A small Vite plugin (`vite.config.ts`) compacts it at build time into a lazily loaded chunk (about 570 kB gzipped) that only the MAC tool fetches.

To add a tool, write the logic in `src/lib/` with tests, add a component in `src/tools/`, and register it in `src/tools/registry.ts`.
