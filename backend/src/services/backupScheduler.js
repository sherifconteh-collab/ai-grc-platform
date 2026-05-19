// @tier: community
// Scheduled database backup service. Spawns db-backup.js as a child process
// so the backup never blocks the Express event loop. Enable with BACKUP_ENABLED=true.
const { spawn } = require('child_process');
const path = require('path');
const { log } = require('../utils/logger');
const pool = require('../config/database');

let cronJob = null;

async function runBackup(trigger = 'scheduled', triggeredBy = null) {
  let logId = null;

  try {
    const { rows: [row] } = await pool.query(
      'INSERT INTO backup_logs (trigger, triggered_by) VALUES ($1, $2) RETURNING id',
      [trigger, triggeredBy]
    );
    logId = row.id;
  } catch (dbErr) {
    log('warn', 'backup.log.insert_failed', { error: dbErr.message });
  }

  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, '../../scripts/db-backup.js');
    const child = spawn(process.execPath, [scriptPath], {
      env: process.env,
      stdio: 'pipe'
    });

    const chunks = [];
    child.stdout.on('data', (chunk) => chunks.push(chunk));
    child.stderr.on('data', (chunk) => chunks.push(chunk));

    child.on('close', async (code) => {
      const output = Buffer.concat(chunks).toString().trim();
      if (code === 0) {
        log('info', 'backup.completed', { output });
        if (logId) {
          try {
            const fileMatch = output.match(/Backup created: (.+?) \(([\d.]+) MB\)/);
            const s3Match = output.match(/Uploaded to s3:\/\/[^/]+\/(.+)/);
            await pool.query(
              `UPDATE backup_logs SET status='success', completed_at=NOW(),
               backup_file=$1, file_size_bytes=$2, s3_key=$3, exit_code=0, output_log=$4
               WHERE id=$5`,
              [
                fileMatch?.[1] ?? null,
                fileMatch ? Math.round(parseFloat(fileMatch[2]) * 1024 * 1024) : null,
                s3Match?.[1] ?? null,
                output.slice(0, 4000),
                logId
              ]
            );
          } catch (dbErr) {
            log('warn', 'backup.log.update_failed', { error: dbErr.message });
          }
        }
        resolve();
      } else {
        log('error', 'backup.failed', { exitCode: code, output });
        if (logId) {
          try {
            await pool.query(
              `UPDATE backup_logs SET status='failed', completed_at=NOW(),
               exit_code=$1, error_message=$2, output_log=$3 WHERE id=$4`,
              [code, `Backup process exited with code ${code}`, output.slice(0, 4000), logId]
            );
          } catch (dbErr) {
            log('warn', 'backup.log.update_failed', { error: dbErr.message });
          }
        }
        reject(new Error(`Backup process exited with code ${code}`));
      }
    });

    child.on('error', async (err) => {
      log('error', 'backup.spawn_error', { error: err.message });
      if (logId) {
        try {
          await pool.query(
            `UPDATE backup_logs SET status='failed', completed_at=NOW(),
             exit_code=-1, error_message=$1 WHERE id=$2`,
            [err.message, logId]
          );
        } catch (dbErr) {
          log('warn', 'backup.log.update_failed', { error: dbErr.message });
        }
      }
      reject(err);
    });
  });
}

function start() {
  const cron = require('node-cron');
  const schedule = process.env.BACKUP_CRON_SCHEDULE || '0 2 * * *';

  if (!cron.validate(schedule)) {
    log('warn', 'backup.scheduler.invalid_schedule', {
      schedule,
      message: 'BACKUP_CRON_SCHEDULE is not a valid cron expression; falling back to 0 2 * * *'
    });
  }

  cronJob = cron.schedule(schedule, () => {
    log('info', 'backup.scheduled.started', { schedule });
    runBackup('scheduled', null).catch((err) => {
      log('error', 'backup.scheduled.failed', { error: err.message });
    });
  });

  log('info', 'backup.scheduler.started', { schedule });
}

function stop() {
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
    log('info', 'backup.scheduler.stopped');
  }
}

module.exports = { start, stop, runBackup };
