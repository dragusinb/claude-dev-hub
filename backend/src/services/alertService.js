import { getAllAlertSettings, getAlertSettings, addAlertHistory, getRecentAlert, getServerOwner } from '../models/database.js';
import https from 'https';
import http from 'http';
import nodemailer from 'nodemailer';

// SMTP Configuration from environment variables
const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
const SMTP_PORT = parseInt(process.env.SMTP_PORT) || 587;
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const SMTP_FROM = process.env.SMTP_FROM || SMTP_USER;

// Create reusable transporter
let transporter = null;

function getTransporter() {
  if (!transporter && SMTP_USER && SMTP_PASS) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS
      }
    });
  }
  return transporter;
}

// Send webhook notification
async function sendWebhook(webhookUrl, payload) {
  return new Promise((resolve, reject) => {
    try {
      const url = new URL(webhookUrl);
      const isHttps = url.protocol === 'https:';
      const lib = isHttps ? https : http;

      const data = JSON.stringify(payload);

      const options = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data)
        }
      };

      const req = lib.request(options, (res) => {
        let responseData = '';
        res.on('data', chunk => responseData += chunk);
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(true);
          } else {
            console.error(`Webhook failed with status ${res.statusCode}: ${responseData}`);
            resolve(false);
          }
        });
      });

      req.on('error', (err) => {
        console.error('Webhook error:', err);
        resolve(false);
      });

      req.setTimeout(10000, () => {
        req.destroy();
        resolve(false);
      });

      req.write(data);
      req.end();
    } catch (err) {
      console.error('Webhook error:', err);
      resolve(false);
    }
  });
}

// Send email notification
async function sendEmail(to, subject, message) {
  const transport = getTransporter();

  if (!transport) {
    console.log(`[EMAIL] SMTP not configured. Would send to: ${to}, Subject: ${subject}`);
    return false;
  }

  try {
    const htmlMessage = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #1e293b; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
          <h2 style="margin: 0; color: #f97316;">Claude Dev Hub Alert</h2>
        </div>
        <div style="background: #f8fafc; padding: 20px; border: 1px solid #e2e8f0; border-radius: 0 0 8px 8px;">
          <p style="font-size: 16px; color: #334155; margin: 0 0 15px 0;">${message}</p>
          <p style="font-size: 12px; color: #64748b; margin: 0;">
            Sent from Claude Dev Hub Monitoring<br>
            ${new Date().toLocaleString()}
          </p>
        </div>
      </div>
    `;

    const result = await transport.sendMail({
      from: SMTP_FROM,
      to: to,
      subject: subject,
      text: message,
      html: htmlMessage
    });

    console.log(`[EMAIL] Sent to ${to}: ${subject}`);
    return true;
  } catch (err) {
    console.error(`[EMAIL] Failed to send to ${to}:`, err.message);
    return false;
  }
}

// Test email function - can be called from API
export async function sendTestEmail(to) {
  const subject = '[Test] Claude Dev Hub Alert System';
  const message = 'This is a test alert from Claude Dev Hub. If you received this email, your alert notifications are working correctly!';

  const htmlMessage = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #1e293b; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
        <h2 style="margin: 0; color: #f97316;">Claude Dev Hub Alert</h2>
      </div>
      <div style="background: #f8fafc; padding: 20px; border: 1px solid #e2e8f0; border-radius: 0 0 8px 8px;">
        <p style="font-size: 16px; color: #334155; margin: 0 0 15px 0;">${message}</p>
        <p style="font-size: 12px; color: #64748b; margin: 0;">
          Sent from Claude Dev Hub Monitoring<br>
          ${new Date().toLocaleString()}
        </p>
      </div>
    </div>
  `;

  // If SMTP is configured, use it
  const transport = getTransporter();
  if (transport) {
    try {
      await transport.sendMail({
        from: SMTP_FROM,
        to: to,
        subject: subject,
        text: message,
        html: htmlMessage
      });
      console.log(`[EMAIL] Test email sent to ${to}`);
      return { success: true, message: 'Test email sent successfully!' };
    } catch (err) {
      console.error(`[EMAIL] Failed to send test email:`, err.message);
      return { success: false, message: `Failed to send: ${err.message}` };
    }
  }

  // If no SMTP configured, use Ethereal for testing
  try {
    console.log('[EMAIL] No SMTP configured, using Ethereal test account...');
    const testAccount = await nodemailer.createTestAccount();

    const testTransport = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass
      }
    });

    const info = await testTransport.sendMail({
      from: '"Claude Dev Hub" <alerts@claude-dev-hub.com>',
      to: to,
      subject: subject,
      text: message,
      html: htmlMessage
    });

    const previewUrl = nodemailer.getTestMessageUrl(info);
    console.log(`[EMAIL] Test email preview: ${previewUrl}`);

    return {
      success: true,
      message: 'Test email sent to Ethereal (SMTP not configured for real delivery). View the email at the preview URL.',
      previewUrl: previewUrl,
      note: 'Configure SMTP_USER and SMTP_PASS in .env for real email delivery'
    };
  } catch (err) {
    console.error(`[EMAIL] Failed to send test email via Ethereal:`, err.message);
    return { success: false, message: `Failed to send test email: ${err.message}` };
  }
}

// Check health data and trigger alerts
export async function checkAndAlert(serverId, stats, serverName, serverHost) {
  const userId = getServerOwner(serverId);
  if (!userId) return;

  const alertSettings = getAlertSettings(userId);
  if (!alertSettings || !alertSettings.enabled) return;

  const alerts = [];
  const timestamp = new Date().toISOString();

  // Check CPU
  if (stats.cpu && stats.cpu >= alertSettings.cpu_threshold) {
    const recentAlert = getRecentAlert(userId, serverId, 'cpu_high', 30);
    if (!recentAlert) {
      alerts.push({
        type: 'cpu_high',
        message: `High CPU usage on ${serverName} (${serverHost}): ${stats.cpu.toFixed(1)}% (threshold: ${alertSettings.cpu_threshold}%)`,
        value: stats.cpu,
        threshold: alertSettings.cpu_threshold
      });
    }
  }

  // Check Memory
  if (stats.memoryPercent && stats.memoryPercent >= alertSettings.memory_threshold) {
    const recentAlert = getRecentAlert(userId, serverId, 'memory_high', 30);
    if (!recentAlert) {
      alerts.push({
        type: 'memory_high',
        message: `High memory usage on ${serverName} (${serverHost}): ${stats.memoryPercent.toFixed(1)}% (threshold: ${alertSettings.memory_threshold}%)`,
        value: stats.memoryPercent,
        threshold: alertSettings.memory_threshold
      });
    }
  }

  // Check Disk
  if (stats.diskPercent && stats.diskPercent >= alertSettings.disk_threshold) {
    const recentAlert = getRecentAlert(userId, serverId, 'disk_high', 60); // 1 hour for disk
    if (!recentAlert) {
      alerts.push({
        type: 'disk_high',
        message: `High disk usage on ${serverName} (${serverHost}): ${stats.diskPercent}% (threshold: ${alertSettings.disk_threshold}%)`,
        value: stats.diskPercent,
        threshold: alertSettings.disk_threshold
      });
    }
  }

  // Send notifications for all alerts
  for (const alert of alerts) {
    let notified = false;

    // Send webhook
    if (alertSettings.webhook_url) {
      const payload = {
        type: 'server_alert',
        alertType: alert.type,
        server: {
          id: serverId,
          name: serverName,
          host: serverHost
        },
        value: alert.value,
        threshold: alert.threshold,
        message: alert.message,
        timestamp
      };

      const webhookSent = await sendWebhook(alertSettings.webhook_url, payload);
      if (webhookSent) notified = true;
    }

    // Send email
    if (alertSettings.email) {
      const subject = `[Alert] ${alert.type.replace('_', ' ').toUpperCase()} - ${serverName}`;
      const emailSent = await sendEmail(alertSettings.email, subject, alert.message);
      if (emailSent) notified = true;
    }

    // Log alert to history
    addAlertHistory({
      userId,
      serverId,
      alertType: alert.type,
      message: alert.message,
      value: alert.value,
      threshold: alert.threshold,
      notified
    });

    console.log(`[ALERT] ${alert.message}`);
  }
}

// Alert for server down
export async function alertServerDown(serverId, serverName, serverHost, errorMessage) {
  const userId = getServerOwner(serverId);
  if (!userId) return;

  const alertSettings = getAlertSettings(userId);
  if (!alertSettings || !alertSettings.enabled || !alertSettings.notify_on_down) return;

  // Check if we already alerted recently
  const recentAlert = getRecentAlert(userId, serverId, 'server_down', 15);
  if (recentAlert) return;

  const timestamp = new Date().toISOString();
  const message = `Server ${serverName} (${serverHost}) is DOWN: ${errorMessage}`;

  let notified = false;

  // Send webhook
  if (alertSettings.webhook_url) {
    const payload = {
      type: 'server_alert',
      alertType: 'server_down',
      server: {
        id: serverId,
        name: serverName,
        host: serverHost
      },
      message,
      error: errorMessage,
      timestamp
    };

    const webhookSent = await sendWebhook(alertSettings.webhook_url, payload);
    if (webhookSent) notified = true;
  }

  // Send email
  if (alertSettings.email) {
    const emailSent = await sendEmail(alertSettings.email, `[CRITICAL] Server Down - ${serverName}`, message);
    if (emailSent) notified = true;
  }

  // Log alert
  addAlertHistory({
    userId,
    serverId,
    alertType: 'server_down',
    message,
    value: null,
    threshold: null,
    notified
  });

  console.log(`[ALERT] ${message}`);
}

// Alert for server back up
export async function alertServerUp(serverId, serverName, serverHost) {
  const userId = getServerOwner(serverId);
  if (!userId) return;

  const alertSettings = getAlertSettings(userId);
  if (!alertSettings || !alertSettings.enabled || !alertSettings.notify_on_down) return;

  // Only alert if there was a recent down alert
  const recentDownAlert = getRecentAlert(userId, serverId, 'server_down', 60);
  if (!recentDownAlert) return;

  // Check if we already sent an up alert
  const recentUpAlert = getRecentAlert(userId, serverId, 'server_up', 15);
  if (recentUpAlert) return;

  const timestamp = new Date().toISOString();
  const message = `Server ${serverName} (${serverHost}) is back UP`;

  let notified = false;

  // Send webhook
  if (alertSettings.webhook_url) {
    const payload = {
      type: 'server_alert',
      alertType: 'server_up',
      server: {
        id: serverId,
        name: serverName,
        host: serverHost
      },
      message,
      timestamp
    };

    const webhookSent = await sendWebhook(alertSettings.webhook_url, payload);
    if (webhookSent) notified = true;
  }

  // Send email
  if (alertSettings.email) {
    const emailSent = await sendEmail(alertSettings.email, `[RESOLVED] Server Up - ${serverName}`, message);
    if (emailSent) notified = true;
  }

  // Log alert
  addAlertHistory({
    userId,
    serverId,
    alertType: 'server_up',
    message,
    value: null,
    threshold: null,
    notified
  });

  console.log(`[ALERT] ${message}`);
}

// SSL Certificate expiry alert
export async function sendSSLAlert(cert, daysUntilExpiry) {
  const alertSettings = getAlertSettings(cert.user_id);
  if (!alertSettings || !alertSettings.enabled) return;

  // Check recent alert to avoid spam
  const recentAlert = getRecentAlert(cert.user_id, cert.id, 'ssl_expiry', 24 * 60); // 24 hours
  if (recentAlert) return;

  const timestamp = new Date().toISOString();
  const severity = daysUntilExpiry <= 7 ? 'CRITICAL' : daysUntilExpiry <= 14 ? 'WARNING' : 'INFO';
  const message = `SSL certificate for ${cert.domain} expires in ${daysUntilExpiry} days`;

  let notified = false;

  // Send webhook
  if (alertSettings.webhook_url) {
    const payload = {
      type: 'ssl_alert',
      alertType: 'ssl_expiry',
      certificate: {
        id: cert.id,
        domain: cert.domain,
        validTo: cert.valid_to
      },
      daysUntilExpiry,
      severity,
      message,
      timestamp
    };

    const webhookSent = await sendWebhook(alertSettings.webhook_url, payload);
    if (webhookSent) notified = true;
  }

  // Send email
  if (alertSettings.email) {
    const subject = `[${severity}] SSL Certificate Expiring - ${cert.domain}`;
    const emailSent = await sendEmail(alertSettings.email, subject, message);
    if (emailSent) notified = true;
  }

  // Log alert
  addAlertHistory({
    userId: cert.user_id,
    serverId: cert.id, // Using cert id as "server" for tracking
    alertType: 'ssl_expiry',
    message,
    value: daysUntilExpiry,
    threshold: cert.alert_days,
    notified
  });

  console.log(`[ALERT] ${message}`);
}

// Backup failure alert
export async function sendBackupAlert(job, status, errorMessage) {
  const alertSettings = getAlertSettings(job.user_id);
  if (!alertSettings || !alertSettings.enabled) return;

  const timestamp = new Date().toISOString();
  const message = `Backup job "${job.name}" failed: ${errorMessage}`;

  let notified = false;

  // Send webhook
  if (alertSettings.webhook_url) {
    const payload = {
      type: 'backup_alert',
      alertType: 'backup_failed',
      job: {
        id: job.id,
        name: job.name,
        type: job.type
      },
      status,
      error: errorMessage,
      message,
      timestamp
    };

    const webhookSent = await sendWebhook(alertSettings.webhook_url, payload);
    if (webhookSent) notified = true;
  }

  // Send email
  if (alertSettings.email) {
    const subject = `[ALERT] Backup Failed - ${job.name}`;
    const emailSent = await sendEmail(alertSettings.email, subject, message);
    if (emailSent) notified = true;
  }

  // Log alert
  addAlertHistory({
    userId: job.user_id,
    serverId: job.server_id,
    alertType: 'backup_failed',
    message,
    value: null,
    threshold: null,
    notified
  });

  console.log(`[ALERT] ${message}`);
}

// Security audit alert (for critical scores)
export async function sendSecurityAlert(server, auditResult) {
  const userId = getServerOwner(server.id);
  if (!userId) return;

  const alertSettings = getAlertSettings(userId);
  if (!alertSettings || !alertSettings.enabled) return;

  // Check recent alert
  const recentAlert = getRecentAlert(userId, server.id, 'security_critical', 6 * 60); // 6 hours
  if (recentAlert) return;

  const timestamp = new Date().toISOString();
  const message = `Security audit for ${server.name} (${server.host}) returned critical score: ${auditResult.score}/100`;

  let notified = false;

  // Send webhook
  if (alertSettings.webhook_url) {
    const payload = {
      type: 'security_alert',
      alertType: 'security_critical',
      server: {
        id: server.id,
        name: server.name,
        host: server.host
      },
      score: auditResult.score,
      findings: auditResult.findings.filter(f => f.severity === 'high'),
      message,
      timestamp
    };

    const webhookSent = await sendWebhook(alertSettings.webhook_url, payload);
    if (webhookSent) notified = true;
  }

  // Send email
  if (alertSettings.email) {
    const subject = `[CRITICAL] Security Alert - ${server.name}`;
    const emailBody = `${message}\n\nHigh Severity Findings:\n${auditResult.findings.filter(f => f.severity === 'high').map(f => `- ${f.message}`).join('\n')}`;
    const emailSent = await sendEmail(alertSettings.email, subject, emailBody);
    if (emailSent) notified = true;
  }

  // Log alert
  addAlertHistory({
    userId,
    serverId: server.id,
    alertType: 'security_critical',
    message,
    value: auditResult.score,
    threshold: 50,
    notified
  });

  console.log(`[ALERT] ${message}`);
}
