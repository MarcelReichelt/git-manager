import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { branchesAvailableForWorktree } from '../src/tui/layout.js';
import {
  confirmCreateWorktree,
  executeCreateWorktree,
  movePickerSelection,
} from '../src/tui/overlays/create-worktree.js';
import { initialCreateOverlayState } from '../src/tui/overlays/CreateWorktreeOverlay.js';
import type { Repository } from '../src/core/registry.js';

vi.mock('../src/core/git-service.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/core/git-service.js')>();
  return {
    ...actual,
    hasLocalBranch: vi.fn(),
    listLocalBranches: vi.fn(),
    listRemoteBranches: vi.fn(),
  };
});

vi.mock('../src/core/worktree-service.js', () => ({
  createWorktree: vi.fn(),
}));

import { hasLocalBranch } from '../src/core/git-service.js';
import { createWorktree } from '../src/core/worktree-service.js';

describe('branchesAvailableForWorktree', () => {
  it('excludes branches that already have a checkout', () => {
    const available = branchesAvailableForWorktree(
      ['master', 'develop', 'feature/login'],
      [{ branch: 'master' }, { branch: 'feature/other' }],
    );
    expect(available).toEqual(['develop', 'feature/login']);
  });
});

describe('create worktree overlay', () => {
  it('opens name entry when new branch option is selected', () => {
    const state = {
      ...initialCreateOverlayState(),
      phase: 'pick' as const,
      branches: ['develop'],
      pickerIndex: 1,
    };
    expect(confirmCreateWorktree(state)).toEqual({ action: 'open-name' });
  });

  it('moves picker selection within bounds', () => {
    const state = {
      ...initialCreateOverlayState(),
      phase: 'pick' as const,
      branches: ['a', 'b', 'c'],
      pickerIndex: 0,
      pickerScroll: 0,
    };
    const next = movePickerSelection(state, 1, 5);
    expect(next.pickerIndex).toBe(1);
  });
});

describe('executeCreateWorktree', () => {
  const repository = { git_root: '/repo' } as Repository;

  beforeEach(() => {
    vi.mocked(hasLocalBranch).mockReset();
    vi.mocked(createWorktree).mockReset();
    vi.mocked(createWorktree).mockResolvedValue({ id: 1 } as never);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('checks out an existing local branch when typing a duplicate name', async () => {
    vi.mocked(hasLocalBranch).mockResolvedValue(true);

    await executeCreateWorktree(repository, 'test', true);

    expect(createWorktree).toHaveBeenCalledWith(repository, 'test', { newBranch: false });
  });

  it('creates a new branch when the name is unused locally', async () => {
    vi.mocked(hasLocalBranch).mockResolvedValue(false);

    await executeCreateWorktree(repository, 'feature/new', true);

    expect(createWorktree).toHaveBeenCalledWith(repository, 'feature/new', { newBranch: true });
  });
});
