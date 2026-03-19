import { spawn, type ChildProcess } from 'child_process';
import { createInterface, type Interface } from 'readline';
import { homedir } from 'os';
import { mkdirSync, existsSync, readdirSync, readFileSync, cpSync, writeFileSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const PI_BIN = process.env.PI_BIN || 'pi';
const WORKSPACE_ROOT = process.env.PI_WORKSPACE_ROOT || join(homedir(), 'pi-workspaces');
const IDLE_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
const MAX_CONCURRENT = 2;

// Skill templates bundled with the API
const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILL_TEMPLATES_DIR = join(__dirname, '..', 'skills');
const DEFAULT_SKILLS = ['write-email', 'summarize', 'brainstorm'];

type Listener = (msg: Record<string, unknown>) => void;

// ── Workspace & Skills ──

function ensureWorkspace(userId: string): string {
  const workDir = join(WORKSPACE_ROOT, userId);
  mkdirSync(join(workDir, '.pi', 'skills'), { recursive: true });

  // Auto-install default skills
  for (const skill of DEFAULT_SKILLS) {
    const destDir = join(workDir, '.pi', 'skills', skill);
    if (!existsSync(destDir)) {
      installSkillFromTemplate(workDir, skill);
    }
  }

  // Write README if missing
  const readmePath = join(workDir, 'README.md');
  if (!existsSync(readmePath)) {
    writeFileSync(readmePath, `# OpenClaw Workspace

This is your personal workspace. The OpenClaw agent can read and write files here.

## Notes
- Your skills are in \`.pi/skills/\`
- You can create new skills by adding a directory with a \`SKILL.md\` file
- This file is yours to edit — it won't be overwritten.
`);
  }

  return workDir;
}

function installSkillFromTemplate(workDir: string, skillName: string): boolean {
  const templateDir = join(SKILL_TEMPLATES_DIR, skillName);
  if (!existsSync(templateDir)) return false;
  const destDir = join(workDir, '.pi', 'skills', skillName);
  mkdirSync(destDir, { recursive: true });
  cpSync(templateDir, destDir, { recursive: true });
  return true;
}

function scanSkills(workDir: string): { name: string; description: string }[] {
  const skillsDir = join(workDir, '.pi', 'skills');
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

  parts.push(`You are OpenClaw, a helpful assistant inside the Minai platform. You can read, write, and edit files, run commands, and help with all kinds of tasks.

Your workspace is: ${workDir}
All your files are here. Your current working directory is already set to this path.`);

  // Skills
  const skills = scanSkills(workDir);
  if (skills.length > 0) {
    const skillList = skills.map((s) => `- **${s.name}**: ${s.description}`).join('\n');
    parts.push(`Your skills:\n${skillList}\n\nSkill docs: \`.pi/skills/<name>/SKILL.md\` (relative to your workspace). Read a skill's SKILL.md to learn how to use it.`);
  }

  parts.push(`## Creating new skills

When the user asks you to create a skill, make a folder at \`.pi/skills/<skill-name>/\` with a \`SKILL.md\` file inside it. The SKILL.md should explain what the skill does and give examples of how to use it.

Skills are shortcuts for things the user does often. You write the code and logic behind them so the user doesn't have to. A skill can include scripts, templates, config files — whatever it needs to work. Good examples:
- A "weekly-report" skill with a script that pulls data and formats it how they like
- A "meeting-notes" skill that turns rough notes into clean action items
- A "social-post" skill that drafts posts in their brand voice and preferred length
- A "translate" skill with a script that calls a translation API between specific languages
- A "resize-images" skill with a bash script that batch-resizes photos in a folder

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
  const workDir = join(WORKSPACE_ROOT, userId);
  const skillsDir = join(workDir, '.pi', 'skills');
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
  const workDir = join(WORKSPACE_ROOT, userId);
  const skillDir = join(workDir, '.pi', 'skills', name);

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
      const fullPath = join(skillDir, filePath);
      mkdirSync(dirname(fullPath), { recursive: true });
      writeFileSync(fullPath, content);
    }
  }

  return true;
}

export function removeSkill(userId: string, skillName: string): boolean {
  if (DEFAULT_SKILLS.includes(skillName)) return false;
  const skillDir = join(WORKSPACE_ROOT, userId, '.pi', 'skills', skillName);
  if (!existsSync(skillDir)) return false;
  rmSync(skillDir, { recursive: true, force: true });
  return true;
}

// ── RPC Process ──

export class PiRpcProcess {
  sessionId: string;
  process: ChildProcess | null = null;
  rl: Interface | null = null;
  listeners = new Set<Listener>();
  ready = false;
  lastActivity = Date.now();
  private idleTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
  }

  start(cwd: string, systemPrompt?: string) {
    const args = ['--mode', 'rpc', '--cwd', cwd];
    if (systemPrompt) {
      args.push('--system-prompt', systemPrompt);
    }

    this.process = spawn(PI_BIN, args, {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        HOME: homedir(),
      },
    });

    this.rl = createInterface({ input: this.process.stdout! });
    this.rl.on('line', (line) => {
      try {
        const msg = JSON.parse(line);
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

    const rpc = new PiRpcProcess(sessionId);
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
      })),
    };
  }
}

export const sessionManager = new SessionManager();
