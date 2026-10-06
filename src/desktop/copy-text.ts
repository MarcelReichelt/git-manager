export type TextCopy = (text: string) => void;

interface CopyHost {
  gitWorktreeManager?: {
    copyText?: (text: string) => void;
  };
  navigator?: {
    clipboard?: {
      writeText?: (text: string) => Promise<void>;
    };
  };
}

function hostCopy(text: string): void {
  const host = globalThis as CopyHost;
  const copy = host.gitWorktreeManager?.copyText;
  if (copy) {
    copy(text);
    return;
  }
  const writeText = host.navigator?.clipboard?.writeText;
  if (!writeText) {
    return;
  }
  try {
    const pending = writeText(text);
    void pending?.catch(() => undefined);
  } catch {
    return;
  }
}

let textCopy: TextCopy = hostCopy;

export function setTextCopy(copy: TextCopy): void {
  textCopy = copy;
}

export function resetTextCopy(): void {
  textCopy = hostCopy;
}

export function copyText(text: string): void {
  textCopy(text);
}
