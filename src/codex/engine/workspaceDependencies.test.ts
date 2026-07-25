import { describe, expect, it } from 'vitest';
import {
  LOAD_WORKSPACE_DEPENDENCIES_TOOL,
  workspaceDependenciesResponse,
  workspaceDependencyTools,
} from './workspaceDependencies';

describe('workspace dependencies dynamic tool', () => {
  it('registers the same dependency loader exposed by Codex Desktop', () => {
    expect(workspaceDependencyTools).toEqual([
      expect.objectContaining({
        type: 'function',
        name: LOAD_WORKSPACE_DEPENDENCIES_TOOL,
      }),
    ]);
  });

  it('returns executable document runtime paths', () => {
    const response = workspaceDependenciesResponse('/Users/example', 'darwin');
    const content = response.contentItems[0];
    if (content.type !== 'inputText') throw new Error('expected a text response');
    const details = JSON.parse(content.text);

    expect(response.success).toBe(true);
    expect(details.python).toBe('/Users/example/.cache/icodex-runtimes/venv/bin/python');
    expect(details.binaries.pdftoppm).toBe(
      '/Users/example/.cache/icodex-runtimes/venv/bin/pdftoppm'
    );
    expect(details.guidance).toContain('do not run pip');
  });
});
