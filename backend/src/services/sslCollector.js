import { execSync } from 'child_process';
import { getAllEnabledSSLCertificates, updateSSLCertificate, getServerOwner } from '../models/database.js';
import { sendSSLAlert } from './alertService.js';

let collectorInterval = null;

// Check SSL certificate for a domain
async function checkSSLCertificate(domain, port = 443) {
  return new Promise((resolve, reject) => {
    try {
      // Use openssl to get certificate info
      const command = `echo | openssl s_client -connect ${domain}:${port} -servername ${domain} 2>/dev/null | openssl x509 -noout -dates -issuer -subject 2>/dev/null`;

      const output = execSync(command, {
        encoding: 'utf-8',
        timeout: 30000
      });

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

      // Parse output
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

      // Calculate days until expiry
      if (result.validTo) {
        const expiryDate = new Date(result.validTo);
        const now = new Date();
        const diffTime = expiryDate.getTime() - now.getTime();
        result.daysUntilExpiry = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      }

      resolve(result);
    } catch (err) {
      resolve({
        domain,
        port,
        error: err.message || 'Failed to check certificate'
      });
    }
  });
}

// Collect SSL info for all enabled certificates
async function collectAllSSLCertificates() {
  try {
    const certificates = getAllEnabledSSLCertificates();

    for (const cert of certificates) {
      try {
        console.log(`Checking SSL certificate for: ${cert.domain}`);
        const result = await checkSSLCertificate(cert.domain, cert.port);

        // Update database
        const updates = {
          last_checked: new Date().toISOString()
        };

        if (result.error) {
          updates.last_error = result.error;
        } else {
          updates.issuer = result.issuer;
          updates.subject = result.subject;
          updates.valid_from = result.validFrom;
          updates.valid_to = result.validTo;
          updates.days_until_expiry = result.daysUntilExpiry;
          updates.last_error = null;
        }

        updateSSLCertificate(cert.id, cert.user_id, updates);

        // Check if we need to send alert
        if (!result.error && result.daysUntilExpiry !== null && result.daysUntilExpiry <= cert.alert_days) {
          await sendSSLAlert(cert, result.daysUntilExpiry);
        }

        console.log(`SSL check complete for ${cert.domain}: ${result.daysUntilExpiry} days until expiry`);
      } catch (err) {
        console.error(`Failed to check SSL for ${cert.domain}:`, err.message);
        updateSSLCertificate(cert.id, cert.user_id, {
          last_checked: new Date().toISOString(),
          last_error: err.message
        });
      }
    }
  } catch (err) {
    console.error('SSL collection error:', err);
  }
}

// Start the SSL collector (runs every 6 hours by default)
export function startSSLCollector(intervalHours = 6) {
  if (collectorInterval) {
    console.log('SSL collector already running');
    return;
  }

  console.log(`Starting SSL collector (interval: ${intervalHours} hours)`);

  // Run immediately on start
  collectAllSSLCertificates();

  // Then run at interval
  collectorInterval = setInterval(collectAllSSLCertificates, intervalHours * 60 * 60 * 1000);
}

// Stop the SSL collector
export function stopSSLCollector() {
  if (collectorInterval) {
    clearInterval(collectorInterval);
    collectorInterval = null;
    console.log('SSL collector stopped');
  }
}

// Manual check for a single certificate
export async function checkSingleSSLCertificate(domain, port = 443) {
  return await checkSSLCertificate(domain, port);
}

export { collectAllSSLCertificates };
