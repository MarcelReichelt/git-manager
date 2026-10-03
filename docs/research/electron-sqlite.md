# How Electron apps handle SQLite

Many Electron apps keep local data in SQLite. The native ABI split is handled in a few recurring ways: compile the addon for Electron's headers, download a prebuild for that Electron ABI, ship one N-API binary per OS and architecture, or skip a native addon. Some Electron apps never open SQLite from their own code.

Slack, Discord, Obsidian, 1Password, Spotify, WhatsApp, and Teams are omitted. No first-party page opened for this note confirms both that the app is Electron and which local database it uses. Slack's engineering posts describe an Electron desktop and do not name a database. Notion's engineering post names SQLite and does not say the desktop app is Electron; the browser half of that post is included below.

## What this repo does today

The registered-repository list is one SQLite file. `resolveRegistryPath` uses `GIT_MANAGER_REGISTRY_PATH` or `~/.config/git-manager/registry.db`. `openDatabase` creates `repositories(path, display_name)` (`src/registry.ts`). The dependency is `better-sqlite3` `^12.11.1`. Electron is pinned to `35.7.5` (`package.json`).

`better-sqlite3` is a native addon. The CLI loads the build compiled for system Node. Electron 35.7.5 reports Node module ABI 133 (`modules` in the [Electron 35.7.5 release record](https://releases.electronjs.org/releases.json)), which is the ABI `node-abi` assigns from Electron `35.0.0-alpha.1` ([abi_registry.json](https://github.com/electron/node-abi/blob/main/abi_registry.json)). A `.node` file built for system Node does not load in that Electron.

`scripts/ensure-electron-natives.mjs` runs `node-gyp rebuild --target=<exact electron version> --arch=<process.arch> --dist-url=https://electronjs.org/headers` for `better-sqlite3` and `node-pty`, stashes the Node `build/` directory, and copies `better_sqlite3.node` into `native/electron/`. `src/desktop/electron-preload.cjs` replaces `Module._extensions['.node']` so a require of that filename loads the Electron binary. `docs/troubleshooting.md` documents the `node-gyp` failure mode (Python, make, and g++).

## Electron's own guidance for native addons

Electron supports native Node modules and says they must be recompiled. The ABI differs from a given Node binary, including Chromium's BoringSSL instead of OpenSSL. Loading the wrong binary fails with `NODE_MODULE_VERSION` mismatch ([Native Node Modules](https://github.com/electron/electron/blob/main/docs/tutorial/using-native-node-modules.md)).

That page lists the install paths:

- Install, then run `@electron/rebuild` (`electron-rebuild`). Electron Forge runs it in development and when making distributables.
- Set `npm_config_target`, `npm_config_runtime=electron`, `npm_config_disturl=https://electronjs.org/headers`, and `npm_config_build_from_source=true`, then `npm install`.
- Run `node-gyp rebuild --target=<electron version> --arch=<arch> --dist-url=https://electronjs.org/headers`. This repo's script is that command.
- If a module publishes `prebuild` binaries for Electron, omit a from-source install so the prebuild is used. For `node-pre-gyp` modules with no Electron binary, the page says to use `@electron/rebuild`.

`@electron/rebuild` rebuilds native modules against the Electron app's Node. It requires Node 22.12.0 or newer and `node-gyp` for source builds. With `prebuild` / `prebuild-install`, it downloads the project's prebuilt binary instead of compiling. The default header URL is `https://www.electronjs.org/headers` ([electron/rebuild README](https://github.com/electron/rebuild/blob/main/README.md)).

`require` of a `.node` file uses `process.dlopen`. Inside an `app.asar` that call unpacks to a temporary file. The asar tutorial's workaround is to ship the `.node` unpacked (`asar pack --unpack *.node`) ([ASAR archives](https://github.com/electron/electron/blob/main/docs/tutorial/asar-archives.md)).

## Apps that ship a native SQLite binding

| App | Binding | What it opens | API |
| --- | --- | --- | --- |
| Visual Studio Code | `@vscode/sqlite3` `5.1.12-vscode` | `state.vscdb` | async `sqlite3` callbacks |
| Signal Desktop | `@signalapp/sqlcipher` `4.1.0` | `sql/db.sqlite`, SQLCipher | sync `prepare` / `run` |
| Joplin desktop | `sqlite3` `5.1.6` | `<profile>/database.sqlite` | async `sqlite3` callbacks |
| Actual (desktop) | `better-sqlite3` `^13.0.3` | a filesystem path passed to `openDatabase` | sync `prepare` / `run` |
| git-manager | `better-sqlite3` `^12.11.1` | `registry.db` | sync `prepare` / `run` |

### Visual Studio Code

`package.json` depends on `@vscode/sqlite3` `5.1.12-vscode` and sets `allowScripts` so that package's install script runs ([package.json](https://github.com/microsoft/vscode/blob/main/package.json)). `SQLiteStorageDatabase` dynamically imports `@vscode/sqlite3` and executes `CREATE TABLE IF NOT EXISTS ItemTable (key TEXT UNIQUE ON CONFLICT REPLACE, value BLOB)` ([src/vs/base/parts/storage/node/storage.ts](https://github.com/microsoft/vscode/blob/main/src/vs/base/parts/storage/node/storage.ts)). `ApplicationStorageMain`, `ApplicationSharedStorageMain`, and `WorkspaceStorageMain` name the file `state.vscdb` and construct `SQLiteStorageDatabase` ([storageMain.ts](https://github.com/microsoft/vscode/blob/main/src/vs/platform/storage/electron-main/storageMain.ts)).

The npm package is published from [microsoft/vscode-node-sqlite3](https://github.com/microsoft/vscode-node-sqlite3) (`release/vscode`). It is a fork of `node-sqlite3`. The root `.npmrc` sets `runtime=electron`, `target=43.7.5`, `disturl=https://electronjs.org/headers`, and `build_from_source=true` ([.npmrc](https://github.com/microsoft/vscode/blob/main/.npmrc)). The remote-server `.npmrc` sets `runtime=node`, `target=24.21.0`, and `disturl=https://nodejs.org/dist` ([remote/.npmrc](https://github.com/microsoft/vscode/blob/main/remote/.npmrc)). `remote/package.json` depends on the same `@vscode/sqlite3` version. Desktop and remote are two compile targets of one binding.

### Signal Desktop

`package.json` depends on `@signalapp/sqlcipher` `4.1.0` and Electron `44.4.5`. `postinstall` runs `electron-builder install-app-deps`. The packaged file list keeps `node_modules/@signalapp/sqlcipher/prebuilds/${platform}-${arch}/*.node`, and `asarUnpack` is `**/*.node` ([package.json](https://github.com/signalapp/Signal-Desktop/blob/main/package.json)).

The addon README describes an N-API binding around SQLCipher, with `new Database(path)`, `prepare`, and `run` ([signalapp/node-sqlcipher README](https://github.com/signalapp/node-sqlcipher/blob/main/README.md)). The published package's install script is `node-gyp-build`, and the prebuild script is `prebuildify --strip --napi` ([npm registry record for 4.1.0](https://registry.npmjs.org/@signalapp/sqlcipher/4.1.0)). The tarball contains one `.node` per OS and architecture (`prebuilds/linux-x64/@signalapp+sqlcipher.node` and the matching darwin, win32, and arm64 paths), not one file per Electron ABI.

`initialize` in `ts/sql/Server.node.ts` sets the file to `<configDir>/sql/db.sqlite`. `openAndMigrateDatabase` constructs `new SQL(filePath)`, then `keyDatabase` runs `db.pragma(\`key = "x'${key}'"\`)` and `switchToWAL` sets `journal_mode = WAL` ([Server.node.ts](https://github.com/signalapp/Signal-Desktop/blob/main/ts/sql/Server.node.ts)). SQLCipher's README says that with no key it behaves like standard SQLite, and that a plaintext database can be converted to an encrypted one ([sqlcipher README](https://github.com/sqlcipher/sqlcipher/blob/master/README.md)).

### Joplin

`packages/app-desktop/package.json` depends on `sqlite3` `5.1.6`, `@electron/rebuild` `4.1.0`, and Electron `42.3.0`. `packages/app-cli/package.json` depends on the same `sqlite3` `5.1.6`. Desktop `asarUnpack` lists `./node_modules/sqlite-vec-*/**` and the `node-notifier` vendor tree ([app-desktop package.json](https://github.com/laurent22/joplin/blob/dev/packages/app-desktop/package.json)).

`tools/electronRebuild.js` runs `electron-rebuild` with `--force-abi 146`. The comment says Electron Builder or `node-abi` otherwise picks the wrong ABI, and that the number has to be updated for each Electron release ([electronRebuild.js](https://github.com/laurent22/joplin/blob/dev/packages/app-desktop/tools/electronRebuild.js)). ABI 146 is the Electron entry whose target is `42.0.0-alpha.1` ([abi_registry.json](https://github.com/electron/node-abi/blob/main/abi_registry.json)).

The renderer init passes `require('sqlite3')` into `shimInit` as `nodeSqlite` ([main-html.ts](https://github.com/laurent22/joplin/blob/dev/packages/app-desktop/main-html.ts)). `DatabaseDriverNode.open` calls `new sqlite3.Database(options.name, ...)` ([database-driver-node.ts](https://github.com/laurent22/joplin/blob/dev/packages/lib/database-driver-node.ts)). `BaseApplication` opens `${profileDir}/database.sqlite` ([BaseApplication.ts](https://github.com/laurent22/joplin/blob/dev/packages/lib/BaseApplication.ts)).

An unused `DatabaseDriverBetterSqlite` file says a `better-sqlite3` driver might be interesting because node-sqlite "breaks all the time when we try to compile any app", and that the performance difference probably would not matter. It also says `better-sqlite3` builds with `SQLITE_DQS=0`, which rejects the double-quoted strings Joplin already uses, so a switch would need a custom compile ([database-driver-better-sqlite.ts](https://github.com/laurent22/joplin/blob/dev/packages/lib/database-driver-better-sqlite.ts)). An open issue says `node-sqlite3` is unmaintained and names `node:sqlite` and `better-sqlite3` as alternatives ([issue 13916](https://github.com/laurent22/joplin/issues/13916)).

### Actual

The Electron package depends on Electron `43.5.0` and `better-sqlite3` `^13.0.3` ([packages/desktop-electron/package.json](https://github.com/actualbudget/actual/blob/master/packages/desktop-electron/package.json)). `openDatabase` in the Electron sqlite module does `new SQL(pathOrBuffer)` from `better-sqlite3` ([index.electron.ts](https://github.com/actualbudget/actual/blob/master/packages/loot-core/src/platform/server/sqlite/index.electron.ts)). The non-Electron module loads `@jlongster/sql.js` instead ([index.ts](https://github.com/actualbudget/actual/blob/master/packages/loot-core/src/platform/server/sqlite/index.ts)).

`beforePackHook.ts` calls `rebuild` from `@electron/rebuild` with `force: true`, `onlyModules: ['better-sqlite3', 'bcrypt', 'argon2']`, and the packager's Electron version. It sets `npm_config_force_build=1` and comments that prebuilts are needed for each architecture ([beforePackHook.ts](https://github.com/actualbudget/actual/blob/master/packages/desktop-electron/beforePackHook.ts)). The root script `rebuild-electron` runs `electron-rebuild` with `--build-from-source -f` for those same modules ([package.json](https://github.com/actualbudget/actual/blob/master/package.json)).

## How those bindings survive Electron's ABI

`better-sqlite3` `^12.11.1` is the range in this repo's `package.json`. v12.11.1 installs with `prebuild-install || node-gyp rebuild --release` ([package.json at v12.11.1](https://github.com/WiseLibs/better-sqlite3/blob/v12.11.1/package.json)). The tag's workflow builds Electron prebuilds with `prebuild -r electron` for Electron 29.0.0 through 38.0.0, and a second command for 39.0.0 through 42.3.0 ([build.yml at v12.11.1](https://github.com/WiseLibs/better-sqlite3/blob/v12.11.1/.github/workflows/build.yml)). The v12.11.1 GitHub release includes `better-sqlite3-v12.11.1-electron-v133-<platform>-<arch>.tar.gz`, which is the ABI of Electron 35. `prebuild-install` downloads the binary for the runtime that is installing. An install under system Node downloads the Node binary. The Electron tarball is a second file. The troubleshooting doc for that line of releases says to use `electron-rebuild`, and to unpack native libraries from an asar ([troubleshooting.md at v12.11.1](https://github.com/WiseLibs/better-sqlite3/blob/v12.11.1/docs/troubleshooting.md)). The same Electron section is still on `master` ([troubleshooting.md](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/troubleshooting.md)).

v13.0.0 is the first release on Node-API. The release notes say prebuilt binaries should theoretically work across Node and Electron versions, that `prebuild-install` was removed, and that a missing prebuild still compiles at install time ([v13.0.0 release](https://github.com/WiseLibs/better-sqlite3/releases/tag/v13.0.0)). v13.0.3 ships those binaries inside the package as `prebuilds/<platform>-<arch>.node` (`linux-x64`, `darwin-arm64`, `win32-x64`, `linuxmusl-arm64`, and the other x64/arm64 pairs). `lib/binding.js` loads that path from `process.platform` and `process.arch`. It does not read `NODE_MODULE_VERSION`. When the file is present, `binding.gyp` sets the target type to `none`, so npm's implicit rebuild compiles nothing. The addon is built with `NAPI_VERSION=10` ([binding.gyp at v13.0.3](https://github.com/WiseLibs/better-sqlite3/blob/v13.0.3/binding.gyp), [lib/binding.js at v13.0.3](https://github.com/WiseLibs/better-sqlite3/blob/v13.0.3/lib/binding.js)).

Node-API 10 is supported on Node v22.14.0+, v23.6.0+, and later ([Node-API version matrix](https://nodejs.org/docs/latest/api/n-api.html#node-api-version-matrix)). The v13 package sets `engines.node` to `>=22` ([package.json at v13.0.3](https://github.com/WiseLibs/better-sqlite3/blob/v13.0.3/package.json)). Electron 35.7.5, the version this repo pins, reports Node `22.16.0` and module ABI `133` ([Electron 35.7.5 release record](https://releases.electronjs.org/releases.json)). That Node is inside the Node-API 10 range. The maintainer closed the long-open N-API request by pointing at v13 ([issue 271](https://github.com/WiseLibs/better-sqlite3/issues/271)). The request to run the test suite under Electron is still open ([issue 1224](https://github.com/WiseLibs/better-sqlite3/issues/1224)).

Actual depends on `^13.0.3` and still force-rebuilds `better-sqlite3` from source in the pack hook above. The hook comment says prebuilts are needed for each architecture, and it sets `npm_config_force_build=1`, which is the `binding.gyp` switch that compiles even when a prebuild is already in the package. That rebuild is the cross-architecture pack, not a second ABI for the same machine.

This repo's preload swap keys off the filename `better_sqlite3.node` (`src/desktop/electron-native-addons.cjs`). v13's prebuild is named for the platform and architecture, so that swap does not see it. `scripts/ensure-electron-natives.mjs` also rebuilds `node-pty` in the same loop. A v13 sqlite binary that loads in both hosts leaves that `node-pty` rebuild in place. This repo's `engines` field is Node `>=20` (`package.json`); v13's field is `>=22`.

`node-sqlite3` v5+ uses Node-API. The current README says the prebuilt binaries are for Node-API v3 and v6, one per OS and architecture (`darwin-arm64`, `linux-x64`, `win32-x64`, and the others on that list). The "Custom builds and Electron" section still documents a from-source Electron build: `--runtime=electron --target=<electron version> --dist-url=https://electronjs.org/headers`. It says `electron-rebuild` drops a SQLCipher build, which is why those flags are there. The README marks the repository unmaintained ([TryGhost/node-sqlite3 README](https://github.com/TryGhost/node-sqlite3/blob/master/README.md)). Joplin still runs `electron-rebuild` for `sqlite3` `5.1.6`. VS Code's `.npmrc` forces a from-source build against Electron headers for its fork of the same binding.

Signal's SQLCipher addon is the N-API prebuild case: one `.node` per OS and architecture, loaded with `node-gyp-build`, plus `electron-builder install-app-deps` and an asar unpack of `*.node`.

## SQLite without a native addon

Actual's non-Electron sqlite module calls `initSqlJs` from `@jlongster/sql.js`. The Electron module's `setWasmBinary` is a no-op and comments that the browser backend instantiates sql.js from an embedded wasm binary ([index.electron.ts](https://github.com/actualbudget/actual/blob/master/packages/loot-core/src/platform/server/sqlite/index.electron.ts), [index.ts](https://github.com/actualbudget/actual/blob/master/packages/loot-core/src/platform/server/sqlite/index.ts)).

`sql.js` compiles SQLite to WebAssembly. Its README says an Electron or Node app will likely prefer a native binding, because native code is faster and can use the database file directly instead of loading the entire database into memory ([sql.js README](https://github.com/sql-js/sql.js/blob/master/README.md)).

`@sqlite.org/sqlite-wasm` wraps the official SQLite Wasm build. Its README says Node.js is supported only for in-memory databases without persistence, and that the origin private file system backend is the worker build ([sqlite-wasm README](https://github.com/sqlite/sqlite-wasm/blob/main/README.md)).

Notion's engineering post says the Mac and Windows app already cached in SQLite, with a single parent process writing the file, and that the browser client now uses the official WASM build of SQLite. The browser database is an OPFS file opened from a Web Worker, using the OPFS SyncAccessHandle Pool VFS. The post says the WASM library is a few hundred kilobytes and that downloading it slowed the first page load until the load was made asynchronous. The same post does not say the desktop app is Electron and does not name the desktop binding ([How we sped up Notion in the browser with WASM SQLite](https://www.notion.com/blog/how-we-sped-up-notion-in-the-browser-with-wasm-sqlite)).

## Electron apps that do not use SQLite

GitHub Desktop depends on Electron `44.1.1` ([package.json](https://github.com/desktop/desktop/blob/development/package.json)). The repository list is Dexie. `RepositoriesDatabase` extends `BaseDatabase`, which extends `Dexie`, and declares tables `repositories`, `gitHubRepositories`, `protectedBranches`, and `owners` ([repositories-database.ts](https://github.com/desktop/desktop/blob/development/app/src/lib/databases/repositories-database.ts), [base-database.ts](https://github.com/desktop/desktop/blob/development/app/src/lib/databases/base-database.ts)). The app package depends on `dexie` `^3.2.3` ([app/package.json](https://github.com/desktop/desktop/blob/development/app/package.json)). A Desktop maintainer wrote that repository data is stored in IndexedDB under the app's Chromium profile directory, and that the account name is in `localStorage` ([desktop issue 8744](https://github.com/desktop/desktop/issues/8744)).

Element Desktop is the Electron wrapper around Element Web. The current desktop package pins Electron `44.4.5` and depends on `electron-store` ([apps/desktop/package.json](https://github.com/element-hq/element-web/blob/develop/apps/desktop/package.json); the [element-desktop README](https://github.com/element-hq/element-desktop/blob/develop/README.md) describes that wrapper). `StorageManager.ts` imports `IndexedDBStore` and `IndexedDBCryptoStore`. The sync store name is `riot-web-sync` and the crypto store name is `matrix-js-sdk::matrix-sdk-crypto`. The file's comment says that store holds the end-to-end encryption keys and that Chromium can evict IndexedDB under storage pressure ([StorageManager.ts](https://github.com/element-hq/element-web/blob/develop/apps/web/src/utils/StorageManager.ts)). Desktop settings that the main process reads live in an `electron-store` named `electron-config`. The class comment calls it a JSON-backed store. Secrets in that file are encrypted with Electron `safeStorage` ([store.ts](https://github.com/element-hq/element-web/blob/develop/apps/desktop/src/store.ts)).

## What the registry would and would not get

The registry is synchronous inserts, lists, deletes, and lookups of `path` and `display_name` (`src/registry.ts`). The CLI and the Electron app both load `better-sqlite3`. The table is the mechanical difference. It is not a recommendation.

| Approach | Sync calls | Encryption | Rebuild | What lands in the app |
| --- | --- | --- | --- | --- |
| Current: `better-sqlite3` v12, `node-gyp` for Electron, Node build put back | Yes | No | Source build on Electron upgrade; needs Python, make, and g++ (`docs/troubleshooting.md`) | Two `.node` files, one per ABI. v12.11.1 also publishes an `electron-v133` prebuild for this Electron |
| `@electron/rebuild` or the v12 Electron prebuild, one `node_modules` tree | Yes | No | Download or compile for Electron. That file is the wrong ABI for system Node | One `.node` in `node_modules`. The CLI and Electron still need different files on v12 |
| `better-sqlite3` v13 | Yes. `prepare` / `run` stay. v13.0.0 had a parameter-binding regression fixed in v13.0.1 | No | One Node-API 10 prebuild per OS and CPU, for Node 22.14+ and an Electron that ships that Node. Electron 35.7.5 ships Node 22.16.0. Actual still force-rebuilds when packing another architecture. No Electron test job in upstream CI | `prebuilds/<platform>-<arch>.node` inside the npm package. Node `>=22`. The preload hook that looks for `better_sqlite3.node` does not match that filename |
| Joplin's `sqlite3` | Callbacks | No, unless rebuilt for SQLCipher as the node-sqlite3 README describes | `electron-rebuild`, and Joplin pins the ABI by hand. The npm package is marked unmaintained | Native `.node`. N-API prebuilds in the README are per OS/arch, and Joplin rebuilds anyway |
| VS Code's `@vscode/sqlite3` | Callbacks | `state.vscdb` is opened without a SQLCipher key | From-source against Electron headers in `.npmrc`, and a second from-source build for the remote Node | A fork maintained inside the VS Code build |
| Signal's `@signalapp/sqlcipher` | Yes, `prepare` / `run` | Yes. `PRAGMA key` makes the file SQLCipher, not a plaintext SQLite file | N-API prebuild per OS/arch, plus `electron-builder install-app-deps` | One `.node` per OS/arch, unpacked from the asar. The package is AGPL |
| Actual's sql.js path, or `@sqlite.org/sqlite-wasm` | sql.js keeps the database in memory and exports bytes. sqlite-wasm's Node support is in-memory only | No | No native addon | WASM. sql.js loads the whole file into memory. Notion measured a few hundred kilobytes of WASM on the browser path |
| Dexie / IndexedDB, as in GitHub Desktop, or Element's IndexedDB plus `electron-store` JSON | Async IndexedDB. `electron-store` is synchronous JSON for a small settings object | Element encrypts secrets in that JSON with `safeStorage`. IndexedDB in these apps is not SQLCipher | No native addon for the database | No `.node` for the store. The bytes live in the Chromium profile, not in a file the Node CLI opens with `better-sqlite3` |
