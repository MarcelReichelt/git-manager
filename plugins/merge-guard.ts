import type { GitManagerPlugin } from '../src/hooks/types.js';

const plugin: GitManagerPlugin = {
  name: 'merge-guard',
  async preMerge(ctx) {
    if (ctx.direction === 'into-primary' && ctx.sourceBranch.includes('wip')) {
      console.log('[merge-guard] Blocking merge from WIP branch');
      return 'abort';
    }
  },
};

export default plugin;
