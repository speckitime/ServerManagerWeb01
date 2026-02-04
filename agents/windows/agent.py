#!/usr/bin/env python3
"""
ServerManager Windows Agent
Collects system metrics and sends them to the management server.
"""

import os
import sys
import json
import time
import signal
import socket
import logging
import argparse
import platform
import subprocess
from pathlib import Path
from datetime import datetime

try:
    import psutil
    import requests
except ImportError:
    print("Missing dependencies. Install with: pip install psutil requests")
    sys.exit(1)

# Configuration
CONFIG_DIR = os.path.join(os.environ.get("ProgramData", "C:\\ProgramData"), "ServerManager")
CONFIG_FILE = os.path.join(CONFIG_DIR, "agent.conf")
LOG_FILE = os.path.join(CONFIG_DIR, "agent.log")

DEFAULT_CONFIG = {
    "server_url": "https://localhost:3000",
    "api_key": "",
    "metrics_interval": 5,
    "heartbeat_interval": 30,
    "package_sync_interval": 3600,
    "verify_ssl": True,
}

running = True
logger = logging.getLogger("servermanager-agent")


def setup_logging():
    os.makedirs(CONFIG_DIR, exist_ok=True)

    handler = logging.FileHandler(LOG_FILE)
    handler.setFormatter(
        logging.Formatter("%(asctime)s - %(name)s - %(levelname)s - %(message)s")
    )
    logger.addHandler(handler)

    console = logging.StreamHandler()
    console.setFormatter(logging.Formatter("%(asctime)s - %(levelname)s - %(message)s"))
    logger.addHandler(console)

    logger.setLevel(logging.INFO)


def load_config():
    config = DEFAULT_CONFIG.copy()
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r") as f:
                file_config = json.load(f)
                config.update(file_config)
        except Exception as e:
            logger.error(f"Failed to load config: {e}")
    return config


def save_config(config):
    os.makedirs(CONFIG_DIR, exist_ok=True)
    with open(CONFIG_FILE, "w") as f:
        json.dump(config, f, indent=2)


def get_cpu_usage():
    return psutil.cpu_percent(interval=1)


def get_memory_info():
    mem = psutil.virtual_memory()
    return {
        "ram_total": mem.total,
        "ram_used": mem.used,
        "ram_usage_percent": mem.percent,
    }


def get_disk_info():
    partitions = []
    for part in psutil.disk_partitions():
        try:
            usage = psutil.disk_usage(part.mountpoint)
            partitions.append(
                {
                    "device": part.device,
                    "mountpoint": part.mountpoint,
                    "fstype": part.fstype,
                    "total": usage.total,
                    "used": usage.used,
                    "free": usage.free,
                    "percent": usage.percent,
                }
            )
        except (PermissionError, OSError):
            continue
    return partitions


def get_network_info():
    counters = psutil.net_io_counters()
    return {
        "network_rx_bytes": counters.bytes_recv,
        "network_tx_bytes": counters.bytes_sent,
    }


def get_load_average():
    # Windows doesn't have load average; approximate with CPU queue length
    cpu_pct = psutil.cpu_percent(interval=0)
    cpu_count = psutil.cpu_count()
    approx_load = (cpu_pct / 100.0) * cpu_count
    return {
        "load_avg_1": round(approx_load, 2),
        "load_avg_5": round(approx_load, 2),
        "load_avg_15": round(approx_load, 2),
    }


def get_top_processes(count=10):
    procs = []
    for proc in psutil.process_iter(["pid", "name", "cpu_percent", "memory_percent"]):
        try:
            info = proc.info
            procs.append(
                {
                    "pid": info["pid"],
                    "name": info["name"],
                    "cpu": info["cpu_percent"] or 0,
                    "memory": info["memory_percent"] or 0,
                }
            )
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue

    procs.sort(key=lambda x: x["cpu"], reverse=True)
    return procs[:count]


def get_uptime():
    return int(time.time() - psutil.boot_time())


def collect_metrics():
    cpu = get_cpu_usage()
    mem = get_memory_info()
    disks = get_disk_info()
    net = get_network_info()
    load = get_load_average()
    procs = get_top_processes()
    uptime = get_uptime()
    proc_count = len(list(psutil.process_iter()))

    return {
        "cpu_usage": cpu,
        **mem,
        "disk_partitions": disks,
        **net,
        **load,
        "process_count": proc_count,
        "top_processes": procs,
        "uptime_seconds": uptime,
    }


def get_installed_packages():
    """Get list of installed programs via PowerShell."""
    packages = []
    try:
        ps_cmd = (
            'Get-ItemProperty HKLM:\\Software\\Wow6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*, '
            'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\* | '
            'Where-Object { $_.DisplayName } | '
            'Select-Object DisplayName, DisplayVersion, Publisher | '
            'ConvertTo-Json -Compress'
        )
        result = subprocess.run(
            ["powershell", "-NoProfile", "-Command", ps_cmd],
            capture_output=True,
            text=True,
            timeout=60,
        )
        if result.stdout.strip():
            items = json.loads(result.stdout)
            if isinstance(items, dict):
                items = [items]
            for item in items:
                packages.append(
                    {
                        "name": item.get("DisplayName", ""),
                        "version": item.get("DisplayVersion", ""),
                        "description": item.get("Publisher", ""),
                    }
                )
    except Exception as e:
        logger.error(f"Failed to get packages: {e}")

    # Check Windows Updates
    try:
        ps_cmd = (
            '$Session = New-Object -ComObject Microsoft.Update.Session; '
            '$Searcher = $Session.CreateUpdateSearcher(); '
            '$Result = $Searcher.Search("IsInstalled=0 and Type=\'Software\'"); '
            '$Result.Updates | Select-Object Title, @{N="Version";E={$_.Identity.UpdateId}} | '
            'ConvertTo-Json -Compress'
        )
        result = subprocess.run(
            ["powershell", "-NoProfile", "-Command", ps_cmd],
            capture_output=True,
            text=True,
            timeout=120,
        )
        if result.stdout.strip():
            updates = json.loads(result.stdout)
            if isinstance(updates, dict):
                updates = [updates]
            for upd in updates:
                # Add as available update for a synthetic "Windows Update" package
                packages.append(
                    {
                        "name": f"WindowsUpdate: {upd.get('Title', 'Unknown')}",
                        "version": "installed",
                        "description": "Windows Update",
                        "available_update": upd.get("Version", "available"),
                    }
                )
    except Exception as e:
        logger.debug(f"Windows Update check failed: {e}")

    return packages


def read_windows_eventlog(log_name="Application", count=100):
    """Read Windows Event Log entries."""
    try:
        ps_cmd = (
            f'Get-EventLog -LogName {log_name} -Newest {count} | '
            'Select-Object TimeGenerated, EntryType, Source, Message | '
            'ForEach-Object {{ "{0} [{1}] {2}: {3}" -f $_.TimeGenerated, $_.EntryType, $_.Source, $_.Message }} '
        )
        result = subprocess.run(
            ["powershell", "-NoProfile", "-Command", ps_cmd],
            capture_output=True,
            text=True,
            timeout=30,
        )
        return {"content": result.stdout, "total_lines": count}
    except Exception as e:
        return {"content": f"Error reading event log: {str(e)}", "total_lines": 0}


def execute_update(package_names=None):
    """Execute Windows Updates via PowerShell."""
    try:
        logger.info("Starting Windows Update...")
        ps_cmd = (
            'Install-Module PSWindowsUpdate -Force -Confirm:$false -ErrorAction SilentlyContinue; '
            'Import-Module PSWindowsUpdate; '
            'Get-WindowsUpdate -Install -AcceptAll -AutoReboot:$false | '
            'ConvertTo-Json -Compress'
        )
        result = subprocess.run(
            ["powershell", "-NoProfile", "-Command", ps_cmd],
            capture_output=True,
            text=True,
            timeout=3600,
        )
        return {
            "status": "completed" if result.returncode == 0 else "failed",
            "log_output": result.stdout + result.stderr,
        }
    except subprocess.TimeoutExpired:
        return {"status": "failed", "log_output": "Update timed out"}
    except Exception as e:
        return {"status": "failed", "log_output": str(e)}


def execute_script(script_content):
    """Execute a PowerShell script."""
    try:
        result = subprocess.run(
            ["powershell", "-NoProfile", "-Command", script_content],
            capture_output=True,
            text=True,
            timeout=600,
        )
        return {
            "status": "completed" if result.returncode == 0 else "failed",
            "output": result.stdout + result.stderr,
        }
    except subprocess.TimeoutExpired:
        return {"status": "failed", "output": "Script timed out"}
    except Exception as e:
        return {"status": "failed", "output": str(e)}


def send_metrics(config, metrics):
    try:
        url = f"{config['server_url']}/api/agent/metrics"
        headers = {"X-Agent-API-Key": config["api_key"], "Content-Type": "application/json"}
        resp = requests.post(
            url, json=metrics, headers=headers, verify=config["verify_ssl"], timeout=10
        )
        if resp.status_code != 200:
            logger.warning(f"Metrics send failed: {resp.status_code}")
    except Exception as e:
        logger.error(f"Failed to send metrics: {e}")


def send_heartbeat(config):
    try:
        url = f"{config['server_url']}/api/agent/heartbeat"
        headers = {"X-Agent-API-Key": config["api_key"], "Content-Type": "application/json"}
        resp = requests.post(url, json={}, headers=headers, verify=config["verify_ssl"], timeout=10)

        if resp.status_code == 200:
            data = resp.json()
            if data.get("pending_commands"):
                process_commands(config, data["pending_commands"])
    except Exception as e:
        logger.error(f"Heartbeat failed: {e}")


def sync_packages(config):
    try:
        packages = get_installed_packages()
        url = f"{config['server_url']}/api/agent/packages/sync"
        headers = {"X-Agent-API-Key": config["api_key"], "Content-Type": "application/json"}
        resp = requests.post(
            url,
            json={"packages": packages},
            headers=headers,
            verify=config["verify_ssl"],
            timeout=60,
        )
        if resp.status_code == 200:
            logger.info(f"Synced {len(packages)} packages")
    except Exception as e:
        logger.error(f"Package sync failed: {e}")


def process_commands(config, commands):
    for cmd in commands:
        logger.info(f"Processing command: {cmd['type']}")
        if cmd["type"] == "update":
            result = execute_update()
            report_task_result(config, cmd["id"], result)
        elif cmd["type"] == "reboot":
            report_task_result(
                config, cmd["id"], {"status": "completed", "output": "Rebooting..."}
            )
            subprocess.run(["shutdown", "/r", "/t", "60", "/c", "Scheduled reboot by ServerManager"])
        elif cmd["type"] == "script" and cmd.get("script_content"):
            result = execute_script(cmd["script_content"])
            report_task_result(config, cmd["id"], result)


def report_task_result(config, task_id, result):
    try:
        url = f"{config['server_url']}/api/agent/tasks/result"
        headers = {"X-Agent-API-Key": config["api_key"], "Content-Type": "application/json"}
        requests.post(
            url,
            json={"task_id": task_id, **result},
            headers=headers,
            verify=config["verify_ssl"],
            timeout=10,
        )
    except Exception as e:
        logger.error(f"Failed to report task result: {e}")


def signal_handler(signum, frame):
    global running
    logger.info("Received shutdown signal")
    running = False


def install_as_service():
    """Install the agent as a Windows Service using NSSM or native sc."""
    agent_path = os.path.abspath(__file__)
    python_path = sys.executable

    print("To install as a Windows Service, use NSSM:")
    print(f"  nssm install ServerManagerAgent \"{python_path}\" \"{agent_path}\"")
    print(f"  nssm set ServerManagerAgent AppDirectory \"{os.path.dirname(agent_path)}\"")
    print(f"  nssm set ServerManagerAgent Description \"ServerManager Monitoring Agent\"")
    print(f"  nssm set ServerManagerAgent Start SERVICE_AUTO_START")
    print(f"  nssm start ServerManagerAgent")
    print()
    print("Or create a scheduled task:")
    ps_cmd = (
        f'$Action = New-ScheduledTaskAction -Execute "{python_path}" -Argument "{agent_path}"; '
        f'$Trigger = New-ScheduledTaskTrigger -AtStartup; '
        f'$Settings = New-ScheduledTaskSettingsSet -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1); '
        f'Register-ScheduledTask -TaskName "ServerManagerAgent" -Action $Action -Trigger $Trigger '
        f'-Settings $Settings -RunLevel Highest -User "SYSTEM" -Description "ServerManager Monitoring Agent"'
    )
    print(f"PowerShell: {ps_cmd}")


def main():
    global running

    parser = argparse.ArgumentParser(description="ServerManager Windows Agent")
    parser.add_argument("--server-url", help="Management server URL")
    parser.add_argument("--api-key", help="Agent API key")
    parser.add_argument("--configure", action="store_true", help="Configure the agent")
    parser.add_argument("--install-service", action="store_true", help="Show service installation instructions")
    parser.add_argument("--once", action="store_true", help="Run once and exit")
    args = parser.parse_args()

    setup_logging()
    config = load_config()

    if args.install_service:
        install_as_service()
        return

    if args.configure or args.server_url or args.api_key:
        if args.server_url:
            config["server_url"] = args.server_url
        else:
            config["server_url"] = input(
                f"Server URL [{config['server_url']}]: "
            ).strip() or config["server_url"]

        if args.api_key:
            config["api_key"] = args.api_key
        else:
            config["api_key"] = input("Agent API Key: ").strip() or config["api_key"]

        save_config(config)
        logger.info("Configuration saved")

        if not args.server_url and not args.api_key:
            return

    if not config["api_key"]:
        logger.error("No API key configured. Run with --configure first.")
        sys.exit(1)

    signal.signal(signal.SIGTERM, signal_handler)
    signal.signal(signal.SIGINT, signal_handler)

    logger.info(f"ServerManager Agent starting (server: {config['server_url']})")

    last_metrics = 0
    last_heartbeat = 0
    last_package_sync = 0

    while running:
        now = time.time()

        if now - last_metrics >= config["metrics_interval"]:
            try:
                metrics = collect_metrics()
                send_metrics(config, metrics)
                last_metrics = now
            except Exception as e:
                logger.error(f"Metrics collection error: {e}")

        if now - last_heartbeat >= config["heartbeat_interval"]:
            send_heartbeat(config)
            last_heartbeat = now

        if now - last_package_sync >= config["package_sync_interval"]:
            sync_packages(config)
            last_package_sync = now

        if args.once:
            break

        time.sleep(1)

    logger.info("Agent stopped")


if __name__ == "__main__":
    main()
