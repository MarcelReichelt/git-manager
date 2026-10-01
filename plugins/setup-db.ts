import type { GitManagerPlugin } from '../src/hooks.js';

const plugin: GitManagerPlugin = {
  name: 'setup-db',
  postWorktreeCreate(context) {
    console.log(`[setup-db] Would start a database for ${context.branch} at ${context.worktreePath}`);
  },
};

export default plugin;
