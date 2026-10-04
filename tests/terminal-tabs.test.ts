import { describe, expect, it } from 'vitest';
import {
  tabChipModel,
  tabChipText,
  type TerminalTabView,
  type TerminalView,
} from '../src/desktop/terminal-tabs.js';

function terminal(id: string, command: string, customName = ''): TerminalView {
  return {
    id,
    host: 'shell',
    cwd: '/repo',
    session: '',
    customName,
    command,
  };
}

function tab(terminals: TerminalView[], customName = ''): TerminalTabView {
  return {
    id: 'tab-1',
    customName,
    terminals,
    focusedTerminalId: terminals[0]?.id ?? '',
    splitRatio: 0.5,
  };
}

function rendered(position: number, item: TerminalTabView): string {
  const model = tabChipModel(position, item);
  if (model.names) {
    return `${model.positionText} ${model.names.map((name) => name.text).join(' · ')}`;
  }
  return model.label === null ? model.positionText : `${model.positionText} ${model.label}`;
}

describe('tab chip', () => {
  it('keeps one terminal as a single label', () => {
    const item = tab([terminal('a', 'bash')]);
    expect(tabChipText(1, item)).toBe('1 bash');
    expect(tabChipModel(1, item)).toEqual({ positionText: '1', label: 'bash', names: null });
    expect(rendered(1, item)).toBe(tabChipText(1, item));
  });

  it('shows only the position when the only terminal has no name', () => {
    const item = tab([terminal('a', '')]);
    expect(tabChipText(1, item)).toBe('1');
    expect(tabChipModel(1, item)).toEqual({ positionText: '1', label: null, names: null });
  });

  it('gives each terminal in a pair its own name, including an empty one', () => {
    const item = tab([terminal('a', ''), terminal('b', 'fish')]);
    expect(tabChipText(1, item)).toBe('1  · fish');
    expect(tabChipModel(1, item)).toEqual({
      positionText: '1',
      label: null,
      names: [
        { terminalId: 'a', text: '' },
        { terminalId: 'b', text: 'fish' },
      ],
    });
    expect(rendered(1, item)).toBe('1  · fish');
  });

  it('uses a custom tab name as one label', () => {
    const item = tab([terminal('a', 'bash'), terminal('b', 'npm')], 'build');
    expect(tabChipText(2, item)).toBe('2 build');
    expect(tabChipModel(2, item)).toEqual({ positionText: '2', label: 'build', names: null });
  });

  it('prefers a terminal custom name over the command', () => {
    const item = tab([terminal('a', 'bash', 'left'), terminal('b', 'bash', 'right')]);
    expect(tabChipText(1, item)).toBe('1 left · right');
    expect(tabChipModel(1, item).names).toEqual([
      { terminalId: 'a', text: 'left' },
      { terminalId: 'b', text: 'right' },
    ]);
  });
});
