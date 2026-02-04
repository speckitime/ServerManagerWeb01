#!/usr/bin/env python3
"""
ServerManager Linux Agent
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
    print("Missing dependencies. Install with: pip3 install psutil requests")
    sys.exit(1)

# Configuration
CONFIG_FILE = "/etc/servermanager/agent.conf"
LOG_FILE = "/var/log/servermanager-agent.log"
PID_FILE = "/var/run/servermanager-agent.pid"

DEFAULT_CONFIG = {
    "server_url": "https://localhost:3000",
    "api_key": "",
    "metrics_interval": 5,
    "heartbeat_interval": 30,
    "package_sync_interval": 3600,
    "verify_ssl": True,
}

# Global state
running = True
logger = logging.getLogger("servermanager-agent")


def setup_logging():
    log_dir = os.path.dirname(LOG_FILE)
    os.makedirs(log_dir, exist_ok=True)

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
    config_dir = os.path.dirname(CONFIG_FILE)
    os.makedirs(config_dir, exist_ok=True)
    with open(CONFIG_FILE, "w") as f:
        json.dump(config, f, indent=2)
    os.chmod(CONFIG_FILE, 0o600)


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
        except PermissionError:
            continue
    return partitions


def get_network_info():
    counters = psutil.net_io_counters()
    return {
        "network_rx_bytes": counters.bytes_recv,
        "network_tx_bytes": counters.bytes_sent,
    }


def get_load_average():
    load = os.getloadavg()
    return {
        "load_avg_1": round(load[0], 2),
        "load_avg_5": round(load[1], 2),
        "load_avg_15": round(load[2], 2),
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
                    "cpu": info["cpu_percent"],
                    "memory": info["memory_percent"],
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
    """Get list of installed packages (Debian/Ubuntu)."""
    packages = []
    try:
        result = subprocess.run(
            ["dpkg-query", "-W", "-f=${Package}\t${Version}\t${Description}\n"],
            capture_output=True,
            text=True,
            timeout=60,
        )
        for line in result.stdout.strip().split("\n"):
            parts = line.split("\t", 2)
            if len(parts) >= 2:
                packages.append(
                    {
                        "name": parts[0],
                        "version": parts[1],
                        "description": parts[2] if len(parts) > 2 else "",
                    }
                )
    except Exception as e:
        logger.error(f"Failed to get packages: {e}")

    # Check for available updates
    try:
        result = subprocess.run(
            ["apt", "list", "--upgradable"],
            capture_output=True,
            text=True,
            timeout=120,
        )
        upgradable = {}
        for line in result.stdout.strip().split("\n")[1:]:  # Skip header
            if "/" in line:
                name = line.split("/")[0]
                version = line.split(" ")[1] if " " in line else ""
                upgradable[name] = version

        for pkg in packages:
            if pkg["name"] in upgradable:
                pkg["available_update"] = upgradable[pkg["name"]]
    except Exception as e:
        logger.error(f"Failed to check updates: {e}")

    return packages


def read_log_file(log_path, lines=100, search=None):
    """Read the last N lines of a log file."""
    try:
        if not os.path.exists(log_path):
            return {"content": f"File not found: {log_path}", "total_lines": 0}

        with open(log_path, "r", errors="replace") as f:
            all_lines = f.readlines()

        if search:
            all_lines = [l for l in all_lines if search.lower() in l.lower()]

        content = "".join(all_lines[-lines:])
        return {"content": content, "total_lines": len(all_lines)}
    except PermissionError:
        return {"content": f"Permission denied: {log_path}", "total_lines": 0}
    except Exception as e:
        return {"content": f"Error reading {log_path}: {str(e)}", "total_lines": 0}


def execute_update(package_names=None):
    """Execute system updates."""
    try:
        logger.info("Starting system update...")

        # Update package lists
        result = subprocess.run(
            ["apt-get", "update"],
            capture_output=True,
            text=True,
            timeout=300,
        )

        if package_names and package_names != ["*"]:
            cmd = ["apt-get", "install", "-y"] + package_names
        else:
            cmd = ["apt-get", "upgrade", "-y"]

        result = subprocess.run(cmd, capture_output=True, text=True, timeout=1800)

        return {
            "status": "completed" if result.returncode == 0 else "failed",
            "log_output": result.stdout + result.stderr,
        }
    except subprocess.TimeoutExpired:
        return {"status": "failed", "log_output": "Update timed out"}
    except Exception as e:
        return {"status": "failed", "log_output": str(e)}


def execute_script(script_content):
    """Execute a custom script."""
    try:
        result = subprocess.run(
            ["bash", "-c", script_content],
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
    """Send metrics to the management server."""
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
    """Send heartbeat and receive pending commands."""
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
    """Sync installed packages with the management server."""
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
    """Process pending commands from the server."""
    for cmd in commands:
        logger.info(f"Processing command: {cmd['type']}")
        if cmd["type"] == "update":
            result = execute_update()
            report_task_result(config, cmd["id"], result)
        elif cmd["type"] == "reboot":
            report_task_result(
                config, cmd["id"], {"status": "completed", "output": "Rebooting..."}
            )
            subprocess.run(["shutdown", "-r", "+1", "Scheduled reboot by ServerManager"])
        elif cmd["type"] == "script" and cmd.get("script_content"):
            result = execute_script(cmd["script_content"])
            report_task_result(config, cmd["id"], result)


def report_task_result(config, task_id, result):
    """Report task execution result to the server."""
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


def main():
    global running

    parser = argparse.ArgumentParser(description="ServerManager Linux Agent")
    parser.add_argument("--server-url", help="Management server URL")
    parser.add_argument("--api-key", help="Agent API key")
    parser.add_argument("--configure", action="store_true", help="Configure the agent")
    parser.add_argument("--once", action="store_true", help="Run once and exit")
    args = parser.parse_args()

    setup_logging()
    config = load_config()

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

        # Send metrics
        if now - last_metrics >= config["metrics_interval"]:
            try:
                metrics = collect_metrics()
                send_metrics(config, metrics)
                last_metrics = now
            except Exception as e:
                logger.error(f"Metrics collection error: {e}")

        # Send heartbeat
        if now - last_heartbeat >= config["heartbeat_interval"]:
            send_heartbeat(config)
            last_heartbeat = now

        # Sync packages
        if now - last_package_sync >= config["package_sync_interval"]:
            sync_packages(config)
            last_package_sync = now

        if args.once:
            break

        time.sleep(1)

    logger.info("Agent stopped")


if __name__ == "__main__":
    main()
