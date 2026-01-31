import express from 'express';
import fetch from 'node-fetch';
import { getServers, getDb } from '../models/database.js';
import { decrypt } from '../services/encryption.js';

const router = express.Router();

// Contabo API configuration
const CONTABO_AUTH_URL = 'https://auth.contabo.com/auth/realms/contabo/protocol/openid-connect/token';
const CONTABO_API_URL = 'https://api.contabo.com';

// Get Contabo credentials from Vault
function getContaboCredentials() {
  try {
    const db = getDb();
    const entry = db.prepare("SELECT * FROM vault WHERE name = 'Contabo API' LIMIT 1").get();
    if (entry) {
      const password = decrypt(entry.encrypted_password);
      const username = decrypt(entry.encrypted_username);
      const notes = decrypt(entry.encrypted_notes) || '';

      // Parse client ID and secret from notes
      const clientIdMatch = notes.match(/Client ID:\s*(\S+)/);
      const clientSecretMatch = notes.match(/Client Secret:\s*(\S+)/);

      return {
        clientId: clientIdMatch ? clientIdMatch[1] : null,
        clientSecret: clientSecretMatch ? clientSecretMatch[1] : null,
        username: username,
        password: password
      };
    }
  } catch (err) {
    console.error('Failed to get Contabo credentials from vault:', err.message);
  }

  // Fallback to environment variables
  return {
    clientId: process.env.CONTABO_CLIENT_ID,
    clientSecret: process.env.CONTABO_CLIENT_SECRET,
    username: process.env.CONTABO_API_USER,
    password: process.env.CONTABO_API_PASSWORD
  };
}

// Token cache
let tokenCache = {
  accessToken: null,
  expiresAt: null
};

// Product pricing (monthly EUR based on Contabo's Jan 2025 pricing)
// Format: productId pattern -> price
const PRODUCT_PRICING = {
  // Cloud VPS 1 (4 vCPU, 6GB RAM, 100GB NVMe or 400GB SSD)
  'V45': 5.50, 'V91': 5.50,
  // Cloud VPS 2 (4 vCPU, 8GB RAM)
  'V92': 7.25,
  // Cloud VPS 3 (6 vCPU, 12GB RAM)
  'V46': 9.50, 'V93': 9.50,
  // Cloud VPS 4 (6 vCPU, 16GB RAM)
  'V47': 11.00, 'V94': 11.00,
  // Cloud VPS 5 (6 vCPU, 20GB RAM)
  'V95': 14.50,
  // Cloud VPS 6 (8 vCPU, 24GB RAM)
  'V48': 16.50, 'V96': 16.50,
  // Cloud VPS 7 (8 vCPU, 30GB RAM)
  'V49': 19.00, 'V97': 19.00,
  // Cloud VPS 8 (10 vCPU, 40GB RAM)
  'V98': 24.00,
  // Cloud VPS 9 (10 vCPU, 50GB RAM)
  'V50': 28.00, 'V99': 28.00,
  // Cloud VPS 10 (12 vCPU, 60GB RAM)
  'V51': 34.00, 'V100': 34.00,
  // VDS S
  'V61': 32.00,
  // VDS M
  'V62': 60.00,
  // VDS L
  'V63': 120.00,
  // VDS XL
  'V64': 180.00,
};

// Get OAuth2 access token
async function getAccessToken() {
  // Check if we have a valid cached token
  if (tokenCache.accessToken && tokenCache.expiresAt && Date.now() < tokenCache.expiresAt) {
    return tokenCache.accessToken;
  }

  const creds = getContaboCredentials();
  if (!creds.clientId || !creds.password) {
    throw new Error('Contabo credentials not configured. Add them to the Vault.');
  }

  const params = new URLSearchParams();
  params.append('client_id', creds.clientId);
  params.append('client_secret', creds.clientSecret);
  params.append('username', creds.username);
  params.append('password', creds.password);
  params.append('grant_type', 'password');

  const response = await fetch(CONTABO_AUTH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Contabo auth failed: ${error}`);
  }

  const data = await response.json();

  // Cache the token (expire 1 minute early to be safe)
  tokenCache.accessToken = data.access_token;
  tokenCache.expiresAt = Date.now() + (data.expires_in - 60) * 1000;

  return data.access_token;
}

// Generate a UUID for x-request-id header
function generateRequestId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Make authenticated API request
async function contaboRequest(endpoint, method = 'GET', body = null) {
  const token = await getAccessToken();

  const options = {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'x-request-id': generateRequestId(),
      'Content-Type': 'application/json'
    }
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`${CONTABO_API_URL}${endpoint}`, options);

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Contabo API error: ${response.status} - ${error}`);
  }

  return response.json();
}

// GET /api/contabo/instances - List all instances
router.get('/instances', async (req, res) => {
  try {
    const userId = req.user.id;
    const data = await contaboRequest('/v1/compute/instances?size=100');

    // Get user's servers to match by IP
    const userServers = getServers(userId) || [];
    const serversByIp = {};
    for (const server of userServers) {
      if (server.host) {
        serversByIp[server.host] = server;
      }
    }

    // Enrich with pricing info and linked server
    const instances = data.data.map(instance => {
      const price = PRODUCT_PRICING[instance.productId] || null;
      const ipv4 = instance.ipConfig?.v4?.ip;
      const linkedServer = ipv4 ? serversByIp[ipv4] : null;

      return {
        id: instance.instanceId,
        name: instance.displayName || instance.name || `Instance ${instance.instanceId}`,
        productId: instance.productId,
        productName: instance.productName || instance.productId,
        productType: instance.productType,
        status: instance.status,
        region: instance.region,
        regionName: instance.regionName,
        dataCenter: instance.dataCenter,
        // Specs
        cpuCores: instance.cpuCores,
        ramMb: instance.ramMb,
        ramGb: Math.round(instance.ramMb / 1024),
        diskMb: instance.diskMb,
        diskGb: Math.round(instance.diskMb / 1024),
        // Network
        ipv4: ipv4,
        ipv6: instance.ipConfig?.v6?.ip,
        // OS
        osType: instance.osType,
        // Dates
        createdAt: instance.createdDate,
        // Pricing (monthly EUR)
        monthlyPrice: price,
        currency: 'EUR',
        // Linked server in Claude Dev Hub
        linkedServer: linkedServer ? {
          id: linkedServer.id,
          name: linkedServer.name,
          host: linkedServer.host
        } : null
      };
    });

    // Calculate totals
    const totalMonthly = instances.reduce((sum, i) => sum + (i.monthlyPrice || 0), 0);

    res.json({
      instances,
      summary: {
        totalInstances: instances.length,
        runningInstances: instances.filter(i => i.status === 'running').length,
        stoppedInstances: instances.filter(i => i.status === 'stopped').length,
        linkedInstances: instances.filter(i => i.linkedServer).length,
        totalMonthlyCost: totalMonthly.toFixed(2),
        currency: 'EUR'
      }
    });
  } catch (err) {
    console.error('Error fetching Contabo instances:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/contabo/instances/:id - Get single instance details
router.get('/instances/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const data = await contaboRequest(`/v1/compute/instances/${id}`);
    res.json(data.data[0] || data.data);
  } catch (err) {
    console.error('Error fetching Contabo instance:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/contabo/instances/:id/start - Start instance
router.post('/instances/:id/start', async (req, res) => {
  try {
    const { id } = req.params;
    await contaboRequest(`/v1/compute/instances/${id}/actions/start`, 'POST');
    res.json({ success: true, message: 'Instance start initiated' });
  } catch (err) {
    console.error('Error starting Contabo instance:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/contabo/instances/:id/stop - Stop instance
router.post('/instances/:id/stop', async (req, res) => {
  try {
    const { id } = req.params;
    await contaboRequest(`/v1/compute/instances/${id}/actions/stop`, 'POST');
    res.json({ success: true, message: 'Instance stop initiated' });
  } catch (err) {
    console.error('Error stopping Contabo instance:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/contabo/instances/:id/restart - Restart instance
router.post('/instances/:id/restart', async (req, res) => {
  try {
    const { id } = req.params;
    await contaboRequest(`/v1/compute/instances/${id}/actions/restart`, 'POST');
    res.json({ success: true, message: 'Instance restart initiated' });
  } catch (err) {
    console.error('Error restarting Contabo instance:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/contabo/images - List available images
router.get('/images', async (req, res) => {
  try {
    const data = await contaboRequest('/v1/compute/images?size=100');
    res.json(data.data);
  } catch (err) {
    console.error('Error fetching Contabo images:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
