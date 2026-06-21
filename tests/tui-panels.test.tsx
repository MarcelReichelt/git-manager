import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { ReposPanel } from '../src/tui/panels/ReposPanel.js';
import { WorktreePanel } from '../src/tui/panels/WorktreePanel.js';
import { DiffPanel } from '../src/tui/panels/DiffPanel.js';
import { Footer } from '../src/tui/components/Footer.js';
import { STAGE_CHANGES, STAGE_REPOS } from '../src/tui/carousel.js';
import type { WorktreeChanges } from '../src/core/changes-service.js';

describe('ReposPanel', () => {
  it('renders repos and marks the active and selected ones', () => {
    const { lastFrame } = render(
      <ReposPanel
        repos={[
          { id: 1, name: 'alpha' },
          { id: 2, name: 'beta' },
        ]}
        activeRepoId={2}
        selectedIndex={0}
        height={10}
        scrollOffset={0}
        focused
      />,
    );

    const frame = lastFrame();
    expect(frame).toContain('Repositories');
    // selected row gets '>' marker, active repo gets '*'
    expect(frame).toContain('>  alpha');
    expect(frame).toContain(' * beta');
  });
});

describe('WorktreePanel', () => {
  it('renders worktrees with change counts and the active marker', () => {
    const changes = [
      { totalCount: 3 },
      { totalCount: 0 },
    ] as unknown as WorktreeChanges[];

    const { lastFrame } = render(
      <WorktreePanel
        worktrees={[
          { id: 1, label: 'main', branch: 'main' },
          { id: 2, label: 'feature', branch: 'feature/x' },
        ]}
        changes={changes}
        activeWorktreeId={1}
        selectedIndex={1}
        height={10}
        scrollOffset={0}
        focused
      />,
    );

    const frame = lastFrame();
    expect(frame).toContain('Worktrees');
    expect(frame).toContain('* main [3]');
    expect(frame).toContain('>  feature [0]');
  });
});

describe('DiffPanel', () => {
  it('shows a loading placeholder', () => {
    const { lastFrame } = render(
      <DiffPanel lines={[]} label="main" loading height={10} scrollOffset={0} focused />,
    );
    expect(lastFrame()).toContain('Loading diff…');
  });

  it('shows an empty placeholder when there is no diff', () => {
    const { lastFrame } = render(
      <DiffPanel lines={[]} label="main" loading={false} height={10} scrollOffset={0} focused />,
    );
    expect(lastFrame()).toContain('No diff to display');
  });

  it('renders diff content with the label', () => {
    const { lastFrame } = render(
      <DiffPanel
        lines={['@@ -1 +1 @@', '-old', '+new']}
        label="feature"
        loading={false}
        height={10}
        scrollOffset={0}
        focused
      />,
    );
    const frame = lastFrame();
    expect(frame).toContain('Diff — feature');
    expect(frame).toContain('+new');
    expect(frame).toContain('-old');
  });
});

describe('Footer', () => {
  it('shows the default ready status and stage-specific actions', () => {
    const { lastFrame } = render(<Footer message="" width={200} stage={STAGE_REPOS} />);
    const frame = lastFrame();
    expect(frame).toContain('Ready');
    expect(frame).toContain('columns');
  });

  it('shows a status message and changes-stage diff hint', () => {
    const { lastFrame } = render(
      <Footer message="Pulled feature" width={200} stage={STAGE_CHANGES} />,
    );
    const frame = lastFrame();
    expect(frame).toContain('Pulled feature');
    expect(frame).toContain('diff');
  });
});
