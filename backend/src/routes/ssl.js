import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import {
  createSSLCertificate,
  getSSLCertificates,
  getSSLCertificate,
  getSSLCertificateByDomain,
  updateSSLCertificate,
  deleteSSLCertificate
} from '../models/database.js';
import { checkSingleSSLCertificate } from '../services/sslCollector.js';

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
