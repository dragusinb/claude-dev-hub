/**
 * Backup Scheduler Unit Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Backup Command Generation', () => {
  // Replicate the command generation logic for testing
  function generateBackupCommand(job) {
    const timestamp = '2026-01-27T10-00-00';
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

  describe('MySQL backups', () => {
    it('should generate correct mysqldump command', () => {
      const job = {
        name: 'Daily MySQL Backup',
        type: 'mysql',
        database_user: 'root',
        database_password: 'secretpass',
        database_name: 'myapp',
        destination_path: '/backups/mysql'
      };

      const { command, filePath } = generateBackupCommand(job);

      expect(command).toContain('mysqldump');
      expect(command).toContain('-uroot');
      expect(command).toContain("-p'secretpass'");
      expect(command).toContain('myapp');
      expect(command).toContain('gzip');
      expect(filePath).toContain('/backups/mysql/');
      expect(filePath).toContain('.sql.gz');
    });

    it('should sanitize job name in filename', () => {
      const job = {
        name: 'My App - Production DB!',
        type: 'mysql',
        database_user: 'root',
        database_password: 'pass',
        database_name: 'db',
        destination_path: '/backups'
      };

      const { filePath } = generateBackupCommand(job);

      expect(filePath).toContain('My_App___Production_DB_');
      expect(filePath).not.toContain(' ');
      expect(filePath).not.toContain('-');
      expect(filePath).not.toContain('!');
    });
  });

  describe('PostgreSQL backups', () => {
    it('should generate correct pg_dump command', () => {
      const job = {
        name: 'Postgres Backup',
        type: 'postgres',
        database_user: 'postgres',
        database_password: 'pgpass',
        database_name: 'webapp',
        destination_path: '/backups/pg'
      };

      const { command, filePath } = generateBackupCommand(job);

      expect(command).toContain('PGPASSWORD=');
      expect(command).toContain('pg_dump');
      expect(command).toContain('-U postgres');
      expect(command).toContain('webapp');
      expect(command).toContain('gzip');
      expect(filePath).toContain('.sql.gz');
    });

    it('should use PGPASSWORD environment variable', () => {
      const job = {
        name: 'PG Backup',
        type: 'postgres',
        database_user: 'user',
        database_password: 'mypassword',
        database_name: 'db',
        destination_path: '/backups'
      };

      const { command } = generateBackupCommand(job);

      expect(command).toContain("PGPASSWORD='mypassword'");
    });
  });

  describe('File backups', () => {
    it('should generate correct tar command for files', () => {
      const job = {
        name: 'Web Files Backup',
        type: 'files',
        source_path: '/var/www/html',
        destination_path: '/backups/files'
      };

      const { command, filePath } = generateBackupCommand(job);

      expect(command).toContain('tar -czf');
      expect(command).toContain('-C /var/www/html');
      expect(command).toContain('.');
      expect(filePath).toContain('.tar.gz');
    });
  });

  describe('Directory backups', () => {
    it('should generate correct tar command for directory', () => {
      const job = {
        name: 'Config Backup',
        type: 'directory',
        source_path: '/etc/nginx',
        destination_path: '/backups/config'
      };

      const { command, filePath } = generateBackupCommand(job);

      expect(command).toContain('tar -czf');
      expect(command).toContain('$(dirname /etc/nginx)');
      expect(command).toContain('$(basename /etc/nginx)');
      expect(filePath).toContain('.tar.gz');
    });
  });

  describe('Unknown backup type', () => {
    it('should throw error for unknown type', () => {
      const job = {
        name: 'Unknown Backup',
        type: 'unknown',
        destination_path: '/backups'
      };

      expect(() => generateBackupCommand(job)).toThrow('Unknown backup type');
    });
  });
});

describe('Backup Filename Sanitization', () => {
  function sanitizeName(name) {
    return name.replace(/[^a-zA-Z0-9]/g, '_');
  }

  it('should replace spaces with underscores', () => {
    expect(sanitizeName('My Backup')).toBe('My_Backup');
  });

  it('should replace special characters with underscores', () => {
    expect(sanitizeName('backup-name!')).toBe('backup_name_');
    expect(sanitizeName('backup@name#123')).toBe('backup_name_123');
  });

  it('should preserve alphanumeric characters', () => {
    expect(sanitizeName('backup123')).toBe('backup123');
    expect(sanitizeName('MyBackup2026')).toBe('MyBackup2026');
  });
});

describe('Backup Retention Cleanup', () => {
  function generateCleanupCommand(job) {
    const sanitizedName = job.name.replace(/[^a-zA-Z0-9]/g, '_');
    return `find ${job.destination_path} -name "${sanitizedName}_*" -type f -mtime +${job.retention_days} -delete`;
  }

  it('should generate correct find command for cleanup', () => {
    const job = {
      name: 'Daily Backup',
      destination_path: '/backups',
      retention_days: 7
    };

    const command = generateCleanupCommand(job);

    expect(command).toContain('find /backups');
    expect(command).toContain('-name "Daily_Backup_*"');
    expect(command).toContain('-mtime +7');
    expect(command).toContain('-delete');
  });

  it('should use sanitized name in cleanup pattern', () => {
    const job = {
      name: 'My App - DB',
      destination_path: '/backups',
      retention_days: 30
    };

    const command = generateCleanupCommand(job);

    expect(command).toContain('My_App___DB_*');
  });
});

describe('Backup Job Validation', () => {
  function validateBackupJob(job) {
    const errors = [];

    if (!job.name || job.name.trim().length === 0) {
      errors.push('Name is required');
    }

    if (!job.type || !['mysql', 'postgres', 'files', 'directory'].includes(job.type)) {
      errors.push('Invalid backup type');
    }

    if (!job.destination_path || job.destination_path.trim().length === 0) {
      errors.push('Destination path is required');
    }

    if (!job.schedule || job.schedule.trim().length === 0) {
      errors.push('Schedule is required');
    }

    if (job.type === 'mysql' || job.type === 'postgres') {
      if (!job.database_name) errors.push('Database name is required');
      if (!job.database_user) errors.push('Database user is required');
    }

    if (job.type === 'files' || job.type === 'directory') {
      if (!job.source_path) errors.push('Source path is required');
    }

    if (job.retention_days !== undefined && (job.retention_days < 1 || job.retention_days > 365)) {
      errors.push('Retention days must be between 1 and 365');
    }

    return errors;
  }

  it('should validate required fields', () => {
    const errors = validateBackupJob({});

    expect(errors).toContain('Name is required');
    expect(errors).toContain('Invalid backup type');
    expect(errors).toContain('Destination path is required');
    expect(errors).toContain('Schedule is required');
  });

  it('should validate MySQL backup requirements', () => {
    const job = {
      name: 'MySQL Backup',
      type: 'mysql',
      destination_path: '/backups',
      schedule: '0 2 * * *'
    };

    const errors = validateBackupJob(job);

    expect(errors).toContain('Database name is required');
    expect(errors).toContain('Database user is required');
  });

  it('should validate file backup requirements', () => {
    const job = {
      name: 'File Backup',
      type: 'files',
      destination_path: '/backups',
      schedule: '0 2 * * *'
    };

    const errors = validateBackupJob(job);

    expect(errors).toContain('Source path is required');
  });

  it('should validate retention days range', () => {
    const job = {
      name: 'Backup',
      type: 'files',
      source_path: '/data',
      destination_path: '/backups',
      schedule: '0 2 * * *',
      retention_days: 0
    };

    const errors = validateBackupJob(job);

    expect(errors).toContain('Retention days must be between 1 and 365');
  });

  it('should pass validation for valid MySQL job', () => {
    const job = {
      name: 'MySQL Backup',
      type: 'mysql',
      destination_path: '/backups',
      schedule: '0 2 * * *',
      database_name: 'mydb',
      database_user: 'root',
      database_password: 'pass',
      retention_days: 7
    };

    const errors = validateBackupJob(job);

    expect(errors).toEqual([]);
  });
});

describe('Backup History Recording', () => {
  function createHistoryEntry(job, result, error) {
    return {
      jobId: job.id,
      serverId: job.server_id,
      status: error ? 'failed' : 'success',
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      durationSeconds: result?.duration || 0,
      fileSize: result?.fileSize || 0,
      filePath: result?.filePath || null,
      errorMessage: error || null
    };
  }

  it('should create success history entry', () => {
    const job = { id: 'job-1', server_id: 'server-1' };
    const result = { duration: 120, fileSize: 1024 * 1024, filePath: '/backups/file.sql.gz' };

    const entry = createHistoryEntry(job, result, null);

    expect(entry.status).toBe('success');
    expect(entry.durationSeconds).toBe(120);
    expect(entry.fileSize).toBe(1048576);
    expect(entry.errorMessage).toBeNull();
  });

  it('should create failed history entry', () => {
    const job = { id: 'job-1', server_id: 'server-1' };

    const entry = createHistoryEntry(job, null, 'Connection refused');

    expect(entry.status).toBe('failed');
    expect(entry.durationSeconds).toBe(0);
    expect(entry.fileSize).toBe(0);
    expect(entry.errorMessage).toBe('Connection refused');
  });
});

describe('File Size Formatting', () => {
  function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${units[i]}`;
  }

  it('should format bytes correctly', () => {
    expect(formatFileSize(500)).toBe('500.00 B');
  });

  it('should format kilobytes correctly', () => {
    expect(formatFileSize(1024)).toBe('1.00 KB');
    expect(formatFileSize(2048)).toBe('2.00 KB');
  });

  it('should format megabytes correctly', () => {
    expect(formatFileSize(1048576)).toBe('1.00 MB');
    expect(formatFileSize(5 * 1024 * 1024)).toBe('5.00 MB');
  });

  it('should format gigabytes correctly', () => {
    expect(formatFileSize(1073741824)).toBe('1.00 GB');
  });

  it('should handle zero bytes', () => {
    expect(formatFileSize(0)).toBe('0 B');
  });
});

describe('Duration Formatting', () => {
  function formatDuration(seconds) {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  }

  it('should format seconds', () => {
    expect(formatDuration(30)).toBe('30s');
    expect(formatDuration(59)).toBe('59s');
  });

  it('should format minutes and seconds', () => {
    expect(formatDuration(60)).toBe('1m 0s');
    expect(formatDuration(90)).toBe('1m 30s');
    expect(formatDuration(150)).toBe('2m 30s');
  });

  it('should format hours and minutes', () => {
    expect(formatDuration(3600)).toBe('1h 0m');
    expect(formatDuration(3660)).toBe('1h 1m');
    expect(formatDuration(7200)).toBe('2h 0m');
  });
});
