# BitSecure local network agent

Optional local helper for the **Live network inventory** learning module.

## Requirements

- Python 3.9 or newer
- Linux or Windows
- A terminal on the computer whose network information you want to inspect

## Start

From the repository root:

```bash
python3 tools/network-agent/network_agent.py
```

On Windows, use:

```powershell
py tools/network-agent/network_agent.py
```

Keep the terminal open while using the module. The agent listens at
`http://127.0.0.1:8765/api/network`. Stop it with Ctrl+C.

## What it reads

- Network interfaces and IP addresses exposed by the operating system
- Default IPv4 routes / gateways
- The operating system's existing neighbour (ARP/NDP) cache
- Current Wi-Fi connection details when the OS exposes them

Linux uses `ip` and optionally `nmcli`. Windows uses read-only PowerShell
network cmdlets and `netsh` for current Wi-Fi details.

## Safety and limitations

- The server binds only to `127.0.0.1`; it is not a LAN server.
- It uses Python's standard library and invokes fixed OS commands without a shell.
- It performs no host discovery, ping, port scan, packet capture, DNS query, route
  change, firewall change, or network configuration change.
- The neighbour cache is incomplete and transient. It is **not** a full list of
  devices on the network and cannot establish physical topology.
- Wi-Fi signal is shown only for this computer's own current connection when
  exposed by the operating system. It cannot read arbitrary clients' RSSI.
- The browser may require permission for a page to contact a local-network
  endpoint. If the browser blocks the request, use the app on localhost or check
  its local-network access prompt/settings.
- The module remains optional; the rest of BitSecure works without this agent.
