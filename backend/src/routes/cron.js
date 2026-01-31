import express from 'express';
import { Client } from 'ssh2';
import { getServer } from '../models/database.js';

const router = express.Router();

// Execute command via SSH
function executeSSH(server, command, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    const timer = setTimeout(() => {
      conn.end();
      reject(new Error('Connection timeout'));
    }, timeout);

    conn.on('ready', () => {
      conn.exec(command, (err, stream) => {
        if (err) {
          clearTimeout(timer);
          conn.end();
          reject(err);
          return;
        }

        let output = '';
        let errorOutput = '';

        stream.on('data', (data) => { output += data.toString(); });
        stream.stderr.on('data', (data) => { errorOutput += data.toString(); });

        stream.on('close', (code) => {
          clearTimeout(timer);
          conn.end();
          // For crontab commands, some error output is normal
          resolve(output);
        });
      });
    });

    conn.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    const config = {
      host: server.host,
      port: server.port || 22,
      username: server.username
    };

    if (server.auth_type === 'key' && server.private_key) {
      config.privateKey = server.private_key;
    } else {
      config.password = server.password;
    }

    conn.connect(config);
  });
}

// Parse crontab output into structured jobs
function parseCrontab(output, user) {
  const jobs = [];
  const lines = output.split('\n');

  lines.forEach((line, index) => {
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) return;

    // Match cron pattern: minute hour day month weekday command
    const match = trimmed.match(/^(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(.+)$/);

    if (match) {
      const [, minute, hour, dayOfMonth, month, dayOfWeek, command] = match;

      jobs.push({
        id: `${user}-${index}`,
        user,
        schedule: {
          minute,
          hour,
          dayOfMonth,
          month,
          dayOfWeek,
          expression: `${minute} ${hour} ${dayOfMonth} ${month} ${dayOfWeek}`
        },
        command,
        enabled: true,
        rawLine: trimmed
      });
    }
  });

  return jobs;
}

// Get human-readable schedule description
function describeSchedule(schedule) {
  const { minute, hour, dayOfMonth, month, dayOfWeek } = schedule;

  // Common patterns
  if (minute === '*' && hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    return 'Every minute';
  }
  if (minute === '0' && hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    return 'Every hour';
  }
  if (minute === '0' && hour === '0' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    return 'Daily at midnight';
  }
  if (minute === '0' && hour === '0' && dayOfMonth === '*' && month === '*' && dayOfWeek === '0') {
    return 'Weekly on Sunday at midnight';
  }
  if (minute === '0' && hour === '0' && dayOfMonth === '1' && month === '*' && dayOfWeek === '*') {
    return 'Monthly on the 1st at midnight';
  }

  // Build description
  let desc = '';

  // Minute
  if (minute === '*') {
    desc += 'Every minute';
  } else if (minute.includes('/')) {
    desc += `Every ${minute.split('/')[1]} minutes`;
  } else if (minute.includes(',')) {
    desc += `At minutes ${minute}`;
  } else {
    desc += `At minute ${minute}`;
  }

  // Hour
  if (hour !== '*') {
    if (hour.includes('/')) {
      desc += ` every ${hour.split('/')[1]} hours`;
    } else if (hour.includes(',')) {
      desc += ` at hours ${hour}`;
    } else {
      desc += ` at ${hour}:${minute.padStart(2, '0')}`;
    }
  }

  // Day of month
  if (dayOfMonth !== '*') {
    if (dayOfMonth.includes('/')) {
      desc += ` every ${dayOfMonth.split('/')[1]} days`;
    } else {
      desc += ` on day ${dayOfMonth}`;
    }
  }

  // Month
  if (month !== '*') {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    if (month.includes(',')) {
      desc += ` in ${month}`;
    } else {
      const monthNum = parseInt(month) - 1;
      if (monthNum >= 0 && monthNum < 12) {
        desc += ` in ${months[monthNum]}`;
      }
    }
  }

  // Day of week
  if (dayOfWeek !== '*') {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    if (dayOfWeek.includes(',')) {
      desc += ` on ${dayOfWeek}`;
    } else {
      const dayNum = parseInt(dayOfWeek);
      if (dayNum >= 0 && dayNum <= 6) {
        desc += ` on ${days[dayNum]}`;
      }
    }
  }

  return desc || schedule.expression;
}

// GET /api/cron/servers/:id/jobs - List cron jobs for a server
router.get('/servers/:id/jobs', async (req, res) => {
  try {
    const server = getServer(req.params.id, req.user.id);
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    // Get crontab for root user
    let output = '';
    try {
      output = await executeSSH(server, 'crontab -l 2>/dev/null || echo ""');
    } catch (err) {
      // No crontab for user is ok
      output = '';
    }

    const jobs = parseCrontab(output, 'root');

    // Add human-readable descriptions
    jobs.forEach(job => {
      job.description = describeSchedule(job.schedule);
    });

    // Also check system crontabs
    let systemJobs = [];
    try {
      const etcCron = await executeSSH(server, 'cat /etc/crontab 2>/dev/null || echo ""');
      systemJobs = parseCrontab(etcCron, 'system');
      systemJobs.forEach(job => {
        job.description = describeSchedule(job.schedule);
        job.isSystem = true;
      });
    } catch (err) {
      // Ignore errors reading system crontab
    }

    res.json({
      server: { id: server.id, name: server.name },
      jobs: [...jobs, ...systemJobs],
      totalJobs: jobs.length + systemJobs.length
    });
  } catch (err) {
    console.error('Error fetching cron jobs:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/cron/servers/:id/jobs - Add a new cron job
router.post('/servers/:id/jobs', async (req, res) => {
  try {
    const server = getServer(req.params.id, req.user.id);
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    const { minute, hour, dayOfMonth, month, dayOfWeek, command } = req.body;

    if (!command) {
      return res.status(400).json({ error: 'Command is required' });
    }

    // Build cron line
    const cronLine = `${minute || '*'} ${hour || '*'} ${dayOfMonth || '*'} ${month || '*'} ${dayOfWeek || '*'} ${command}`;

    // Add to crontab
    const addCommand = `(crontab -l 2>/dev/null; echo "${cronLine.replace(/"/g, '\\"')}") | crontab -`;

    await executeSSH(server, addCommand);

    res.json({ success: true, message: 'Cron job added successfully' });
  } catch (err) {
    console.error('Error adding cron job:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/cron/servers/:id/jobs - Delete a cron job
router.delete('/servers/:id/jobs', async (req, res) => {
  try {
    const server = getServer(req.params.id, req.user.id);
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    const { rawLine } = req.body;

    if (!rawLine) {
      return res.status(400).json({ error: 'Raw line is required to identify the job' });
    }

    // Remove specific line from crontab
    // Escape special regex characters and use grep -v to filter out the line
    const escapedLine = rawLine.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const removeCommand = `crontab -l 2>/dev/null | grep -v -F "${rawLine.replace(/"/g, '\\"')}" | crontab -`;

    await executeSSH(server, removeCommand);

    res.json({ success: true, message: 'Cron job removed successfully' });
  } catch (err) {
    console.error('Error removing cron job:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/cron/servers/:id/jobs/toggle - Enable/disable a cron job
router.post('/servers/:id/jobs/toggle', async (req, res) => {
  try {
    const server = getServer(req.params.id, req.user.id);
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    const { rawLine, enabled } = req.body;

    if (!rawLine) {
      return res.status(400).json({ error: 'Raw line is required' });
    }

    if (enabled) {
      // Enable: remove # from beginning
      const uncommentedLine = rawLine.replace(/^#\s*/, '');
      const command = `crontab -l 2>/dev/null | sed 's|^#\\s*${rawLine.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/"/g, '\\"')}|${uncommentedLine.replace(/"/g, '\\"')}|' | crontab -`;
      await executeSSH(server, command);
    } else {
      // Disable: add # to beginning
      const command = `crontab -l 2>/dev/null | sed 's|^${rawLine.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/"/g, '\\"')}|# ${rawLine.replace(/"/g, '\\"')}|' | crontab -`;
      await executeSSH(server, command);
    }

    res.json({ success: true, message: `Cron job ${enabled ? 'enabled' : 'disabled'}` });
  } catch (err) {
    console.error('Error toggling cron job:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/cron/servers/:id/cron.d - List /etc/cron.d files
router.get('/servers/:id/cron.d', async (req, res) => {
  try {
    const server = getServer(req.params.id, req.user.id);
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    const output = await executeSSH(server, 'ls -la /etc/cron.d/ 2>/dev/null || echo "No cron.d directory"');

    res.json({
      server: { id: server.id, name: server.name },
      output
    });
  } catch (err) {
    console.error('Error listing cron.d:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/cron/presets - Get common cron presets
router.get('/presets', (req, res) => {
  res.json({
    presets: [
      { name: 'Every minute', expression: '* * * * *' },
      { name: 'Every 5 minutes', expression: '*/5 * * * *' },
      { name: 'Every 15 minutes', expression: '*/15 * * * *' },
      { name: 'Every 30 minutes', expression: '*/30 * * * *' },
      { name: 'Every hour', expression: '0 * * * *' },
      { name: 'Every 2 hours', expression: '0 */2 * * *' },
      { name: 'Every 6 hours', expression: '0 */6 * * *' },
      { name: 'Every 12 hours', expression: '0 */12 * * *' },
      { name: 'Daily at midnight', expression: '0 0 * * *' },
      { name: 'Daily at 6 AM', expression: '0 6 * * *' },
      { name: 'Daily at noon', expression: '0 12 * * *' },
      { name: 'Daily at 6 PM', expression: '0 18 * * *' },
      { name: 'Weekly (Sunday midnight)', expression: '0 0 * * 0' },
      { name: 'Weekly (Monday midnight)', expression: '0 0 * * 1' },
      { name: 'Monthly (1st at midnight)', expression: '0 0 1 * *' },
      { name: 'Yearly (Jan 1st)', expression: '0 0 1 1 *' },
    ]
  });
});

export default router;
