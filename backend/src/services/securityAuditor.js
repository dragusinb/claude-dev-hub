import { Client } from 'ssh2';
import { getAllServersForMonitoring, addSecurityAudit, getServerOwner } from '../models/database.js';
import { sendSecurityAlert } from './alertService.js';

let auditInterval = null;

// Run security audit on a single server via SSH
async function auditServer(server) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    const timeout = setTimeout(() => {
      conn.end();
      reject(new Error('Connection timeout'));
    }, 60000); // 60 second timeout for audit

    conn.on('ready', () => {
      const commands = `
        echo "===PORTS==="
        ss -tuln 2>/dev/null | grep LISTEN | awk '{print $5}' | rev | cut -d: -f1 | rev | sort -n | uniq
        echo "===UPDATES==="
        apt list --upgradable 2>/dev/null | grep -v "Listing..." | wc -l
        echo "===SECURITY==="
        apt list --upgradable 2>/dev/null | grep -i security | wc -l
        echo "===SSHFAIL==="
        grep "Failed password" /var/log/auth.log 2>/dev/null | tail -100 | wc -l
        echo "===ROOTLOGIN==="
        grep -c "^PermitRootLogin yes" /etc/ssh/sshd_config 2>/dev/null || echo "0"
        echo "===FIREWALL==="
        ufw status 2>/dev/null | head -1
        echo "===FAIL2BAN==="
        systemctl is-active fail2ban 2>/dev/null || echo "inactive"
        echo "===USERS==="
        cat /etc/passwd | grep -c ":/bin/bash"
      `;

      conn.exec(commands, (err, stream) => {
        if (err) {
          clearTimeout(timeout);
          conn.end();
          reject(err);
          return;
        }

        let output = '';
        stream.on('data', (data) => {
          output += data.toString();
        });
        stream.stderr.on('data', (data) => {
          // Ignore stderr
        });
        stream.on('close', () => {
          clearTimeout(timeout);
          conn.end();

          // Parse the output
          const sections = output.split('===');
          const audit = {
            openPorts: [],
            pendingUpdates: 0,
            securityUpdates: 0,
            failedSshAttempts: 0,
            firewallActive: false,
            fail2banActive: false,
            findings: [],
            recommendations: [],
            score: 100
          };

          for (let i = 0; i < sections.length; i++) {
            const section = sections[i].trim();
            const data = sections[i + 1]?.trim() || '';

            if (section === 'PORTS') {
              audit.openPorts = data.split('\n').filter(p => p && !isNaN(parseInt(p))).map(p => parseInt(p));
            } else if (section === 'UPDATES') {
              audit.pendingUpdates = parseInt(data) || 0;
            } else if (section === 'SECURITY') {
              audit.securityUpdates = parseInt(data) || 0;
            } else if (section === 'SSHFAIL') {
              audit.failedSshAttempts = parseInt(data) || 0;
            } else if (section === 'FIREWALL') {
              audit.firewallActive = data.toLowerCase().includes('active');
            } else if (section === 'FAIL2BAN') {
              audit.fail2banActive = data.trim() === 'active';
            }
          }

          // Analyze and generate findings/recommendations
          analyzeAudit(audit);

          resolve(audit);
        });
      });
    });

    conn.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    const config = {
      host: server.host,
      port: server.port,
      username: server.username
    };

    if (server.auth_type === 'password') {
      config.password = server.password;
    } else {
      config.privateKey = server.private_key;
    }

    conn.connect(config);
  });
}

// Port descriptions for better UX
const PORT_DESCRIPTIONS = {
  21: 'FTP',
  22: 'SSH',
  23: 'Telnet',
  25: 'SMTP',
  53: 'DNS',
  80: 'HTTP',
  110: 'POP3',
  143: 'IMAP',
  443: 'HTTPS',
  465: 'SMTPS',
  587: 'SMTP Submission',
  631: 'CUPS Printing',
  993: 'IMAPS',
  995: 'POP3S',
  3306: 'MySQL',
  5432: 'PostgreSQL',
  6379: 'Redis',
  8080: 'HTTP Alt',
  8443: 'HTTPS Alt',
  10000: 'Webmin',
  27017: 'MongoDB'
};

// Analyze audit results and generate findings/recommendations
function analyzeAudit(audit) {
  // Track deductions per category to apply caps
  const deductions = { ports: 0, firewall: 0, ssh: 0, updates: 0 };
  const maxDeductions = { ports: 30, firewall: 15, ssh: 25, updates: 25 };

  // Port categories
  const riskyPorts = [21, 23];  // FTP, Telnet - truly dangerous
  const mailPorts = [25, 110, 143];  // SMTP, POP3, IMAP - risky if not mail server
  const secureMailPorts = [993, 995, 465, 587];  // IMAPS, POP3S, SMTPS, Submission
  const databasePorts = [3306, 5432, 6379, 27017];
  const commonPorts = [22, 80, 443, 53];  // SSH, HTTP, HTTPS, DNS

  // Check if this looks like a mail server (has secure mail ports open)
  const isMailServer = audit.openPorts.some(p => secureMailPorts.includes(p)) ||
                       audit.openPorts.filter(p => mailPorts.includes(p)).length >= 2;

  for (const port of audit.openPorts) {
    const portName = PORT_DESCRIPTIONS[port] || `Port ${port}`;

    if (databasePorts.includes(port)) {
      audit.findings.push({
        severity: 'high',
        category: 'ports',
        port: port,
        message: `${portName} (${port}) is exposed to the internet - should be localhost only`,
        action: `restrict_port_${port}_localhost`
      });
      audit.recommendations.push(`Restrict ${portName} (port ${port}) to localhost only`);
      deductions.ports += 15;
    } else if (riskyPorts.includes(port)) {
      audit.findings.push({
        severity: 'high',
        category: 'ports',
        port: port,
        message: `${portName} (${port}) is open - this is a security risk`,
        action: `block_port_${port}`
      });
      audit.recommendations.push(`Block ${portName} (port ${port}) with firewall`);
      deductions.ports += 10;
    } else if (mailPorts.includes(port)) {
      if (isMailServer) {
        audit.findings.push({
          severity: 'info',
          category: 'ports',
          port: port,
          message: `${portName} (${port}) is open (mail server detected)`
        });
      } else {
        audit.findings.push({
          severity: 'medium',
          category: 'ports',
          port: port,
          message: `${portName} (${port}) is open - consider blocking if not a mail server`,
          action: `block_port_${port}`
        });
        deductions.ports += 5;
      }
    } else if (secureMailPorts.includes(port)) {
      audit.findings.push({
        severity: 'info',
        category: 'ports',
        port: port,
        message: `${portName} (${port}) is open (secure mail port)`
      });
    } else if (!commonPorts.includes(port)) {
      audit.findings.push({
        severity: 'low',
        category: 'ports',
        port: port,
        message: `Non-standard port ${port} is open`
      });
      deductions.ports += 2;
    }
  }

  // Apply capped deductions for ports
  audit.score -= Math.min(deductions.ports, maxDeductions.ports);

  // Check firewall status
  if (!audit.firewallActive) {
    audit.findings.push({
      severity: 'high',
      category: 'firewall',
      message: 'Firewall (UFW) is not active',
      action: 'enable_firewall'
    });
    audit.recommendations.push('Enable UFW firewall to protect against unauthorized access');
    deductions.firewall += 15;
  } else {
    audit.findings.push({
      severity: 'info',
      category: 'firewall',
      message: 'Firewall (UFW) is active'
    });
  }

  // Apply capped deductions for firewall
  audit.score -= Math.min(deductions.firewall, maxDeductions.firewall);

  // Check fail2ban status
  if (!audit.fail2banActive) {
    if (audit.failedSshAttempts > 10) {
      audit.findings.push({
        severity: 'high',
        category: 'ssh',
        message: 'Fail2ban is not installed/active and SSH attacks detected',
        action: 'install_fail2ban'
      });
      deductions.ssh += 10;
    }
  } else {
    audit.findings.push({
      severity: 'info',
      category: 'ssh',
      message: 'Fail2ban is active - protecting against brute force'
    });
  }

  // Check failed SSH attempts (only if fail2ban not active)
  if (!audit.fail2banActive) {
    if (audit.failedSshAttempts > 50) {
      audit.findings.push({
        severity: 'medium',
        category: 'ssh',
        message: `${audit.failedSshAttempts} failed SSH login attempts detected`
      });
      audit.recommendations.push('Install fail2ban to automatically block attackers');
      deductions.ssh += 10;
    } else if (audit.failedSshAttempts > 10) {
      audit.findings.push({
        severity: 'low',
        category: 'ssh',
        message: `${audit.failedSshAttempts} failed SSH login attempts detected`
      });
      deductions.ssh += 5;
    }
  }

  // Apply capped deductions for SSH
  audit.score -= Math.min(deductions.ssh, maxDeductions.ssh);

  // Check security updates
  if (audit.securityUpdates > 0) {
    audit.findings.push({
      severity: 'high',
      category: 'updates',
      message: `${audit.securityUpdates} security updates pending`,
      action: 'install_security_updates'
    });
    audit.recommendations.push('Install pending security updates immediately');
    deductions.updates += Math.min(audit.securityUpdates * 3, 15);
  }

  // Check pending updates
  if (audit.pendingUpdates > 10) {
    audit.findings.push({
      severity: 'medium',
      category: 'updates',
      message: `${audit.pendingUpdates} total updates pending`,
      action: 'install_all_updates'
    });
    audit.recommendations.push('Schedule a maintenance window to update packages');
    deductions.updates += Math.min(Math.floor(audit.pendingUpdates / 5), 10);
  }

  // Apply capped deductions for updates
  audit.score -= Math.min(deductions.updates, maxDeductions.updates);

  // Ensure score doesn't go below 10 if firewall is active (base protection)
  if (audit.firewallActive) {
    audit.score = Math.max(10, audit.score);
  } else {
    audit.score = Math.max(0, audit.score);
  }

  // Add positive findings
  if (audit.openPorts.length <= 3) {
    audit.findings.push({
      severity: 'info',
      category: 'ports',
      message: 'Minimal ports exposed - good security practice'
    });
  }

  if (audit.securityUpdates === 0 && audit.pendingUpdates < 5) {
    audit.findings.push({
      severity: 'info',
      category: 'updates',
      message: 'System is up to date'
    });
  }
}

// Run audit for a specific server
export async function runSecurityAudit(server, userId) {
  try {
    console.log(`Running security audit for server: ${server.name}`);
    const auditResult = await auditServer(server);

    // Save to database
    addSecurityAudit({
      serverId: server.id,
      userId: userId,
      score: auditResult.score,
      openPorts: auditResult.openPorts,
      pendingUpdates: auditResult.pendingUpdates,
      securityUpdates: auditResult.securityUpdates,
      failedSshAttempts: auditResult.failedSshAttempts,
      findings: auditResult.findings,
      recommendations: auditResult.recommendations
    });

    // Security email alerts disabled - log only
    if (auditResult.score < 50) {
      console.log(`[ALERT] Security audit for ${server.name} (${server.host}) returned critical score: ${auditResult.score}/100`);
    }

    console.log(`Security audit complete for ${server.name}: Score ${auditResult.score}`);
    return auditResult;
  } catch (err) {
    console.error(`Security audit failed for ${server.name}:`, err.message);
    throw err;
  }
}

// Run audit on all servers (for scheduled runs)
export async function auditAllServers() {
  try {
    const servers = getAllServersForMonitoring();

    for (const server of servers) {
      // Skip servers without credentials
      const hasCredentials = server.auth_type === 'password' ? !!server.password : !!server.private_key;
      if (!hasCredentials) continue;

      try {
        const userId = getServerOwner(server.id);
        if (userId) {
          await runSecurityAudit(server, userId);
        }
      } catch (err) {
        console.error(`Failed to audit server ${server.name}:`, err.message);
      }
    }
  } catch (err) {
    console.error('Security audit collection error:', err);
  }
}

// Start scheduled security audits (runs every N hours)
export function startSecurityAuditor(intervalHours = 24) {
  if (auditInterval) {
    console.log('Security auditor already running');
    return;
  }

  console.log(`Starting security auditor (interval: ${intervalHours} hours)`);

  // Run first audit after 5 minutes (let health collector run first)
  setTimeout(() => {
    auditAllServers();
  }, 5 * 60 * 1000);

  // Then run at interval
  auditInterval = setInterval(auditAllServers, intervalHours * 60 * 60 * 1000);
}

// Stop the security auditor
export function stopSecurityAuditor() {
  if (auditInterval) {
    clearInterval(auditInterval);
    auditInterval = null;
    console.log('Security auditor stopped');
  }
}
