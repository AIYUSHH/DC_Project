#!/usr/bin/env python3
"""Read-only localhost agent for BitSecure's live network inventory.

This agent reads information already exposed by the operating system. It does not
scan hosts, send diagnostic packets, change routes, or modify network settings.
Requires Python 3.9+. Run: python network_agent.py
"""
from __future__ import annotations

import json
import platform
import shutil
import subprocess
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

HOST = "127.0.0.1"
PORT = 8765
TIMEOUT = 3


def run_command(*args: str) -> str:
    """Run a fixed OS utility without a shell; return empty text if unavailable."""
    if not args or not shutil.which(args[0]):
        return ""
    try:
        result = subprocess.run(args, capture_output=True, text=True, timeout=TIMEOUT, check=False)
        return result.stdout.strip()
    except (OSError, subprocess.TimeoutExpired):
        return ""


def linux_inventory() -> dict:
    interfaces = []
    routes = []
    neighbours = []
    raw = run_command("ip", "-j", "addr")
    if raw:
        try:
            for item in json.loads(raw):
                addresses = []
                for info in item.get("addr_info", []):
                    if info.get("family") in ("inet", "inet6"):
                        addresses.append({
                            "family": info.get("family"),
                            "address": info.get("local"),
                            "prefix": info.get("prefixlen"),
                        })
                interfaces.append({
                    "name": item.get("ifname"),
                    "state": item.get("operstate", "unknown"),
                    "mac": item.get("address"),
                    "addresses": addresses,
                })
        except (ValueError, TypeError):
            pass
    raw = run_command("ip", "-j", "route")
    if raw:
        try:
            for item in json.loads(raw):
                if item.get("dst") == "default":
                    routes.append({
                        "destination": "default",
                        "gateway": item.get("gateway"),
                        "interface": item.get("dev"),
                        "protocol": item.get("protocol"),
                    })
        except (ValueError, TypeError):
            pass
    raw = run_command("ip", "-j", "neigh")
    if raw:
        try:
            for item in json.loads(raw):
                neighbours.append({
                    "address": item.get("dst"),
                    "mac": item.get("lladdr"),
                    "interface": item.get("dev"),
                    "state": ",".join(item.get("state", [])) if isinstance(item.get("state"), list) else item.get("state"),
                })
        except (ValueError, TypeError):
            pass
    wifi = run_command("nmcli", "-t", "-f", "ACTIVE,SSID,SIGNAL,DEVICE", "device", "wifi")
    wifi_rows = []
    for line in wifi.splitlines():
        parts = line.split(":")
        if len(parts) >= 4 and parts[0] == "yes":
            wifi_rows.append({"ssid": parts[1], "signal_percent": parts[2], "interface": parts[3]})
    return {"interfaces": interfaces, "default_routes": routes, "neighbours": neighbours, "wifi": wifi_rows}


def windows_inventory() -> dict:
    # PowerShell is used only for read-only OS cmdlets; no shell interpolation is used.
    ps = shutil.which("powershell") or shutil.which("pwsh")
    interfaces = []
    routes = []
    neighbours = []
    if ps:
        script = (
            "$ErrorActionPreference='SilentlyContinue'; "
            "Get-NetIPConfiguration | ForEach-Object { "
            "[pscustomobject]@{name=$_.InterfaceAlias; "
            "ipv4=@($_.IPv4Address | ForEach-Object {$_.IPAddress}); "
            "ipv6=@($_.IPv6Address | ForEach-Object {$_.IPAddress}); "
            "gateway=@($_.IPv4DefaultGateway | ForEach-Object {$_.NextHop})} } | ConvertTo-Json -Compress"
        )
        raw = run_command(ps, "-NoProfile", "-Command", script)
        if raw:
            try:
                data = json.loads(raw)
                if isinstance(data, dict):
                    data = [data]
                for item in data:
                    ipv4 = item.get("ipv4") or []
                    ipv6 = item.get("ipv6") or []
                    gateways = item.get("gateway") or []
                    ipv4 = [ipv4] if isinstance(ipv4, str) else ipv4
                    ipv6 = [ipv6] if isinstance(ipv6, str) else ipv6
                    gateways = [gateways] if isinstance(gateways, str) else gateways
                    addresses = [{"family": "inet", "address": x, "prefix": None} for x in ipv4]
                    addresses += [{"family": "inet6", "address": x, "prefix": None} for x in ipv6]
                    interfaces.append({"name": item.get("name"), "state": "OS reported", "mac": None, "addresses": addresses})
                    for gateway in gateways:
                        routes.append({"destination": "default", "gateway": gateway, "interface": item.get("name")})
            except (ValueError, TypeError):
                pass
        raw = run_command(ps, "-NoProfile", "-Command",
                          "Get-NetNeighbor -AddressFamily IPv4 | Select-Object IPAddress,LinkLayerAddress,InterfaceAlias,State | ConvertTo-Json -Compress")
        if raw:
            try:
                data = json.loads(raw)
                if isinstance(data, dict):
                    data = [data]
                for item in data:
                    neighbours.append({"address": item.get("IPAddress"), "mac": item.get("LinkLayerAddress"),
                                       "interface": item.get("InterfaceAlias"), "state": item.get("State")})
            except (ValueError, TypeError):
                pass
    wifi_text = run_command("netsh", "wlan", "show", "interfaces")
    wifi = []
    current = {}
    for line in wifi_text.splitlines():
        if ":" not in line:
            continue
        key, value = (part.strip() for part in line.split(":", 1))
        if key.lower() in ("ssid", "signal", "name", "state"):
            current[key.lower()] = value
    if current:
        wifi.append({"ssid": current.get("ssid"), "signal_percent": current.get("signal"),
                     "interface": current.get("name"), "state": current.get("state")})
    return {"interfaces": interfaces, "default_routes": routes, "neighbours": neighbours, "wifi": wifi}


def collect_inventory() -> dict:
    system = platform.system()
    data = linux_inventory() if system == "Linux" else windows_inventory() if system == "Windows" else {
        "interfaces": [], "default_routes": [], "neighbours": [], "wifi": []
    }
    return {
        "ok": True,
        "platform": system,
        "collected_at": __import__("datetime").datetime.now().astimezone().isoformat(timespec="seconds"),
        "source": "Operating-system network tables and utilities",
        "limitations": [
            "Neighbour entries are cached link-layer observations, not a complete device inventory or physical topology.",
            "Wi-Fi signal is reported only when the operating system exposes it for this computer's current connection.",
            "No active host discovery, ping, port scan, packet capture, or configuration change is performed.",
        ],
        **data,
    }


class Handler(BaseHTTPRequestHandler):
    def _send(self, status: int, payload: dict) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Private-Network", "true")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self) -> None:
        self._send(204, {})

    def do_GET(self) -> None:
        if urlparse(self.path).path != "/api/network":
            self._send(404, {"ok": False, "error": "Not found"})
            return
        self._send(200, collect_inventory())

    def log_message(self, fmt: str, *args) -> None:
        print("[BitSecure agent] " + (fmt % args))


if __name__ == "__main__":
    print(f"BitSecure read-only network agent: http://{HOST}:{PORT}/api/network")
    print("Bound to loopback only. Press Ctrl+C to stop.")
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
