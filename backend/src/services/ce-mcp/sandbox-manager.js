/**
 * Sandbox Manager for CE-MCP
 * Manages containerized execution environment for code execution
 * Implements defense against MAESTRO attack classes #14, #15, #16
 */

const { spawn } = require('child_process');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs').promises;

class SandboxManager {
  constructor(config = {}) {
    this.config = {
      type: config.type || 'docker',
      image: config.image || 'controlweave/ce-mcp-sandbox:latest',
      cpuLimit: parseFloat(config.cpuLimit || '0.5'),
      memoryLimit: config.memoryLimit || '256m',
      diskLimit: config.diskLimit || '100m',
      timeLimit: parseInt(config.timeLimit || '30'),
      networkEnabled: config.networkEnabled === true,
      allowSubprocess: config.allowSubprocess === true,
      writablePaths: config.writablePaths || '/tmp',
      tmpDir: config.tmpDir || '/tmp/ce-mcp-sandbox',
      ...config
    };

    this.activeSandboxes = new Map();
  }

  /**
   * Execute code in isolated sandbox
   * @param {Object} params - Execution parameters
   * @returns {Object} Execution result
   */
  async execute({ code, language, userId, organizationId }) {
    const sandboxId = this.generateSandboxId();
    const startTime = Date.now();

    try {
      // Create sandbox environment
      const sandbox = await this.createSandbox(sandboxId, code, language);
      this.activeSandboxes.set(sandboxId, sandbox);

      // Execute code with timeout
      const result = await Promise.race([
        this.runCode(sandbox, code, language),
        this.timeout(this.config.timeLimit * 1000, sandboxId)
      ]);

      // Calculate execution time
      const executionTime = Date.now() - startTime;

      return {
        success: true,
        sandboxId,
        output: result.stdout,
        errors: result.stderr,
        exitCode: result.exitCode,
        executionTime,
        resourceUsage: result.resourceUsage
      };

    } catch (error) {
      const executionTime = Date.now() - startTime;
      
      return {
        success: false,
        sandboxId,
        error: error.message,
        executionTime,
        exitCode: error.exitCode || 1
      };

    } finally {
      // Cleanup sandbox
      await this.destroySandbox(sandboxId);
      this.activeSandboxes.delete(sandboxId);
    }
  }

  /**
   * Create isolated sandbox container
   */
  async createSandbox(sandboxId, code, language) {
    if (this.config.type === 'docker') {
      return await this.createDockerSandbox(sandboxId, code, language);
    } else {
      throw new Error(`Unsupported sandbox type: ${this.config.type}`);
    }
  }

  /**
   * Create Docker-based sandbox
   */
  async createDockerSandbox(sandboxId, code, language) {
    // Create temporary directory for this sandbox
    const sandboxDir = path.join(this.config.tmpDir, sandboxId);
    await fs.mkdir(sandboxDir, { recursive: true });

    // Write code to file
    const scriptExt = language === 'python' ? 'py' : 'js';
    const scriptPath = path.join(sandboxDir, `script.${scriptExt}`);
    await fs.writeFile(scriptPath, code, 'utf8');

    return {
      id: sandboxId,
      dir: sandboxDir,
      scriptPath,
      language,
      containerId: null
    };
  }

  /**
   * Run code in sandbox
   */
  async runCode(sandbox, code, language) {
    if (this.config.type === 'docker') {
      return await this.runInDocker(sandbox, language);
    }
    throw new Error(`Unsupported sandbox type: ${this.config.type}`);
  }

  /**
   * Execute code in Docker container
   */
  async runInDocker(sandbox, language) {
    const command = language === 'python' ? 'python' : 'node';
    const scriptName = path.basename(sandbox.scriptPath);

    // Docker run arguments with security restrictions
    const dockerArgs = [
      'run',
      '--rm',                          // Remove container after execution
      '--read-only',                   // Read-only root filesystem
      `--tmpfs=/tmp:size=${this.config.diskLimit}`,  // Writable tmp with size limit
      '--network=none',                // No network access
      `--cpus=${this.config.cpuLimit}`,  // CPU limit
      `--memory=${this.config.memoryLimit}`,  // Memory limit
      '--pids-limit=1',                // Only 1 process allowed
      '--security-opt=no-new-privileges',  // Prevent privilege escalation
      '--cap-drop=ALL',                // Drop all capabilities
      '--user=10000:10000',            // Non-root user
      '-v', `${sandbox.dir}:/sandbox:ro`,  // Mount code as read-only
      '-w', '/sandbox',                // Set working directory
      this.config.image,
      command,
      scriptName
    ];

    return new Promise((resolve, reject) => {
      const docker = spawn('docker', dockerArgs);
      
      let stdout = '';
      let stderr = '';
      const startTime = Date.now();

      docker.stdout.on('data', (data) => {
        stdout += data.toString();
        // Prevent excessive output (DoS attack)
        if (stdout.length > 1024 * 100) { // 100KB limit
          docker.kill('SIGTERM');
          reject(new Error('Output size limit exceeded'));
        }
      });

      docker.stderr.on('data', (data) => {
        stderr += data.toString();
        if (stderr.length > 1024 * 50) { // 50KB limit
          docker.kill('SIGTERM');
          reject(new Error('Error output size limit exceeded'));
        }
      });

      docker.on('close', (exitCode) => {
        const executionTime = Date.now() - startTime;

        resolve({
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          exitCode,
          resourceUsage: {
            time: executionTime,
            // Note: Getting actual CPU/memory usage would require docker stats
            estimatedCpu: executionTime * 0.5,
            estimatedMemory: stdout.length + stderr.length
          }
        });
      });

      docker.on('error', (error) => {
        reject(new Error(`Docker execution failed: ${error.message}`));
      });

      // Store container reference
      sandbox.containerId = docker.pid;
    });
  }

  /**
   * Timeout promise
   */
  timeout(ms, sandboxId) {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Execution timeout after ${ms}ms (sandboxId: ${sandboxId})`));
      }, ms);
    });
  }

  /**
   * Destroy sandbox and cleanup
   */
  async destroySandbox(sandboxId) {
    try {
      const sandboxDir = path.join(this.config.tmpDir, sandboxId);
      
      // Remove temporary directory
      await fs.rm(sandboxDir, { recursive: true, force: true });

      // If container is still running, kill it
      const sandbox = this.activeSandboxes.get(sandboxId);
      if (sandbox && sandbox.containerId) {
        try {
          // Kill any remaining docker containers
          spawn('docker', ['kill', sandbox.containerId.toString()]);
        } catch (error) {
          // Ignore errors if container already stopped
        }
      }
    } catch (error) {
      console.error(`Failed to cleanup sandbox ${sandboxId}:`, error.message);
    }
  }

  /**
   * Generate unique sandbox ID
   */
  generateSandboxId() {
    return `sandbox_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  }

  /**
   * Get active sandboxes count
   */
  getActiveSandboxCount() {
    return this.activeSandboxes.size;
  }

  /**
   * Kill all active sandboxes (emergency cleanup)
   */
  async killAllSandboxes() {
    const promises = [];
    for (const [sandboxId] of this.activeSandboxes) {
      promises.push(this.destroySandbox(sandboxId));
    }
    await Promise.all(promises);
    this.activeSandboxes.clear();
  }

  /**
   * Check if Docker is available
   */
  async checkDockerAvailable() {
    return new Promise((resolve) => {
      const docker = spawn('docker', ['version']);
      docker.on('close', (exitCode) => {
        resolve(exitCode === 0);
      });
      docker.on('error', () => {
        resolve(false);
      });
    });
  }

  /**
   * Validate sandbox image exists
   */
  async validateSandboxImage() {
    return new Promise((resolve) => {
      const docker = spawn('docker', ['image', 'inspect', this.config.image]);
      docker.on('close', (exitCode) => {
        resolve(exitCode === 0);
      });
      docker.on('error', () => {
        resolve(false);
      });
    });
  }
}

module.exports = SandboxManager;
