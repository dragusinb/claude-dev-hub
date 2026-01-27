import { Client } from 'ssh2';
import { getAllServersForMonitoring, addSecurityAudit, getServerOwner } from '../models/database.js';
import { sendSecurityAlert } from './alertService.js';

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
        ufw status 2>/dev/null | head -1 || iptables -L -n 2>/dev/null | wc -l
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

// Analyze audit results and generate findings/recommendations
function analyzeAudit(audit) {
  // Check open ports
  const riskyPorts = [21, 23, 25, 110, 143, 3306, 5432, 6379, 27017];
  const commonPorts = [22, 80, 443];

  for (const port of audit.openPorts) {
    if (riskyPorts.includes(port)) {
      audit.findings.push({
        severity: 'high',
        category: 'ports',
        message: `Risky port ${port} is open and exposed`
      });
      audit.recommendations.push(`Consider closing port ${port} or restricting access with firewall`);
      audit.score -= 10;
    } else if (!commonPorts.includes(port)) {
      audit.findings.push({
        severity: 'medium',
        category: 'ports',
        message: `Non-standard port ${port} is open`
      });
      audit.score -= 3;
    }
  }

  // Check security updates
  if (audit.securityUpdates > 0) {
    audit.findings.push({
      severity: 'high',
      category: 'updates',
      message: `${audit.securityUpdates} security updates pending`
    });
    audit.recommendations.push('Install pending security updates immediately');
    audit.score -= Math.min(audit.securityUpdates * 5, 25);
  }

  // Check pending updates
  if (audit.pendingUpdates > 10) {
    audit.findings.push({
      severity: 'medium',
      category: 'updates',
      message: `${audit.pendingUpdates} total updates pending`
    });
    audit.recommendations.push('Schedule a maintenance window to update packages');
    audit.score -= Math.min(audit.pendingUpdates, 15);
  }

  // Check failed SSH attempts
  if (audit.failedSshAttempts > 50) {
    audit.findings.push({
      severity: 'high',
      category: 'ssh',
      message: `${audit.failedSshAttempts} failed SSH login attempts detected`
    });
    audit.recommendations.push('Consider installing fail2ban or configuring SSH key-only authentication');
    audit.score -= 15;
  } else if (audit.failedSshAttempts > 10) {
    audit.findings.push({
      severity: 'medium',
      category: 'ssh',
      message: `${audit.failedSshAttempts} failed SSH login attempts detected`
    });
    audit.score -= 5;
  }

  // Ensure score doesn't go below 0
  audit.score = Math.max(0, audit.score);

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

    // Send alert if score is critical
    if (auditResult.score < 50) {
      await sendSecurityAlert(server, auditResult);
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
