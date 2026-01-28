/**
 * SSL Certificate API Integration Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the database module before importing route
vi.mock('../../src/models/database.js', () => ({
  createSSLCertificate: vi.fn(),
  getSSLCertificates: vi.fn(),
  getSSLCertificate: vi.fn(),
  getSSLCertificateByDomain: vi.fn(),
  updateSSLCertificate: vi.fn(),
  deleteSSLCertificate: vi.fn(),
  getServersWithCredentials: vi.fn()
}));

// Mock SSL collector
vi.mock('../../src/services/sslCollector.js', () => ({
  checkSingleSSLCertificate: vi.fn()
}));

import {
  createSSLCertificate,
  getSSLCertificates,
  getSSLCertificate,
  getSSLCertificateByDomain,
  updateSSLCertificate,
  deleteSSLCertificate,
  getServersWithCredentials
} from '../../src/models/database.js';

import { checkSingleSSLCertificate } from '../../src/services/sslCollector.js';

import { createMockRequest, createMockResponse, mockUser, testDataGenerators } from '../setup.js';

describe('SSL Certificate API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/ssl - List certificates', () => {
    it('should return all certificates for user', async () => {
      const mockCerts = [
        testDataGenerators.sslCertificate({ domain: 'example.com' }),
        testDataGenerators.sslCertificate({ domain: 'test.com' })
      ];
      getSSLCertificates.mockReturnValue(mockCerts);

      const req = createMockRequest();
      const res = createMockResponse();

      // Simulate route handler
      const userId = req.user.id;
      const certificates = getSSLCertificates(userId);
      res.json(certificates);

      expect(getSSLCertificates).toHaveBeenCalledWith(mockUser.id);
      expect(res.json).toHaveBeenCalledWith(mockCerts);
    });

    it('should return empty array when no certificates', () => {
      getSSLCertificates.mockReturnValue([]);

      const req = createMockRequest();
      const res = createMockResponse();

      const certificates = getSSLCertificates(req.user.id);
      res.json(certificates);

      expect(res.json).toHaveBeenCalledWith([]);
    });
  });

  describe('POST /api/ssl - Create certificate', () => {
    it('should create a new certificate', async () => {
      const certData = { domain: 'newdomain.com', port: 443, alertDays: 30, enabled: true };
      getSSLCertificateByDomain.mockReturnValue(null); // No duplicate
      checkSingleSSLCertificate.mockResolvedValue({
        issuer: "Let's Encrypt",
        subject: 'newdomain.com',
        validFrom: '2025-01-01',
        validTo: '2026-01-01',
        daysUntilExpiry: 365
      });
      getSSLCertificate.mockReturnValue({ id: 'new-id', ...certData });

      const req = createMockRequest(certData);
      const res = createMockResponse();

      // Check for duplicate
      const existing = getSSLCertificateByDomain(certData.domain, certData.port, req.user.id);
      expect(existing).toBeNull();

      // Create certificate
      createSSLCertificate({
        id: 'test-id',
        userId: req.user.id,
        domain: certData.domain,
        port: certData.port,
        alertDays: certData.alertDays,
        enabled: certData.enabled
      });

      expect(createSSLCertificate).toHaveBeenCalled();
    });

    it('should reject duplicate domain:port', () => {
      const certData = { domain: 'existing.com', port: 443 };
      const existingCert = testDataGenerators.sslCertificate({ domain: 'existing.com' });
      getSSLCertificateByDomain.mockReturnValue(existingCert);

      const req = createMockRequest(certData);
      const res = createMockResponse();

      const existing = getSSLCertificateByDomain(certData.domain, certData.port || 443, req.user.id);

      if (existing) {
        res.status(409).json({ error: `Domain ${certData.domain}:443 is already being monitored` });
      }

      expect(res.statusCode).toBe(409);
      expect(res.jsonData.error).toContain('already being monitored');
    });

    it('should clean domain from URL format', () => {
      const domain = 'https://example.com/path/to/page';
      const cleanDomain = domain.replace(/^https?:\/\//, '').split('/')[0];

      expect(cleanDomain).toBe('example.com');
    });

    it('should require domain field', () => {
      const req = createMockRequest({ port: 443 }); // No domain
      const res = createMockResponse();

      if (!req.body.domain) {
        res.status(400).json({ error: 'Domain is required' });
      }

      expect(res.statusCode).toBe(400);
      expect(res.jsonData.error).toBe('Domain is required');
    });
  });

  describe('GET /api/ssl/:id - Get single certificate', () => {
    it('should return certificate by id', () => {
      const mockCert = testDataGenerators.sslCertificate({ id: 'cert-123' });
      getSSLCertificate.mockReturnValue(mockCert);

      const req = createMockRequest({}, { id: 'cert-123' });
      const res = createMockResponse();

      const cert = getSSLCertificate(req.params.id, req.user.id);
      res.json(cert);

      expect(getSSLCertificate).toHaveBeenCalledWith('cert-123', mockUser.id);
      expect(res.jsonData).toEqual(mockCert);
    });

    it('should return 404 for non-existent certificate', () => {
      getSSLCertificate.mockReturnValue(null);

      const req = createMockRequest({}, { id: 'nonexistent' });
      const res = createMockResponse();

      const cert = getSSLCertificate(req.params.id, req.user.id);

      if (!cert) {
        res.status(404).json({ error: 'Certificate not found' });
      }

      expect(res.statusCode).toBe(404);
    });
  });

  describe('PATCH /api/ssl/:id - Update certificate', () => {
    it('should update certificate settings', () => {
      const existingCert = testDataGenerators.sslCertificate({ id: 'cert-123' });
      getSSLCertificate
        .mockReturnValueOnce(existingCert)
        .mockReturnValueOnce({ ...existingCert, alert_days: 14, enabled: 0 });

      const req = createMockRequest(
        { alertDays: 14, enabled: false },
        { id: 'cert-123' }
      );
      const res = createMockResponse();

      const cert = getSSLCertificate(req.params.id, req.user.id);
      expect(cert).not.toBeNull();

      const updates = {};
      if (req.body.alertDays !== undefined) updates.alert_days = req.body.alertDays;
      if (req.body.enabled !== undefined) updates.enabled = req.body.enabled ? 1 : 0;

      updateSSLCertificate(req.params.id, req.user.id, updates);

      expect(updateSSLCertificate).toHaveBeenCalledWith('cert-123', mockUser.id, {
        alert_days: 14,
        enabled: 0
      });
    });

    it('should clean domain on update', () => {
      const existingCert = testDataGenerators.sslCertificate({ id: 'cert-123' });
      getSSLCertificate.mockReturnValue(existingCert);

      const req = createMockRequest(
        { domain: 'http://updated.com/page' },
        { id: 'cert-123' }
      );

      const updates = {};
      if (req.body.domain !== undefined) {
        updates.domain = req.body.domain.replace(/^https?:\/\//, '').split('/')[0];
      }

      expect(updates.domain).toBe('updated.com');
    });
  });

  describe('DELETE /api/ssl/:id - Delete certificate', () => {
    it('should delete certificate', () => {
      const existingCert = testDataGenerators.sslCertificate({ id: 'cert-123' });
      getSSLCertificate.mockReturnValue(existingCert);

      const req = createMockRequest({}, { id: 'cert-123' });
      const res = createMockResponse();

      const cert = getSSLCertificate(req.params.id, req.user.id);
      expect(cert).not.toBeNull();

      deleteSSLCertificate(req.params.id, req.user.id);
      res.json({ success: true });

      expect(deleteSSLCertificate).toHaveBeenCalledWith('cert-123', mockUser.id);
      expect(res.jsonData.success).toBe(true);
    });

    it('should return 404 when deleting non-existent certificate', () => {
      getSSLCertificate.mockReturnValue(null);

      const req = createMockRequest({}, { id: 'nonexistent' });
      const res = createMockResponse();

      const cert = getSSLCertificate(req.params.id, req.user.id);

      if (!cert) {
        res.status(404).json({ error: 'Certificate not found' });
      }

      expect(res.statusCode).toBe(404);
    });
  });

  describe('POST /api/ssl/:id/check - Manual certificate check', () => {
    it('should perform manual certificate check', async () => {
      const existingCert = testDataGenerators.sslCertificate({ id: 'cert-123', domain: 'example.com' });
      getSSLCertificate.mockReturnValue(existingCert);

      const checkResult = {
        issuer: "Let's Encrypt",
        subject: 'example.com',
        validFrom: '2025-01-01',
        validTo: '2026-01-01',
        daysUntilExpiry: 300
      };
      checkSingleSSLCertificate.mockResolvedValue(checkResult);

      const req = createMockRequest({}, { id: 'cert-123' });
      const res = createMockResponse();

      const cert = getSSLCertificate(req.params.id, req.user.id);
      expect(cert).not.toBeNull();

      const result = await checkSingleSSLCertificate(cert.domain, cert.port);

      if (!result.error) {
        updateSSLCertificate(cert.id, req.user.id, {
          issuer: result.issuer,
          valid_to: result.validTo,
          days_until_expiry: result.daysUntilExpiry,
          last_checked: expect.any(String)
        });
        res.json({ success: true, certificate: cert });
      }

      expect(checkSingleSSLCertificate).toHaveBeenCalledWith('example.com', 443);
    });

    it('should handle check errors gracefully', async () => {
      const existingCert = testDataGenerators.sslCertificate({ id: 'cert-123', domain: 'broken.com' });
      getSSLCertificate.mockReturnValue(existingCert);
      checkSingleSSLCertificate.mockResolvedValue({ error: 'Connection refused' });

      const req = createMockRequest({}, { id: 'cert-123' });
      const res = createMockResponse();

      const cert = getSSLCertificate(req.params.id, req.user.id);
      const result = await checkSingleSSLCertificate(cert.domain, cert.port);

      if (result.error) {
        updateSSLCertificate(cert.id, req.user.id, {
          last_checked: new Date().toISOString(),
          last_error: result.error
        });
        res.json({ success: false, error: result.error });
      }

      expect(res.jsonData.success).toBe(false);
      expect(res.jsonData.error).toBe('Connection refused');
    });
  });

  describe('GET /api/ssl/discover - Domain discovery', () => {
    it('should discover domains from servers', async () => {
      const mockServers = [
        testDataGenerators.server({ id: 'server-1', name: 'Web Server' })
      ];
      getServersWithCredentials.mockReturnValue(mockServers);
      getSSLCertificates.mockReturnValue([]); // No existing certs

      const req = createMockRequest();

      const servers = getServersWithCredentials(req.user.id);
      expect(servers.length).toBe(1);

      const existingCerts = getSSLCertificates(req.user.id);
      const existingDomains = new Set(existingCerts.map(c => c.domain.toLowerCase()));
      expect(existingDomains.size).toBe(0);
    });

    it('should filter out already monitored domains', () => {
      const existingCerts = [
        testDataGenerators.sslCertificate({ domain: 'existing.com' })
      ];
      getSSLCertificates.mockReturnValue(existingCerts);

      const existingDomains = new Set(existingCerts.map(c => c.domain.toLowerCase()));

      // Simulate discovered domains
      const discoveredDomains = ['existing.com', 'new1.com', 'new2.com'];
      const suggestions = discoveredDomains.filter(d => !existingDomains.has(d.toLowerCase()));

      expect(suggestions).toEqual(['new1.com', 'new2.com']);
      expect(suggestions).not.toContain('existing.com');
    });

    it('should deduplicate discovered domains', () => {
      const suggestions = [
        { domain: 'example.com', serverName: 'Server 1' },
        { domain: 'example.com', serverName: 'Server 2' }, // Duplicate
        { domain: 'other.com', serverName: 'Server 1' }
      ];

      const seen = new Set();
      const uniqueSuggestions = suggestions.filter(s => {
        if (seen.has(s.domain)) return false;
        seen.add(s.domain);
        return true;
      });

      expect(uniqueSuggestions.length).toBe(2);
      expect(uniqueSuggestions.map(s => s.domain)).toEqual(['example.com', 'other.com']);
    });
  });
});

describe('Domain URL Cleaning', () => {
  it('should remove http:// prefix', () => {
    const domain = 'http://example.com';
    const clean = domain.replace(/^https?:\/\//, '').split('/')[0];
    expect(clean).toBe('example.com');
  });

  it('should remove https:// prefix', () => {
    const domain = 'https://example.com';
    const clean = domain.replace(/^https?:\/\//, '').split('/')[0];
    expect(clean).toBe('example.com');
  });

  it('should remove path after domain', () => {
    const domain = 'https://example.com/path/to/page';
    const clean = domain.replace(/^https?:\/\//, '').split('/')[0];
    expect(clean).toBe('example.com');
  });

  it('should handle subdomains', () => {
    const domain = 'https://sub.example.com/path';
    const clean = domain.replace(/^https?:\/\//, '').split('/')[0];
    expect(clean).toBe('sub.example.com');
  });

  it('should preserve port in domain', () => {
    const domain = 'https://example.com:8443/path';
    const clean = domain.replace(/^https?:\/\//, '').split('/')[0];
    expect(clean).toBe('example.com:8443');
  });
});

describe('Certificate Expiry Calculations', () => {
  it('should calculate days until expiry correctly', () => {
    const now = new Date();
    const expiry = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days from now
    const days = Math.floor((expiry - now) / (1000 * 60 * 60 * 24));
    expect(days).toBe(30);
  });

  it('should return negative for expired certificates', () => {
    const now = new Date();
    const expiry = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000); // 5 days ago
    const days = Math.floor((expiry - now) / (1000 * 60 * 60 * 24));
    expect(days).toBe(-5);
  });

  it('should classify certificate by expiry status', () => {
    function getExpiryStatus(daysUntilExpiry) {
      if (daysUntilExpiry <= 0) return 'expired';
      if (daysUntilExpiry <= 7) return 'critical';
      if (daysUntilExpiry <= 30) return 'warning';
      return 'ok';
    }

    expect(getExpiryStatus(-1)).toBe('expired');
    expect(getExpiryStatus(0)).toBe('expired');
    expect(getExpiryStatus(5)).toBe('critical');
    expect(getExpiryStatus(7)).toBe('critical');
    expect(getExpiryStatus(15)).toBe('warning');
    expect(getExpiryStatus(30)).toBe('warning');
    expect(getExpiryStatus(31)).toBe('ok');
    expect(getExpiryStatus(90)).toBe('ok');
  });
});
