import { Client } from 'ssh2';
import { getDueBackupJobs, updateBackupJob, addBackupHistory, getBackupHistoryForJob } from '../models/database.js';
import { getNextRun } from '../utils/cron.js';
import { sendBackupAlert } from './alertService.js';

let schedulerInterval = null;

// Generate backup command based on type
function generateBackupCommand(job) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `${job.name.replace(/[^a-zA-Z0-9]/g, '_')}_${timestamp}`;

  switch (job.type) {
    case 'mysql':
      return {
        command: `mysqldump -u${job.database_user} -p'${job.database_password}' ${job.database_name} | gzip > ${job.destination_path}/${filename}.sql.gz`,
        filePath: `${job.destination_path}/${filename}.sql.gz`
      };

    case 'postgres':
      return {
        command: `PGPASSWORD='${job.database_password}' pg_dump -U ${job.database_user} ${job.database_name} | gzip > ${job.destination_path}/${filename}.sql.gz`,
        filePath: `${job.destination_path}/${filename}.sql.gz`
      };

    case 'files':
      return {
        command: `tar -czf ${job.destination_path}/${filename}.tar.gz -C ${job.source_path} .`,
        filePath: `${job.destination_path}/${filename}.tar.gz`
      };

    case 'directory':
      return {
        command: `tar -czf ${job.destination_path}/${filename}.tar.gz -C $(dirname ${job.source_path}) $(basename ${job.source_path})`,
        filePath: `${job.destination_path}/${filename}.tar.gz`
      };

    default:
      throw new Error(`Unknown backup type: ${job.type}`);
  }
}

// Execute backup via SSH
async function executeBackup(job) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    const startTime = new Date();
    const timeout = setTimeout(() => {
      conn.end();
      reject(new Error('Backup timeout - operation took too long'));
    }, 3600000); // 1 hour timeout

    conn.on('ready', () => {
      const { command, filePath } = generateBackupCommand(job);

      // Ensure destination directory exists
      const mkdirCommand = `mkdir -p ${job.destination_path}`;
      const fullCommand = `${mkdirCommand} && ${command} && stat -c%s ${filePath} 2>/dev/null || echo "0"`;

      conn.exec(fullCommand, (err, stream) => {
        if (err) {
          clearTimeout(timeout);
          conn.end();
          reject(err);
          return;
        }

        let output = '';
        let errorOutput = '';

        stream.on('data', (data) => {
          output += data.toString();
        });
        stream.stderr.on('data', (data) => {
          errorOutput += data.toString();
        });
        stream.on('close', (code) => {
          clearTimeout(timeout);
          conn.end();

          if (code !== 0) {
            reject(new Error(errorOutput || `Backup failed with exit code ${code}`));
            return;
          }

          const endTime = new Date();
          const fileSize = parseInt(output.trim()) || 0;

          resolve({
            filePath,
            fileSize,
            duration: Math.round((endTime - startTime) / 1000)
          });
        });
      });
    });

    conn.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    const config = {
      host: job.host,
      port: job.port,
      username: job.username
    };

    if (job.auth_type === 'password') {
      config.password = job.password;
    } else {
      config.privateKey = job.private_key;
    }

    conn.connect(config);
  });
}

// Cleanup old backups based on retention policy
async function cleanupOldBackups(job) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    const timeout = setTimeout(() => {
      conn.end();
      resolve(); // Don't fail the backup if cleanup fails
    }, 60000);

    conn.on('ready', () => {
      // Find and delete files older than retention days
      const command = `find ${job.destination_path} -name "${job.name.replace(/[^a-zA-Z0-9]/g, '_')}_*" -type f -mtime +${job.retention_days} -delete 2>/dev/null; echo "cleanup done"`;

      conn.exec(command, (err, stream) => {
        clearTimeout(timeout);

        if (err) {
          conn.end();
          resolve(); // Don't fail
          return;
        }

        stream.on('close', () => {
          conn.end();
          resolve();
        });
      });
    });

    conn.on('error', () => {
      clearTimeout(timeout);
      resolve(); // Don't fail
    });

    const config = {
      host: job.host,
      port: job.port,
      username: job.username
    };

    if (job.auth_type === 'password') {
      config.password = job.password;
    } else {
      config.privateKey = job.private_key;
    }

    conn.connect(config);
  });
}

// Run a single backup job
export async function runBackupJob(job) {
  const startedAt = new Date().toISOString();
  let status = 'success';
  let result = null;
  let errorMessage = null;

  try {
    console.log(`Starting backup job: ${job.name}`);
    result = await executeBackup(job);

    // Cleanup old backups
    await cleanupOldBackups(job);

    console.log(`Backup complete: ${job.name} (${result.fileSize} bytes in ${result.duration}s)`);
  } catch (err) {
    console.error(`Backup failed: ${job.name}:`, err.message);
    status = 'failed';
    errorMessage = err.message;

    // Send alert on failure
    await sendBackupAlert(job, 'failed', err.message);
  }

  const finishedAt = new Date().toISOString();

  // Record history
  addBackupHistory({
    jobId: job.id,
    serverId: job.server_id,
    status,
    startedAt,
    finishedAt,
    durationSeconds: result?.duration || 0,
    fileSize: result?.fileSize || 0,
    filePath: result?.filePath || null,
    errorMessage
  });

  // Update job status
  const nextRun = getNextRun(job.schedule);
  updateBackupJob(job.id, job.user_id, {
    last_run: startedAt,
    next_run: nextRun?.toISOString() || null,
    last_status: status
  });

  return { status, result, errorMessage };
}

// Check and run due backup jobs
async function checkDueJobs() {
  try {
    const dueJobs = getDueBackupJobs();

    for (const job of dueJobs) {
      try {
        await runBackupJob(job);
      } catch (err) {
        console.error(`Error running backup job ${job.name}:`, err.message);
      }
    }
  } catch (err) {
    console.error('Backup scheduler error:', err);
  }
}

// Start the backup scheduler (checks every minute)
export function startBackupScheduler() {
  if (schedulerInterval) {
    console.log('Backup scheduler already running');
    return;
  }

  console.log('Starting backup scheduler (checking every minute)');

  // Run check every minute
  schedulerInterval = setInterval(checkDueJobs, 60 * 1000);

  // Also run immediately
  checkDueJobs();
}

// Stop the backup scheduler
export function stopBackupScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log('Backup scheduler stopped');
  }
}

export { checkDueJobs };
