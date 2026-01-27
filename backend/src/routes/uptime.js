import express from 'express';
import {
  getUptimeSummary,
  getUptimeEvents,
  getDailyUptimeStats,
  getServer
} from '../models/database.js';

const router = express.Router();

// GET /api/uptime/summary - Get uptime summary for all servers
router.get('/summary', (req, res) => {
  try {
    const userId = req.user.id;
    const summary = getUptimeSummary(userId);

    // Calculate uptime percentages
    const enrichedSummary = summary.map(server => {
      const uptime24h = server.checks_24h > 0
        ? Math.round((server.up_24h / server.checks_24h) * 100 * 10) / 10
        : null;

      return {
        id: server.id,
        name: server.name,
        host: server.host,
        currentStatus: server.current_status || 'unknown',
        uptime24h,
        avgResponse24h: server.avg_response_24h ? Math.round(server.avg_response_24h) : null,
        totalChecks24h: server.checks_24h
      };
    });

    res.json(enrichedSummary);
  } catch (err) {
    console.error('Error getting uptime summary:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/uptime/server/:id - Get detailed uptime for a server
router.get('/server/:id', (req, res) => {
  try {
    const userId = req.user.id;
    const serverId = req.params.id;

    // Verify server belongs to user
    const server = getServer(serverId, userId);
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    const hours = parseInt(req.query.hours) || 24;
    const events = getUptimeEvents(serverId, hours);

    // Calculate stats
    const totalChecks = events.length;
    const upChecks = events.filter(e => e.status === 'up').length;
    const downChecks = events.filter(e => e.status === 'down').length;
    const uptimePercent = totalChecks > 0 ? Math.round((upChecks / totalChecks) * 100 * 10) / 10 : null;

    // Calculate average response time (only for successful checks)
    const successfulEvents = events.filter(e => e.status === 'up' && e.response_time);
    const avgResponseTime = successfulEvents.length > 0
      ? Math.round(successfulEvents.reduce((sum, e) => sum + e.response_time, 0) / successfulEvents.length)
      : null;

    // Get timeline data (group events by hour for visualization)
    const timeline = [];
    const now = new Date();
    for (let i = hours - 1; i >= 0; i--) {
      const hourStart = new Date(now.getTime() - (i + 1) * 60 * 60 * 1000);
      const hourEnd = new Date(now.getTime() - i * 60 * 60 * 1000);

      const hourEvents = events.filter(e => {
        const eventTime = new Date(e.created_at);
        return eventTime >= hourStart && eventTime < hourEnd;
      });

      const hourUp = hourEvents.filter(e => e.status === 'up').length;
      const hourTotal = hourEvents.length;

      timeline.push({
        hour: hourStart.toISOString(),
        status: hourTotal === 0 ? 'unknown' : (hourUp === hourTotal ? 'up' : (hourUp === 0 ? 'down' : 'partial')),
        upCount: hourUp,
        totalCount: hourTotal
      });
    }

    res.json({
      server: {
        id: server.id,
        name: server.name,
        host: server.host
      },
      stats: {
        totalChecks,
        upChecks,
        downChecks,
        uptimePercent,
        avgResponseTime
      },
      timeline,
      recentEvents: events.slice(0, 20)
    });
  } catch (err) {
    console.error('Error getting server uptime:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/uptime/server/:id/events - Get uptime events list
router.get('/server/:id/events', (req, res) => {
  try {
    const userId = req.user.id;
    const serverId = req.params.id;

    const server = getServer(serverId, userId);
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    const hours = parseInt(req.query.hours) || 24;
    const events = getUptimeEvents(serverId, hours);

    res.json(events);
  } catch (err) {
    console.error('Error getting uptime events:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/uptime/server/:id/daily - Get daily stats for graphs
router.get('/server/:id/daily', (req, res) => {
  try {
    const userId = req.user.id;
    const serverId = req.params.id;

    const server = getServer(serverId, userId);
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    const days = parseInt(req.query.days) || 30;
    const dailyStats = getDailyUptimeStats(serverId, days);

    res.json(dailyStats);
  } catch (err) {
    console.error('Error getting daily uptime stats:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
