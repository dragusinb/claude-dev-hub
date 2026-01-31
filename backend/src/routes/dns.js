import express from 'express';
import dns from 'dns';
import { promisify } from 'util';
import { getDb } from '../models/database.js';
import { decrypt } from '../services/encryption.js';
import { v4 as uuidv4 } from 'uuid';
import fetch from 'node-fetch';

const router = express.Router();

// Promisify DNS functions
const resolve4 = promisify(dns.resolve4);
const resolve6 = promisify(dns.resolve6);
const resolveMx = promisify(dns.resolveMx);
const resolveTxt = promisify(dns.resolveTxt);
const resolveCname = promisify(dns.resolveCname);
const resolveNs = promisify(dns.resolveNs);
const resolveSoa = promisify(dns.resolveSoa);

// Public DNS servers for propagation check
const DNS_SERVERS = [
  { name: 'Google', ip: '8.8.8.8' },
  { name: 'Cloudflare', ip: '1.1.1.1' },
  { name: 'OpenDNS', ip: '208.67.222.222' },
  { name: 'Quad9', ip: '9.9.9.9' }
];

// Lookup DNS record using specific DNS server
async function lookupWithServer(domain, type, serverIp) {
  return new Promise((resolve) => {
    const resolver = new dns.Resolver();
    resolver.setServers([serverIp]);

    const method = {
      'A': 'resolve4',
      'AAAA': 'resolve6',
      'MX': 'resolveMx',
      'TXT': 'resolveTxt',
      'CNAME': 'resolveCname',
      'NS': 'resolveNs'
    }[type] || 'resolve4';

    resolver[method](domain, (err, records) => {
      if (err) {
        resolve({ error: err.code || err.message });
      } else {
        resolve({ records });
      }
    });
  });
}

// GET /api/dns/lookup - Lookup DNS records for a domain
router.get('/lookup', async (req, res) => {
  try {
    const { domain, type = 'A' } = req.query;

    if (!domain) {
      return res.status(400).json({ error: 'Domain is required' });
    }

    // Sanitize domain
    const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/\/.*$/, '').toLowerCase();

    const results = {};

    // A records
    try {
      results.A = await resolve4(cleanDomain);
    } catch (err) {
      results.A = null;
    }

    // AAAA records
    try {
      results.AAAA = await resolve6(cleanDomain);
    } catch (err) {
      results.AAAA = null;
    }

    // MX records
    try {
      results.MX = await resolveMx(cleanDomain);
      results.MX = results.MX.sort((a, b) => a.priority - b.priority);
    } catch (err) {
      results.MX = null;
    }

    // TXT records
    try {
      results.TXT = await resolveTxt(cleanDomain);
      results.TXT = results.TXT.map(r => r.join(''));
    } catch (err) {
      results.TXT = null;
    }

    // CNAME records
    try {
      results.CNAME = await resolveCname(cleanDomain);
    } catch (err) {
      results.CNAME = null;
    }

    // NS records
    try {
      results.NS = await resolveNs(cleanDomain);
    } catch (err) {
      results.NS = null;
    }

    // SOA record
    try {
      results.SOA = await resolveSoa(cleanDomain);
    } catch (err) {
      results.SOA = null;
    }

    res.json({
      domain: cleanDomain,
      records: results,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('DNS lookup error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dns/propagation - Check DNS propagation across multiple servers
router.get('/propagation', async (req, res) => {
  try {
    const { domain, type = 'A' } = req.query;

    if (!domain) {
      return res.status(400).json({ error: 'Domain is required' });
    }

    const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/\/.*$/, '').toLowerCase();

    const results = await Promise.all(
      DNS_SERVERS.map(async (server) => {
        const result = await lookupWithServer(cleanDomain, type, server.ip);
        return {
          server: server.name,
          ip: server.ip,
          ...result
        };
      })
    );

    // Check if all servers return the same result
    const successfulResults = results.filter(r => r.records);
    const allMatch = successfulResults.length > 1 &&
      successfulResults.every(r => JSON.stringify(r.records) === JSON.stringify(successfulResults[0].records));

    res.json({
      domain: cleanDomain,
      type,
      results,
      propagated: allMatch,
      successCount: successfulResults.length,
      totalServers: DNS_SERVERS.length,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('DNS propagation check error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Managed domains storage
// GET /api/dns/domains - List managed domains
router.get('/domains', (req, res) => {
  try {
    const db = getDb();

    // Create table if not exists
    db.exec(`
      CREATE TABLE IF NOT EXISTS dns_domains (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        domain TEXT NOT NULL UNIQUE,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_checked DATETIME,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    const domains = db.prepare('SELECT * FROM dns_domains ORDER BY domain ASC').all();
    res.json({ domains });
  } catch (err) {
    console.error('Error fetching domains:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/dns/domains - Add a domain to monitor
router.post('/domains', (req, res) => {
  try {
    const { domain, notes } = req.body;

    if (!domain) {
      return res.status(400).json({ error: 'Domain is required' });
    }

    const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/\/.*$/, '').toLowerCase();
    const db = getDb();

    // Create table if not exists
    db.exec(`
      CREATE TABLE IF NOT EXISTS dns_domains (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        domain TEXT NOT NULL UNIQUE,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_checked DATETIME,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    const id = uuidv4();
    db.prepare('INSERT INTO dns_domains (id, user_id, domain, notes) VALUES (?, ?, ?, ?)').run(
      id, req.user.id, cleanDomain, notes || null
    );

    res.status(201).json({ id, domain: cleanDomain, message: 'Domain added successfully' });
  } catch (err) {
    if (err.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'Domain already exists' });
    }
    console.error('Error adding domain:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/dns/domains/:id - Remove a domain
router.delete('/domains/:id', (req, res) => {
  try {
    const db = getDb();
    db.prepare('DELETE FROM dns_domains WHERE id = ?').run(req.params.id);
    res.json({ message: 'Domain removed successfully' });
  } catch (err) {
    console.error('Error deleting domain:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dns/domains/:id/records - Get DNS records for a managed domain
router.get('/domains/:id/records', async (req, res) => {
  try {
    const db = getDb();
    const domain = db.prepare('SELECT * FROM dns_domains WHERE id = ?').get(req.params.id);

    if (!domain) {
      return res.status(404).json({ error: 'Domain not found' });
    }

    // Lookup all records
    const results = {};

    try { results.A = await resolve4(domain.domain); } catch (err) { results.A = null; }
    try { results.AAAA = await resolve6(domain.domain); } catch (err) { results.AAAA = null; }
    try {
      results.MX = await resolveMx(domain.domain);
      results.MX = results.MX.sort((a, b) => a.priority - b.priority);
    } catch (err) { results.MX = null; }
    try {
      results.TXT = await resolveTxt(domain.domain);
      results.TXT = results.TXT.map(r => r.join(''));
    } catch (err) { results.TXT = null; }
    try { results.CNAME = await resolveCname(domain.domain); } catch (err) { results.CNAME = null; }
    try { results.NS = await resolveNs(domain.domain); } catch (err) { results.NS = null; }

    // Update last checked
    db.prepare('UPDATE dns_domains SET last_checked = ? WHERE id = ?').run(new Date().toISOString(), req.params.id);

    res.json({
      domain: domain.domain,
      id: domain.id,
      records: results,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('Error fetching domain records:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dns/whois - Get WHOIS info (basic implementation)
router.get('/whois', async (req, res) => {
  try {
    const { domain } = req.query;

    if (!domain) {
      return res.status(400).json({ error: 'Domain is required' });
    }

    const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/\/.*$/, '').toLowerCase();

    // For now, return basic info from DNS
    const results = {};

    try { results.NS = await resolveNs(cleanDomain); } catch (err) { results.NS = null; }
    try { results.SOA = await resolveSoa(cleanDomain); } catch (err) { results.SOA = null; }

    res.json({
      domain: cleanDomain,
      nameservers: results.NS,
      soa: results.SOA,
      note: 'Full WHOIS requires external API integration',
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('WHOIS error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ==================== CLOUDFLARE INTEGRATION ====================

const CLOUDFLARE_API = 'https://api.cloudflare.com/client/v4';

// Get Cloudflare API token from Vault
function getCloudflareToken() {
  try {
    console.log('[CF DEBUG] Getting Cloudflare token from vault...');
    const db = getDb();
    const entry = db.prepare("SELECT * FROM vault WHERE name = 'Cloudflare API' LIMIT 1").get();
    console.log('[CF DEBUG] Vault entry found:', entry ? 'yes' : 'no');
    if (entry && entry.encrypted_password) {
      console.log('[CF DEBUG] Encrypted password exists, decrypting...');
      const token = decrypt(entry.encrypted_password);
      console.log('[CF DEBUG] Decrypted token:', token ? `${token.substring(0, 10)}...` : 'null');
      return token;
    }
    console.log('[CF DEBUG] No encrypted_password in entry');
  } catch (err) {
    console.error('[CF DEBUG] Failed to get Cloudflare token:', err.message, err.stack);
  }
  return null;
}

// Make Cloudflare API request
async function cloudflareRequest(endpoint, method = 'GET', body = null) {
  const token = getCloudflareToken();
  if (!token) {
    throw new Error('Cloudflare API token not configured. Add it to the Vault as "Cloudflare API".');
  }

  const options = {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`${CLOUDFLARE_API}${endpoint}`, options);
  const data = await response.json();

  if (!data.success) {
    const errorMsg = data.errors?.map(e => e.message).join(', ') || 'Cloudflare API error';
    throw new Error(errorMsg);
  }

  return data;
}

// GET /api/dns/cloudflare/zones - List all Cloudflare zones
router.get('/cloudflare/zones', async (req, res) => {
  try {
    const data = await cloudflareRequest('/zones?per_page=50');

    const zones = data.result.map(zone => ({
      id: zone.id,
      name: zone.name,
      status: zone.status,
      paused: zone.paused,
      type: zone.type,
      nameServers: zone.name_servers,
      originalNameServers: zone.original_name_servers,
      plan: zone.plan?.name,
      createdOn: zone.created_on,
      modifiedOn: zone.modified_on
    }));

    res.json({
      zones,
      total: data.result_info?.total_count || zones.length
    });
  } catch (err) {
    console.error('Cloudflare zones error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dns/cloudflare/zones/:zoneId/records - List DNS records for a zone
router.get('/cloudflare/zones/:zoneId/records', async (req, res) => {
  try {
    const { zoneId } = req.params;
    const { type, name } = req.query;

    let endpoint = `/zones/${zoneId}/dns_records?per_page=100`;
    if (type) endpoint += `&type=${type}`;
    if (name) endpoint += `&name=${encodeURIComponent(name)}`;

    const data = await cloudflareRequest(endpoint);

    const records = data.result.map(record => ({
      id: record.id,
      type: record.type,
      name: record.name,
      content: record.content,
      ttl: record.ttl,
      proxied: record.proxied,
      priority: record.priority,
      createdOn: record.created_on,
      modifiedOn: record.modified_on
    }));

    // Sort by type, then name
    records.sort((a, b) => {
      if (a.type !== b.type) return a.type.localeCompare(b.type);
      return a.name.localeCompare(b.name);
    });

    res.json({
      zoneId,
      records,
      total: data.result_info?.total_count || records.length
    });
  } catch (err) {
    console.error('Cloudflare records error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/dns/cloudflare/zones/:zoneId/records - Create DNS record
router.post('/cloudflare/zones/:zoneId/records', async (req, res) => {
  try {
    const { zoneId } = req.params;
    const { type, name, content, ttl, proxied, priority } = req.body;

    if (!type || !name || !content) {
      return res.status(400).json({ error: 'Type, name, and content are required' });
    }

    const recordData = {
      type,
      name,
      content,
      ttl: ttl || 1, // 1 = auto
      proxied: proxied !== undefined ? proxied : false
    };

    if (type === 'MX' && priority !== undefined) {
      recordData.priority = priority;
    }

    const data = await cloudflareRequest(`/zones/${zoneId}/dns_records`, 'POST', recordData);

    res.status(201).json({
      record: data.result,
      message: 'DNS record created successfully'
    });
  } catch (err) {
    console.error('Cloudflare create record error:', err);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/dns/cloudflare/zones/:zoneId/records/:recordId - Update DNS record
router.patch('/cloudflare/zones/:zoneId/records/:recordId', async (req, res) => {
  try {
    const { zoneId, recordId } = req.params;
    const { type, name, content, ttl, proxied, priority } = req.body;

    const recordData = {};
    if (type) recordData.type = type;
    if (name) recordData.name = name;
    if (content) recordData.content = content;
    if (ttl !== undefined) recordData.ttl = ttl;
    if (proxied !== undefined) recordData.proxied = proxied;
    if (priority !== undefined) recordData.priority = priority;

    const data = await cloudflareRequest(`/zones/${zoneId}/dns_records/${recordId}`, 'PATCH', recordData);

    res.json({
      record: data.result,
      message: 'DNS record updated successfully'
    });
  } catch (err) {
    console.error('Cloudflare update record error:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/dns/cloudflare/zones/:zoneId/records/:recordId - Delete DNS record
router.delete('/cloudflare/zones/:zoneId/records/:recordId', async (req, res) => {
  try {
    const { zoneId, recordId } = req.params;

    await cloudflareRequest(`/zones/${zoneId}/dns_records/${recordId}`, 'DELETE');

    res.json({ message: 'DNS record deleted successfully' });
  } catch (err) {
    console.error('Cloudflare delete record error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dns/cloudflare/status - Check Cloudflare connection
router.get('/cloudflare/status', async (req, res) => {
  console.log('[CF DEBUG] /cloudflare/status endpoint called');
  try {
    const token = getCloudflareToken();
    console.log('[CF DEBUG] Token retrieved:', token ? 'yes' : 'no');
    if (!token) {
      console.log('[CF DEBUG] Returning not connected - no token');
      return res.json({ connected: false, error: 'No API token configured' });
    }

    console.log('[CF DEBUG] Calling Cloudflare API to verify token...');
    const data = await cloudflareRequest('/user/tokens/verify');
    console.log('[CF DEBUG] Cloudflare API response:', JSON.stringify(data));

    res.json({
      connected: true,
      status: data.result?.status,
      expiresOn: data.result?.expires_on
    });
  } catch (err) {
    console.error('[CF DEBUG] Error in /cloudflare/status:', err.message, err.stack);
    res.json({ connected: false, error: err.message });
  }
});

export default router;
