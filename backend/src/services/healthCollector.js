import { Client } from 'ssh2';
import { exec } from 'child_process';
import { getAllServersForMonitoring, addServerHealthHistory, cleanupOldHealthHistory, addUptimeEvent, cleanupOldUptimeEvents, getLastHealthRecord } from '../models/database.js';
import { checkAndAlert, alertServerDown, alertServerUp } from './alertService.js';

let collectorInterval = null;

// Check if server is the local machine
function isLocalServer(server) {
  return server.is_local === 1 ||
         server.host === 'localhost' ||
         server.host === '127.0.0.1' ||
         server.name?.toLowerCase().includes('claude dev hub server');
}

// Execute commands locally
function executeLocally(commands) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Command timeout'));
    }, 15000);

    exec(commands, { shell: '/bin/bash', maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      clearTimeout(timeout);
      if (err && err.killed) {
        reject(new Error('Command timeout'));
        return;
      }
      resolve(stdout);
    });
  });
}

// Parse health output into stats object
function parseHealthOutput(output, startTime) {
  const sections = output.split('===');
  const stats = {};

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i].trim();
    if (section.startsWith('CPU')) {
      const cpuValue = sections[i + 1]?.trim();
      stats.cpu = parseFloat(cpuValue) || 0;
    } else if (section.startsWith('MEMORY')) {
      const memParts = sections[i + 1]?.trim().split(' ');
      if (memParts && memParts.length >= 3) {
        stats.memoryTotal = parseInt(memParts[0]) || 0;
        stats.memoryUsed = parseInt(memParts[1]) || 0;
        stats.memoryPercent = stats.memoryTotal > 0 ? Math.round((stats.memoryUsed / stats.memoryTotal) * 100) : 0;
      }
    } else if (section.startsWith('DISK')) {
      const diskParts = sections[i + 1]?.trim().split(' ');
      if (diskParts && diskParts.length >= 4) {
        stats.diskTotal = diskParts[0];
        stats.diskUsed = diskParts[1];
        stats.diskPercent = parseInt(diskParts[3]) || 0;
      }
    } else if (section.startsWith('LOAD')) {
      const loadParts = sections[i + 1]?.trim().split(' ');
      if (loadParts && loadParts.length >= 3) {
        stats.loadOne = parseFloat(loadParts[0]) || 0;
        stats.loadFive = parseFloat(loadParts[1]) || 0;
        stats.loadFifteen = parseFloat(loadParts[2]) || 0;
      }
    } else if (section.startsWith('NETWORK')) {
      const netParts = sections[i + 1]?.trim().split(' ');
      if (netParts && netParts.length >= 2) {
        stats.networkRxBytes = parseInt(netParts[0]) || 0;
        stats.networkTxBytes = parseInt(netParts[1]) || 0;
      }
    }
  }

  stats.responseTime = Date.now() - startTime;
  return stats;
}

// Collect health data from a single server
async function collectServerHealth(server) {
  const commands = `
    echo "===CPU==="
    top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1
    echo "===MEMORY==="
    free -m | awk 'NR==2{printf "%s %s %s", $2, $3, $4}'
    echo "===DISK==="
    df -h / | awk 'NR==2{printf "%s %s %s %s", $2, $3, $4, $5}'
    echo "===LOAD==="
    cat /proc/loadavg | awk '{print $1, $2, $3}'
    echo "===NETWORK==="
    cat /proc/net/dev | awk 'NR>2 && !/lo:/ {rx+=$2; tx+=$10} END {printf "%d %d", rx, tx}'
  `;

  const startTime = Date.now();

  // Local server - execute directly
  if (isLocalServer(server)) {
    const output = await executeLocally(commands);
    return parseHealthOutput(output, startTime);
  }

  // Remote server - use SSH
  return new Promise((resolve, reject) => {
    const conn = new Client();
    const timeout = setTimeout(() => {
      conn.end();
      reject(new Error('Connection timeout'));
    }, 15000);

    conn.on('ready', () => {
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
        stream.on('close', () => {
          clearTimeout(timeout);
          conn.end();
          resolve(parseHealthOutput(output, startTime));
        });
      });
    });

    conn.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    const config = {
      host: server.host,
      port: server.port || 22,
      username: server.username,
      readyTimeout: 10000,
      keepaliveInterval: 0,
      // Support older servers with different algorithms
      algorithms: {
        kex: [
          'ecdh-sha2-nistp256',
          'ecdh-sha2-nistp384',
          'ecdh-sha2-nistp521',
          'diffie-hellman-group-exchange-sha256',
          'diffie-hellman-group14-sha256',
          'diffie-hellman-group14-sha1',
          'diffie-hellman-group1-sha1'
        ],
        cipher: [
          'aes128-ctr',
          'aes192-ctr',
          'aes256-ctr',
          'aes128-gcm',
          'aes128-gcm@openssh.com',
          'aes256-gcm',
          'aes256-gcm@openssh.com',
          'aes256-cbc',
          'aes192-cbc',
          'aes128-cbc',
          '3des-cbc'
        ],
        serverHostKey: [
          'ssh-ed25519',
          'ecdsa-sha2-nistp256',
          'ecdsa-sha2-nistp384',
          'ecdsa-sha2-nistp521',
          'rsa-sha2-512',
          'rsa-sha2-256',
          'ssh-rsa'
        ],
        hmac: [
          'hmac-sha2-256',
          'hmac-sha2-512',
          'hmac-sha1'
        ]
      }
    };

    if (server.auth_type === 'password') {
      config.password = server.password;
    } else {
      config.privateKey = server.private_key;
    }

    conn.connect(config);
  });
}

// Collect health from all servers
async function collectAllServersHealth() {
  try {
    const servers = getAllServersForMonitoring();

    for (const server of servers) {
      // Skip credential check for local servers
      if (!isLocalServer(server)) {
        // Check if credentials are available (decryption succeeded)
        const hasCredentials = server.auth_type === 'password'
          ? !!server.password
          : !!server.private_key;

        if (!hasCredentials) {
          // Silently skip servers without credentials - not an error condition
          continue;
        }
      }

      try {
        const stats = await collectServerHealth(server);

        // Calculate network rates based on previous reading
        let networkRxRate = 0;
        let networkTxRate = 0;
        const lastRecord = getLastHealthRecord(server.id);
        if (lastRecord && lastRecord.network_rx_bytes && stats.networkRxBytes) {
          const timeDiffSeconds = (Date.now() - new Date(lastRecord.created_at).getTime()) / 1000;
          if (timeDiffSeconds > 0) {
            // Calculate bytes per second, handle counter reset
            const rxDiff = stats.networkRxBytes - lastRecord.network_rx_bytes;
            const txDiff = stats.networkTxBytes - lastRecord.network_tx_bytes;
            // Only calculate rate if counters didn't reset (diff should be positive)
            if (rxDiff >= 0) networkRxRate = rxDiff / timeDiffSeconds;
            if (txDiff >= 0) networkTxRate = txDiff / timeDiffSeconds;
          }
        }

        // Save to database
        addServerHealthHistory({
          serverId: server.id,
          cpu: stats.cpu || 0,
          memoryUsed: stats.memoryUsed || 0,
          memoryTotal: stats.memoryTotal || 0,
          memoryPercent: stats.memoryPercent || 0,
          diskUsed: stats.diskUsed || '0',
          diskTotal: stats.diskTotal || '0',
          diskPercent: stats.diskPercent || 0,
          loadOne: stats.loadOne || 0,
          loadFive: stats.loadFive || 0,
          loadFifteen: stats.loadFifteen || 0,
          networkRxBytes: stats.networkRxBytes || 0,
          networkTxBytes: stats.networkTxBytes || 0,
          networkRxRate: networkRxRate,
          networkTxRate: networkTxRate
        });

        // Check for alerts
        await checkAndAlert(server.id, stats, server.name, server.host);

        // Server is up - check if we need to send recovery alert
        await alertServerUp(server.id, server.name, server.host);

        // Record uptime event
        addUptimeEvent({
          serverId: server.id,
          status: 'up',
          responseTime: stats.responseTime || null,
          errorMessage: null
        });

        console.log(`Collected health data for server: ${server.name}`);
      } catch (err) {
        // More detailed error logging
        let errorDetail = err.message;
        if (err.level) {
          errorDetail = `${err.level}: ${err.message}`;
        }
        console.error(`Failed to collect health from ${server.name} (${server.host}):`, errorDetail);

        // Record uptime event with detailed error
        addUptimeEvent({
          serverId: server.id,
          status: 'down',
          responseTime: null,
          errorMessage: errorDetail.substring(0, 500) // Limit error message length
        });

        // Server is down - send alert
        await alertServerDown(server.id, server.name, server.host, errorDetail);
      }
    }

    // Cleanup old data (keep 7 days)
    cleanupOldHealthHistory(7);
    cleanupOldUptimeEvents(30); // Keep uptime events for 30 days
  } catch (err) {
    console.error('Health collection error:', err);
  }
}

// Start the health collector (runs every 5 minutes)
export function startHealthCollector(intervalMinutes = 5) {
  if (collectorInterval) {
    console.log('Health collector already running');
    return;
  }

  console.log(`Starting health collector (interval: ${intervalMinutes} minutes)`);

  // Run immediately on start
  collectAllServersHealth();

  // Then run at interval
  collectorInterval = setInterval(collectAllServersHealth, intervalMinutes * 60 * 1000);
}

// Stop the health collector
export function stopHealthCollector() {
  if (collectorInterval) {
    clearInterval(collectorInterval);
    collectorInterval = null;
    console.log('Health collector stopped');
  }
}

export { collectAllServersHealth };
