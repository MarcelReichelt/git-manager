import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  applyStash,
  dropStash,
  listStashes,
  popStashAt,
  stashAllChanges,
} from '../src/core/git-service.js';
import {
  loadStashOverlayList,
  moveStashSelection,
  runStashAction,
  runStashCreate,
} from '../src/tui/overlays/stash-overlay.js';
import { createStashOverlayState } from '../src/tui/overlays/StashOverlay.js';

vi.mock('../src/core/git-service.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/core/git-service.js')>();
  return {
    ...actual,
    listStashes: vi.fn(),
    applyStash: vi.fn(),
    popStashAt: vi.fn(),
    dropStash: vi.fn(),
    stashAllChanges: vi.fn(),
  };
});

const mockedListStashes = vi.mocked(listStashes);
const mockedApplyStash = vi.mocked(applyStash);
const mockedPopStashAt = vi.mocked(popStashAt);
const mockedDropStash = vi.mocked(dropStash);
const mockedStashAllChanges = vi.mocked(stashAllChanges);

describe('tui stash overlay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a loading overlay state', () => {
    expect(createStashOverlayState('/repo', 'feature')).toEqual({
      phase: 'loading',
      worktreePath: '/repo',
      worktreeLabel: 'feature',
      stashes: [],
      selectedIndex: 0,
      scroll: 0,
    });
  });

  it('loads stashes into list state', async () => {
    mockedListStashes.mockResolvedValue([
      { index: 0, label: 'WIP on main: abc1234 message' },
      { index: 1, label: 'On feature: def5678 other' },
    ]);

    const state = await loadStashOverlayList('/repo', 'feature');
    expect(state.phase).toBe('list');
    expect(state.stashes).toHaveLength(2);
    expect(mockedListStashes).toHaveBeenCalledWith('/repo');
  });

  it('moves selection and scrolls within bounds', () => {
    const state = {
      phase: 'list' as const,
      worktreePath: '/repo',
      worktreeLabel: 'feature',
      stashes: [
        { index: 0, label: 'first' },
        { index: 1, label: 'second' },
      ],
      selectedIndex: 0,
      scroll: 0,
    };

    expect(moveStashSelection(state, 1).selectedIndex).toBe(1);
    expect(moveStashSelection(state, -1).selectedIndex).toBe(0);
    expect(
      moveStashSelection({ ...state, selectedIndex: 1 }, 1).selectedIndex,
    ).toBe(1);
  });

  it('applies the selected stash and reloads the list', async () => {
    mockedApplyStash.mockResolvedValue();
    mockedListStashes.mockResolvedValue([{ index: 0, label: 'remaining' }]);

    const state = {
      phase: 'list' as const,
      worktreePath: '/repo',
      worktreeLabel: 'feature',
      stashes: [
        { index: 0, label: 'WIP on main: abc1234 message' },
        { index: 1, label: 'On feature: def5678 other' },
      ],
      selectedIndex: 1,
      scroll: 0,
    };

    const result = await runStashAction(state, 'apply');
    expect(result.action).toBe('updated');
    expect(mockedApplyStash).toHaveBeenCalledWith('/repo', 1);
    if (result.action === 'updated') {
      expect(result.refreshChanges).toBe(true);
      expect(result.state.stashes).toHaveLength(1);
    }
  });

  it('pops the selected stash', async () => {
    mockedPopStashAt.mockResolvedValue();
    mockedListStashes.mockResolvedValue([]);

    const state = {
      phase: 'list' as const,
      worktreePath: '/repo',
      worktreeLabel: 'feature',
      stashes: [{ index: 0, label: 'WIP on main: abc1234 message' }],
      selectedIndex: 0,
      scroll: 0,
    };

    const result = await runStashAction(state, 'pop');
    expect(mockedPopStashAt).toHaveBeenCalledWith('/repo', 0);
    if (result.action === 'updated') {
      expect(result.refreshChanges).toBe(true);
      expect(result.state.stashes).toHaveLength(0);
    }
  });

  it('drops the selected stash without refreshing changes', async () => {
    mockedDropStash.mockResolvedValue();
    mockedListStashes.mockResolvedValue([]);

    const state = {
      phase: 'list' as const,
      worktreePath: '/repo',
      worktreeLabel: 'feature',
      stashes: [{ index: 0, label: 'WIP on main: abc1234 message' }],
      selectedIndex: 0,
      scroll: 0,
    };

    const result = await runStashAction(state, 'drop');
    expect(mockedDropStash).toHaveBeenCalledWith('/repo', 0);
    if (result.action === 'updated') {
      expect(result.refreshChanges).toBe(false);
    }
  });

  it('returns an error when git fails', async () => {
    mockedApplyStash.mockRejectedValue(new Error('working tree not clean'));

    const state = {
      phase: 'list' as const,
      worktreePath: '/repo',
      worktreeLabel: 'feature',
      stashes: [{ index: 0, label: 'WIP on main: abc1234 message' }],
      selectedIndex: 0,
      scroll: 0,
    };

    const result = await runStashAction(state, 'apply');
    expect(result.action).toBe('error');
    if (result.action === 'error') {
      expect(result.message).toBe('working tree not clean');
      expect(result.state.error).toBe('working tree not clean');
      expect(result.state.busy).toBe(false);
    }
  });

  it('stashes all changes including untracked files and reloads the list', async () => {
    mockedStashAllChanges.mockResolvedValue(true);
    mockedListStashes.mockResolvedValue([{ index: 0, label: 'git-manager stash' }]);

    const state = {
      phase: 'list' as const,
      worktreePath: '/repo',
      worktreeLabel: 'feature',
      stashes: [],
      selectedIndex: 0,
      scroll: 0,
    };

    const result = await runStashCreate(state);
    expect(mockedStashAllChanges).toHaveBeenCalledWith('/repo');
    expect(result.action).toBe('updated');
    if (result.action === 'updated') {
      expect(result.message).toBe('Stashed all changes (feature)');
      expect(result.refreshChanges).toBe(true);
      expect(result.state.stashes).toHaveLength(1);
    }
  });

  it('reports when there is nothing to stash', async () => {
    mockedStashAllChanges.mockResolvedValue(false);

    const state = {
      phase: 'list' as const,
      worktreePath: '/repo',
      worktreeLabel: 'feature',
      stashes: [],
      selectedIndex: 0,
      scroll: 0,
    };

    const result = await runStashCreate(state);
    expect(result.action).toBe('error');
    if (result.action === 'error') {
      expect(result.message).toBe('No changes to stash');
    }
  });
});
