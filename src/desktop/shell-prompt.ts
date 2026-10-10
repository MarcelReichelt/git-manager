const settleMs = 500;
const latestMs = 5_000;

export function shellCanTakeInput(buffer: string): boolean {
  const marker = lastIntegrationMarker(buffer);
  if (marker === 'B') {
    return true;
  }
  if (marker === 'A' || marker === 'C') {
    return false;
  }
  return /(?:[$#%>]|❯|➜|λ|›|»)\s*$/.test(visiblePrompt(buffer));
}

export function watchStartupPrompt(send: () => void): {
  push(buffer: string): void;
  cancel(): void;
} {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let readySince = 0;
  let keySince = 0;
  let lastKey = '';
  let latest = '';
  let sent = false;

  const clear = (): void => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  return {
    cancel() {
      sent = true;
      clear();
    },
    push(buffer: string) {
      if (sent) {
        return;
      }
      latest = buffer;
      if (!shellCanTakeInput(buffer)) {
        readySince = 0;
        keySince = 0;
        lastKey = '';
        clear();
        return;
      }
      const now = Date.now();
      if (readySince === 0) {
        readySince = now;
      }
      const key = visiblePrompt(buffer).trimEnd();
      if (key !== lastKey) {
        lastKey = key;
        keySince = now;
      }
      clear();
      const stableFor = now - keySince;
      const readyFor = now - readySince;
      const delay =
        stableFor >= settleMs || readyFor >= latestMs ? 0 : Math.min(settleMs - stableFor, latestMs - readyFor);
      timer = setTimeout(() => {
        deliver();
      }, delay);
    },
  };

  function deliver(): void {
    timer = null;
    if (sent || !shellCanTakeInput(latest)) {
      return;
    }
    const now = Date.now();
    const quietFor = visiblePrompt(latest).trimEnd() === lastKey ? now - keySince : 0;
    const waitingFor = readySince === 0 ? 0 : now - readySince;
    if (quietFor < settleMs && waitingFor < latestMs) {
      timer = setTimeout(() => {
        deliver();
      }, Math.max(settleMs - quietFor, 20));
      return;
    }
    sent = true;
    send();
  }
}

function visiblePrompt(buffer: string): string {
  return buffer.replace(/\u001b(?:\[[0-9;?]*[A-Za-z]|\][^\u0007]*(?:\u0007|\u001b\\))/g, '').replace(/\r/g, '');
}

function lastIntegrationMarker(buffer: string): string | null {
  let marker: string | null = null;
  for (const match of buffer.matchAll(/\u001b\](?:133|633);([A-D])/g)) {
    marker = match[1] ?? marker;
  }
  return marker;
}
