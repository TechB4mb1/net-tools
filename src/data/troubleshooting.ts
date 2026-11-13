/**
 * Network troubleshooting commands for Windows and Debian.
 *
 * Placeholders, filled in from the page's inputs:
 *   {host}     target host name or IP
 *   {port}     TCP/UDP port
 *   {gateway}  default gateway IP
 *   {iface}    Debian interface name (e.g. eth0, enp3s0, wlp2s0)
 *   {adapter}  Windows adapter name (e.g. Ethernet, Wi-Fi)
 */

export interface Cmd {
  cmd: string;
  note?: string;
  /** Windows: needs an elevated (Run as administrator) prompt. Debian commands show this via "sudo". */
  admin?: boolean;
  /** Windows: PowerShell only. Unmarked Windows commands work in both cmd and PowerShell. */
  ps?: boolean;
  /** Debian: package that provides the command when it is not installed by default. */
  pkg?: string;
}

export interface Task {
  id: string;
  title: string;
  windows: Cmd[];
  debian: Cmd[];
}

export interface Topic {
  id: string;
  title: string;
  tasks: Task[];
}

export const PLACEHOLDERS = ['host', 'port', 'gateway', 'iface', 'adapter'] as const;
export type Placeholder = (typeof PLACEHOLDERS)[number];

export const TOPICS: Topic[] = [
  {
    id: 'interfaces',
    title: 'Interfaces & IP configuration',
    tasks: [
      {
        id: 'ip-addr',
        title: 'Show IP addresses and settings',
        windows: [
          { cmd: 'ipconfig /all', note: 'Addresses, gateway, DNS servers, DHCP lease and MAC for every adapter' },
          { cmd: 'Get-NetIPConfiguration -Detailed', ps: true },
        ],
        debian: [
          { cmd: 'ip -br addr', note: 'One line per interface' },
          { cmd: 'ip addr show dev {iface}' },
        ],
      },
      {
        id: 'link-state',
        title: 'Check link state, speed and MAC',
        windows: [{ cmd: 'Get-NetAdapter | Format-Table Name, InterfaceDescription, Status, LinkSpeed, MacAddress', ps: true }],
        debian: [
          { cmd: 'ip -br link', note: 'NO-CARRIER means no cable or no link' },
          { cmd: 'sudo ethtool {iface}', pkg: 'ethtool', note: 'Speed, duplex, auto-negotiation, "Link detected"' },
        ],
      },
      {
        id: 'iface-restart',
        title: 'Restart an interface',
        windows: [{ cmd: 'Restart-NetAdapter -Name "{adapter}"', ps: true, admin: true, note: 'Drops remote sessions over this adapter' }],
        debian: [
          { cmd: 'sudo ifdown {iface} && sudo ifup {iface}', note: 'ifupdown (/etc/network/interfaces, the server default)' },
          { cmd: 'sudo nmcli device disconnect {iface} && sudo nmcli device connect {iface}', note: 'NetworkManager (desktop installs)' },
          { cmd: 'sudo ip link set {iface} down && sudo ip link set {iface} up', note: 'Link only; does not rerun DHCP' },
        ],
      },
      {
        id: 'net-config',
        title: 'Show the network configuration source',
        windows: [{ cmd: 'netsh interface ipv4 show config', note: 'Static vs DHCP per interface' }],
        debian: [
          { cmd: 'cat /etc/network/interfaces /etc/network/interfaces.d/*', note: 'ifupdown configuration' },
          { cmd: 'nmcli device status', note: 'Which interfaces NetworkManager manages' },
        ],
      },
      {
        id: 'hostname',
        title: 'Show host name',
        windows: [{ cmd: 'hostname' }],
        debian: [{ cmd: 'hostnamectl' }],
      },
    ],
  },
  {
    id: 'dhcp',
    title: 'DHCP',
    tasks: [
      {
        id: 'dhcp-renew',
        title: 'Release and renew the DHCP lease',
        windows: [
          { cmd: 'ipconfig /release', admin: true, note: 'Drops the address: do not run it over a remote session' },
          { cmd: 'ipconfig /renew', admin: true },
          { cmd: 'ipconfig /renew6', admin: true, note: 'IPv6 (DHCPv6)' },
        ],
        debian: [
          { cmd: 'sudo ifdown {iface} && sudo ifup {iface}', note: 'Works with any DHCP client under ifupdown' },
          { cmd: 'sudo dhclient -r {iface} && sudo dhclient -v {iface}', note: 'isc-dhcp-client (Debian 12 and older)' },
          { cmd: 'sudo dhcpcd -n {iface}', note: 'dhcpcd (Debian 13 default with ifupdown)' },
          { cmd: 'sudo nmcli device disconnect {iface} && sudo nmcli device connect {iface}', note: 'NetworkManager' },
        ],
      },
      {
        id: 'dhcp-lease',
        title: 'Show the current lease',
        windows: [{ cmd: 'ipconfig /all', note: 'See "DHCP Server", "Lease Obtained" and "Lease Expires"' }],
        debian: [
          { cmd: 'cat /var/lib/dhcp/dhclient*.leases', note: 'isc-dhcp-client' },
          { cmd: 'nmcli -f DHCP4 device show {iface}', note: 'NetworkManager' },
        ],
      },
    ],
  },
  {
    id: 'connectivity',
    title: 'Connectivity',
    tasks: [
      {
        id: 'ping',
        title: 'Ping a host',
        windows: [
          { cmd: 'ping {host}' },
          { cmd: 'ping -t {host}', note: 'Continuous; stop with Ctrl+C' },
          { cmd: 'ping -6 {host}', note: 'Force IPv6' },
        ],
        debian: [
          { cmd: 'ping -c 4 {host}' },
          { cmd: 'ping {host}', note: 'Continuous; stop with Ctrl+C' },
          { cmd: 'ping -6 -c 4 {host}', note: 'Force IPv6' },
        ],
      },
      {
        id: 'ping-gateway',
        title: 'Ping the default gateway',
        windows: [{ cmd: 'ping {gateway}' }],
        debian: [{ cmd: 'ping -c 4 {gateway}' }],
      },
      {
        id: 'ping-internet',
        title: 'Ping a public IP (bypasses DNS)',
        windows: [{ cmd: 'ping 1.1.1.1' }],
        debian: [{ cmd: 'ping -c 4 1.1.1.1' }],
      },
      {
        id: 'tcp-port',
        title: 'Test a TCP port',
        windows: [{ cmd: 'Test-NetConnection {host} -Port {port}', ps: true, note: 'TcpTestSucceeded : True means the port is open' }],
        debian: [
          { cmd: 'nc -zv {host} {port}', pkg: 'netcat-openbsd' },
          { cmd: "timeout 3 bash -c '</dev/tcp/{host}/{port}' && echo open || echo closed", note: 'No extra packages needed' },
        ],
      },
      {
        id: 'traceroute',
        title: 'Trace the route',
        windows: [
          { cmd: 'tracert -d {host}', note: '-d skips reverse DNS, which is much faster' },
          { cmd: 'pathping {host}', note: 'Per-hop loss statistics; takes a few minutes' },
          { cmd: 'Test-NetConnection {host} -TraceRoute', ps: true },
        ],
        debian: [
          { cmd: 'mtr -rwc 10 {host}', pkg: 'mtr-tiny', note: 'Per-hop loss and latency report' },
          { cmd: 'traceroute -n {host}', pkg: 'traceroute' },
          { cmd: 'sudo traceroute -n -T -p {port} {host}', pkg: 'traceroute', note: 'TCP traceroute, gets through firewalls that drop UDP/ICMP' },
          { cmd: 'tracepath -n {host}', pkg: 'iputils-tracepath', note: 'Also reports the path MTU' },
        ],
      },
      {
        id: 'http',
        title: 'Check an HTTP(S) service',
        windows: [{ cmd: 'curl.exe -I https://{host}', note: 'Use curl.exe: in Windows PowerShell "curl" is an alias for Invoke-WebRequest' }],
        debian: [{ cmd: 'curl -I https://{host}', pkg: 'curl' }],
      },
      {
        id: 'public-ip',
        title: 'Show your public IP',
        windows: [{ cmd: 'curl.exe -s https://ifconfig.me' }],
        debian: [{ cmd: 'curl -s https://ifconfig.me', pkg: 'curl' }],
      },
    ],
  },
  {
    id: 'dns',
    title: 'DNS',
    tasks: [
      {
        id: 'dns-lookup',
        title: 'Resolve a name',
        windows: [{ cmd: 'nslookup {host}' }, { cmd: 'Resolve-DnsName {host}', ps: true }],
        debian: [
          { cmd: 'getent ahosts {host}', note: 'Uses the system resolver, including /etc/hosts' },
          { cmd: 'dig {host}', pkg: 'bind9-dnsutils' },
          { cmd: 'host {host}', pkg: 'bind9-host' },
        ],
      },
      {
        id: 'dns-server',
        title: 'Query a specific DNS server',
        windows: [{ cmd: 'nslookup {host} 1.1.1.1' }, { cmd: 'Resolve-DnsName {host} -Server 1.1.1.1', ps: true }],
        debian: [{ cmd: 'dig @1.1.1.1 {host}', pkg: 'bind9-dnsutils' }],
      },
      {
        id: 'dns-records',
        title: 'Look up other record types (MX, TXT, reverse)',
        windows: [
          { cmd: 'Resolve-DnsName {host} -Type MX', ps: true },
          { cmd: 'Resolve-DnsName {host} -Type TXT', ps: true },
          { cmd: 'nslookup {host}', note: 'Reverse lookup when {host} is an IP address' },
        ],
        debian: [
          { cmd: 'dig +short {host} MX', pkg: 'bind9-dnsutils' },
          { cmd: 'dig +short {host} TXT', pkg: 'bind9-dnsutils' },
          { cmd: 'dig -x {host}', pkg: 'bind9-dnsutils', note: 'Reverse lookup; {host} must be an IP address' },
        ],
      },
      {
        id: 'dns-config',
        title: 'Show which DNS servers are used',
        windows: [{ cmd: 'Get-DnsClientServerAddress -AddressFamily IPv4', ps: true }],
        debian: [
          { cmd: 'cat /etc/resolv.conf' },
          { cmd: 'resolvectl status', note: 'Only if systemd-resolved is in use' },
          { cmd: 'nmcli device show {iface} | grep DNS', note: 'NetworkManager' },
        ],
      },
      {
        id: 'dns-flush',
        title: 'Show or flush the DNS cache',
        windows: [
          { cmd: 'ipconfig /displaydns' },
          { cmd: 'ipconfig /flushdns', admin: true },
          { cmd: 'Clear-DnsClientCache', ps: true, admin: true },
        ],
        debian: [
          { cmd: 'sudo resolvectl flush-caches', note: 'systemd-resolved. A default Debian install has no local DNS cache' },
          { cmd: 'sudo nscd -i hosts', pkg: 'nscd', note: 'Only if nscd is installed' },
        ],
      },
    ],
  },
  {
    id: 'routing',
    title: 'Routing',
    tasks: [
      {
        id: 'routes',
        title: 'Show the routing table',
        windows: [{ cmd: 'route print -4' }, { cmd: 'Get-NetRoute -AddressFamily IPv4', ps: true }],
        debian: [{ cmd: 'ip route' }, { cmd: 'ip -6 route' }],
      },
      {
        id: 'default-gw',
        title: 'Show the default gateway',
        windows: [{ cmd: 'Get-NetRoute -DestinationPrefix 0.0.0.0/0', ps: true }, { cmd: 'ipconfig | findstr /i "Gateway"' }],
        debian: [{ cmd: 'ip route show default' }],
      },
      {
        id: 'route-get',
        title: 'Which route and source address reach a host',
        windows: [{ cmd: 'Find-NetRoute -RemoteIPAddress {host}', ps: true, note: '{host} must be an IP address' }],
        debian: [{ cmd: 'ip route get {host}', note: '{host} must be an IP address' }],
      },
      {
        id: 'route-add',
        title: 'Add a temporary static route',
        windows: [{ cmd: 'route add 10.0.0.0 mask 255.0.0.0 {gateway}', admin: true, note: 'Add -p to keep it after a reboot' }],
        debian: [
          { cmd: 'sudo ip route add 10.0.0.0/8 via {gateway}', note: 'Lost on reboot; for ifupdown add an "up ip route add ..." line to /etc/network/interfaces' },
        ],
      },
    ],
  },
  {
    id: 'neighbors',
    title: 'ARP / neighbors',
    tasks: [
      {
        id: 'arp',
        title: 'Show the ARP / neighbor table',
        windows: [{ cmd: 'arp -a' }, { cmd: 'Get-NetNeighbor -AddressFamily IPv4', ps: true }],
        debian: [{ cmd: 'ip neigh' }],
      },
      {
        id: 'arp-gateway',
        title: "Check the gateway's MAC address",
        windows: [{ cmd: 'arp -a {gateway}', note: 'No entry after pinging the gateway points to a layer 2 problem' }],
        debian: [
          { cmd: 'ip neigh show {gateway}', note: 'FAILED or INCOMPLETE points to a layer 2 problem' },
          { cmd: 'sudo arping -c 4 -I {iface} {gateway}', pkg: 'iputils-arping', note: 'Works even when ICMP is blocked' },
        ],
      },
      {
        id: 'arp-flush',
        title: 'Clear the ARP cache',
        windows: [{ cmd: 'arp -d *', admin: true }, { cmd: 'netsh interface ip delete arpcache', admin: true }],
        debian: [{ cmd: 'sudo ip neigh flush dev {iface}' }],
      },
    ],
  },
  {
    id: 'sockets',
    title: 'Ports & connections',
    tasks: [
      {
        id: 'listening',
        title: 'List listening ports',
        windows: [
          { cmd: 'netstat -ano | findstr LISTENING', note: 'Last column is the process ID' },
          { cmd: 'Get-NetTCPConnection -State Listen | Sort-Object LocalPort', ps: true },
          { cmd: 'Get-NetUDPEndpoint | Sort-Object LocalPort', ps: true },
        ],
        debian: [{ cmd: 'sudo ss -tulpn', note: 'TCP and UDP, with process names' }],
      },
      {
        id: 'port-owner',
        title: 'Find the process using a port',
        windows: [
          { cmd: 'Get-Process -Id (Get-NetTCPConnection -LocalPort {port}).OwningProcess', ps: true },
          { cmd: 'netstat -ano | findstr :{port}', note: 'Then: tasklist /fi "pid eq <PID>"' },
        ],
        debian: [{ cmd: "sudo ss -tulpn 'sport = :{port}'" }, { cmd: 'sudo lsof -i :{port}', pkg: 'lsof' }],
      },
      {
        id: 'connections',
        title: 'List active connections',
        windows: [{ cmd: 'netstat -ano' }, { cmd: 'Get-NetTCPConnection -State Established', ps: true }],
        debian: [{ cmd: 'ss -tunp', note: 'Run with sudo to see other users’ processes' }, { cmd: 'ss -s', note: 'Summary counts per state' }],
      },
    ],
  },
  {
    id: 'firewall',
    title: 'Firewall',
    tasks: [
      {
        id: 'fw-status',
        title: 'Show firewall status and rules',
        windows: [
          { cmd: 'Get-NetFirewallProfile | Format-Table Name, Enabled, DefaultInboundAction, DefaultOutboundAction', ps: true },
          { cmd: 'Get-NetConnectionProfile', ps: true, note: 'Shows whether the network is Public, Private or Domain' },
          { cmd: 'netsh advfirewall show allprofiles' },
        ],
        debian: [
          { cmd: 'sudo nft list ruleset', note: 'nftables is the Debian default' },
          { cmd: 'sudo iptables -L -n -v' },
          { cmd: 'sudo ufw status verbose', pkg: 'ufw', note: 'Only if ufw is installed' },
        ],
      },
      {
        id: 'fw-allow',
        title: 'Allow an inbound TCP port',
        windows: [
          {
            cmd: 'New-NetFirewallRule -DisplayName "Allow TCP {port}" -Direction Inbound -Protocol TCP -LocalPort {port} -Action Allow',
            ps: true,
            admin: true,
          },
        ],
        debian: [
          { cmd: 'sudo ufw allow {port}/tcp', pkg: 'ufw' },
          {
            cmd: 'sudo nft add rule inet filter input tcp dport {port} accept',
            note: 'Assumes the default "inet filter" table. Not persistent: add it to /etc/nftables.conf',
          },
        ],
      },
    ],
  },
  {
    id: 'capture',
    title: 'Packet capture',
    tasks: [
      {
        id: 'capture-host',
        title: 'Capture traffic',
        windows: [
          { cmd: 'pktmon start --capture --pkt-size 0', admin: true, note: 'Built in (Windows 10 2004 and later)' },
          { cmd: 'pktmon stop', admin: true },
          { cmd: 'pktmon etl2pcap PktMon.etl --out capture.pcapng', note: 'Convert for Wireshark' },
        ],
        debian: [
          { cmd: 'sudo tcpdump -ni {iface} host {host}', pkg: 'tcpdump' },
          { cmd: 'sudo tcpdump -ni {iface} port {port} -w capture.pcap', pkg: 'tcpdump', note: 'Write to a file for Wireshark' },
        ],
      },
    ],
  },
  {
    id: 'wifi',
    title: 'Wi-Fi',
    tasks: [
      {
        id: 'wifi-status',
        title: 'Show Wi-Fi connection details',
        windows: [{ cmd: 'netsh wlan show interfaces', note: 'SSID, BSSID, channel, signal, rates' }],
        debian: [
          { cmd: 'iw dev {iface} link', pkg: 'iw', note: 'Use the wireless interface (e.g. wlp2s0)' },
          { cmd: 'nmcli device wifi list', note: 'NetworkManager' },
        ],
      },
      {
        id: 'wifi-scan',
        title: 'List nearby networks',
        windows: [{ cmd: 'netsh wlan show networks mode=bssid' }],
        debian: [{ cmd: 'nmcli device wifi list --rescan yes' }, { cmd: 'sudo iw dev {iface} scan | grep -E "SSID|signal"', pkg: 'iw' }],
      },
      {
        id: 'wifi-report',
        title: 'Generate a Wi-Fi diagnostic report',
        windows: [{ cmd: 'netsh wlan show wlanreport', admin: true, note: 'Writes an HTML report and prints its path' }],
        debian: [{ cmd: 'journalctl -u wpa_supplicant -b', note: 'Association and authentication log' }],
      },
    ],
  },
  {
    id: 'performance',
    title: 'MTU & performance',
    tasks: [
      {
        id: 'mtu-test',
        title: 'Test the path MTU (1500-byte packets)',
        windows: [{ cmd: 'ping -f -l 1472 {host}', note: '"Packet needs to be fragmented" means the path MTU is below 1500' }],
        debian: [{ cmd: 'ping -M do -s 1472 -c 3 {host}', note: '"message too long" means the path MTU is below 1500' }, { cmd: 'tracepath -n {host}', pkg: 'iputils-tracepath' }],
      },
      {
        id: 'mtu-show',
        title: 'Show the interface MTU',
        windows: [{ cmd: 'netsh interface ipv4 show subinterfaces' }],
        debian: [{ cmd: 'ip link show {iface}' }],
      },
      {
        id: 'counters',
        title: 'Check interface errors and drops',
        windows: [{ cmd: 'Get-NetAdapterStatistics -Name "{adapter}"', ps: true }, { cmd: 'netstat -e' }],
        debian: [{ cmd: 'ip -s link show {iface}' }, { cmd: 'sudo ethtool -S {iface}', pkg: 'ethtool', note: 'Driver-level counters (CRC errors, etc.)' }],
      },
      {
        id: 'iperf',
        title: 'Measure throughput between two hosts',
        windows: [{ cmd: 'iperf3.exe -c {host}', note: 'Not built in; download iperf3 for Windows. Run "iperf3 -s" on the other end' }],
        debian: [
          { cmd: 'iperf3 -c {host}', pkg: 'iperf3', note: 'Run "iperf3 -s" on the other end' },
          { cmd: 'iperf3 -c {host} -R', pkg: 'iperf3', note: 'Reverse direction (server sends)' },
        ],
      },
    ],
  },
  {
    id: 'reset',
    title: 'Logs & reset',
    tasks: [
      {
        id: 'logs',
        title: 'Read network logs',
        windows: [{ cmd: 'Get-WinEvent -LogName "Microsoft-Windows-Dhcp-Client/Admin" -MaxEvents 20', ps: true }],
        debian: [
          { cmd: 'journalctl -u networking -b', note: 'ifupdown' },
          { cmd: 'journalctl -u NetworkManager -b', note: 'NetworkManager' },
          { cmd: 'sudo dmesg | grep -i {iface}', note: 'Driver and link up/down messages' },
        ],
      },
      {
        id: 'stack-reset',
        title: 'Reset the network stack',
        windows: [
          { cmd: 'netsh winsock reset', admin: true, note: 'Reboot afterwards' },
          { cmd: 'netsh int ip reset', admin: true, note: 'Resets TCP/IP settings; reboot afterwards' },
        ],
        debian: [
          { cmd: 'sudo systemctl restart networking', note: 'ifupdown; may drop your SSH session' },
          { cmd: 'sudo systemctl restart NetworkManager', note: 'NetworkManager' },
        ],
      },
    ],
  },
];

export interface ChecklistStep {
  title: string;
  why: string;
  lookFor: string[];
  /** Task ids from TOPICS. */
  tasks: string[];
  /** Optional link to another tool in the app. */
  link?: { href: string; label: string };
}

/** Bottom-up connectivity troubleshooting, from the cable to the application. */
export const CHECKLIST: ChecklistStep[] = [
  {
    title: 'Is there a link?',
    why: 'Nothing above layer 1 works without a link. Rule out the cable, switch port, or Wi-Fi association first.',
    lookFor: [
      'Windows: Status "Up" and the expected LinkSpeed. "Disconnected" means no cable or no link.',
      'Debian: state UP. NO-CARRIER means no cable or no link.',
      'A speed lower than expected (e.g. 100 Mb/s on a gigabit port) often means a bad cable.',
    ],
    tasks: ['link-state', 'wifi-status'],
  },
  {
    title: 'Is there a valid IP address?',
    why: 'Without an address, subnet mask and gateway from the right network, the host cannot talk to anything beyond the link.',
    lookFor: [
      'An address of 169.254.x.x means DHCP failed (APIPA). Renew the lease, then check the DHCP server or the VLAN.',
      'An address from an unexpected subnet means the port may be in the wrong VLAN.',
      'Check that a default gateway and DNS servers are present.',
    ],
    tasks: ['ip-addr', 'dhcp-renew'],
    link: { href: '#/ipv4', label: 'Check the subnet in the IPv4 calculator' },
  },
  {
    title: 'Can you reach the gateway?',
    why: 'The gateway is the first hop. If it does not answer, the problem is local: layer 2, VLAN, or the gateway itself.',
    lookFor: [
      'Replies from the gateway: the local network works.',
      'No reply, but an ARP entry with a MAC address: the gateway may simply block ping.',
      'No ARP entry at all: a layer 2 problem (wrong VLAN, port security, Wi-Fi isolation).',
    ],
    tasks: ['ping-gateway', 'arp-gateway', 'default-gw'],
  },
  {
    title: 'Can you reach the internet by IP?',
    why: 'Pinging a public IP tests routing and NAT without involving DNS.',
    lookFor: [
      'Replies: routing works. If browsing still fails, move on to DNS.',
      'No replies: trace the route to see where it stops. Check the routing table for a wrong default route (VPN clients often change it).',
    ],
    tasks: ['ping-internet', 'traceroute', 'routes'],
  },
  {
    title: 'Does DNS resolve?',
    why: 'If IPs work but names do not, the problem is DNS.',
    lookFor: [
      'Compare your configured DNS server with a public one (1.1.1.1). If only the public one works, your DNS server is the problem.',
      'If both fail, something may be blocking UDP/TCP port 53.',
      'Stale results: flush the cache.',
    ],
    tasks: ['dns-lookup', 'dns-server', 'dns-config', 'dns-flush'],
  },
  {
    title: 'Is the service port reachable?',
    why: 'Ping can succeed while the application port is blocked or nothing is listening.',
    lookFor: [
      'Port open: the network path is fine; look at the application itself.',
      'Port closed or timing out: check the firewall on both ends, and that the service is listening on the server.',
    ],
    tasks: ['tcp-port', 'http', 'listening', 'fw-status'],
    link: { href: '#/ports', label: 'Look up the port in the port reference' },
  },
  {
    title: 'Are large packets getting through?',
    why: 'If small requests work but large transfers, VPNs or some websites hang, the path MTU is probably smaller than the interface MTU.',
    lookFor: [
      'The 1472-byte do-not-fragment ping fails while smaller sizes work: lower the MTU or clamp the TCP MSS.',
      'Rising error or drop counters on the interface point to a physical or duplex problem.',
    ],
    tasks: ['mtu-test', 'counters'],
    link: { href: '#/mtu', label: 'Calculate tunnel overhead in the MTU calculator' },
  },
];

const TASK_INDEX = new Map(TOPICS.flatMap((t) => t.tasks.map((task) => [task.id, task] as const)));

export const getTask = (id: string): Task | undefined => TASK_INDEX.get(id);

export type PlaceholderValues = Record<Placeholder, string>;

export const DEFAULT_VALUES: PlaceholderValues = {
  host: 'example.com',
  port: '443',
  gateway: '192.168.1.1',
  iface: 'eth0',
  adapter: 'Ethernet',
};

/** Replace {placeholders} with the given values (blank values fall back to the defaults). */
export function fillCommand(cmd: string, values: Partial<PlaceholderValues>): string {
  return cmd.replace(/\{(host|port|gateway|iface|adapter)\}/g, (_, key: Placeholder) => values[key]?.trim() || DEFAULT_VALUES[key]);
}
