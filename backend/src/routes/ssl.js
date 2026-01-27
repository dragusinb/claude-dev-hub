import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { Client } from 'ssh2';
import {
  createSSLCertificate,
  getSSLCertificates,
  getSSLCertificate,
  getSSLCertificateByDomain,
  updateSSLCertificate,
  deleteSSLCertificate,
  getServersWithCredentials
} from '../models/database.js';
import { checkSingleSSLCertificate } from '../services/sslCollector.js';

// Discover domains from a server via SSH
function discoverDomainsFromServer(server) {
  return new Promise((resolve) => {
    const conn = new Client();
    const timeout = setTimeout(() => {
      conn.end();
      resolve({ serverId: server.id, serverName: server.name, domains: [], error: 'Connection timeout' });
    }, 30000);

    conn.on('ready', () => {
      // Check nginx, apache, and letsencrypt for domains
      const command = `
        echo "===NGINX==="
        grep -rh "server_name" /etc/nginx/sites-enabled/ /etc/nginx/conf.d/ 2>/dev/null | grep -v "^#" | sed 's/server_name//g' | tr ';' '\\n' | tr ' ' '\\n' | grep -v "^$" | grep "\\." | sort -u
        echo "===APACHE==="
        grep -rh "ServerName\\|ServerAlias" /etc/apache2/sites-enabled/ /etc/httpd/conf.d/ 2>/dev/null | grep -v "^#" | sed 's/ServerName//g; s/ServerAlias//g' | tr ' ' '\\n' | grep -v "^$" | grep "\\." | sort -u
        echo "===LETSENCRYPT==="
        ls /etc/letsencrypt/live/ 2>/dev/null | grep -v "README"
      `;

      conn.exec(command, (err, stream) => {
        if (err) {
          clearTimeout(timeout);
          conn.end();
          resolve({ serverId: server.id, serverName: server.name, domains: [], error: err.message });
          return;
        }

        let output = '';
        stream.on('data', (data) => { output += data.toString(); });
        stream.stderr.on('data', () => {}); // Ignore stderr
        stream.on('close', () => {
          clearTimeout(timeout);
          conn.end();

          console.log(`[SSL Discovery] ${server.name}: Raw output length: ${output.length}`);

          const domains = new Set();
          const sections = output.split('===');

          for (let i = 0; i < sections.length; i++) {
            const section = sections[i].trim();
            const data = sections[i + 1]?.trim() || '';

            if (['NGINX', 'APACHE', 'LETSENCRYPT'].includes(section)) {
              const lines = data.split('\n').filter(l => l.trim());
              for (const line of lines) {
                const domain = line.trim().toLowerCase();
                // Filter out invalid entries
                if (domain &&
                    domain.includes('.') &&
                    !domain.startsWith('_') &&
                    !domain.includes('*') &&
                    !domain.includes('$') &&
                    domain !== 'localhost' &&
                    !domain.match(/^\d+\.\d+\.\d+\.\d+$/) &&
                    !domain.match(/-\d{4}$/)) {  // Filter Let's Encrypt backup dirs like domain.com-0001
                  domains.add(domain);
                }
              }
            }
          }

          const domainList = Array.from(domains).sort();
          console.log(`[SSL Discovery] ${server.name}: Found ${domainList.length} domains:`, domainList);

          resolve({
            serverId: server.id,
            serverName: server.name,
            domains: domainList
          });
        });
      });
    });

    conn.on('error', (err) => {
      clearTimeout(timeout);
      resolve({ serverId: server.id, serverName: server.name, domains: [], error: err.message });
    });

    const config = {
      host: server.host,
      port: server.port,
      username: server.username
    };

    if (server.auth_type === 'password') {
      config.password = server.password;
    } else {
      config.privateKey = server.private_key;
    }

    // Skip if no credentials
    const hasCredentials = server.auth_type === 'password' ? !!server.password : !!server.private_key;
    if (!hasCredentials) {
      resolve({ serverId: server.id, serverName: server.name, domains: [], error: 'No credentials' });
      return;
    }

    conn.connect(config);
  });
}

const router = express.Router();

// GET /api/ssl - List all SSL certificates
router.get('/', (req, res) => {
  try {
    const userId = req.user.id;
    const certificates = getSSLCertificates(userId);
    res.json(certificates);
  } catch (err) {
    console.error('Error getting SSL certificates:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ssl - Add new SSL certificate to monitor
router.post('/', async (req, res) => {
  try {
    const userId = req.user.id;
    const { domain, port, alertDays, enabled } = req.body;

    if (!domain) {
      return res.status(400).json({ error: 'Domain is required' });
    }

    // Clean domain (remove protocol if present)
    const cleanDomain = domain.replace(/^https?:\/\//, '').split('/')[0];
    const certPort = port || 443;

    // Check for duplicate domain+port combination
    const existing = getSSLCertificateByDomain(cleanDomain, certPort, userId);
    if (existing) {
      return res.status(409).json({ error: `Domain ${cleanDomain}:${certPort} is already being monitored` });
    }

    const cert = {
      id: uuidv4(),
      userId,
      domain: cleanDomain,
      port: certPort,
      alertDays: alertDays || 30,
      enabled: enabled !== false
    };

    createSSLCertificate(cert);

    // Immediately check the certificate
    try {
      const checkResult = await checkSingleSSLCertificate(cleanDomain, cert.port);
      if (!checkResult.error) {
        updateSSLCertificate(cert.id, userId, {
          issuer: checkResult.issuer,
          subject: checkResult.subject,
          valid_from: checkResult.validFrom,
          valid_to: checkResult.validTo,
          days_until_expiry: checkResult.daysUntilExpiry,
          last_checked: new Date().toISOString()
        });
      } else {
        updateSSLCertificate(cert.id, userId, {
          last_checked: new Date().toISOString(),
          last_error: checkResult.error
        });
      }
    } catch (checkErr) {
      console.error('Initial SSL check failed:', checkErr.message);
    }

    const created = getSSLCertificate(cert.id, userId);
    res.status(201).json(created);
  } catch (err) {
    console.error('Error creating SSL certificate:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/ssl/discover - Discover domains from all servers
// NOTE: This route must be defined BEFORE /:id routes
router.get('/discover', async (req, res) => {
  try {
    const userId = req.user.id;
    const servers = getServersWithCredentials(userId);
    console.log(`[SSL Discovery] Starting discovery for user ${userId}, found ${servers.length} servers`);
    servers.forEach(s => console.log(`[SSL Discovery] Server: ${s.name} (${s.host}) - has credentials: ${!!(s.password || s.private_key)}`));

    const existingCerts = getSSLCertificates(userId);
    const existingDomains = new Set(existingCerts.map(c => c.domain.toLowerCase()));
    console.log(`[SSL Discovery] Existing monitored domains:`, Array.from(existingDomains));

    // Discover domains from all servers in parallel
    const results = await Promise.all(servers.map(s => discoverDomainsFromServer(s)));

    // Aggregate and filter out already-monitored domains
    const suggestions = [];
    for (const result of results) {
      for (const domain of result.domains) {
        if (!existingDomains.has(domain.toLowerCase())) {
          suggestions.push({
            domain,
            serverId: result.serverId,
            serverName: result.serverName
          });
        }
      }
    }

    // Deduplicate by domain (keep first occurrence)
    const seen = new Set();
    const uniqueSuggestions = suggestions.filter(s => {
      if (seen.has(s.domain)) return false;
      seen.add(s.domain);
      return true;
    });

    console.log(`[SSL Discovery] Total unique suggestions: ${uniqueSuggestions.length}`, uniqueSuggestions.map(s => s.domain));

    res.json({
      suggestions: uniqueSuggestions,
      serverResults: results.map(r => ({
        serverId: r.serverId,
        serverName: r.serverName,
        domainsFound: r.domains.length,
        error: r.error || null
      }))
    });
  } catch (err) {
    console.error('Error discovering domains:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/ssl/:id - Get single SSL certificate
router.get('/:id', (req, res) => {
  try {
    const userId = req.user.id;
    const cert = getSSLCertificate(req.params.id, userId);

    if (!cert) {
      return res.status(404).json({ error: 'Certificate not found' });
    }

    res.json(cert);
  } catch (err) {
    console.error('Error getting SSL certificate:', err);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/ssl/:id - Update SSL certificate settings
router.patch('/:id', (req, res) => {
  try {
    const userId = req.user.id;
    const cert = getSSLCertificate(req.params.id, userId);

    if (!cert) {
      return res.status(404).json({ error: 'Certificate not found' });
    }

    const { domain, port, alertDays, enabled } = req.body;
    const updates = {};

    if (domain !== undefined) {
      updates.domain = domain.replace(/^https?:\/\//, '').split('/')[0];
    }
    if (port !== undefined) updates.port = port;
    if (alertDays !== undefined) updates.alert_days = alertDays;
    if (enabled !== undefined) updates.enabled = enabled ? 1 : 0;

    updateSSLCertificate(req.params.id, userId, updates);

    const updated = getSSLCertificate(req.params.id, userId);
    res.json(updated);
  } catch (err) {
    console.error('Error updating SSL certificate:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/ssl/:id - Remove SSL certificate
router.delete('/:id', (req, res) => {
  try {
    const userId = req.user.id;
    const cert = getSSLCertificate(req.params.id, userId);

    if (!cert) {
      return res.status(404).json({ error: 'Certificate not found' });
    }

    deleteSSLCertificate(req.params.id, userId);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting SSL certificate:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ssl/:id/check - Manual check
router.post('/:id/check', async (req, res) => {
  try {
    const userId = req.user.id;
    const cert = getSSLCertificate(req.params.id, userId);

    if (!cert) {
      return res.status(404).json({ error: 'Certificate not found' });
    }

    const checkResult = await checkSingleSSLCertificate(cert.domain, cert.port);

    if (checkResult.error) {
      updateSSLCertificate(cert.id, userId, {
        last_checked: new Date().toISOString(),
        last_error: checkResult.error
      });
      return res.json({ success: false, error: checkResult.error });
    }

    updateSSLCertificate(cert.id, userId, {
      issuer: checkResult.issuer,
      subject: checkResult.subject,
      valid_from: checkResult.validFrom,
      valid_to: checkResult.validTo,
      days_until_expiry: checkResult.daysUntilExpiry,
      last_checked: new Date().toISOString(),
      last_error: null
    });

    const updated = getSSLCertificate(cert.id, userId);
    res.json({ success: true, certificate: updated });
  } catch (err) {
    console.error('Error checking SSL certificate:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
