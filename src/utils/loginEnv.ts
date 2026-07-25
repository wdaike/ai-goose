import { delimiter } from 'node:path';
import { shellEnv } from 'shell-env';
import log from './logger';

const RESOLVE_TIMEOUT_MS = 5000;

/**
 * A GUI-launched macOS or Linux app inherits launchd's bare environment —
 * `PATH` is `/usr/bin:/bin:/usr/sbin:/sbin` and none of the user's variables
 * exist — so `codex`, `uv` and provider API keys are all invisible. That is why
 * the app has only ever worked when started from `start-desktop.sh`.
 *
 * Reading the login shell's environment once at startup makes a double-clicked
 * app behave like one launched from a terminal. `PATH` is replaced outright
 * because the inherited value is present but wrong; every other variable only
 * fills a gap, so Electron's own environment always wins.
 *
 * Never fatal: a shell that is slow, interactive or misconfigured leaves the
 * process with the environment it already had.
 */
export async function adoptLoginEnv(): Promise<void> {
  if (process.platform === 'win32') return;

  let resolved: Readonly<Record<string, string>>;
  try {
    resolved = await Promise.race([
      shellEnv(),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`timed out after ${RESOLVE_TIMEOUT_MS}ms`)),
          RESOLVE_TIMEOUT_MS
        )
      ),
    ]);
  } catch (error) {
    log.error(`Could not read the login shell environment: ${String(error)}`);
    return;
  }

  let adopted = 0;
  for (const [key, value] of Object.entries(resolved)) {
    if (key === 'PATH' || process.env[key] !== undefined) continue;
    process.env[key] = value;
    adopted += 1;
  }

  process.env.PATH = mergePath(resolved.PATH ?? '', process.env.PATH ?? '');
  log.info(`Adopted ${adopted} variables from the login shell environment`);
}

/**
 * Login entries first, then whatever the inherited PATH added on top of them.
 * A merge rather than a replace because a dev launch inherits entries the login
 * shell never had — `node_modules/.bin` among them — and those must survive.
 */
function mergePath(loginPath: string, inheritedPath: string): string {
  const seen = new Set<string>();
  return [...loginPath.split(delimiter), ...inheritedPath.split(delimiter)]
    .filter((entry) => entry !== '' && !seen.has(entry) && seen.add(entry) !== undefined)
    .join(delimiter);
}
