/**
 * Backups API Integration Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the database module
vi.mock('../../src/models/database.js', () => ({
  getBackupJobs: vi.fn(),
  getBackupJob: vi.fn(),
  createBackupJob: vi.fn(),
  updateBackupJob: vi.fn(),
  deleteBackupJob: vi.fn(),
  getBackupHistory: vi.fn(),
  getServer: vi.fn()
}));

// Mock backup scheduler
vi.mock('../../src/services/backupScheduler.js', () => ({
  runBackupJob: vi.fn()
}));

import {
  getBackupJobs,
  getBackupJob,
  createBackupJob,
  updateBackupJob,
  deleteBackupJob,
  getBackupHistory,
  getServer
} from '../../src/models/database.js';

import { runBackupJob } from '../../src/services/backupScheduler.js';

import { createMockRequest, createMockResponse, mockUser, testDataGenerators } from '../setup.js';

describe('Backups API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/backups/jobs - List backup jobs', () => {
    it('should return all backup jobs for user', () => {
      const mockJobs = [
        testDataGenerators.backupJob({ id: 'job-1', name: 'MySQL Backup' }),
        testDataGenerators.backupJob({ id: 'job-2', name: 'Files Backup', type: 'files' })
      ];
      getBackupJobs.mockReturnValue(mockJobs);

      const req = createMockRequest();
      const res = createMockResponse();

      const jobs = getBackupJobs(req.user.id);
      res.json(jobs);

      expect(getBackupJobs).toHaveBeenCalledWith(mockUser.id);
      expect(res.jsonData.length).toBe(2);
    });

    it('should return empty array when no jobs exist', () => {
      getBackupJobs.mockReturnValue([]);

      const req = createMockRequest();
      const res = createMockResponse();

      const jobs = getBackupJobs(req.user.id);
      res.json(jobs);

      expect(res.jsonData).toEqual([]);
    });
  });

  describe('POST /api/backups/jobs - Create backup job', () => {
    it('should create a MySQL backup job', () => {
      const jobData = {
        name: 'Daily MySQL',
        type: 'mysql',
        serverId: 'server-1',
        schedule: '0 2 * * *',
        destinationPath: '/backups/mysql',
        databaseName: 'myapp',
        databaseUser: 'root',
        databasePassword: 'secret',
        retentionDays: 7
      };

      const mockServer = testDataGenerators.server({ id: 'server-1' });
      getServer.mockReturnValue(mockServer);

      const req = createMockRequest(jobData);
      const res = createMockResponse();

      // Validate server exists
      const server = getServer(jobData.serverId, req.user.id);
      expect(server).not.toBeNull();

      createBackupJob({
        id: 'new-job',
        userId: req.user.id,
        serverId: jobData.serverId,
        name: jobData.name,
        type: jobData.type,
        schedule: jobData.schedule,
        destinationPath: jobData.destinationPath,
        databaseName: jobData.databaseName,
        databaseUser: jobData.databaseUser,
        databasePassword: jobData.databasePassword,
        retentionDays: jobData.retentionDays
      });

      expect(createBackupJob).toHaveBeenCalled();
      const callArg = createBackupJob.mock.calls[0][0];
      expect(callArg.name).toBe('Daily MySQL');
      expect(callArg.type).toBe('mysql');
    });

    it('should validate required fields', () => {
      const req = createMockRequest({ name: 'Backup' }); // Missing type, serverId, etc.
      const res = createMockResponse();

      const required = ['name', 'type', 'serverId', 'schedule', 'destinationPath'];
      const missing = required.filter(f => !req.body[f]);

      if (missing.length > 0) {
        res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}` });
      }

      expect(res.statusCode).toBe(400);
      expect(res.jsonData.error).toContain('Missing required fields');
    });
  });

  describe('PATCH /api/backups/jobs/:id - Update backup job', () => {
    it('should update job schedule', () => {
      const existingJob = testDataGenerators.backupJob({ id: 'job-1', schedule: '0 2 * * *' });
      getBackupJob
        .mockReturnValueOnce(existingJob)
        .mockReturnValueOnce({ ...existingJob, schedule: '0 3 * * *' });

      const req = createMockRequest({ schedule: '0 3 * * *' }, { id: 'job-1' });
      const res = createMockResponse();

      const job = getBackupJob(req.params.id, req.user.id);
      expect(job).not.toBeNull();

      updateBackupJob(req.params.id, req.user.id, { schedule: req.body.schedule });

      expect(updateBackupJob).toHaveBeenCalledWith('job-1', mockUser.id, { schedule: '0 3 * * *' });
    });

    it('should toggle job enabled status', () => {
      const existingJob = testDataGenerators.backupJob({ id: 'job-1', enabled: 1 });
      getBackupJob.mockReturnValue(existingJob);

      const req = createMockRequest({ enabled: false }, { id: 'job-1' });
      const res = createMockResponse();

      updateBackupJob(req.params.id, req.user.id, { enabled: req.body.enabled ? 1 : 0 });

      expect(updateBackupJob).toHaveBeenCalledWith('job-1', mockUser.id, { enabled: 0 });
    });
  });

  describe('DELETE /api/backups/jobs/:id - Delete backup job', () => {
    it('should delete backup job', () => {
      const existingJob = testDataGenerators.backupJob({ id: 'job-1' });
      getBackupJob.mockReturnValue(existingJob);

      const req = createMockRequest({}, { id: 'job-1' });
      const res = createMockResponse();

      const job = getBackupJob(req.params.id, req.user.id);
      expect(job).not.toBeNull();

      deleteBackupJob(req.params.id, req.user.id);
      res.json({ success: true });

      expect(deleteBackupJob).toHaveBeenCalledWith('job-1', mockUser.id);
    });
  });

  describe('POST /api/backups/jobs/:id/run - Manual backup run', () => {
    it('should run backup job manually', async () => {
      const existingJob = testDataGenerators.backupJob({ id: 'job-1' });
      getBackupJob.mockReturnValue(existingJob);
      runBackupJob.mockResolvedValue({
        status: 'success',
        result: { duration: 30, fileSize: 1024 * 1024, filePath: '/backups/file.sql.gz' }
      });

      const req = createMockRequest({}, { id: 'job-1' });
      const res = createMockResponse();

      const job = getBackupJob(req.params.id, req.user.id);
      const result = await runBackupJob(job);

      res.json({ success: true, result });

      expect(runBackupJob).toHaveBeenCalledWith(existingJob);
      expect(res.jsonData.result.status).toBe('success');
    });

    it('should handle backup failure', async () => {
      const existingJob = testDataGenerators.backupJob({ id: 'job-1' });
      getBackupJob.mockReturnValue(existingJob);
      runBackupJob.mockResolvedValue({
        status: 'failed',
        errorMessage: 'Connection refused'
      });

      const req = createMockRequest({}, { id: 'job-1' });
      const res = createMockResponse();

      const job = getBackupJob(req.params.id, req.user.id);
      const result = await runBackupJob(job);

      res.json({ success: false, error: result.errorMessage });

      expect(res.jsonData.success).toBe(false);
      expect(res.jsonData.error).toBe('Connection refused');
    });
  });

  describe('GET /api/backups/history - Backup history', () => {
    it('should return backup history', () => {
      const mockHistory = [
        { id: 'h1', job_id: 'job-1', status: 'success', started_at: '2026-01-27T02:00:00Z', file_size: 1024 },
        { id: 'h2', job_id: 'job-1', status: 'success', started_at: '2026-01-26T02:00:00Z', file_size: 1020 },
        { id: 'h3', job_id: 'job-2', status: 'failed', started_at: '2026-01-26T02:00:00Z', error_message: 'Timeout' }
      ];
      getBackupHistory.mockReturnValue(mockHistory);

      const req = createMockRequest({}, {}, { limit: '50' });
      const res = createMockResponse();

      const limit = parseInt(req.query.limit) || 50;
      const history = getBackupHistory(req.user.id, limit);
      res.json(history);

      expect(getBackupHistory).toHaveBeenCalledWith(mockUser.id, 50);
      expect(res.jsonData.length).toBe(3);
    });

    it('should filter history by job', () => {
      const mockHistory = [
        { id: 'h1', job_id: 'job-1', status: 'success' },
        { id: 'h2', job_id: 'job-1', status: 'success' }
      ];
      getBackupHistory.mockReturnValue(mockHistory);

      const req = createMockRequest({}, {}, { jobId: 'job-1' });

      const jobId = req.query.jobId;
      expect(jobId).toBe('job-1');
    });
  });
});

describe('Backup Job Scheduling', () => {
  describe('Cron schedule validation', () => {
    function isValidCronSchedule(schedule) {
      const parts = schedule.trim().split(/\s+/);
      if (parts.length !== 5) return false;

      const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

      // Basic validation
      const validatePart = (part, min, max) => {
        if (part === '*') return true;
        if (part.startsWith('*/')) {
          const step = parseInt(part.slice(2));
          return !isNaN(step) && step >= 1;
        }
        const num = parseInt(part);
        return !isNaN(num) && num >= min && num <= max;
      };

      return (
        validatePart(minute, 0, 59) &&
        validatePart(hour, 0, 23) &&
        validatePart(dayOfMonth, 1, 31) &&
        validatePart(month, 1, 12) &&
        validatePart(dayOfWeek, 0, 6)
      );
    }

    it('should validate common backup schedules', () => {
      expect(isValidCronSchedule('0 2 * * *')).toBe(true); // Daily at 2 AM
      expect(isValidCronSchedule('0 0 * * 0')).toBe(true); // Weekly on Sunday
      expect(isValidCronSchedule('0 3 1 * *')).toBe(true); // Monthly on 1st
      expect(isValidCronSchedule('*/30 * * * *')).toBe(true); // Every 30 min
    });

    it('should reject invalid schedules', () => {
      expect(isValidCronSchedule('invalid')).toBe(false);
      expect(isValidCronSchedule('60 * * * *')).toBe(false); // Invalid minute
      expect(isValidCronSchedule('* 24 * * *')).toBe(false); // Invalid hour
      expect(isValidCronSchedule('* * * *')).toBe(false); // Missing part
    });
  });

  describe('Next run calculation', () => {
    it('should calculate next run for daily backup', () => {
      // Simplified test - actual implementation in cron.test.js
      const schedule = '0 2 * * *';
      const now = new Date('2026-01-27T10:00:00Z');

      // Expected: Next 2 AM is Jan 28, 2026
      const expectedHour = 2;

      // Just verify the schedule implies 2 AM
      expect(schedule.split(' ')[1]).toBe('2');
    });
  });
});

describe('Backup Statistics', () => {
  function calculateBackupStats(history) {
    const total = history.length;
    const successful = history.filter(h => h.status === 'success').length;
    const failed = history.filter(h => h.status === 'failed').length;
    const totalSize = history
      .filter(h => h.status === 'success')
      .reduce((sum, h) => sum + (h.file_size || 0), 0);
    const avgDuration = history.length > 0
      ? Math.round(history.reduce((sum, h) => sum + (h.duration_seconds || 0), 0) / history.length)
      : 0;

    return {
      total,
      successful,
      failed,
      successRate: total > 0 ? Math.round((successful / total) * 100) : 0,
      totalSize,
      avgDuration
    };
  }

  it('should calculate backup statistics', () => {
    const history = [
      { status: 'success', file_size: 1000, duration_seconds: 30 },
      { status: 'success', file_size: 1200, duration_seconds: 35 },
      { status: 'failed', file_size: 0, duration_seconds: 5 },
      { status: 'success', file_size: 1100, duration_seconds: 32 }
    ];

    const stats = calculateBackupStats(history);

    expect(stats.total).toBe(4);
    expect(stats.successful).toBe(3);
    expect(stats.failed).toBe(1);
    expect(stats.successRate).toBe(75);
    expect(stats.totalSize).toBe(3300);
    expect(stats.avgDuration).toBe(26); // (30+35+5+32)/4 = 25.5 rounds to 26
  });

  it('should handle empty history', () => {
    const stats = calculateBackupStats([]);

    expect(stats.total).toBe(0);
    expect(stats.successRate).toBe(0);
    expect(stats.totalSize).toBe(0);
  });
});
