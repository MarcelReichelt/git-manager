import type { GitManagerPlugin } from '../src/hooks/types.js';

const plugin: GitManagerPlugin = {
  name: 'setup-db',
  async postWorktreeCreate(ctx) {
    const port = (ctx as { hookConfig?: { database_port?: number } }).hookConfig?.database_port ?? 5432;
    console.log(`[setup-db] Would start database on port ${port} for ${ctx.branch}`);
  },
};

export default plugin;
