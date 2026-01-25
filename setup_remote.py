#!/usr/bin/env python3
"""
Remote server setup script for Claude Dev Hub
Usage: python setup_remote.py <host> <user> <password> <github_repo_url>
"""

import paramiko
import sys
import os

def run_command(ssh, command, timeout=300):
    """Run a command and print output"""
    print(f"\n>>> {command}")
    stdin, stdout, stderr = ssh.exec_command(command, timeout=timeout)
    exit_status = stdout.channel.recv_exit_status()

    try:
        output = stdout.read().decode('utf-8', errors='replace')
        clean_output = ''.join(c for c in output if ord(c) < 128 or c in '\n\r\t')
        if clean_output.strip():
            lines = clean_output.strip().split('\n')
            if len(lines) > 50:
                print(f"... [{len(lines) - 50} lines truncated] ...")
                lines = lines[-50:]
            print('\n'.join(lines))
    except Exception as e:
        print(f"[Output encoding error: {e}]")

    if exit_status != 0:
        try:
            error = stderr.read().decode('utf-8', errors='replace')
            if error.strip():
                print(f"Error: {error}")
        except:
            pass

    return exit_status

def main():
    if len(sys.argv) < 5:
        print("Usage: python setup_remote.py <host> <user> <password> <github_repo_url>")
        print("Example: python setup_remote.py 194.163.144.206 root mypassword https://github.com/user/repo.git")
        sys.exit(1)

    HOST = sys.argv[1]
    USER = sys.argv[2]
    PASSWORD = sys.argv[3]
    GITHUB_REPO = sys.argv[4]

    print("=" * 50)
    print("Claude Dev Hub - Remote Server Setup")
    print("=" * 50)
    print(f"\nConnecting to {HOST}...")

    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())

    try:
        ssh.connect(HOST, username=USER, password=PASSWORD, timeout=30)
        print("Connected successfully!\n")

        print("\n[1/10] Updating system packages...")
        run_command(ssh, "apt update && DEBIAN_FRONTEND=noninteractive apt upgrade -y 2>&1 | tail -20", timeout=600)

        print("\n[2/10] Installing Node.js 20.x...")
        run_command(ssh, "curl -fsSL https://deb.nodesource.com/setup_20.x | bash - 2>&1 | tail -5", timeout=120)
        run_command(ssh, "apt install -y nodejs 2>&1 | tail -5", timeout=120)

        print("\n[3/10] Installing build essentials...")
        run_command(ssh, "apt install -y build-essential python3 2>&1 | tail -5", timeout=120)

        print("\n[4/10] Installing Git...")
        run_command(ssh, "apt install -y git 2>&1 | tail -3", timeout=60)

        print("\n[5/10] Installing PM2...")
        run_command(ssh, "npm install -g pm2 2>&1 | tail -5", timeout=120)

        print("\n[6/10] Installing Claude Code CLI...")
        run_command(ssh, "npm install -g @anthropic-ai/claude-code 2>&1 | tail -5", timeout=180)

        print("\n[7/10] Installing Nginx...")
        run_command(ssh, "apt install -y nginx 2>&1 | tail -5", timeout=120)

        print("\n[8/10] Cloning repository...")
        run_command(ssh, "mkdir -p /opt/claude-dev-hub/projects /opt/claude-dev-hub/data")
        run_command(ssh, f"rm -rf /opt/claude-dev-hub/app && git clone {GITHUB_REPO} /opt/claude-dev-hub/app 2>&1", timeout=120)

        print("\n[9/10] Installing dependencies and building...")
        run_command(ssh, "cd /opt/claude-dev-hub/app && npm install 2>&1 | tail -10", timeout=300)
        run_command(ssh, "cd /opt/claude-dev-hub/app && npm run build 2>&1 | tail -10", timeout=300)

        print("\n[10/10] Configuring and starting services...")
        run_command(ssh, "cp /opt/claude-dev-hub/app/nginx.conf /etc/nginx/sites-available/claude-dev-hub")
        run_command(ssh, "ln -sf /etc/nginx/sites-available/claude-dev-hub /etc/nginx/sites-enabled/")
        run_command(ssh, "rm -f /etc/nginx/sites-enabled/default")
        run_command(ssh, "nginx -t && systemctl restart nginx")
        run_command(ssh, "cd /opt/claude-dev-hub/app && pm2 delete claude-dev-hub 2>/dev/null; pm2 start ecosystem.config.js 2>&1 | tail -5")
        run_command(ssh, "pm2 save")

        print("\n[Checking status...]")
        run_command(ssh, "curl -s http://localhost:3001/api/health")

        print("\n" + "=" * 50)
        print("SETUP COMPLETE!")
        print("=" * 50)
        print(f"\nYour Claude Dev Hub is running at: http://{HOST}")
        print("=" * 50)

    except Exception as e:
        print(f"\nError: {e}")
        sys.exit(1)
    finally:
        ssh.close()

if __name__ == "__main__":
    main()
