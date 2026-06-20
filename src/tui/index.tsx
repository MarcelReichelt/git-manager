import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { render, Box, Text, useInput, useApp, useStdout } from 'ink';
import { ensureSetup } from '../commands/setup.js';
import { getActiveContext, switchWorktree, type ActiveContext } from '../core/active-session.js';
import { ensureActiveRepository } from '../core/startup-context.js';
import {
  listRepositories,
  listWorktrees,
  getGlobalState,
  getPrimaryWorktree,
  type Worktree,
} from '../core/registry.js';
import { getChangesForWorktrees, type WorktreeChanges } from '../core/changes-service.js';
import { loadGlobalConfig } from '../config/loader.js';
import { openEditor } from '../core/editor-service.js';
import { pullWorktree, pushWorktree } from '../core/sync-service.js';
import { removeWorktreeEntry } from '../core/worktree-service.js';
import { syncWorktreesFromGit } from '../core/worktree-service.js';
import { ChangesPanel, flattenChanges } from './panels/ChangesPanel.js';
import { WorktreePanel } from './panels/WorktreePanel.js';
import { sliceScrollLines } from './scroll.js';
import { resolveWorktreeSelectionIndex } from './selection.js';
import { Footer } from './components/Footer.js';
import { DialogOverlay } from './components/DialogOverlay.js';
import {
  CreateWorktreeOverlay,
  createWorktreeDialogWidth,
  createWorktreeInnerHeight,
  initialCreateOverlayState,
  type CreateWorktreeOverlayState,
} from './overlays/CreateWorktreeOverlay.js';
import {
  confirmCreateWorktree,
  executeCreateWorktree,
  loadCreateOverlayBranches,
  movePickerSelection,
} from './overlays/create-worktree.js';
import {
  RepoPickerOverlay,
  initialRepoPickerState,
  repoPickerDialogWidth,
  repoPickerInnerHeight,
  type RepoPickerOverlayState,
} from './overlays/RepoPickerOverlay.js';
import {
  buildRepoPickerChoices,
  confirmRepoPicker,
  moveRepoPickerSelection,
} from './overlays/repo-picker.js';
import {
  SettingsOverlay,
  settingsDialogWidth,
  settingsInnerHeight,
  type SettingsOverlayState,
} from './overlays/SettingsOverlay.js';
import {
  backToSettingsList,
  createInitialSettingsState,
  moveSettingsSelection,
  openSettingsField,
  saveLayoutModePick,
  saveSettingsEdit,
} from './overlays/settings-overlay.js';
import {
  MergeOverlay,
  mergeDialogWidth,
  type MergeOverlayState,
} from './overlays/MergeOverlay.js';
import {
  confirmMergeIntoDialog,
  confirmUpdateStep,
  createMergeIntoOverlayState,
  createUpdateOverlayState,
  executeMergeAction,
  moveMergeConfirmSelection,
  prepareUpdateFromPrimary,
  primarySyncBlockedMessage,
} from './overlays/merge-worktree.js';
import {
  ShortcutsOverlay,
  initialShortcutsOverlayState,
  shortcutsDialogWidth,
  shortcutsInnerHeight,
  type ShortcutsOverlayState,
} from './overlays/ShortcutsOverlay.js';
import { moveShortcutsSelection, selectedShortcutAction } from './overlays/shortcuts-overlay.js';
import { tuiShortcutEntries, type ShortcutActionId } from './shortcuts.js';

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
  const [repoOverlay, setRepoOverlay] = useState<RepoPickerOverlayState | null>(null);
  const [settingsOverlay, setSettingsOverlay] = useState<SettingsOverlayState | null>(null);
  const [mergeOverlay, setMergeOverlay] = useState<MergeOverlayState | null>(null);
  const [shortcutsOverlay, setShortcutsOverlay] = useState<ShortcutsOverlayState | null>(null);
  const [ctx, setCtx] = useState<ActiveContext | undefined>(() => getActiveContext());
  const messageTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectedWorktreeIdRef = useRef<number | undefined>(undefined);
  const dialogOpen =
    overlay !== null ||
    repoOverlay !== null ||
    settingsOverlay !== null ||
    mergeOverlay !== null ||
    shortcutsOverlay !== null;

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
    setSelectedIndex((prevIndex) =>
      resolveWorktreeSelectionIndex(wts, {
        previousWorktreeId: selectedWorktreeIdRef.current,
        activeWorktreeId: active.worktree.id,
        previousIndex: prevIndex,
      }),
    );
  }, []);

  useEffect(() => {
    (async () => {
      await ensureSetup();
      await ensureActiveRepository({ promptIfMissing: false });
      setCtx(getActiveContext());
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
    if (overlay || repoOverlay || settingsOverlay || mergeOverlay || shortcutsOverlay) {
      return;
    }
    const config = loadGlobalConfig();
    const interval = config.tui.refresh_interval_ms;
    if (interval <= 0) return;
    const id = setInterval(refresh, interval);
    return () => clearInterval(id);
  }, [refresh, overlay, repoOverlay, settingsOverlay, mergeOverlay, shortcutsOverlay]);

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
    const wt = worktrees[selectedIndex];
    if (wt) {
      selectedWorktreeIdRef.current = wt.id;
    }
  }, [selectedIndex, worktrees]);

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

  const openRepoOverlay = useCallback(() => {
    setRepoOverlay(initialRepoPickerState(buildRepoPickerChoices()));
  }, []);

  const closeRepoOverlay = useCallback(() => {
    setRepoOverlay(null);
  }, []);

  const openSettingsOverlay = useCallback(() => {
    setSettingsOverlay(createInitialSettingsState());
  }, []);

  const closeSettingsOverlay = useCallback(() => {
    setSettingsOverlay(null);
  }, []);

  const closeMergeOverlay = useCallback(() => {
    setMergeOverlay(null);
  }, []);

  const openShortcutsOverlay = useCallback(() => {
    setShortcutsOverlay(initialShortcutsOverlayState());
  }, []);

  const closeShortcutsOverlay = useCallback(() => {
    setShortcutsOverlay(null);
  }, []);

  const startUpdateFromPrimary = useCallback(async () => {
    if (!ctx || !selectedWt) {
      return;
    }
    const primary = getPrimaryWorktree(ctx.repository.id);
    if (!primary) {
      showMessage('Primary worktree not found');
      return;
    }
    const primaryBranch = primary.branch;
    const isPrimary = selectedWt.id === primary.id;
    const blocked = primarySyncBlockedMessage(isPrimary, primaryBranch);
    if (blocked) {
      showMessage(blocked);
      return;
    }
    try {
      const prepared = await prepareUpdateFromPrimary(ctx.repository, selectedWt, primary);
      if (prepared.alreadyUpToDate) {
        showMessage(`${selectedWt.label ?? selectedWt.branch} already includes ${primaryBranch}`);
        return;
      }
      if (prepared.steps.length === 0) {
        await executeMergeAction(ctx.repository, selectedWt, 'update-from-primary', {
          updatePlan: prepared.plan,
        });
        showMessage(`Updated ${selectedWt.label ?? selectedWt.branch} from ${primaryBranch}`);
        await refresh();
        return;
      }
      setMergeOverlay(createUpdateOverlayState(selectedWt, primaryBranch, prepared.steps));
    } catch (err) {
      showMessage((err as Error).message);
    }
  }, [ctx, selectedWt, showMessage, refresh]);

  const startMergeIntoPrimary = useCallback(() => {
    if (!ctx || !selectedWt) {
      return;
    }
    const primary = getPrimaryWorktree(ctx.repository.id);
    if (!primary) {
      showMessage('Primary worktree not found');
      return;
    }
    const primaryBranch = primary.branch;
    const isPrimary = selectedWt.id === primary.id;
    const blocked = primarySyncBlockedMessage(isPrimary, primaryBranch);
    if (blocked) {
      showMessage(blocked);
      return;
    }
    setMergeOverlay(createMergeIntoOverlayState(selectedWt, primaryBranch));
  }, [ctx, selectedWt, showMessage]);

  const submitRepoOverlay = useCallback(async () => {
    if (!repoOverlay) {
      return;
    }
    try {
      const result = await confirmRepoPicker(repoOverlay);
      if (result.action === 'error') {
        setRepoOverlay({ ...repoOverlay, error: result.message });
        return;
      }
      if (result.action === 'unsupported') {
        closeRepoOverlay();
        showMessage(result.message);
        return;
      }
      closeRepoOverlay();
      setCtx(getActiveContext());
      showMessage(`Active repository: ${result.repository.name}`);
      await refresh();
    } catch (err) {
      setRepoOverlay({ ...repoOverlay, error: (err as Error).message });
    }
  }, [repoOverlay, closeRepoOverlay, showMessage, refresh]);

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

  const submitMergeOverlay = useCallback(async () => {
    if (!mergeOverlay || !ctx || !selectedWt) {
      return;
    }

    if (mergeOverlay.phase === 'confirm-update-step') {
      const result = confirmUpdateStep(mergeOverlay);
      if (result.action === 'cancel') {
        closeMergeOverlay();
        return;
      }
      if (result.action === 'next-step') {
        setMergeOverlay({
          ...mergeOverlay,
          updateStepIndex: result.nextStepIndex,
          confirmIndex: 0,
          error: undefined,
        });
        return;
      }
      try {
        await executeMergeAction(ctx.repository, selectedWt, 'update-from-primary', {
          updatePlan: result.plan,
        });
        closeMergeOverlay();
        showMessage(
          `Updated ${selectedWt.label ?? selectedWt.branch} from ${mergeOverlay.primaryBranch}`,
        );
        await refresh();
      } catch (err) {
        setMergeOverlay({ ...mergeOverlay, error: (err as Error).message });
      }
      return;
    }

    const result = confirmMergeIntoDialog(mergeOverlay);
    if (result.action === 'cancel') {
      closeMergeOverlay();
      return;
    }

    try {
      await executeMergeAction(ctx.repository, selectedWt, result.pick);
      closeMergeOverlay();
      showMessage(
        `Merged ${selectedWt.label ?? selectedWt.branch} into ${mergeOverlay.primaryBranch}`,
      );
      await refresh();
    } catch (err) {
      setMergeOverlay({ ...mergeOverlay, error: (err as Error).message });
    }
  }, [mergeOverlay, ctx, selectedWt, closeMergeOverlay, showMessage, refresh]);

  const primaryBranch = useMemo(() => {
    if (!ctx) {
      return 'primary';
    }
    const primary = getPrimaryWorktree(ctx.repository.id);
    return primary?.branch ?? ctx.repository.primary_branch;
  }, [ctx]);

  const shortcutsMenuHeight = useMemo(
    () => shortcutsInnerHeight(tuiShortcutEntries(primaryBranch).length),
    [primaryBranch],
  );

  const runShortcutAction = useCallback(
    async (action: ShortcutActionId) => {
      closeShortcutsOverlay();

      switch (action) {
        case 'focus-toggle':
          setFocus((current) => (current === 'worktrees' ? 'changes' : 'worktrees'));
          return;
        case 'navigate-up':
          if (focus === 'changes') scrollChanges(-1);
          else scrollWorktrees(-1);
          return;
        case 'navigate-down':
          if (focus === 'changes') scrollChanges(1);
          else scrollWorktrees(1);
          return;
        case 'changes-down':
          setFocus('changes');
          scrollChanges(1);
          return;
        case 'changes-up':
          setFocus('changes');
          scrollChanges(-1);
          return;
        case 'refresh':
          await refresh();
          return;
        case 'change-repo':
          openRepoOverlay();
          return;
        case 'settings':
          openSettingsOverlay();
          return;
        case 'shortcuts-menu':
          return;
        case 'quit':
          exit();
          return;
        default:
          break;
      }

      if (!ctx || !selectedWt) {
        showMessage('No worktree selected');
        return;
      }

      try {
        switch (action) {
          case 'open-editor':
            switchWorktree(ctx.repository.id, selectedWt.label ?? selectedWt.branch);
            openEditor(selectedWt.path, ctx.repository.path);
            showMessage(`Opened ${selectedWt.label ?? selectedWt.branch}`);
            return;
          case 'pull':
            await pullWorktree(ctx.repository, selectedWt);
            showMessage(`Pulled ${selectedWt.label ?? selectedWt.branch}`);
            await refresh();
            return;
          case 'push':
            await pushWorktree(ctx.repository, selectedWt);
            showMessage(`Pushed ${selectedWt.label ?? selectedWt.branch}`);
            await refresh();
            return;
          case 'update-from-primary':
            await startUpdateFromPrimary();
            return;
          case 'merge-into-primary':
            startMergeIntoPrimary();
            return;
          case 'create-worktree':
            openCreateOverlay();
            return;
          case 'remove-worktree':
            await removeWorktreeEntry(ctx.repository, selectedWt);
            showMessage(`Removed ${selectedWt.label ?? selectedWt.branch}`);
            await refresh();
            return;
        }
      } catch (err) {
        showMessage((err as Error).message);
      }
    },
    [
      closeShortcutsOverlay,
      focus,
      scrollChanges,
      scrollWorktrees,
      refresh,
      openRepoOverlay,
      openSettingsOverlay,
      exit,
      ctx,
      selectedWt,
      showMessage,
      startUpdateFromPrimary,
      startMergeIntoPrimary,
      openCreateOverlay,
    ],
  );

  useInput((input, key) => {
    if (shortcutsOverlay) {
      if (key.escape || input === 'm') {
        closeShortcutsOverlay();
        return;
      }
      if (key.upArrow) {
        setShortcutsOverlay((current) =>
          current ? moveShortcutsSelection(current, -1, primaryBranch) : current,
        );
        return;
      }
      if (key.downArrow) {
        setShortcutsOverlay((current) =>
          current ? moveShortcutsSelection(current, 1, primaryBranch) : current,
        );
        return;
      }
      if (key.return) {
        const action = selectedShortcutAction(shortcutsOverlay, primaryBranch);
        if (action) {
          void runShortcutAction(action);
        }
        return;
      }
      return;
    }

    if (mergeOverlay) {
      if (key.escape) {
        closeMergeOverlay();
        return;
      }

      if (key.upArrow) {
        setMergeOverlay((current) => (current ? moveMergeConfirmSelection(current, -1) : current));
        return;
      }
      if (key.downArrow) {
        setMergeOverlay((current) => (current ? moveMergeConfirmSelection(current, 1) : current));
        return;
      }
      if (key.return) {
        void submitMergeOverlay();
      }
      return;
    }

    if (settingsOverlay) {
      const innerHeight = Math.max(1, settingsInnerHeight(settingsOverlay));

      if (key.escape) {
        if (settingsOverlay.phase === 'list') {
          closeSettingsOverlay();
        } else {
          setSettingsOverlay(backToSettingsList(settingsOverlay));
        }
        return;
      }

      if (settingsOverlay.phase === 'list' || settingsOverlay.phase === 'pick_layout') {
        if (key.upArrow) {
          setSettingsOverlay((current) =>
            current ? moveSettingsSelection(current, -1, innerHeight) : current,
          );
          return;
        }
        if (key.downArrow) {
          setSettingsOverlay((current) =>
            current ? moveSettingsSelection(current, 1, innerHeight) : current,
          );
          return;
        }
        if (key.return) {
          if (settingsOverlay.phase === 'pick_layout') {
            const result = saveLayoutModePick(settingsOverlay);
            if (result.action === 'error') {
              setSettingsOverlay({ ...settingsOverlay, error: result.message });
              return;
            }
            setSettingsOverlay(result.state);
            showMessage(result.message);
            return;
          }

          const openResult = openSettingsField(settingsOverlay);
          if (openResult.action === 'error') {
            setSettingsOverlay({ ...settingsOverlay, error: openResult.message });
            return;
          }
          if (openResult.action === 'pick_layout') {
            setSettingsOverlay({
              ...settingsOverlay,
              phase: 'pick_layout',
              layoutPickerIndex: openResult.index,
              scroll: 0,
              error: undefined,
            });
            return;
          }
          setSettingsOverlay({
            ...settingsOverlay,
            phase: 'edit',
            editValue: openResult.value,
            error: undefined,
          });
        }
        return;
      }

      if (settingsOverlay.phase === 'edit') {
        if (key.return) {
          const result = saveSettingsEdit(settingsOverlay);
          if (result.action === 'error') {
            setSettingsOverlay({ ...settingsOverlay, error: result.message });
            return;
          }
          setSettingsOverlay(result.state);
          showMessage(result.message);
          return;
        }
        if (key.backspace || key.delete) {
          setSettingsOverlay({
            ...settingsOverlay,
            editValue: settingsOverlay.editValue.slice(0, -1),
            error: undefined,
          });
          return;
        }
        if (input && input.length === 1 && !key.ctrl && !key.meta) {
          setSettingsOverlay({
            ...settingsOverlay,
            editValue: settingsOverlay.editValue + input,
            error: undefined,
          });
        }
      }
      return;
    }

    if (repoOverlay) {
      if (key.escape) {
        closeRepoOverlay();
        return;
      }
      if (key.upArrow) {
        setRepoOverlay((current) =>
          current
            ? moveRepoPickerSelection(current, -1, Math.max(1, repoPickerInnerHeight(current)))
            : current,
        );
        return;
      }
      if (key.downArrow) {
        setRepoOverlay((current) =>
          current
            ? moveRepoPickerSelection(current, 1, Math.max(1, repoPickerInnerHeight(current)))
            : current,
        );
        return;
      }
      if (key.return) {
        void submitRepoOverlay();
        return;
      }
      return;
    }

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
              ? movePickerSelection(current, -1, createWorktreeInnerHeight(current))
              : current,
          );
          return;
        }
        if (key.downArrow) {
          setOverlay((current) =>
            current
              ? movePickerSelection(current, 1, createWorktreeInnerHeight(current))
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
    if (input === 'R') {
      openRepoOverlay();
      return;
    }
    if (input === 'S' || input === ',') {
      openSettingsOverlay();
      return;
    }
    if (input === 'm') {
      openShortcutsOverlay();
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
        } else if (input === 'u') {
          void startUpdateFromPrimary();
        } else if (input === 'U') {
          startMergeIntoPrimary();
        } else if (input === 'x') {
          await removeWorktreeEntry(ctx.repository, selectedWt);
          showMessage(`Removed ${selectedWt.label ?? selectedWt.branch}`);
          await refresh();
        } else if (input === 'w') {
          openCreateOverlay();
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

      <Box height={paneHeight} flexDirection="row" overflow="hidden" position="relative">
        <Box flexDirection="row" width={columns} height={paneHeight} dimColor={dialogOpen}>
          <WorktreePanel
            worktrees={worktrees}
            changes={changes}
            activeWorktreeId={ctx.worktree.id}
            selectedIndex={selectedIndex}
            height={paneHeight}
            scrollOffset={worktreeScroll}
            focused={focus === 'worktrees' && !dialogOpen}
          />
          <ChangesPanel
            changes={selectedChanges}
            label={selectedWt?.label ?? selectedWt?.branch ?? 'none'}
            height={paneHeight}
            scrollOffset={changesScroll}
            focused={focus === 'changes' && !dialogOpen}
          />
        </Box>
        {overlay ? (
          <DialogOverlay width={columns} height={paneHeight}>
            <CreateWorktreeOverlay
              state={overlay}
              width={createWorktreeDialogWidth(columns)}
            />
          </DialogOverlay>
        ) : null}
        {repoOverlay ? (
          <DialogOverlay width={columns} height={paneHeight}>
            <RepoPickerOverlay
              state={repoOverlay}
              width={repoPickerDialogWidth(columns)}
            />
          </DialogOverlay>
        ) : null}
        {settingsOverlay ? (
          <DialogOverlay width={columns} height={paneHeight}>
            <SettingsOverlay
              state={settingsOverlay}
              width={settingsDialogWidth(columns)}
            />
          </DialogOverlay>
        ) : null}
        {mergeOverlay ? (
          <DialogOverlay width={columns} height={paneHeight}>
            <MergeOverlay state={mergeOverlay} width={mergeDialogWidth(columns)} />
          </DialogOverlay>
        ) : null}
        {shortcutsOverlay ? (
          <DialogOverlay width={columns} height={paneHeight}>
            <ShortcutsOverlay
              primaryBranch={primaryBranch}
              state={shortcutsOverlay}
              width={shortcutsDialogWidth(columns)}
              innerHeight={shortcutsMenuHeight}
            />
          </DialogOverlay>
        ) : null}
      </Box>

      <Box height={FOOTER_HEIGHT} overflow="hidden">
        <Footer message={message} width={columns} />
      </Box>
    </Box>
  );
}

await ensureSetup();
render(<App />);
