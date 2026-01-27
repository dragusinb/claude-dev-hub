import { Client } from 'ssh2';
import { getAllServersForMonitoring, addServerHealthHistory, cleanupOldHealthHistory, addUptimeEvent, cleanupOldUptimeEvents } from '../models/database.js';
import { checkAndAlert, alertServerDown, alertServerUp } from './alertService.js';

let collectorInterval = null;

// Collect health data from a single server
async function collectServerHealth(server) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    const startTime = Date.now();
    const timeout = setTimeout(() => {
      conn.end();
      reject(new Error('Connection timeout'));
    }, 15000);

    conn.on('ready', () => {
      const commands = `
        echo "===CPU==="
        top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1
        echo "===MEMORY==="
        free -m | awk 'NR==2{printf "%s %s %s", $2, $3, $4}'
        echo "===DISK==="
        df -h / | awk 'NR==2{printf "%s %s %s %s", $2, $3, $4, $5}'
        echo "===LOAD==="
        cat /proc/loadavg | awk '{print $1, $2, $3}'
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
        stream.on('close', () => {
          clearTimeout(timeout);
          conn.end();

          // Parse the output
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
            }
          }

          // Calculate response time
          stats.responseTime = Date.now() - startTime;

          resolve(stats);
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

// Collect health from all servers
async function collectAllServersHealth() {
  try {
    const servers = getAllServersForMonitoring();

    for (const server of servers) {
      try {
        const stats = await collectServerHealth(server);

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
          loadFifteen: stats.loadFifteen || 0
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
        console.error(`Failed to collect health from ${server.name}:`, err.message);

        // Record uptime event
        addUptimeEvent({
          serverId: server.id,
          status: 'down',
          responseTime: null,
          errorMessage: err.message
        });

        // Server is down - send alert
        await alertServerDown(server.id, server.name, server.host, err.message);
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
