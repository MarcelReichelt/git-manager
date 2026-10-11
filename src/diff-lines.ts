export interface DiffSpan {
  text: string;
  changed: boolean;
}

export interface DiffLine {
  kind: 'context' | 'removed' | 'added';
  oldNumber: number | null;
  newNumber: number | null;
  text: string;
  spans: DiffSpan[];
}

export interface InlineDiff {
  lines: DiffLine[];
  previousPath: string | null;
  binary: boolean;
}

interface RawLine {
  kind: DiffLine['kind'];
  oldNumber: number | null;
  newNumber: number | null;
  text: string;
}

export interface DiffLinesOptions {
  previousPath?: string | null;
  binary?: boolean;
}

export function diffLines(patch: string, options: DiffLinesOptions = {}): InlineDiff {
  const lines: DiffLine[] = [];
  let hunk: RawLine[] = [];
  let oldNumber = 0;
  let newNumber = 0;
  let inHunk = false;
  let previousPath: string | null = null;
  let binary = false;

  const flushHunk = (): void => {
    lines.push(...withSpans(hunk));
    hunk = [];
  };

  for (const line of patch.split('\n')) {
    if (line.length === 0) {
      continue;
    }
    if (line.startsWith('Binary files ')) {
      binary = true;
      continue;
    }
    if (line.startsWith('rename from ')) {
      previousPath = line.slice('rename from '.length).trim();
      continue;
    }
    const header = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (header) {
      flushHunk();
      oldNumber = Number(header[1]);
      newNumber = Number(header[2]);
      inHunk = true;
      continue;
    }
    if (!inHunk || line.startsWith('\\')) {
      continue;
    }
    const marker = line[0];
    const text = line.slice(1);
    if (marker === ' ') {
      hunk.push({ kind: 'context', oldNumber, newNumber, text });
      oldNumber += 1;
      newNumber += 1;
      continue;
    }
    if (marker === '-') {
      hunk.push({ kind: 'removed', oldNumber, newNumber: null, text });
      oldNumber += 1;
      continue;
    }
    if (marker === '+') {
      hunk.push({ kind: 'added', oldNumber: null, newNumber, text });
      newNumber += 1;
    }
  }
  flushHunk();

  const selectedPath = options.previousPath?.trim() ?? '';
  return {
    lines,
    previousPath: selectedPath !== '' ? selectedPath : previousPath,
    binary: options.binary === true || binary,
  };
}

function withSpans(lines: RawLine[]): DiffLine[] {
  const result: DiffLine[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (!line || line.kind !== 'removed') {
      if (line) {
        result.push(unchanged(line));
      }
      index += 1;
      continue;
    }
    let removedEnd = index;
    while (removedEnd < lines.length && lines[removedEnd]?.kind === 'removed') {
      removedEnd += 1;
    }
    let addedEnd = removedEnd;
    while (addedEnd < lines.length && lines[addedEnd]?.kind === 'added') {
      addedEnd += 1;
    }
    const removed = lines.slice(index, removedEnd);
    const added = lines.slice(removedEnd, addedEnd);
    if (added.length === removed.length) {
      const paired = removed.map((before, pair) => intraSpans(before.text, added[pair]?.text ?? ''));
      for (let pair = 0; pair < removed.length; pair += 1) {
        const before = removed[pair];
        if (before) {
          result.push({ ...before, spans: paired[pair]?.removed ?? [{ text: before.text, changed: false }] });
        }
      }
      for (let pair = 0; pair < added.length; pair += 1) {
        const after = added[pair];
        if (after) {
          result.push({ ...after, spans: paired[pair]?.added ?? [{ text: after.text, changed: false }] });
        }
      }
    } else {
      for (const plain of [...removed, ...added]) {
        result.push(unchanged(plain));
      }
    }
    index = addedEnd;
  }
  return result;
}

function unchanged(line: RawLine): DiffLine {
  return { ...line, spans: [{ text: line.text, changed: false }] };
}

function intraSpans(before: string, after: string): { removed: DiffSpan[]; added: DiffSpan[] } {
  const oldTokens = tokenize(before);
  const newTokens = tokenize(after);
  const { oldChanged, newChanged } = changedTokens(oldTokens, newTokens);
  return {
    removed: coalesce(oldTokens, oldChanged),
    added: coalesce(newTokens, newChanged),
  };
}

function tokenize(text: string): string[] {
  return text.match(/\s+|\S+/g) ?? [];
}

function changedTokens(before: string[], after: string[]): { oldChanged: boolean[]; newChanged: boolean[] } {
  const oldCount = before.length;
  const newCount = after.length;
  const lengths: number[][] = Array.from({ length: oldCount + 1 }, () => Array(newCount + 1).fill(0));
  for (let oldIndex = oldCount - 1; oldIndex >= 0; oldIndex -= 1) {
    for (let newIndex = newCount - 1; newIndex >= 0; newIndex -= 1) {
      const nextOld = lengths[oldIndex + 1]?.[newIndex] ?? 0;
      const nextNew = lengths[oldIndex]?.[newIndex + 1] ?? 0;
      const diagonal = lengths[oldIndex + 1]?.[newIndex + 1] ?? 0;
      lengths[oldIndex]![newIndex] = before[oldIndex] === after[newIndex] ? diagonal + 1 : Math.max(nextOld, nextNew);
    }
  }
  const oldChanged = Array<boolean>(oldCount).fill(true);
  const newChanged = Array<boolean>(newCount).fill(true);
  let oldIndex = 0;
  let newIndex = 0;
  while (oldIndex < oldCount && newIndex < newCount) {
    if (before[oldIndex] === after[newIndex]) {
      oldChanged[oldIndex] = false;
      newChanged[newIndex] = false;
      oldIndex += 1;
      newIndex += 1;
      continue;
    }
    const dropOld = lengths[oldIndex + 1]?.[newIndex] ?? 0;
    const dropNew = lengths[oldIndex]?.[newIndex + 1] ?? 0;
    if (dropOld >= dropNew) {
      oldIndex += 1;
    } else {
      newIndex += 1;
    }
  }
  return { oldChanged, newChanged };
}

function coalesce(tokens: string[], changed: boolean[]): DiffSpan[] {
  const spans: DiffSpan[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const text = tokens[index] ?? '';
    const isChanged = changed[index] ?? false;
    const last = spans.at(-1);
    if (last && last.changed === isChanged) {
      last.text += text;
      continue;
    }
    spans.push({ text, changed: isChanged });
  }
  if (spans.length === 0) {
    spans.push({ text: '', changed: false });
  }
  return spans;
}
