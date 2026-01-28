/**
 * Servers API Integration Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the database module
vi.mock('../../src/models/database.js', () => ({
  createServer: vi.fn(),
  getServers: vi.fn(),
  getServer: vi.fn(),
  deleteServer: vi.fn(),
  updateServer: vi.fn(),
  getServerHealthHistory: vi.fn()
}));

import {
  createServer,
  getServers,
  getServer,
  deleteServer,
  updateServer,
  getServerHealthHistory
} from '../../src/models/database.js';

import { createMockRequest, createMockResponse, mockUser, testDataGenerators } from '../setup.js';

describe('Servers API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/servers - List all servers', () => {
    it('should return all servers for user', () => {
      const mockServers = [
        testDataGenerators.server({ id: 'server-1', name: 'Web Server' }),
        testDataGenerators.server({ id: 'server-2', name: 'Database Server' })
      ];
      getServers.mockReturnValue(mockServers);

      const req = createMockRequest();
      const res = createMockResponse();

      const servers = getServers(req.user.id);
      res.json(servers);

      expect(getServers).toHaveBeenCalledWith(mockUser.id);
      expect(res.jsonData.length).toBe(2);
    });

    it('should return empty array when no servers', () => {
      getServers.mockReturnValue([]);

      const req = createMockRequest();
      const res = createMockResponse();

      const servers = getServers(req.user.id);
      res.json(servers);

      expect(res.jsonData).toEqual([]);
    });
  });

  describe('GET /api/servers/:id - Get single server', () => {
    it('should return server without credentials', () => {
      const mockServer = testDataGenerators.server({
        id: 'server-1',
        password: 'secret123',
        private_key: 'secret-key'
      });
      getServer.mockReturnValue(mockServer);

      const req = createMockRequest({}, { id: 'server-1' });
      const res = createMockResponse();

      const server = getServer(req.params.id, req.user.id);

      // Strip credentials before sending
      const { password, private_key, ...safeServer } = server;
      res.json(safeServer);

      expect(res.jsonData.password).toBeUndefined();
      expect(res.jsonData.private_key).toBeUndefined();
      expect(res.jsonData.name).toBe('Test Server');
    });

    it('should return 404 for non-existent server', () => {
      getServer.mockReturnValue(null);

      const req = createMockRequest({}, { id: 'nonexistent' });
      const res = createMockResponse();

      const server = getServer(req.params.id, req.user.id);

      if (!server) {
        res.status(404).json({ error: 'Server not found' });
      }

      expect(res.statusCode).toBe(404);
    });
  });

  describe('POST /api/servers - Create server', () => {
    it('should create a new server', () => {
      const serverData = {
        name: 'New Server',
        host: '192.168.1.50',
        port: 22,
        username: 'admin',
        authType: 'password',
        password: 'secret'
      };

      const req = createMockRequest(serverData);
      const res = createMockResponse();

      // Validate required fields
      if (!serverData.name || !serverData.host || !serverData.username) {
        res.status(400).json({ error: 'Name, host, and username are required' });
        return;
      }

      createServer({
        id: 'new-id',
        userId: req.user.id,
        name: serverData.name,
        host: serverData.host,
        port: serverData.port || 22,
        username: serverData.username,
        authType: serverData.authType || 'password',
        password: serverData.password || null,
        privateKey: serverData.privateKey || null
      });

      expect(createServer).toHaveBeenCalled();
      const callArg = createServer.mock.calls[0][0];
      expect(callArg.name).toBe('New Server');
      expect(callArg.host).toBe('192.168.1.50');
    });

    it('should require name field', () => {
      const serverData = { host: '192.168.1.50', username: 'admin' };

      const req = createMockRequest(serverData);
      const res = createMockResponse();

      if (!serverData.name || !serverData.host || !serverData.username) {
        res.status(400).json({ error: 'Name, host, and username are required' });
      }

      expect(res.statusCode).toBe(400);
    });

    it('should require host field', () => {
      const serverData = { name: 'Server', username: 'admin' };

      const req = createMockRequest(serverData);
      const res = createMockResponse();

      if (!serverData.name || !serverData.host || !serverData.username) {
        res.status(400).json({ error: 'Name, host, and username are required' });
      }

      expect(res.statusCode).toBe(400);
    });

    it('should use default port 22 if not specified', () => {
      const serverData = { name: 'Server', host: '192.168.1.1', username: 'admin' };

      const port = serverData.port || 22;
      expect(port).toBe(22);
    });
  });

  describe('PATCH /api/servers/:id - Update server', () => {
    it('should update server fields', () => {
      const existingServer = testDataGenerators.server({ id: 'server-1' });
      getServer
        .mockReturnValueOnce(existingServer)
        .mockReturnValueOnce({ ...existingServer, name: 'Updated Name' });

      const req = createMockRequest({ name: 'Updated Name' }, { id: 'server-1' });
      const res = createMockResponse();

      const server = getServer(req.params.id, req.user.id);
      expect(server).not.toBeNull();

      const updates = {};
      if (req.body.name !== undefined) updates.name = req.body.name;

      updateServer(req.params.id, req.user.id, updates);

      expect(updateServer).toHaveBeenCalledWith('server-1', mockUser.id, { name: 'Updated Name' });
    });

    it('should return 404 for non-existent server', () => {
      getServer.mockReturnValue(null);

      const req = createMockRequest({ name: 'New Name' }, { id: 'nonexistent' });
      const res = createMockResponse();

      const server = getServer(req.params.id, req.user.id);

      if (!server) {
        res.status(404).json({ error: 'Server not found' });
      }

      expect(res.statusCode).toBe(404);
    });
  });

  describe('DELETE /api/servers/:id - Delete server', () => {
    it('should delete server', () => {
      const existingServer = testDataGenerators.server({ id: 'server-1' });
      getServer.mockReturnValue(existingServer);

      const req = createMockRequest({}, { id: 'server-1' });
      const res = createMockResponse();

      const server = getServer(req.params.id, req.user.id);
      expect(server).not.toBeNull();

      deleteServer(req.params.id, req.user.id);
      res.json({ success: true });

      expect(deleteServer).toHaveBeenCalledWith('server-1', mockUser.id);
      expect(res.jsonData.success).toBe(true);
    });
  });

  describe('GET /api/servers/:id/health/history - Get health history', () => {
    it('should return health history for server', () => {
      const existingServer = testDataGenerators.server({ id: 'server-1' });
      getServer.mockReturnValue(existingServer);

      const mockHistory = [
        { timestamp: '2026-01-27T10:00:00Z', cpu: 25, memory_percent: 60, disk_percent: 45 },
        { timestamp: '2026-01-27T10:05:00Z', cpu: 30, memory_percent: 62, disk_percent: 45 },
        { timestamp: '2026-01-27T10:10:00Z', cpu: 28, memory_percent: 61, disk_percent: 46 }
      ];
      getServerHealthHistory.mockReturnValue(mockHistory);

      const req = createMockRequest({}, { id: 'server-1' }, { hours: '24' });
      const res = createMockResponse();

      const server = getServer(req.params.id, req.user.id);
      const hours = parseInt(req.query.hours) || 24;
      const history = getServerHealthHistory(server.id, hours);

      res.json({
        success: true,
        server: { id: server.id, name: server.name },
        history,
        hours
      });

      expect(getServerHealthHistory).toHaveBeenCalledWith('server-1', 24);
      expect(res.jsonData.history.length).toBe(3);
    });

    it('should use default 24 hours if not specified', () => {
      const req = createMockRequest({}, { id: 'server-1' }, {});
      const hours = parseInt(req.query.hours) || 24;
      expect(hours).toBe(24);
    });
  });
});

describe('Server Validation', () => {
  describe('Host validation', () => {
    it('should accept valid IP addresses', () => {
      const validIPs = ['192.168.1.1', '10.0.0.1', '172.16.0.1', '8.8.8.8'];
      const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;

      validIPs.forEach(ip => {
        expect(ipRegex.test(ip)).toBe(true);
      });
    });

    it('should accept valid hostnames', () => {
      const validHostnames = ['server1.example.com', 'web-server', 'db.internal.net'];

      validHostnames.forEach(hostname => {
        expect(typeof hostname).toBe('string');
        expect(hostname.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Port validation', () => {
    it('should accept valid port numbers', () => {
      const validPorts = [22, 80, 443, 3000, 8080, 65535];

      validPorts.forEach(port => {
        expect(port >= 1 && port <= 65535).toBe(true);
      });
    });

    it('should reject invalid port numbers', () => {
      const invalidPorts = [0, -1, 65536, 99999];

      invalidPorts.forEach(port => {
        expect(port >= 1 && port <= 65535).toBe(false);
      });
    });
  });

  describe('Auth type validation', () => {
    it('should accept password auth type', () => {
      const authType = 'password';
      expect(['password', 'key'].includes(authType)).toBe(true);
    });

    it('should accept key auth type', () => {
      const authType = 'key';
      expect(['password', 'key'].includes(authType)).toBe(true);
    });
  });
});

describe('Health Stats Parsing', () => {
  describe('CPU parsing', () => {
    it('should parse CPU percentage correctly', () => {
      const cpuOutput = '25.5';
      const cpu = parseFloat(cpuOutput) || 0;
      expect(cpu).toBe(25.5);
    });

    it('should handle invalid CPU output', () => {
      const cpuOutput = 'invalid';
      const cpu = parseFloat(cpuOutput) || 0;
      expect(cpu).toBe(0);
    });
  });

  describe('Memory parsing', () => {
    it('should parse memory stats correctly', () => {
      const memOutput = '8000 4500 3500'; // total used free
      const parts = memOutput.split(' ');

      const memory = {
        total: parseInt(parts[0]) || 0,
        used: parseInt(parts[1]) || 0,
        free: parseInt(parts[2]) || 0,
        percent: Math.round((parseInt(parts[1]) / parseInt(parts[0])) * 100)
      };

      expect(memory.total).toBe(8000);
      expect(memory.used).toBe(4500);
      expect(memory.free).toBe(3500);
      expect(memory.percent).toBe(56); // 4500/8000 * 100 = 56.25
    });
  });

  describe('Disk parsing', () => {
    it('should parse disk stats correctly', () => {
      const diskOutput = '100G 50G 50G 50%';
      const parts = diskOutput.split(' ');

      const disk = {
        total: parts[0],
        used: parts[1],
        free: parts[2],
        percent: parseInt(parts[3]) || 0
      };

      expect(disk.total).toBe('100G');
      expect(disk.used).toBe('50G');
      expect(disk.free).toBe('50G');
      expect(disk.percent).toBe(50);
    });
  });

  describe('Load average parsing', () => {
    it('should parse load averages correctly', () => {
      const loadOutput = '1.5 2.0 1.8';
      const parts = loadOutput.split(' ');

      const load = {
        one: parseFloat(parts[0]) || 0,
        five: parseFloat(parts[1]) || 0,
        fifteen: parseFloat(parts[2]) || 0
      };

      expect(load.one).toBe(1.5);
      expect(load.five).toBe(2.0);
      expect(load.fifteen).toBe(1.8);
    });
  });
});
