import { spawn } from 'child_process';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { Logger } from './codexProcess';

/** Deliberately separate from the Codex desktop app's `~/.cache/codex-runtimes`. */
const RUNTIME_ROOT = path.join(os.homedir(), '.cache', 'icodex-runtimes');
const VENV_DIR = path.join(RUNTIME_ROOT, 'venv');
const UV_DIR = path.join(RUNTIME_ROOT, 'uv');
const PYTHON_INSTALL_DIR = path.join(RUNTIME_ROOT, 'python');
const MARKER = path.join(RUNTIME_ROOT, '.provisioned');

const PYTHON_VERSION = '3.12';
const UV_VERSION = '0.11.32';

/**
 * Pinned so a provisioned runtime is reproducible and the marker hash changes
 * whenever this list does. Deliberately excludes pandas/numpy (~120MB) and any
 * package needing native poppler — `pypdfium2` renders PDF pages to images on
 * its own, which is what the pdf skill's page-render step actually needs.
 */
const PACKAGES = [
  'reportlab==4.4.9',
  'pypdfium2==5.11.0',
  'pdfplumber==0.11.9',
  'pypdf==6.10.0',
  'pillow==12.2.0',
  'python-docx==1.2.0',
  'python-pptx==1.0.2',
  'openpyxl==3.1.5',
];

/**
 * The pdf skill's render step calls `pdftoppm`, which only exists in a poppler
 * install. Shimming the flags that step actually uses onto pypdfium2 keeps the
 * skill working verbatim without pulling in 179MB of native poppler. Anything
 * outside that flag set fails loudly rather than being quietly ignored.
 */
const PDFTOPPM_SHIM = `import sys
import pypdfium2

SUPPORTED = {"-png", "-jpeg", "-r", "-f", "-l", "-scale-to"}
fmt, dpi, first, last, scale_to = "png", 150, None, None, None
positional = []

argv = sys.argv[1:]
i = 0
while i < len(argv):
    arg = argv[i]
    if not arg.startswith("-"):
        positional.append(arg)
    elif arg == "-png" or arg == "-jpeg":
        fmt = arg[1:]
    elif arg in ("-r", "-f", "-l", "-scale-to"):
        i += 1
        value = int(argv[i])
        if arg == "-r":
            dpi = value
        elif arg == "-f":
            first = value
        elif arg == "-l":
            last = value
        else:
            scale_to = value
    else:
        sys.exit(f"pdftoppm shim: unsupported option {arg} (supported: {' '.join(sorted(SUPPORTED))})")
    i += 1

if len(positional) != 2:
    sys.exit("usage: pdftoppm [-png|-jpeg] [-r dpi] [-f n] [-l n] [-scale-to px] in.pdf out-prefix")

src, prefix = positional
doc = pypdfium2.PdfDocument(src)
first = first or 1
last = min(last or len(doc), len(doc))
width = max(len(str(last)), 2)

for page in range(first, last + 1):
    image = doc[page - 1].render(scale=dpi / 72)
    pil = image.to_pil()
    if scale_to:
        ratio = scale_to / max(pil.size)
        pil = pil.resize((round(pil.width * ratio), round(pil.height * ratio)))
    out = f"{prefix}-{page:0{width}d}.{'png' if fmt == 'png' else 'jpg'}"
    pil.save(out)
    print(out)
`;

const UV_TARGETS: Record<string, string> = {
  'darwin-arm64': 'aarch64-apple-darwin',
  'darwin-x64': 'x86_64-apple-darwin',
  'linux-arm64': 'aarch64-unknown-linux-gnu',
  'linux-x64': 'x86_64-unknown-linux-gnu',
  'win32-arm64': 'aarch64-pc-windows-msvc',
  'win32-x64': 'x86_64-pc-windows-msvc',
};

export function documentRuntimeBinDir(): string {
  return path.join(VENV_DIR, process.platform === 'win32' ? 'Scripts' : 'bin');
}

function documentRuntimePython(): string {
  return path.join(documentRuntimeBinDir(), process.platform === 'win32' ? 'python.exe' : 'python');
}

function specHash(): string {
  return crypto
    .createHash('sha256')
    .update(`${PYTHON_VERSION}\n${PACKAGES.join('\n')}\n${PDFTOPPM_SHIM}`)
    .digest('hex')
    .slice(0, 16);
}

function run(command: string, args: string[], logger: Logger): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, UV_PYTHON_INSTALL_DIR: PYTHON_INSTALL_DIR },
    });
    // uv writes progress faster than chunk boundaries fall on newlines, so
    // buffer until one arrives rather than logging split tokens.
    const tail: string[] = [];
    let buffered = '';
    const collect = (data: Buffer) => {
      buffered += data.toString();
      const lines = buffered.split('\n');
      buffered = lines.pop() ?? '';
      for (const line of lines.map((l) => l.trimEnd()).filter(Boolean)) {
        tail.push(line);
        logger.info(`[runtime] ${line}`);
      }
    };
    child.stdout?.on('data', collect);
    child.stderr?.on('data', collect);
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`${command} exited ${code}: ${tail.slice(-3).join(' ')}`))
    );
  });
}

async function resolveUv(logger: Logger): Promise<string> {
  const override = process.env.GOOSE_UV_BIN;
  if (override) return override;

  const exe = process.platform === 'win32' ? 'uv.exe' : 'uv';
  const downloaded = path.join(UV_DIR, exe);
  if (fs.existsSync(downloaded)) return downloaded;

  try {
    await run('uv', ['--version'], logger);
    return 'uv';
  } catch {
    // Not on PATH; fall through to the pinned download.
  }

  const target = UV_TARGETS[`${process.platform}-${process.arch}`];
  if (!target) throw new Error(`no uv build for ${process.platform}-${process.arch}`);
  const asset = `uv-${target}.${process.platform === 'win32' ? 'zip' : 'tar.gz'}`;
  const url = `https://github.com/astral-sh/uv/releases/download/${UV_VERSION}/${asset}`;

  logger.info(`Downloading ${url}`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`uv download failed (${response.status})`);

  fs.mkdirSync(UV_DIR, { recursive: true });
  const archive = path.join(UV_DIR, asset);
  fs.writeFileSync(archive, Buffer.from(await response.arrayBuffer()));
  // bsdtar reads both .tar.gz and .zip, and ships with macOS, Linux and Win10+.
  await run('tar', ['-xf', archive, '-C', UV_DIR, '--strip-components=1'], logger);
  fs.rmSync(archive, { force: true });
  return downloaded;
}

async function provision(logger: Logger): Promise<void> {
  const spec = specHash();
  if (fs.existsSync(MARKER) && fs.readFileSync(MARKER, 'utf8').trim() === spec) return;

  const uv = await resolveUv(logger);
  const python = documentRuntimePython();

  logger.info(`Provisioning document runtime in ${RUNTIME_ROOT}`);
  // `--managed-python` keeps the venv self-contained under RUNTIME_ROOT rather
  // than linking a system interpreter a package manager may later move.
  await run(uv, ['venv', '--managed-python', '--python', PYTHON_VERSION, VENV_DIR], logger);
  await run(uv, ['pip', 'install', '--python', python, ...PACKAGES], logger);

  if (process.platform !== 'win32') {
    const shim = path.join(documentRuntimeBinDir(), 'pdftoppm');
    fs.writeFileSync(shim, `#!${python}\n${PDFTOPPM_SHIM}`, { mode: 0o755 });
  }

  fs.writeFileSync(MARKER, spec);
  logger.info('Document runtime ready');
}

let started: Promise<void> | null = null;

/**
 * Installs the Python packages the bundled document skills expect (reportlab,
 * pdfplumber, pypdf, python-docx/pptx, openpyxl) into a private venv, so a
 * first PDF request doesn't burn turns on `pip install`. Runs once per process,
 * in the background: `documentRuntimeBinDir()` is on the codex PATH from the
 * start, so the packages go live as soon as this finishes — no restart.
 */
export function ensureDocumentRuntime(logger: Logger): Promise<void> {
  started ??= provision(logger).catch((error) => {
    logger.error(`Document runtime provisioning failed: ${String(error)}`);
  });
  return started;
}
