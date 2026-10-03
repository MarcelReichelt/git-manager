# How Electron apps handle SQLite

Many Electron apps keep local data in a SQLite file. The native binding is the part that hurts, and they do not all handle it the same way. Some ship a binding compiled for Electron's ABI. Some publish one N-API binary per OS and load that. Some skip a native addon and use IndexedDB or WASM SQLite instead.

This note only includes apps and libraries whose own docs or source were opened. Slack, Discord, Notion, Obsidian, and 1Password are left out: no first-party page was checked for those.

## What this repo does

The registry is one SQLite file, `~/.config/git-manager/registry.db`, opened with `better-sqlite3` (`src/registry.ts`). The table is `repositories(path, display_name)`.

`better-sqlite3` is a native addon. The CLI loads the copy compiled for system Node. Electron embeds a different Node ABI, so that binary does not load in the desktop app. Electron's own write-up of that mismatch is below.

`scripts/ensure-electron-natives.mjs` compiles `better-sqlite3` and `node-pty` with `node-gyp rebuild --target=<exact electron version> --dist-url=https://electronjs.org/headers`, stashes the Node `build/` directory, and copies `better_sqlite3.node` to `native/electron/`. `src/desktop/electron-preload.cjs` patches `Module._extensions['.node']` so a require of that filename loads the Electron binary. Electron is pinned to `35.7.5` (`package.json`). `docs/troubleshooting.md` is the node-gyp failure mode: Python, make, and g++.

That script is the "manually building for Electron" path in Electron's docs, plus a second copy of the binary so the CLI and the desktop app can both run from one checkout.

## Electron's own guidance

Native modules are supported, and they have to be recompiled for Electron. Electron's ABI differs from Node's because Chromium uses BoringSSL rather than OpenSSL. Loading a Node-built `.node` file fails with `NODE_MODULE_VERSION` mismatch ([Native Node Modules](https://www.electronjs.org/docs/latest/tutorial/using-native-node-modules)).

The same page lists the ways to get a binary that loads:

- Install, then run `@electron/rebuild` (`electron-rebuild`). Electron Forge does this on its own. The rebuild tool's job is to compile native modules against the Node that Electron ships, so the system Node version does not have to match ([electron/rebuild](https://github.com/electron/rebuild)).
- Set `npm_config_target`, `npm_config_runtime=electron`, and `npm_config_disturl=https://electronjs.org/headers` and install.
- Run `node-gyp rebuild --target=<electron version> --dist-url=https://electronjs.org/headers` by hand. This repo does that.
- If the module publishes `prebuild` binaries for Electron, do not force a source build; use the prebuilt file.

After an Electron upgrade, rebuild. Inside an `app.asar`, native libraries have to be unpacked. `better-sqlite3` says the same two things: use `electron-rebuild`, and unpack native libraries from the asar ([troubleshooting, v12.11.1](https://github.com/WiseLibs/better-sqlite3/blob/v12.11.1/docs/troubleshooting.md)).

`node-abi` records one ABI for an Electron major. Electron 35 starts at ABI 133 (`target` `35.0.0-alpha.1`); Electron 36 is ABI 135 ([abi_registry.json](https://github.com/electron/node-abi/blob/main/abi_registry.json)). A binary built for Electron 35.0.0 loads in Electron 35.7.5.

## `better-sqlite3` already publishes Electron binaries

v12.11.1, the version this repo resolves, installs with `prebuild-install || node-gyp rebuild --release` ([package.json at v12.11.1](https://github.com/WiseLibs/better-sqlite3/blob/v12.11.1/package.json)). `prebuild-install` runs at install time and downloads one binary for the runtime that is installing.

The release workflow builds those binaries for Node and for Electron. The Electron list includes `-r electron -t 35.0.0` through `-t 38.0.0`, and a separate job for Electron 39+ ([build.yml at v12.11.1](https://github.com/WiseLibs/better-sqlite3/blob/v12.11.1/.github/workflows/build.yml)). Electron 35 is the major this repo pins.

`npm install` under system Node downloads the Node binary. That is the right file for the CLI and the wrong file for Electron. Downloading the Electron 35 prebuild avoids the compiler for the desktop app. It still does not put both binaries in `node_modules` at once. A checkout that runs both hosts still needs two files, which is what `native/electron/` is.

## Apps that ship a native SQLite binding

| App | Binding | Database | How the binary is produced |
| --- | --- | --- | --- |
| Visual Studio Code | `@vscode/sqlite3` `5.1.12-vscode` | `state.vscdb` | Vendored binding, shipped inside the app |
| Signal Desktop | `@signalapp/sqlcipher` `4.1.0` | SQLCipher file, key via `PRAGMA key` | N-API prebuilds, unpacked from the asar |
| Joplin desktop | `sqlite3` `5.1.6` | Node driver over a SQLite file | `@electron/rebuild` before packaging |
| git-manager | `better-sqlite3` `^12.11.1` | `registry.db` | `node-gyp` for Electron, Node build left in place |

### Visual Studio Code

`package.json` depends on `@vscode/sqlite3` at `5.1.12-vscode` and allows that package's install script ([package.json](https://github.com/microsoft/vscode/blob/main/package.json)). The storage implementation imports that package and runs `CREATE TABLE IF NOT EXISTS ItemTable (key TEXT UNIQUE ON CONFLICT REPLACE, value BLOB)` ([src/vs/base/parts/storage/node/storage.ts](https://github.com/microsoft/vscode/blob/main/src/vs/base/parts/storage/node/storage.ts)). The desktop storage service names the file `state.vscdb` and opens it with `SQLiteStorageDatabase` for profile, shared, and workspace state ([storageMain.ts](https://github.com/microsoft/vscode/blob/main/src/vs/platform/storage/electron-main/storageMain.ts)).

`@vscode/sqlite3` is Microsoft's fork of `node-sqlite3`, published from [microsoft/vscode-node-sqlite3](https://github.com/microsoft/vscode-node-sqlite3). That README still says `electron-rebuild` does not preserve a SQLCipher build, and that an Electron source build needs `--runtime=electron --target=<electron version> --dist-url=https://electronjs.org/headers`. The API is the callback-style `sqlite3` API, not `better-sqlite3`.

VS Code is an Electron app. It does not also ship a Node CLI that must load the same `node_modules` binary, so it does not keep two copies the way this repo does.

### Signal Desktop

`package.json` depends on `@signalapp/sqlcipher` `4.1.0` and on Electron `44.4.5`. `postinstall` runs `electron-builder install-app-deps`. The asar unpack list includes `node_modules/@signalapp/sqlcipher/prebuilds/${platform}-${arch}/*.node` ([package.json](https://github.com/signalapp/Signal-Desktop/blob/main/package.json)).

The binding is a N-API addon around SQLCipher. Its install script is `node-gyp-build`, and its prebuild script is `prebuildify --strip --napi` ([signalapp/node-sqlcipher package.json](https://github.com/signalapp/node-sqlcipher/blob/master/package.json)). N-API prebuilds are selected by platform, architecture, and N-API version, not by `NODE_MODULE_VERSION`. The package README shows the same shape as `better-sqlite3`: `new Database(path)`, `prepare`, `run` ([README](https://github.com/signalapp/node-sqlcipher/blob/master/README.md)).

`ts/sql/Server.node.ts` opens that database and sets the key with `db.pragma(\`key = "x'${key}'"\`)`, then `journal_mode = WAL` ([Server.node.ts](https://github.com/signalapp/Signal-Desktop/blob/main/ts/sql/Server.node.ts)). The file is encrypted SQLite. A plaintext `better-sqlite3` file is a different format once a key is set; SQLCipher's own README says that with no key it behaves like SQLite ([sqlcipher README](https://github.com/sqlcipher/sqlcipher/blob/master/README.md)).

### Joplin

The desktop package depends on `sqlite3` `5.1.6` and on `@electron/rebuild` `4.1.0`. Electron is `42.3.0`. The `dist` script runs `yarn electronRebuild` before `electron-builder`. `asarUnpack` lists native trees, including `sqlite-vec` ([packages/app-desktop/package.json](https://github.com/laurent22/joplin/blob/dev/packages/app-desktop/package.json)).

`tools/electronRebuild.js` calls `electron-rebuild` and passes `--force-abi 146`, with a comment that Electron Builder or `node-abi` otherwise picks the wrong ABI and that the number has to be updated for each Electron release ([electronRebuild.js](https://github.com/laurent22/joplin/blob/dev/packages/app-desktop/tools/electronRebuild.js)). ABI 146 is Electron 42 ([abi_registry.json](https://github.com/electron/node-abi/blob/main/abi_registry.json)).

The driver opens the file with `new sqlite3.Database(options.name, ...)` ([packages/lib/database-driver-node.ts](https://github.com/laurent22/joplin/blob/dev/packages/lib/database-driver-node.ts)). The CLI package depends on the same `sqlite3` `5.1.6` ([packages/app-cli/package.json](https://github.com/laurent22/joplin/blob/dev/packages/app-cli/package.json)). Desktop and CLI are separate packages, so each install can hold the binary for its own runtime. Joplin's maintainers have an open issue to leave `node-sqlite3` because it is unmaintained, and they name `node:sqlite` and `better-sqlite3` as the alternatives ([issue 13916](https://github.com/laurent22/joplin/issues/13916)). The current `sqlite3` README marks the package deprecated and unmaintained ([TryGhost/node-sqlite3](https://github.com/TryGhost/node-sqlite3)).

## An Electron app that does not use SQLite

GitHub Desktop depends on Electron `44.1.1` ([package.json](https://github.com/desktop/desktop/blob/development/package.json)). Its repository list is a Dexie database, not SQLite. `RepositoriesDatabase` extends `BaseDatabase` and declares Dexie tables (`repositories`, `gitHubRepositories`, `protectedBranches`, `owners`) ([repositories-database.ts](https://github.com/desktop/desktop/blob/development/app/src/lib/databases/repositories-database.ts)). The app package depends on `dexie` `^3.2.3` ([app/package.json](https://github.com/desktop/desktop/blob/development/app/package.json)). Dexie is a wrapper around IndexedDB, and its README names Electron as a supported host ([Dexie.js README](https://github.com/dexie/Dexie.js/blob/master/README.md)).

IndexedDB is Chromium's database. There is no `.node` file and no Electron rebuild. The data lives in the Chromium profile, not in a file a Node CLI opens with `better-sqlite3`.

## SQLite without a native addon

`sql.js` compiles SQLite to WebAssembly. Its README says an Electron or Node app will likely prefer a native binding: native code is faster, and it can use the database file directly instead of loading the whole file into memory ([sql.js README](https://github.com/sql-js/sql.js/blob/master/README.md)). Official SQLite also publishes a WASM build as `@sqlite.org/sqlite-wasm` ([sqlite-wasm](https://github.com/sqlite/sqlite-wasm)). Neither was found as the store in the apps above.

WASM removes the ABI problem. It does not give the sync, on-disk `better-sqlite3` API this registry uses.

## What each approach would change for this registry

The registry is a small synchronous file: insert, list, delete, lookup (`src/registry.ts`). These are the mechanical differences, not a recommendation.

| Approach | Sync API | On-disk file the CLI can open | Native build | Encryption |
| --- | --- | --- | --- | --- |
| Current: `better-sqlite3`, compile a second binary | Yes | Yes, same file | `node-gyp` on Electron upgrade, and on a missing prebuild | No |
| Install the published Electron 35 prebuild into `native/electron/` | Yes | Yes, same file | Download instead of compile, while the prebuild exists for that ABI | No |
| `@electron/rebuild` in place | Yes | Yes, until something rebuilds the other ABI over it | Replaces the `node_modules` binary; the CLI and Electron still cannot share that one file | No |
| Joplin's `sqlite3` plus `electron-rebuild` | No, callbacks | Yes, if both hosts use a compatible SQLite build | Rebuild per package; the npm package is marked unmaintained | No |
| Signal's `@signalapp/sqlcipher` | Yes, same shape | Only with the key; AGPL package | N-API prebuild per OS/arch | Yes, SQLCipher |
| VS Code's `@vscode/sqlite3` | No, callbacks | Yes | Vendored fork, maintained for their Electron | Optional SQLCipher flags in the upstream README, not how `state.vscdb` is opened |
| Dexie / IndexedDB, as in GitHub Desktop | No | No shared file with the CLI | None | No |
| `sql.js` / SQLite WASM | Mostly sync, in memory | Whole file loaded and written back | None | No |

The split that this repo's script exists for is the two hosts. Electron-only apps rebuild once and ship that binary. Joplin puts the CLI and the desktop app in different packages so each install gets one ABI. A single `node_modules` that serves both `node dist/cli.js` and `electron` still needs two builds of `better-sqlite3`, whether those builds are compiled or downloaded.
