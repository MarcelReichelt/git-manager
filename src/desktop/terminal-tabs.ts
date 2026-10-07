export type TerminalHostKind = 'tmux' | 'shell';

export interface TerminalView {
  id: string;
  host: TerminalHostKind;
  cwd: string;
  session: string;
  customName: string;
  command: string;
}

export interface TerminalTabView {
  id: string;
  customName: string;
  terminals: TerminalView[];
  focusedTerminalId: string;
  splitRatio: number;
}

export interface WorktreeTerminalView {
  tabs: TerminalTabView[];
  focusedTabId: string;
}

export interface TerminalMenuActions {
  split: boolean;
  unsplit: boolean;
  splitDisabled: boolean;
}

export interface TerminalMoveTarget {
  tabId: string;
  label: string;
}

export function emptyTerminals(): WorktreeTerminalView {
  return { tabs: [], focusedTabId: '' };
}

export function terminalDisplayName(terminal: Pick<TerminalView, 'customName' | 'command'>): string {
  const custom = terminal.customName.trim();
  return custom.length > 0 ? custom : terminal.command;
}

export function terminalHostTitle(host: TerminalHostKind): string {
  return host === 'tmux' ? 'tmux session' : 'in-app terminal';
}

export interface TabChipName {
  terminalId: string;
  text: string;
}

export interface TabChipModel {
  positionText: string;
  label: string | null;
  names: TabChipName[] | null;
}

export function tabChipText(position: number, tab: TerminalTabView): string {
  const custom = tab.customName.trim();
  if (custom.length > 0) {
    return `${position} ${custom}`;
  }
  if (tab.terminals.length > 1) {
    return `${position} ${tab.terminals.map((terminal) => terminalDisplayName(terminal)).join(' · ')}`;
  }
  const only = tab.terminals[0];
  const name = only ? terminalDisplayName(only) : '';
  return name.length > 0 ? `${position} ${name}` : `${position}`;
}

export function tabChipModel(position: number, tab: TerminalTabView): TabChipModel {
  const positionText = String(position);
  if (tab.terminals.length > 1 && tab.customName.trim().length === 0) {
    return {
      positionText,
      label: null,
      names: tab.terminals.map((terminal) => ({
        terminalId: terminal.id,
        text: terminalDisplayName(terminal),
      })),
    };
  }
  const text = tabChipText(position, tab);
  const prefix = `${positionText} `;
  return {
    positionText,
    label: text.startsWith(prefix) ? text.slice(prefix.length) : null,
    names: null,
  };
}

export function editableName(tab: TerminalTabView, terminalId: string | null): string {
  if (terminalId !== null && tab.terminals.length > 1) {
    const terminal = tab.terminals.find((item) => item.id === terminalId);
    return terminal ? terminalDisplayName(terminal) : '';
  }
  const custom = tab.customName.trim();
  if (custom.length > 0) {
    return custom;
  }
  return tab.terminals
    .map((terminal) => terminalDisplayName(terminal))
    .filter((name) => name.length > 0)
    .join(' · ');
}

export function terminalMenuActions(tab: TerminalTabView, terminalId: string | null): TerminalMenuActions {
  if (terminalId !== null && tab.terminals.length > 1) {
    return { split: true, unsplit: true, splitDisabled: true };
  }
  if (tab.terminals.length > 1) {
    return { split: false, unsplit: false, splitDisabled: true };
  }
  return { split: true, unsplit: false, splitDisabled: false };
}

export function terminalMoveTargets(
  state: WorktreeTerminalView,
  sourceTabId: string,
  terminalId: string | null,
): TerminalMoveTarget[] {
  const source = state.tabs.find((tab) => tab.id === sourceTabId);
  if (!source || !movingTerminal(source, terminalId)) {
    return [];
  }
  return state.tabs.flatMap((tab, index) => {
    if (tab.id === sourceTabId || tab.terminals.length !== 1) {
      return [];
    }
    return [{ tabId: tab.id, label: tabChipText(index + 1, tab) }];
  });
}

export function withNewTab(state: WorktreeTerminalView, tab: TerminalTabView): WorktreeTerminalView {
  return {
    tabs: [...state.tabs, tab],
    focusedTabId: tab.id,
  };
}

export function withSplit(
  state: WorktreeTerminalView,
  tabId: string,
  terminal: TerminalView,
): WorktreeTerminalView {
  return {
    ...state,
    focusedTabId: tabId,
    tabs: state.tabs.map((tab) => {
      if (tab.id !== tabId || tab.terminals.length !== 1) {
        return tab;
      }
      return placeOnRight(tab, terminal);
    }),
  };
}

export function withMoveInto(
  state: WorktreeTerminalView,
  sourceTabId: string,
  terminalId: string | null,
  targetTabId: string,
): WorktreeTerminalView {
  if (sourceTabId === targetTabId) {
    return state;
  }
  const source = state.tabs.find((tab) => tab.id === sourceTabId);
  const target = state.tabs.find((tab) => tab.id === targetTabId);
  if (!source || !target || target.terminals.length !== 1) {
    return state;
  }
  const moving = movingTerminal(source, terminalId);
  if (!moving) {
    return state;
  }
  const carried = carriedTerminal(source, moving);
  const placed = placeOnRight(target, carried);
  const rest = source.terminals.filter((terminal) => terminal.id !== moving.id);
  const tabs = state.tabs.flatMap((tab) => {
    if (tab.id === targetTabId) {
      return [placed];
    }
    if (tab.id !== sourceTabId) {
      return [tab];
    }
    const only = rest[0];
    if (rest.length === 1 && only) {
      return [collapsePair(tab, only)];
    }
    return [];
  });
  return { tabs, focusedTabId: target.id };
}

export function withRename(
  state: WorktreeTerminalView,
  tabId: string,
  terminalId: string | null,
  name: string,
): WorktreeTerminalView {
  const trimmed = name.trim();
  return {
    ...state,
    tabs: state.tabs.map((tab) => {
      if (tab.id !== tabId) {
        return tab;
      }
      if (terminalId === null || tab.terminals.length < 2) {
        return { ...tab, customName: trimmed };
      }
      return {
        ...tab,
        terminals: tab.terminals.map((terminal) =>
          terminal.id === terminalId ? { ...terminal, customName: trimmed } : terminal,
        ),
      };
    }),
  };
}

export function withUnsplit(
  state: WorktreeTerminalView,
  tabId: string,
  terminalId: string,
  newTabId: string,
): WorktreeTerminalView {
  const index = state.tabs.findIndex((tab) => tab.id === tabId);
  const tab = state.tabs[index];
  if (!tab || tab.terminals.length < 2) {
    return state;
  }
  const moving = tab.terminals.find((terminal) => terminal.id === terminalId);
  const staying = tab.terminals.find((terminal) => terminal.id !== terminalId);
  if (!moving || !staying) {
    return state;
  }
  const movedName = moving.customName.trim();
  const newTab: TerminalTabView = {
    id: newTabId,
    customName: movedName,
    terminals: [{ ...moving, customName: '' }],
    focusedTerminalId: moving.id,
    splitRatio: 0.5,
  };
  const tabs = [...state.tabs];
  tabs.splice(index, 1, collapsePair(tab, staying), newTab);
  return { tabs, focusedTabId: newTab.id };
}

export function withoutTerminal(
  state: WorktreeTerminalView,
  tabId: string,
  terminalId: string,
): { state: WorktreeTerminalView; removed: TerminalView[] } {
  const tab = state.tabs.find((item) => item.id === tabId);
  if (!tab) {
    return { state, removed: [] };
  }
  const dying = tab.terminals.find((item) => item.id === terminalId);
  if (!dying) {
    return { state, removed: [] };
  }
  const rest = tab.terminals.filter((item) => item.id !== terminalId);
  const only = rest[0];
  if (!only || rest.length === 0) {
    return withoutTab(state, tabId);
  }
  return {
    state: {
      ...state,
      tabs: state.tabs.map((item) => (item.id === tabId ? collapsePair(tab, only) : item)),
    },
    removed: [dying],
  };
}

export function withoutTab(
  state: WorktreeTerminalView,
  tabId: string,
): { state: WorktreeTerminalView; removed: TerminalView[] } {
  const index = state.tabs.findIndex((tab) => tab.id === tabId);
  const tab = state.tabs[index];
  if (!tab) {
    return { state, removed: [] };
  }
  const tabs = state.tabs.filter((item) => item.id !== tabId);
  let focusedTabId = state.focusedTabId;
  if (focusedTabId === tabId || !tabs.some((item) => item.id === focusedTabId)) {
    const neighbor = tabs[Math.min(index, tabs.length - 1)];
    focusedTabId = neighbor?.id ?? '';
  }
  return {
    state: { tabs, focusedTabId },
    removed: tab.terminals,
  };
}

export function mapTerminalCommand(
  state: WorktreeTerminalView,
  terminalId: string,
  command: string,
): WorktreeTerminalView {
  return {
    ...state,
    tabs: state.tabs.map((tab) => {
      if (!tab.terminals.some((terminal) => terminal.id === terminalId)) {
        return tab;
      }
      return {
        ...tab,
        terminals: tab.terminals.map((terminal) =>
          terminal.id === terminalId ? { ...terminal, command } : terminal,
        ),
      };
    }),
  };
}

function placeOnRight(tab: TerminalTabView, terminal: TerminalView): TerminalTabView {
  const existing = tab.terminals[0];
  if (!existing) {
    return tab;
  }
  const moved = tab.customName.trim();
  const kept = moved.length > 0 ? { ...existing, customName: moved } : existing;
  return {
    ...tab,
    customName: '',
    terminals: [kept, terminal],
    focusedTerminalId: terminal.id,
  };
}

function carriedTerminal(source: TerminalTabView, moving: TerminalView): TerminalView {
  if (moving.customName.trim().length > 0 || source.terminals.length !== 1) {
    return moving;
  }
  const tabName = source.customName.trim();
  return tabName.length > 0 ? { ...moving, customName: tabName } : moving;
}

function movingTerminal(tab: TerminalTabView, terminalId: string | null): TerminalView | undefined {
  if (terminalId !== null) {
    return tab.terminals.find((terminal) => terminal.id === terminalId);
  }
  return tab.terminals.length === 1 ? tab.terminals[0] : undefined;
}

function collapsePair(tab: TerminalTabView, only: TerminalView): TerminalTabView {
  const tabName = tab.customName.trim();
  if (tabName.length > 0) {
    return {
      ...tab,
      terminals: [{ ...only, customName: '' }],
      focusedTerminalId: only.id,
    };
  }
  const terminalName = only.customName.trim();
  if (terminalName.length > 0) {
    return {
      ...tab,
      customName: terminalName,
      terminals: [{ ...only, customName: '' }],
      focusedTerminalId: only.id,
    };
  }
  return {
    ...tab,
    terminals: [only],
    focusedTerminalId: only.id,
  };
}
