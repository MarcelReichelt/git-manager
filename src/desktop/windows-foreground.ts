import koffi from 'koffi';

// TH32CS_SNAPPROCESS
const processSnapshot = 0x2;
// PROCESS_QUERY_LIMITED_INFORMATION
const processQueryLimited = 0x1000;
// ProcessCommandLineInformation
const processCommandLine = 60;

interface ProcessEntry {
  dwSize: number;
  cntUsage: number;
  th32ProcessID: number;
  th32DefaultHeapID: number;
  th32ModuleID: number;
  cntThreads: number;
  th32ParentProcessID: number;
  pcPriClassBase: number;
  dwFlags: number;
  szExeFile: string;
}

interface ListedProcess {
  pid: number;
  parentPid: number;
  name: string;
}

interface ProcessTools {
  list(): ListedProcess[];
  commandLine(pid: number): string;
}

let tools: ProcessTools | null = null;

export function windowsForegroundCommand(pid: number): string {
  if (process.platform !== 'win32' || pid <= 0) {
    return '';
  }
  try {
    return foregroundName(pid);
  } catch {
    return '';
  }
}

function foregroundName(pid: number): string {
  const listed = processTools().list();
  const children = new Map<number, ListedProcess[]>();
  for (const item of listed) {
    const group = children.get(item.parentPid) ?? [];
    group.push(item);
    children.set(item.parentPid, group);
  }
  const child = foregroundChild(pid, children);
  if (!child) {
    return '';
  }
  if (/^node(\.exe)?$/i.test(child.name)) {
    const commandLine = processTools().commandLine(child.pid);
    // npm runs as node.exe. The cli path is the process name Linux stores in the title.
    if (/[\\/]npm[\\/]bin[\\/]npm-cli\.js/i.test(commandLine)) {
      return 'npm';
    }
  }
  return child.name;
}

function foregroundChild(pid: number, children: Map<number, ListedProcess[]>): ListedProcess | null {
  const group = (children.get(pid) ?? []).filter((child) => !consoleHost(child.name));
  let chosen: ListedProcess | null = null;
  for (const child of group) {
    if (!chosen || child.pid > chosen.pid) {
      chosen = child;
    }
  }
  return chosen;
}

function consoleHost(name: string): boolean {
  const normalized = name.toLowerCase();
  return normalized === 'conhost.exe' || normalized === 'openconsole.exe';
}

function processTools(): ProcessTools {
  if (tools) {
    return tools;
  }
  const kernel32 = koffi.load('kernel32.dll');
  const ntdll = koffi.load('ntdll.dll');
  const processEntry = koffi.struct('PROCESSENTRY32W', {
    dwSize: 'uint32',
    cntUsage: 'uint32',
    th32ProcessID: 'uint32',
    th32DefaultHeapID: 'uintptr',
    th32ModuleID: 'uint32',
    cntThreads: 'uint32',
    th32ParentProcessID: 'uint32',
    pcPriClassBase: 'int32',
    dwFlags: 'uint32',
    szExeFile: koffi.array('char16', 260, 'String'),
  });
  const commandText = koffi.struct('UNICODE_STRING', {
    Length: 'uint16',
    MaximumLength: 'uint16',
    Buffer: 'uintptr',
  });
  const createSnapshot = kernel32.func(
    'void * __stdcall CreateToolhelp32Snapshot(uint32 dwFlags, uint32 th32ProcessID)',
  );
  const firstProcess = kernel32.func(
    'bool __stdcall Process32FirstW(void *hSnapshot, _Inout_ PROCESSENTRY32W *lppe)',
  );
  const nextProcess = kernel32.func(
    'bool __stdcall Process32NextW(void *hSnapshot, _Inout_ PROCESSENTRY32W *lppe)',
  );
  const closeHandle = kernel32.func('bool __stdcall CloseHandle(void *hObject)');
  const openProcess = kernel32.func(
    'void * __stdcall OpenProcess(uint32 dwDesiredAccess, bool bInheritHandle, uint32 dwProcessId)',
  );
  const queryProcess = ntdll.func(
    'int32 __stdcall NtQueryInformationProcess(void *ProcessHandle, int32 ProcessInformationClass, void *ProcessInformation, uint32 ProcessInformationLength, _Out_ uint32 *ReturnLength)',
  );
  const entrySize = koffi.sizeof(processEntry);
  const textOffset = koffi.sizeof(commandText);

  tools = {
    list(): ListedProcess[] {
      const snapshot = createSnapshot(processSnapshot, 0);
      const entry: ProcessEntry = {
        dwSize: entrySize,
        cntUsage: 0,
        th32ProcessID: 0,
        th32DefaultHeapID: 0,
        th32ModuleID: 0,
        cntThreads: 0,
        th32ParentProcessID: 0,
        pcPriClassBase: 0,
        dwFlags: 0,
        szExeFile: '',
      };
      const listed: ListedProcess[] = [];
      try {
        if (!firstProcess(snapshot, entry)) {
          return listed;
        }
        do {
          const name = executableName(entry.szExeFile);
          if (name.length > 0) {
            listed.push({
              pid: entry.th32ProcessID,
              parentPid: entry.th32ParentProcessID,
              name,
            });
          }
          entry.dwSize = entrySize;
        } while (nextProcess(snapshot, entry));
      } finally {
        closeHandle(snapshot);
      }
      return listed;
    },
    commandLine(pid: number): string {
      const handle = openProcess(processQueryLimited, false, pid);
      if (!handle) {
        return '';
      }
      try {
        const written = [0];
        queryProcess(handle, processCommandLine, null, 0, written);
        const size = written[0] ?? 0;
        if (size <= textOffset) {
          return '';
        }
        const buffer = Buffer.alloc(size);
        const status = queryProcess(handle, processCommandLine, buffer, buffer.length, written);
        if (status !== 0) {
          return '';
        }
        const byteLength = buffer.readUInt16LE(0);
        const end = textOffset + byteLength;
        if (byteLength <= 0 || end > buffer.length) {
          return '';
        }
        return buffer.toString('utf16le', textOffset, end);
      } finally {
        closeHandle(handle);
      }
    },
  };
  return tools;
}

function executableName(name: string): string {
  const end = name.indexOf('\0');
  return (end === -1 ? name : name.slice(0, end)).trim();
}
