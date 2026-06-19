import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { render, Box, Text, useInput, useApp, useStdout } from 'ink';
import { ensureSetup } from '../commands/setup.js';
import { getActiveContext, switchWorktree } from '../core/active-session.js';
import {
  listRepositories,
  listWorktrees,
  getGlobalState,
  type Worktree,
} from '../core/registry.js';
import { getChangesForWorktrees, type WorktreeChanges } from '../core/changes-service.js';
import { loadGlobalConfig } from '../config/loader.js';
import { openEditor } from '../core/editor-service.js';
import { pullWorktree, pushWorktree } from '../core/sync-service.js';
import { removeWorktreeEntry } from '../core/worktree-service.js';
import { mergeIntoPrimary, mergeFromPrimary } from '../core/merge-service.js';
import { syncWorktreesFromGit } from '../core/worktree-service.js';
import { repoPicker } from '../commands/repo.js';
import { ChangesPanel, flattenChanges } from './panels/ChangesPanel.js';
import { WorktreePanel } from './panels/WorktreePanel.js';
import { sliceScrollLines } from './scroll.js';
import { Footer } from './components/Footer.js';
import {
  CreateWorktreeOverlay,
  initialCreateOverlayState,
  type CreateWorktreeOverlayState,
} from './overlays/CreateWorktreeOverlay.js';
import {
  confirmCreateWorktree,
  executeCreateWorktree,
  loadCreateOverlayBranches,
  movePickerSelection,
} from './overlays/create-worktree.js';

type PanelFocus = 'worktrees' | 'changes';

const HEADER_HEIGHT = 2;
const FOOTER_HEIGHT = 2;

function useTerminalLayout() {
  const { stdout } = useStdout();
  const rows = stdout.rows ?? 24;
  const columns = stdout.columns ?? 80;
  const paneHeight = Math.max(6, rows - HEADER_HEIGHT - FOOTER_HEIGHT);
  return { rows, columns, paneHeight };
}

function App() {
  const { exit } = useApp();
  const { rows, columns, paneHeight } = useTerminalLayout();
  const [ready, setReady] = useState(false);
  const [focus, setFocus] = useState<PanelFocus>('worktrees');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [worktreeScroll, setWorktreeScroll] = useState(0);
  const [changesScroll, setChangesScroll] = useState(0);
  const [worktrees, setWorktrees] = useState<Worktree[]>([]);
  const [changes, setChanges] = useState<WorktreeChanges[]>([]);
  const [message, setMessage] = useState('');
  const [overlay, setOverlay] = useState<CreateWorktreeOverlayState | null>(null);
  const ctx = getActiveContext();
  const messageTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const overlayPickerHeight = Math.max(8, Math.floor(paneHeight * 0.7));

  const showMessage = useCallback((text: string) => {
    setMessage(text);
    if (messageTimer.current) {
      clearTimeout(messageTimer.current);
    }
    messageTimer.current = setTimeout(() => setMessage(''), 5000);
  }, []);

  const refresh = useCallback(async () => {
    const active = getActiveContext();
    if (!active) return;
    await syncWorktreesFromGit(active.repository);
    const wts = listWorktrees(active.repository.id);
    setWorktrees(wts);
    const ch = await getChangesForWorktrees(wts);
    setChanges(ch);
    const idx = wts.findIndex((w) => w.id === active.worktree.id);
    if (idx >= 0) setSelectedIndex(idx);
  }, []);

  useEffect(() => {
    (async () => {
      await ensureSetup();
      setReady(true);
      await refresh();
    })();
    return () => {
      if (messageTimer.current) {
        clearTimeout(messageTimer.current);
      }
    };
  }, [refresh]);

  useEffect(() => {
    if (overlay) {
      return;
    }
    const config = loadGlobalConfig();
    const interval = config.tui.refresh_interval_ms;
    if (interval <= 0) return;
    const id = setInterval(refresh, interval);
    return () => clearInterval(id);
  }, [refresh, overlay]);

  useEffect(() => {
    if (!overlay || overlay.phase !== 'loading' || !ctx) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const branches = await loadCreateOverlayBranches(ctx.repository, worktrees);
        if (cancelled) {
          return;
        }
        setOverlay({
          phase: 'pick',
          branches,
          pickerIndex: 0,
          pickerScroll: 0,
          newBranchName: '',
        });
      } catch (err) {
        if (cancelled) {
          return;
        }
        showMessage((err as Error).message);
        setOverlay(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [overlay?.phase, ctx, worktrees, showMessage]);

  const selectedChanges = changes[selectedIndex];
  const selectedWt = worktrees[selectedIndex];
  const innerPaneHeight = Math.max(1, paneHeight - 2);

  const changeLines = useMemo(
    () => flattenChanges(selectedChanges),
    [selectedChanges],
  );
  const maxWorktreeScroll = useMemo(
    () => sliceScrollLines(worktrees, innerPaneHeight, 0).maxScroll,
    [worktrees, innerPaneHeight],
  );

  useEffect(() => {
    setChangesScroll(0);
  }, [selectedIndex]);

  useEffect(() => {
    setWorktreeScroll((offset) => {
      const max = maxWorktreeScroll;
      let next = Math.min(offset, max);
      if (selectedIndex < next) {
        next = selectedIndex;
      }
      if (selectedIndex >= next + innerPaneHeight) {
        next = Math.min(max, selectedIndex - innerPaneHeight + 1);
      }
      return next;
    });
  }, [selectedIndex, maxWorktreeScroll, innerPaneHeight]);

  const scrollChanges = useCallback(
    (delta: number) => {
      setChangesScroll((offset) => {
        const max = sliceScrollLines(changeLines, innerPaneHeight, 0).maxScroll;
        return Math.min(Math.max(0, offset + delta), max);
      });
    },
    [changeLines, innerPaneHeight],
  );

  const scrollWorktrees = useCallback(
    (delta: number) => {
      setSelectedIndex((index) => Math.min(Math.max(0, index + delta), worktrees.length - 1));
    },
    [worktrees.length],
  );

  const openCreateOverlay = useCallback(() => {
    setOverlay(initialCreateOverlayState());
  }, []);

  const closeOverlay = useCallback(() => {
    setOverlay(null);
  }, []);

  const submitCreateOverlay = useCallback(async () => {
    if (!overlay || !ctx) {
      return;
    }
    const result = confirmCreateWorktree(overlay);
    if (result.action === 'error') {
      setOverlay({ ...overlay, error: result.message });
      return;
    }
    if (result.action === 'open-name') {
      setOverlay({
        ...overlay,
        phase: 'name',
        newBranchName: '',
        error: undefined,
      });
      return;
    }
    try {
      await executeCreateWorktree(ctx.repository, result.branch, result.newBranch);
      closeOverlay();
      showMessage(`Created worktree for ${result.branch}`);
      await refresh();
    } catch (err) {
      setOverlay({ ...overlay, error: (err as Error).message });
    }
  }, [overlay, ctx, closeOverlay, showMessage, refresh]);

  useInput((input, key) => {
    if (overlay) {
      if (key.escape) {
        if (overlay.phase === 'name') {
          setOverlay({
            ...overlay,
            phase: 'pick',
            newBranchName: '',
            error: undefined,
          });
        } else {
          closeOverlay();
        }
        return;
      }
      if (overlay.phase === 'pick') {
        if (key.upArrow) {
          setOverlay((current) =>
            current
              ? movePickerSelection(current, -1, Math.max(3, overlayPickerHeight - 4))
              : current,
          );
          return;
        }
        if (key.downArrow) {
          setOverlay((current) =>
            current
              ? movePickerSelection(current, 1, Math.max(3, overlayPickerHeight - 4))
              : current,
          );
          return;
        }
        if (key.return) {
          void submitCreateOverlay();
          return;
        }
        return;
      }
      if (overlay.phase === 'name') {
        if (key.return) {
          void submitCreateOverlay();
          return;
        }
        if (key.backspace || key.delete) {
          setOverlay({
            ...overlay,
            newBranchName: overlay.newBranchName.slice(0, -1),
            error: undefined,
          });
          return;
        }
        if (input && input.length === 1 && !key.ctrl && !key.meta) {
          setOverlay({
            ...overlay,
            newBranchName: overlay.newBranchName + input,
            error: undefined,
          });
        }
      }
      return;
    }

    if (input === '\t' || key.tab) {
      setFocus((current) => (current === 'worktrees' ? 'changes' : 'worktrees'));
      return;
    }
    if (key.upArrow) {
      if (focus === 'changes') scrollChanges(-1);
      else scrollWorktrees(-1);
      return;
    }
    if (key.downArrow) {
      if (focus === 'changes') scrollChanges(1);
      else scrollWorktrees(1);
      return;
    }
    if (input === 'j') {
      setFocus('changes');
      scrollChanges(1);
      return;
    }
    if (input === 'k') {
      setFocus('changes');
      scrollChanges(-1);
      return;
    }
    if (input === 'q') {
      exit();
      return;
    }
    if (input === 'r') {
      void refresh();
      return;
    }
    if (!ctx || !selectedWt) {
      return;
    }

    void (async () => {
      try {
        if (input === 'o' || key.return) {
          switchWorktree(ctx.repository.id, selectedWt.label ?? selectedWt.branch);
          openEditor(selectedWt.path, ctx.repository.path);
          showMessage(`Opened ${selectedWt.label ?? selectedWt.branch}`);
        } else if (input === 'p') {
          await pullWorktree(ctx.repository, selectedWt);
          showMessage(`Pulled ${selectedWt.label ?? selectedWt.branch}`);
          await refresh();
        } else if (input === 'P') {
          await pushWorktree(ctx.repository, selectedWt);
          showMessage(`Pushed ${selectedWt.label ?? selectedWt.branch}`);
          await refresh();
        } else if (input === 'M') {
          await mergeIntoPrimary(ctx.repository, selectedWt.label ?? selectedWt.branch);
          showMessage('Merged into primary');
          await refresh();
        } else if (input === 'm') {
          await mergeFromPrimary(ctx.repository, selectedWt.label ?? selectedWt.branch);
          showMessage('Merged from primary');
          await refresh();
        } else if (input === 'x') {
          await removeWorktreeEntry(ctx.repository, selectedWt);
          showMessage(`Removed ${selectedWt.label ?? selectedWt.branch}`);
          await refresh();
        } else if (input === 'w') {
          openCreateOverlay();
        } else if (input === 'R') {
          exit();
          await repoPicker();
        }
      } catch (err) {
        showMessage((err as Error).message);
      }
    })();
  });

  if (!ready) {
    return <Text>Loading...</Text>;
  }

  if (!ctx) {
    return (
      <Box flexDirection="column">
        <Text>No active repository. Run git-manager repo switch</Text>
        <Text color="gray">Press q to quit</Text>
      </Box>
    );
  }

  const repos = listRepositories();
  const activeRepoId = getGlobalState().active_repository_id;

  return (
    <Box flexDirection="column" height={rows} overflow="hidden">
      <Box height={HEADER_HEIGHT} flexDirection="column" overflow="hidden">
        <Box height={1} overflow="hidden">
          <Text wrap="truncate">
            {repos.map((r) => (
              <Text key={r.id} color={r.id === activeRepoId ? 'green' : undefined}>
                {r.id === activeRepoId ? '* ' : '  '}
                {r.name}{'  '}
              </Text>
            ))}
            <Text color="gray"> [R] change repo</Text>
          </Text>
        </Box>
        <Box height={1} overflow="hidden">
          <Text wrap="truncate">
            Active: {ctx.worktree.label ?? ctx.worktree.branch} ({ctx.worktree.branch})
          </Text>
        </Box>
      </Box>

      <Box height={paneHeight} flexDirection="row" overflow="hidden">
        {overlay ? (
          <CreateWorktreeOverlay state={overlay} height={paneHeight} width={columns} />
        ) : (
          <>
            <WorktreePanel
              worktrees={worktrees}
              changes={changes}
              activeWorktreeId={ctx.worktree.id}
              selectedIndex={selectedIndex}
              height={paneHeight}
              scrollOffset={worktreeScroll}
              focused={focus === 'worktrees'}
            />
            <ChangesPanel
              changes={selectedChanges}
              label={selectedWt?.label ?? selectedWt?.branch ?? 'none'}
              height={paneHeight}
              scrollOffset={changesScroll}
              focused={focus === 'changes'}
            />
          </>
        )}
      </Box>

      <Box height={FOOTER_HEIGHT} overflow="hidden">
        <Footer message={message} width={columns} />
      </Box>
    </Box>
  );
}

await ensureSetup();
render(<App />);
