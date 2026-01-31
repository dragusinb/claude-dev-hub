import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { Client } from 'ssh2';
import {
  createDeploymentPipeline,
  getDeploymentPipelines,
  getDeploymentPipeline,
  updateDeploymentPipeline,
  deleteDeploymentPipeline,
  createDeploymentRun,
  updateDeploymentRun,
  getDeploymentRuns,
  getDeploymentRun,
  getRecentDeploymentRuns,
  getPipelineForExecution,
  addActivityLog
} from '../models/database.js';

const router = express.Router();

// GET /api/deployments/pipelines - List all pipelines
router.get('/pipelines', (req, res) => {
  try {
    const pipelines = getDeploymentPipelines(req.user.id);
    res.json({ pipelines });
  } catch (err) {
    console.error('Error fetching pipelines:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/deployments/pipelines/:id - Get pipeline by ID
router.get('/pipelines/:id', (req, res) => {
  try {
    const pipeline = getDeploymentPipeline(req.params.id, req.user.id);
    if (!pipeline) {
      return res.status(404).json({ error: 'Pipeline not found' });
    }
    res.json(pipeline);
  } catch (err) {
    console.error('Error fetching pipeline:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/deployments/pipelines - Create new pipeline
router.post('/pipelines', (req, res) => {
  try {
    const { name, serverId, projectId, deployScript, preDeployScript, postDeployScript, rollbackScript, notifyOnSuccess, notifyOnFailure } = req.body;

    if (!name || !serverId || !deployScript) {
      return res.status(400).json({ error: 'Name, server, and deploy script are required' });
    }

    const pipeline = {
      id: uuidv4(),
      userId: req.user.id,
      name,
      serverId,
      projectId: projectId || null,
      deployScript,
      preDeployScript: preDeployScript || null,
      postDeployScript: postDeployScript || null,
      rollbackScript: rollbackScript || null,
      notifyOnSuccess: notifyOnSuccess || false,
      notifyOnFailure: notifyOnFailure !== false
    };

    createDeploymentPipeline(pipeline);

    addActivityLog({
      userId: req.user.id,
      action: 'create_pipeline',
      entityType: 'pipeline',
      entityId: pipeline.id,
      details: `Created deployment pipeline: ${name}`
    });

    res.status(201).json({ id: pipeline.id, message: 'Pipeline created successfully' });
  } catch (err) {
    console.error('Error creating pipeline:', err);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/deployments/pipelines/:id - Update pipeline
router.patch('/pipelines/:id', (req, res) => {
  try {
    const pipeline = getDeploymentPipeline(req.params.id, req.user.id);
    if (!pipeline) {
      return res.status(404).json({ error: 'Pipeline not found' });
    }

    const updates = {};
    const allowedFields = ['name', 'server_id', 'project_id', 'enabled', 'pre_deploy_script',
      'deploy_script', 'post_deploy_script', 'rollback_script', 'notify_on_success', 'notify_on_failure'];

    for (const field of allowedFields) {
      const camelCase = field.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
      if (req.body[camelCase] !== undefined) {
        updates[field] = req.body[camelCase];
      }
    }

    updateDeploymentPipeline(req.params.id, req.user.id, updates);

    addActivityLog({
      userId: req.user.id,
      action: 'update_pipeline',
      entityType: 'pipeline',
      entityId: req.params.id,
      details: `Updated deployment pipeline: ${pipeline.name}`
    });

    res.json({ message: 'Pipeline updated successfully' });
  } catch (err) {
    console.error('Error updating pipeline:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/deployments/pipelines/:id - Delete pipeline
router.delete('/pipelines/:id', (req, res) => {
  try {
    const pipeline = getDeploymentPipeline(req.params.id, req.user.id);
    if (!pipeline) {
      return res.status(404).json({ error: 'Pipeline not found' });
    }

    deleteDeploymentPipeline(req.params.id, req.user.id);

    addActivityLog({
      userId: req.user.id,
      action: 'delete_pipeline',
      entityType: 'pipeline',
      entityId: req.params.id,
      details: `Deleted deployment pipeline: ${pipeline.name}`
    });

    res.json({ message: 'Pipeline deleted successfully' });
  } catch (err) {
    console.error('Error deleting pipeline:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/deployments/pipelines/:id/run - Trigger deployment
router.post('/pipelines/:id/run', async (req, res) => {
  try {
    const pipeline = getPipelineForExecution(req.params.id);
    if (!pipeline) {
      return res.status(404).json({ error: 'Pipeline not found' });
    }

    if (!pipeline.enabled) {
      return res.status(400).json({ error: 'Pipeline is disabled' });
    }

    // Create deployment run
    const runId = createDeploymentRun({
      pipelineId: pipeline.id,
      userId: req.user.id,
      triggeredBy: req.body.triggeredBy || 'manual'
    });

    // Execute deployment in background
    executeDeployment(pipeline, runId, req.user.id);

    addActivityLog({
      userId: req.user.id,
      action: 'trigger_deployment',
      entityType: 'deployment_run',
      entityId: runId.toString(),
      details: `Triggered deployment for pipeline: ${pipeline.name}`
    });

    res.json({ runId, message: 'Deployment started' });
  } catch (err) {
    console.error('Error triggering deployment:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/deployments/pipelines/:id/runs - Get runs for a pipeline
router.get('/pipelines/:id/runs', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const runs = getDeploymentRuns(req.params.id, limit);
    res.json({ runs });
  } catch (err) {
    console.error('Error fetching deployment runs:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/deployments/runs - Get recent runs across all pipelines
router.get('/runs', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const runs = getRecentDeploymentRuns(req.user.id, limit);
    res.json({ runs });
  } catch (err) {
    console.error('Error fetching recent runs:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/deployments/runs/:id - Get single run details
router.get('/runs/:id', (req, res) => {
  try {
    const run = getDeploymentRun(parseInt(req.params.id));
    if (!run) {
      return res.status(404).json({ error: 'Deployment run not found' });
    }
    res.json(run);
  } catch (err) {
    console.error('Error fetching deployment run:', err);
    res.status(500).json({ error: err.message });
  }
});

// Execute deployment via SSH
async function executeDeployment(pipeline, runId, userId) {
  const startTime = Date.now();
  let preDeployOutput = '';
  let deployOutput = '';
  let postDeployOutput = '';
  let errorMessage = null;
  let status = 'success';

  try {
    // Execute pre-deploy script if exists
    if (pipeline.pre_deploy_script) {
      try {
        preDeployOutput = await executeSSHCommand(pipeline, pipeline.pre_deploy_script);
      } catch (err) {
        preDeployOutput = err.message;
        throw new Error(`Pre-deploy failed: ${err.message}`);
      }
    }

    // Execute main deploy script
    try {
      deployOutput = await executeSSHCommand(pipeline, pipeline.deploy_script);
    } catch (err) {
      deployOutput = err.message;
      throw new Error(`Deploy failed: ${err.message}`);
    }

    // Execute post-deploy script if exists
    if (pipeline.post_deploy_script) {
      try {
        postDeployOutput = await executeSSHCommand(pipeline, pipeline.post_deploy_script);
      } catch (err) {
        postDeployOutput = err.message;
        throw new Error(`Post-deploy failed: ${err.message}`);
      }
    }
  } catch (err) {
    status = 'failed';
    errorMessage = err.message;
    console.error(`Deployment ${runId} failed:`, err.message);
  }

  const finishedAt = new Date().toISOString();
  const durationSeconds = Math.round((Date.now() - startTime) / 1000);

  // Update the run with results
  updateDeploymentRun(runId, {
    status,
    finished_at: finishedAt,
    duration_seconds: durationSeconds,
    pre_deploy_output: preDeployOutput,
    deploy_output: deployOutput,
    post_deploy_output: postDeployOutput,
    error_message: errorMessage
  });

  // TODO: Send notification if configured
  if (status === 'success' && pipeline.notify_on_success) {
    // sendDeploymentNotification(pipeline, run, 'success');
  } else if (status === 'failed' && pipeline.notify_on_failure) {
    // sendDeploymentNotification(pipeline, run, 'failure');
  }
}

// Execute SSH command
function executeSSHCommand(pipeline, command, timeout = 300000) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    const timer = setTimeout(() => {
      conn.end();
      reject(new Error('Command timeout'));
    }, timeout);

    conn.on('ready', () => {
      conn.exec(command, (err, stream) => {
        if (err) {
          clearTimeout(timer);
          conn.end();
          reject(err);
          return;
        }

        let output = '';
        let errorOutput = '';

        stream.on('data', (data) => { output += data.toString(); });
        stream.stderr.on('data', (data) => { errorOutput += data.toString(); });

        stream.on('close', (code) => {
          clearTimeout(timer);
          conn.end();
          if (code !== 0 && errorOutput) {
            reject(new Error(errorOutput || `Command exited with code ${code}`));
          } else {
            resolve(output + (errorOutput ? `\n[stderr]\n${errorOutput}` : ''));
          }
        });
      });
    });

    conn.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    const config = {
      host: pipeline.host,
      port: pipeline.port || 22,
      username: pipeline.username
    };

    if (pipeline.auth_type === 'key' && pipeline.private_key) {
      config.privateKey = pipeline.private_key;
    } else {
      config.password = pipeline.password;
    }

    conn.connect(config);
  });
}

export default router;
