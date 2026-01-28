/**
 * Cron Expression Parser Unit Tests
 */

import { describe, it, expect } from 'vitest';
import { parseCronExpression, matchesCron, getNextRun, describeCron } from '../../src/utils/cron.js';

describe('Cron Expression Parser', () => {
  describe('parseCronExpression', () => {
    it('should parse basic wildcard expression', () => {
      const parsed = parseCronExpression('* * * * *');
      expect(parsed.minute.type).toBe('any');
      expect(parsed.hour.type).toBe('any');
      expect(parsed.dayOfMonth.type).toBe('any');
      expect(parsed.month.type).toBe('any');
      expect(parsed.dayOfWeek.type).toBe('any');
    });

    it('should parse specific values', () => {
      const parsed = parseCronExpression('30 14 * * *');
      expect(parsed.minute).toEqual({ type: 'value', value: 30 });
      expect(parsed.hour).toEqual({ type: 'value', value: 14 });
    });

    it('should parse step expressions', () => {
      const parsed = parseCronExpression('*/5 * * * *');
      expect(parsed.minute).toEqual({ type: 'step', step: 5, min: 0, max: 59 });
    });

    it('should parse range expressions', () => {
      const parsed = parseCronExpression('* 9-17 * * *');
      expect(parsed.hour).toEqual({ type: 'range', start: 9, end: 17 });
    });

    it('should parse list expressions', () => {
      const parsed = parseCronExpression('0 8,12,18 * * *');
      expect(parsed.hour).toEqual({ type: 'list', values: [8, 12, 18] });
    });

    it('should throw error for invalid expression with wrong number of parts', () => {
      expect(() => parseCronExpression('* * *')).toThrow('must have 5 parts');
      expect(() => parseCronExpression('* * * * * *')).toThrow('must have 5 parts');
    });

    it('should throw error for invalid minute value', () => {
      expect(() => parseCronExpression('60 * * * *')).toThrow('Invalid value');
      expect(() => parseCronExpression('-1 * * * *')).toThrow('Invalid value');
    });

    it('should throw error for invalid hour value', () => {
      expect(() => parseCronExpression('* 24 * * *')).toThrow('Invalid value');
    });

    it('should throw error for invalid day of month value', () => {
      expect(() => parseCronExpression('* * 0 * *')).toThrow('Invalid value');
      expect(() => parseCronExpression('* * 32 * *')).toThrow('Invalid value');
    });

    it('should throw error for invalid range', () => {
      expect(() => parseCronExpression('* 10-5 * * *')).toThrow('Invalid range');
    });
  });

  describe('matchesCron', () => {
    it('should match wildcard expression at any time', () => {
      const date = new Date(2026, 0, 27, 10, 30); // Jan 27, 2026 10:30
      expect(matchesCron('* * * * *', date)).toBe(true);
    });

    it('should match specific minute', () => {
      const date = new Date(2026, 0, 27, 10, 30);
      expect(matchesCron('30 * * * *', date)).toBe(true);
      expect(matchesCron('15 * * * *', date)).toBe(false);
    });

    it('should match specific hour', () => {
      const date = new Date(2026, 0, 27, 14, 0);
      expect(matchesCron('0 14 * * *', date)).toBe(true);
      expect(matchesCron('0 10 * * *', date)).toBe(false);
    });

    it('should match step expression', () => {
      const date1 = new Date(2026, 0, 27, 10, 0);
      const date2 = new Date(2026, 0, 27, 10, 5);
      const date3 = new Date(2026, 0, 27, 10, 10);
      const date4 = new Date(2026, 0, 27, 10, 3);

      expect(matchesCron('*/5 * * * *', date1)).toBe(true);
      expect(matchesCron('*/5 * * * *', date2)).toBe(true);
      expect(matchesCron('*/5 * * * *', date3)).toBe(true);
      expect(matchesCron('*/5 * * * *', date4)).toBe(false);
    });

    it('should match range expression', () => {
      const date1 = new Date(2026, 0, 27, 10, 0); // 10 AM
      const date2 = new Date(2026, 0, 27, 14, 0); // 2 PM
      const date3 = new Date(2026, 0, 27, 6, 0);  // 6 AM

      expect(matchesCron('0 9-17 * * *', date1)).toBe(true);
      expect(matchesCron('0 9-17 * * *', date2)).toBe(true);
      expect(matchesCron('0 9-17 * * *', date3)).toBe(false);
    });

    it('should match day of week', () => {
      const monday = new Date(2026, 0, 26, 10, 0); // Monday
      const sunday = new Date(2026, 0, 25, 10, 0); // Sunday

      expect(matchesCron('0 10 * * 1', monday)).toBe(true); // 1 = Monday
      expect(matchesCron('0 10 * * 0', sunday)).toBe(true); // 0 = Sunday
      expect(matchesCron('0 10 * * 1', sunday)).toBe(false);
    });

    it('should match combined fields (daily at 2 AM)', () => {
      const match = new Date(2026, 0, 27, 2, 0);
      const noMatch = new Date(2026, 0, 27, 3, 0);

      expect(matchesCron('0 2 * * *', match)).toBe(true);
      expect(matchesCron('0 2 * * *', noMatch)).toBe(false);
    });

    it('should match monthly schedule', () => {
      const firstOfMonth = new Date(2026, 0, 1, 0, 0);
      const otherDay = new Date(2026, 0, 15, 0, 0);

      expect(matchesCron('0 0 1 * *', firstOfMonth)).toBe(true);
      expect(matchesCron('0 0 1 * *', otherDay)).toBe(false);
    });

    it('should return false for invalid expression', () => {
      expect(matchesCron('invalid', new Date())).toBe(false);
    });
  });

  describe('getNextRun', () => {
    it('should calculate next run for every minute', () => {
      const from = new Date(2026, 0, 27, 10, 30, 0);
      const next = getNextRun('* * * * *', from);

      expect(next).not.toBeNull();
      expect(next.getMinutes()).toBe(31);
    });

    it('should calculate next run for daily at midnight', () => {
      const from = new Date(2026, 0, 27, 10, 30);
      const next = getNextRun('0 0 * * *', from);

      expect(next).not.toBeNull();
      expect(next.getHours()).toBe(0);
      expect(next.getMinutes()).toBe(0);
      expect(next.getDate()).toBe(28); // Next day
    });

    it('should calculate next run for every 5 minutes', () => {
      const from = new Date(2026, 0, 27, 10, 32);
      const next = getNextRun('*/5 * * * *', from);

      expect(next).not.toBeNull();
      expect(next.getMinutes()).toBe(35);
    });

    it('should calculate next run for specific time', () => {
      const from = new Date(2026, 0, 27, 10, 0);
      const next = getNextRun('30 14 * * *', from);

      expect(next).not.toBeNull();
      expect(next.getHours()).toBe(14);
      expect(next.getMinutes()).toBe(30);
    });

    it('should return null for invalid expression', () => {
      const next = getNextRun('invalid');
      expect(next).toBeNull();
    });
  });

  describe('describeCron', () => {
    it('should describe daily at midnight', () => {
      expect(describeCron('0 0 * * *')).toBe('Daily at midnight');
    });

    it('should describe every hour', () => {
      expect(describeCron('0 * * * *')).toBe('Every hour');
    });

    it('should describe every N minutes', () => {
      expect(describeCron('*/5 * * * *')).toBe('Every 5 minutes');
      expect(describeCron('*/15 * * * *')).toBe('Every 15 minutes');
    });

    it('should describe weekly on Sunday', () => {
      expect(describeCron('0 0 * * 0')).toBe('Weekly on Sunday');
    });

    it('should describe monthly on the 1st', () => {
      expect(describeCron('0 0 1 * *')).toBe('Monthly on the 1st');
    });

    it('should describe custom schedules', () => {
      const desc = describeCron('30 14 * * *');
      expect(desc).toContain('minute 30');
      expect(desc).toContain('hour 14');
    });

    it('should return original expression for invalid input', () => {
      expect(describeCron('invalid')).toBe('invalid');
    });
  });
});

describe('Common Backup Schedules', () => {
  it('should support nightly backup at 2 AM', () => {
    const schedule = '0 2 * * *';
    const from = new Date(2026, 0, 27, 10, 0);
    const next = getNextRun(schedule, from);

    expect(next.getHours()).toBe(2);
    expect(next.getMinutes()).toBe(0);
  });

  it('should support hourly backups', () => {
    const schedule = '0 * * * *';
    const from = new Date(2026, 0, 27, 10, 30);
    const next = getNextRun(schedule, from);

    expect(next.getMinutes()).toBe(0);
    expect(next.getHours()).toBe(11);
  });

  it('should support weekly backups on Sunday', () => {
    const schedule = '0 0 * * 0';
    const from = new Date(2026, 0, 27, 10, 0); // Tuesday
    const next = getNextRun(schedule, from);

    expect(next.getDay()).toBe(0); // Sunday
  });

  it('should support multiple backups per day', () => {
    const schedule = '0 2,14 * * *'; // 2 AM and 2 PM
    const from = new Date(2026, 0, 27, 10, 0);
    const next = getNextRun(schedule, from);

    expect(next.getHours()).toBe(14); // Next is 2 PM
  });
});
