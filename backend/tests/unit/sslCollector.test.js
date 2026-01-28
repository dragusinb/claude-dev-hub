/**
 * SSL Collector Unit Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('SSL Certificate Parsing', () => {
  // Replicate the parsing logic for testing
  function parseSSLOutput(output, domain, port) {
    const result = {
      domain,
      port,
      issuer: null,
      subject: null,
      validFrom: null,
      validTo: null,
      daysUntilExpiry: null,
      error: null
    };

    const lines = output.split('\n');
    for (const line of lines) {
      if (line.startsWith('notBefore=')) {
        const dateStr = line.replace('notBefore=', '').trim();
        result.validFrom = new Date(dateStr).toISOString();
      } else if (line.startsWith('notAfter=')) {
        const dateStr = line.replace('notAfter=', '').trim();
        result.validTo = new Date(dateStr).toISOString();
      } else if (line.startsWith('issuer=')) {
        result.issuer = line.replace('issuer=', '').trim();
      } else if (line.startsWith('subject=')) {
        result.subject = line.replace('subject=', '').trim();
      }
    }

    if (result.validTo) {
      const expiryDate = new Date(result.validTo);
      const now = new Date();
      const diffTime = expiryDate.getTime() - now.getTime();
      result.daysUntilExpiry = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }

    return result;
  }

  it('should parse valid SSL output', () => {
    const output = `notBefore=Jan  1 00:00:00 2026 GMT
notAfter=Jan  1 00:00:00 2027 GMT
issuer=C = US, O = Let's Encrypt, CN = R3
subject=CN = example.com`;

    const result = parseSSLOutput(output, 'example.com', 443);

    expect(result.domain).toBe('example.com');
    expect(result.port).toBe(443);
    expect(result.issuer).toContain("Let's Encrypt");
    expect(result.subject).toContain('example.com');
    expect(result.validFrom).toBeDefined();
    expect(result.validTo).toBeDefined();
    expect(result.daysUntilExpiry).toBeTypeOf('number');
    expect(result.error).toBeNull();
  });

  it('should handle missing fields gracefully', () => {
    const output = 'notAfter=Dec 31 23:59:59 2025 GMT';

    const result = parseSSLOutput(output, 'example.com', 443);

    expect(result.validTo).toBeDefined();
    expect(result.issuer).toBeNull();
    expect(result.subject).toBeNull();
    expect(result.validFrom).toBeNull();
  });

  it('should handle empty output', () => {
    const output = '';

    const result = parseSSLOutput(output, 'example.com', 443);

    expect(result.domain).toBe('example.com');
    expect(result.validTo).toBeNull();
    expect(result.daysUntilExpiry).toBeNull();
  });

  it('should calculate days until expiry correctly', () => {
    const now = new Date();
    const futureDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days
    const output = `notAfter=${futureDate.toUTCString().replace(' GMT', ' GMT')}`;

    const result = parseSSLOutput(output, 'example.com', 443);

    expect(result.daysUntilExpiry).toBeGreaterThanOrEqual(29);
    expect(result.daysUntilExpiry).toBeLessThanOrEqual(31);
  });

  it('should handle expired certificates', () => {
    const now = new Date();
    const pastDate = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000); // 10 days ago
    const output = `notAfter=${pastDate.toUTCString()}`;

    const result = parseSSLOutput(output, 'example.com', 443);

    expect(result.daysUntilExpiry).toBeLessThan(0);
  });
});

describe('SSL Alert Logic', () => {
  function shouldSendAlert(cert, daysUntilExpiry) {
    // Alert if days until expiry is at or below the alert threshold
    return daysUntilExpiry !== null && daysUntilExpiry <= cert.alert_days;
  }

  it('should alert when certificate expires within alert threshold', () => {
    const cert = { alert_days: 30 };

    expect(shouldSendAlert(cert, 25)).toBe(true);
    expect(shouldSendAlert(cert, 30)).toBe(true);
    expect(shouldSendAlert(cert, 7)).toBe(true);
    expect(shouldSendAlert(cert, 0)).toBe(true);
  });

  it('should not alert when certificate has sufficient time', () => {
    const cert = { alert_days: 30 };

    expect(shouldSendAlert(cert, 31)).toBe(false);
    expect(shouldSendAlert(cert, 60)).toBe(false);
    expect(shouldSendAlert(cert, 365)).toBe(false);
  });

  it('should not alert when days is null', () => {
    const cert = { alert_days: 30 };

    expect(shouldSendAlert(cert, null)).toBe(false);
  });

  it('should respect custom alert threshold', () => {
    const cert7Days = { alert_days: 7 };
    const cert14Days = { alert_days: 14 };

    expect(shouldSendAlert(cert7Days, 10)).toBe(false);
    expect(shouldSendAlert(cert7Days, 5)).toBe(true);
    expect(shouldSendAlert(cert14Days, 10)).toBe(true);
  });
});

describe('Certificate Status Classification', () => {
  function getCertificateStatus(daysUntilExpiry, hasError) {
    if (hasError) return 'error';
    if (daysUntilExpiry === null) return 'unknown';
    if (daysUntilExpiry <= 0) return 'expired';
    if (daysUntilExpiry <= 7) return 'critical';
    if (daysUntilExpiry <= 30) return 'warning';
    return 'valid';
  }

  it('should classify expired certificates', () => {
    expect(getCertificateStatus(0, false)).toBe('expired');
    expect(getCertificateStatus(-5, false)).toBe('expired');
  });

  it('should classify critical certificates (1-7 days)', () => {
    expect(getCertificateStatus(1, false)).toBe('critical');
    expect(getCertificateStatus(7, false)).toBe('critical');
  });

  it('should classify warning certificates (8-30 days)', () => {
    expect(getCertificateStatus(8, false)).toBe('warning');
    expect(getCertificateStatus(15, false)).toBe('warning');
    expect(getCertificateStatus(30, false)).toBe('warning');
  });

  it('should classify valid certificates (>30 days)', () => {
    expect(getCertificateStatus(31, false)).toBe('valid');
    expect(getCertificateStatus(90, false)).toBe('valid');
    expect(getCertificateStatus(365, false)).toBe('valid');
  });

  it('should classify error states', () => {
    expect(getCertificateStatus(null, true)).toBe('error');
    expect(getCertificateStatus(30, true)).toBe('error');
  });

  it('should classify unknown states', () => {
    expect(getCertificateStatus(null, false)).toBe('unknown');
  });
});

describe('OpenSSL Command Generation', () => {
  function generateSSLCheckCommand(domain, port) {
    return `echo | openssl s_client -connect ${domain}:${port} -servername ${domain} 2>/dev/null | openssl x509 -noout -dates -issuer -subject 2>/dev/null`;
  }

  it('should generate correct command for standard HTTPS', () => {
    const command = generateSSLCheckCommand('example.com', 443);

    expect(command).toContain('-connect example.com:443');
    expect(command).toContain('-servername example.com');
    expect(command).toContain('openssl x509');
    expect(command).toContain('-dates');
    expect(command).toContain('-issuer');
    expect(command).toContain('-subject');
  });

  it('should generate correct command for custom port', () => {
    const command = generateSSLCheckCommand('example.com', 8443);

    expect(command).toContain('-connect example.com:8443');
  });

  it('should handle subdomains', () => {
    const command = generateSSLCheckCommand('sub.example.com', 443);

    expect(command).toContain('-connect sub.example.com:443');
    expect(command).toContain('-servername sub.example.com');
  });
});

describe('Date Parsing', () => {
  function parseSSLDate(dateStr) {
    try {
      return new Date(dateStr).toISOString();
    } catch {
      return null;
    }
  }

  it('should parse GMT date format', () => {
    const dateStr = 'Jan  1 00:00:00 2026 GMT';
    const result = parseSSLDate(dateStr);

    expect(result).toBeDefined();
    expect(result).toContain('2026');
  });

  it('should parse standard date format', () => {
    const dateStr = 'Mon Jan 27 10:00:00 2026';
    const result = parseSSLDate(dateStr);

    expect(result).toBeDefined();
    expect(result).toContain('2026');
  });

  it('should handle invalid date gracefully', () => {
    const dateStr = 'invalid date';
    const result = parseSSLDate(dateStr);

    // Should return invalid date or handle gracefully
    expect(result === null || result.includes('Invalid')).toBe(true);
  });
});

describe('Domain Validation', () => {
  function isValidDomain(domain) {
    if (!domain || typeof domain !== 'string') return false;
    if (domain.length > 253) return false;

    // Basic domain pattern
    const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    return domainRegex.test(domain);
  }

  it('should validate simple domains', () => {
    expect(isValidDomain('example.com')).toBe(true);
    expect(isValidDomain('test.org')).toBe(true);
  });

  it('should validate subdomains', () => {
    expect(isValidDomain('sub.example.com')).toBe(true);
    expect(isValidDomain('a.b.c.example.com')).toBe(true);
  });

  it('should validate domains with hyphens', () => {
    expect(isValidDomain('my-site.example.com')).toBe(true);
    expect(isValidDomain('test-domain.org')).toBe(true);
  });

  it('should reject invalid domains', () => {
    expect(isValidDomain('')).toBe(false);
    expect(isValidDomain(null)).toBe(false);
    expect(isValidDomain('.')).toBe(false);
    expect(isValidDomain('-example.com')).toBe(false);
    expect(isValidDomain('example-.com')).toBe(false);
  });

  it('should reject domains with invalid characters', () => {
    expect(isValidDomain('example_site.com')).toBe(false);
    expect(isValidDomain('example site.com')).toBe(false);
  });
});

describe('Certificate Update Payload', () => {
  function createUpdatePayload(result, isError) {
    const updates = {
      last_checked: new Date().toISOString()
    };

    if (isError || result.error) {
      updates.last_error = result.error || 'Unknown error';
    } else {
      updates.issuer = result.issuer;
      updates.subject = result.subject;
      updates.valid_from = result.validFrom;
      updates.valid_to = result.validTo;
      updates.days_until_expiry = result.daysUntilExpiry;
      updates.last_error = null;
    }

    return updates;
  }

  it('should create update payload for successful check', () => {
    const result = {
      issuer: "Let's Encrypt",
      subject: 'CN=example.com',
      validFrom: '2026-01-01T00:00:00.000Z',
      validTo: '2027-01-01T00:00:00.000Z',
      daysUntilExpiry: 365
    };

    const payload = createUpdatePayload(result, false);

    expect(payload.issuer).toBe("Let's Encrypt");
    expect(payload.subject).toBe('CN=example.com');
    expect(payload.days_until_expiry).toBe(365);
    expect(payload.last_error).toBeNull();
    expect(payload.last_checked).toBeDefined();
  });

  it('should create update payload for error', () => {
    const result = {
      error: 'Connection refused'
    };

    const payload = createUpdatePayload(result, true);

    expect(payload.last_error).toBe('Connection refused');
    expect(payload.last_checked).toBeDefined();
    expect(payload.issuer).toBeUndefined();
  });
});

describe('Port Validation', () => {
  function isValidPort(port) {
    const portNum = parseInt(port, 10);
    return !isNaN(portNum) && portNum >= 1 && portNum <= 65535;
  }

  it('should validate common SSL ports', () => {
    expect(isValidPort(443)).toBe(true);
    expect(isValidPort(8443)).toBe(true);
    expect(isValidPort(465)).toBe(true); // SMTPS
    expect(isValidPort(993)).toBe(true); // IMAPS
    expect(isValidPort(995)).toBe(true); // POP3S
  });

  it('should validate port range', () => {
    expect(isValidPort(1)).toBe(true);
    expect(isValidPort(65535)).toBe(true);
    expect(isValidPort(0)).toBe(false);
    expect(isValidPort(65536)).toBe(false);
    expect(isValidPort(-1)).toBe(false);
  });

  it('should handle non-numeric ports', () => {
    expect(isValidPort('443')).toBe(true);
    expect(isValidPort('invalid')).toBe(false);
    expect(isValidPort(null)).toBe(false);
  });
});
