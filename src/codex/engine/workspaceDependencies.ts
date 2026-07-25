import type { DynamicToolSpec } from '../protocol/v2/DynamicToolSpec';
import type { DynamicToolCallResponse } from '../protocol/v2/DynamicToolCallResponse';

export const LOAD_WORKSPACE_DEPENDENCIES_TOOL = 'load_workspace_dependencies';

export const workspaceDependencyTools: DynamicToolSpec[] = [
  {
    type: 'function',
    name: LOAD_WORKSPACE_DEPENDENCIES_TOOL,
    description:
      'Locate the configured bundled workspace dependency runtime paths, including Python and libraries for working with PDFs, Word documents, presentations, and spreadsheets. Call this before installing document dependencies.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
];

export function workspaceDependenciesResponse(
  homeDir: string,
  platform: string
): DynamicToolCallResponse {
  const separator = platform === 'win32' ? '\\' : '/';
  const executable = platform === 'win32' ? 'python.exe' : 'python';
  const binDir = [homeDir, '.cache', 'icodex-runtimes', 'venv', platform === 'win32' ? 'Scripts' : 'bin']
    .filter(Boolean)
    .join(separator);
  const details = {
    python: `${binDir}${separator}${executable}`,
    binaries: {
      pdftoppm: `${binDir}${separator}${platform === 'win32' ? 'pdftoppm.exe' : 'pdftoppm'}`,
    },
    pythonPackages: [
      'reportlab',
      'pypdfium2',
      'pdfplumber',
      'pypdf',
      'pillow',
      'python-docx',
      'python-pptx',
      'openpyxl',
    ],
    guidance:
      'Use these paths directly. The dependencies are preinstalled; do not run pip, uv pip, or create another virtual environment.',
  };

  return {
    contentItems: [{ type: 'inputText', text: JSON.stringify(details) }],
    success: true,
  };
}
