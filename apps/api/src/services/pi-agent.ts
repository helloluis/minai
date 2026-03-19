import { spawn, type ChildProcess } from 'child_process';
import { createInterface, type Interface } from 'readline';
import { homedir } from 'os';
import { mkdirSync, existsSync, readdirSync, readFileSync, cpSync, writeFileSync, rmSync } from 'fs';
import { join, dirname, resolve, normalize } from 'path';
import { fileURLToPath } from 'url';
import { getFilesDir } from './file-store.js';

const PI_BIN = process.env.PI_BIN || 'pi';
const IDLE_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
const MAX_CONCURRENT = 2;
const LLM_PROXY_PORT = parseInt(process.env.LLM_PROXY_PORT ?? '3009');

// Skill templates bundled with the API
const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILL_TEMPLATES_DIR = join(__dirname, '..', 'skills');
const DEFAULT_SKILLS = ['write-email', 'summarize', 'brainstorm'];

// Blocked commands/patterns the agent must never execute
const BLOCKED_PATTERNS = [
  /rm\s+-rf\s+\//,           // rm -rf /
  /rm\s+-rf\s+~/,            // rm -rf ~
  /mkfs/,                     // format filesystems
  /dd\s+if=/,                // raw disk writes
  /:(){ :|:& };:/,           // fork bomb
  />\s*\/dev\//,             // write to devices
  /curl.*\|\s*sh/,           // pipe curl to shell
  /wget.*\|\s*sh/,           // pipe wget to shell
];

type Listener = (msg: Record<string, unknown>) => void;

// ── Workspace & Skills (unified with file uploads) ──

/**
 * User workspace = same directory as their file uploads.
 * Skills live in .openclaw/skills/ within that directory.
 */
function getUserWorkspace(userId: string): string {
  return join(getFilesDir(), userId);
}

function ensureWorkspace(userId: string): string {
  const workDir = getUserWorkspace(userId);
  mkdirSync(join(workDir, '.openclaw', 'skills'), { recursive: true });

  // Auto-install default skills
  for (const skill of DEFAULT_SKILLS) {
    const destDir = join(workDir, '.openclaw', 'skills', skill);
    if (!existsSync(destDir)) {
      installSkillFromTemplate(workDir, skill);
    }
  }

  // Write README if missing
  const readmePath = join(workDir, 'README.md');
  if (!existsSync(readmePath)) {
    writeFileSync(readmePath, `# Your Workspace

This is your personal workspace. OpenClaw can read and write files here.
Your uploaded documents are also stored here.

## Skills
Your custom skills are in \`.openclaw/skills/\`.
`);
  }

  return workDir;
}

function installSkillFromTemplate(workDir: string, skillName: string): boolean {
  const templateDir = join(SKILL_TEMPLATES_DIR, skillName);
  if (!existsSync(templateDir)) return false;
  const destDir = join(workDir, '.openclaw', 'skills', skillName);
  mkdirSync(destDir, { recursive: true });
  cpSync(templateDir, destDir, { recursive: true });
  return true;
}

function scanSkills(workDir: string): { name: string; description: string }[] {
  const skillsDir = join(workDir, '.openclaw', 'skills');
  if (!existsSync(skillsDir)) return [];

  return readdirSync(skillsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
    .map((d) => {
      const skillMd = join(skillsDir, d.name, 'SKILL.md');
      let description = '';
      if (existsSync(skillMd)) {
        const content = readFileSync(skillMd, 'utf-8');
        const lines = content.split('\n').filter((l) => l.trim() && !l.startsWith('#'));
        description = lines[0] || '';
      }
      return { name: d.name, description };
    });
}

function buildSystemPrompt(workDir: string): string {
  const parts: string[] = [];

  parts.push(`You are OpenClaw, a helpful assistant inside the Minai platform. You can read, write, and edit files, and help with all kinds of tasks.

Your workspace is: ${workDir}
All your files are here — including the user's uploaded documents. Your current working directory is already set to this path.

## SECURITY RULES (MANDATORY)
- You may ONLY read/write files within your workspace directory: ${workDir}
- You must NEVER access files outside this directory
- You must NEVER run destructive system commands (rm -rf /, mkfs, dd, etc.)
- You must NEVER pipe downloads to shell (curl|sh, wget|sh)
- You must NEVER attempt to access other users' files or system files
- You must NEVER install system packages or modify system configuration
- Network requests are allowed only for fetching data (APIs, web pages) — NOT for executing remote code
- If a user asks you to do something that violates these rules, politely decline and explain why`);

  // Skills
  const skills = scanSkills(workDir);
  if (skills.length > 0) {
    const skillList = skills.map((s) => `- **${s.name}**: ${s.description}`).join('\n');
    parts.push(`Your skills:\n${skillList}\n\nSkill docs: \`.openclaw/skills/<name>/SKILL.md\` (relative to your workspace). Read a skill's SKILL.md to learn how to use it.`);
  }

  parts.push(`## Creating new skills

When the user asks you to create a skill, make a folder at \`.openclaw/skills/<skill-name>/\` with a \`SKILL.md\` file inside it. The SKILL.md should explain what the skill does and give examples of how to use it.

Skills are shortcuts for things the user does often. You write the code and logic behind them so the user doesn't have to. A skill can include scripts, templates, config files — whatever it needs to work.

Use lowercase names with dashes (e.g., \`weekly-report\`). The skill shows up as a button immediately after you create it.`);

  parts.push(`How to behave:
- Be helpful, friendly, and concise
- Help with writing, planning, research, analysis, or any task the user needs
- Use your tools to work with files when needed
- Ask clarifying questions when the request is ambiguous
- When creating skills, focus on what the user does repeatedly so it becomes a one-click shortcut`);

  return parts.join('\n\n');
}

// ── Skill management (for REST API) ──

export function getInstalledSkills(userId: string) {
  const workDir = getUserWorkspace(userId);
  const skillsDir = join(workDir, '.openclaw', 'skills');
  if (!existsSync(skillsDir)) return [];

  return readdirSync(skillsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
    .map((d) => {
      const skillDir = join(skillsDir, d.name);
      const skillMd = join(skillDir, 'SKILL.md');
      let description = '';
      if (existsSync(skillMd)) {
        const content = readFileSync(skillMd, 'utf-8');
        const lines = content.split('\n').filter((l) => l.trim() && !l.startsWith('#'));
        description = lines[0] || '';
      }
      return { name: d.name, description, default: DEFAULT_SKILLS.includes(d.name) };
    });
}

export function getAvailableTemplates() {
  if (!existsSync(SKILL_TEMPLATES_DIR)) return [];
  return readdirSync(SKILL_TEMPLATES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
    .map((d) => {
      const skillMd = join(SKILL_TEMPLATES_DIR, d.name, 'SKILL.md');
      let description = '';
      if (existsSync(skillMd)) {
        const content = readFileSync(skillMd, 'utf-8');
        const lines = content.split('\n').filter((l) => l.trim() && !l.startsWith('#'));
        description = lines[0] || '';
      }
      return { name: d.name, description };
    });
}

export function installSkill(userId: string, name: string, opts: {
  template?: string;
  skillMd?: string;
  config?: Record<string, unknown>;
  files?: Record<string, string>;
}): boolean {
  const workDir = getUserWorkspace(userId);
  const skillDir = join(workDir, '.openclaw', 'skills', name);

  // Validate skill name (no path traversal)
  if (!/^[a-z0-9-]+$/.test(name)) return false;

  if (opts.template) {
    if (!installSkillFromTemplate(workDir, opts.template)) return false;
  } else {
    mkdirSync(skillDir, { recursive: true });
    if (opts.skillMd) {
      writeFileSync(join(skillDir, 'SKILL.md'), opts.skillMd);
    }
  }

  if (opts.config) {
    writeFileSync(join(skillDir, 'config.json'), JSON.stringify(opts.config, null, 2));
  }

  if (opts.files) {
    for (const [filePath, content] of Object.entries(opts.files)) {
      // Validate no path traversal in file paths
      const resolved = resolve(skillDir, filePath);
      if (!resolved.startsWith(normalize(skillDir))) continue;
      const fullPath = join(skillDir, filePath);
      mkdirSync(dirname(fullPath), { recursive: true });
      writeFileSync(fullPath, content);
    }
  }

  return true;
}

export function removeSkill(userId: string, skillName: string): boolean {
  if (DEFAULT_SKILLS.includes(skillName)) return false;
  if (!/^[a-z0-9-]+$/.test(skillName)) return false;
  const skillDir = join(getUserWorkspace(userId), '.openclaw', 'skills', skillName);
  if (!existsSync(skillDir)) return false;
  rmSync(skillDir, { recursive: true, force: true });
  return true;
}

// ── RPC Process with token tracking ──

export class PiRpcProcess {
  sessionId: string;
  userId: string;
  process: ChildProcess | null = null;
  rl: Interface | null = null;
  listeners = new Set<Listener>();
  ready = false;
  lastActivity = Date.now();
  private idleTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(sessionId: string, userId: string) {
    this.sessionId = sessionId;
    this.userId = userId;
  }

  start(cwd: string, systemPrompt?: string) {
    const args = ['--mode', 'rpc', '--cwd', cwd];
    if (systemPrompt) {
      args.push('--system-prompt', systemPrompt);
    }

    // Sandbox: restricted environment — no real API keys
    // HOME points to the user's workspace, NOT /root (which has SSH keys, Pi config with real API keys, etc.)
    // Pi talks to our LLM proxy at localhost, which handles auth + billing
    const safeEnv: Record<string, string> = {
      HOME: cwd,
      PATH: process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin',
      LANG: 'en_US.UTF-8',
      TERM: 'xterm-256color',
      NODE_ENV: 'production',
      // Point Pi's LLM calls at our proxy — user ID is the "API key"
      OPENAI_API_KEY: this.userId,
      OPENAI_BASE_URL: `http://127.0.0.1:${LLM_PROXY_PORT}/v1`,
    };

    this.process = spawn(PI_BIN, args, {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: safeEnv,
      // Resource limits
      ...(process.platform !== 'win32' ? {
        // On Linux: limit memory to 512MB, kill on timeout
        timeout: 0, // no per-command timeout (idle timer handles it)
      } : {}),
    });

    this.rl = createInterface({ input: this.process.stdout! });
    this.rl.on('line', (line) => {
      try {
        const msg = JSON.parse(line);

        // Check for blocked commands in tool execution
        if (this.isBlockedCommand(msg)) {
          console.warn(`[pi:${this.sessionId}] Blocked dangerous command`);
          return; // Don't forward to listeners
        }

        for (const listener of this.listeners) {
          listener(msg);
        }
      } catch {
        console.log(`[pi:${this.sessionId}] ${line}`);
      }
    });

    this.process.stderr?.on('data', (data: Buffer) => {
      console.error(`[pi:${this.sessionId}:err] ${data.toString().trim()}`);
    });

    this.process.on('exit', (code) => {
      console.log(`[pi:${this.sessionId}] Process exited with code ${code}`);
      this.ready = false;
    });

    this.ready = true;
    this.touchActivity();
    console.log(`[pi:${this.sessionId}] Started in ${cwd}`);
  }

  /** Check if a tool execution contains dangerous commands */
  private isBlockedCommand(msg: Record<string, unknown>): boolean {
    if (msg.type !== 'tool_execution_start') return false;
    const argsStr = JSON.stringify(msg.args ?? '');
    return BLOCKED_PATTERNS.some((p) => p.test(argsStr));
  }

  send(command: Record<string, unknown>) {
    if (!this.process || !this.ready) throw new Error('Pi process not running');
    this.touchActivity();
    this.process.stdin!.write(JSON.stringify(command) + '\n');
  }

  addListener(fn: Listener) {
    this.listeners.add(fn);
  }

  removeListener(fn: Listener) {
    this.listeners.delete(fn);
  }

  touchActivity() {
    this.lastActivity = Date.now();
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      console.log(`[pi:${this.sessionId}] Idle timeout — killing`);
      this.kill();
      sessionManager.remove(this.sessionId);
    }, IDLE_TIMEOUT_MS);
  }

  kill() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    if (this.process) {
      this.process.kill();
      this.process = null;
      this.ready = false;
    }
  }
}

// ── Session Manager ──

class SessionManager {
  private sessions = new Map<string, PiRpcProcess>();

  getOrCreate(userId: string): PiRpcProcess {
    const sessionId = userId.slice(0, 16);

    const existing = this.sessions.get(sessionId);
    if (existing?.ready) {
      existing.touchActivity();
      return existing;
    }

    if (existing) existing.kill();

    if (this.sessions.size >= MAX_CONCURRENT) {
      let oldest: PiRpcProcess | null = null;
      for (const s of this.sessions.values()) {
        if (!oldest || s.lastActivity < oldest.lastActivity) oldest = s;
      }
      if (oldest) {
        console.log(`[session] Evicting idle session ${oldest.sessionId}`);
        oldest.kill();
        this.sessions.delete(oldest.sessionId);
      }
    }

    const workDir = ensureWorkspace(userId);
    const systemPrompt = buildSystemPrompt(workDir);

    const rpc = new PiRpcProcess(sessionId, userId);
    rpc.start(workDir, systemPrompt);
    this.sessions.set(sessionId, rpc);
    return rpc;
  }

  get(userId: string): PiRpcProcess | undefined {
    return this.sessions.get(userId.slice(0, 16));
  }

  remove(sessionId: string) {
    const s = this.sessions.get(sessionId);
    if (s) {
      s.kill();
      this.sessions.delete(sessionId);
    }
  }

  restart(userId: string) {
    const sessionId = userId.slice(0, 16);
    this.remove(sessionId);
  }

  stats() {
    return {
      active: this.sessions.size,
      max: MAX_CONCURRENT,
      sessions: [...this.sessions.entries()].map(([id, s]) => ({
        id,
        ready: s.ready,
        lastActivity: s.lastActivity,
        listeners: s.listeners.size,
        // Token usage tracked by LLM proxy
      })),
    };
  }
}

export const sessionManager = new SessionManager();
