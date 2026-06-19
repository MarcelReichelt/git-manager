import type { GitManagerPlugin } from '../src/hooks/types.js';

const plugin: GitManagerPlugin = {
  name: 'install-deps',
  async postMerge() {
    console.log('[install-deps] Run yarn/npm install after merge');
  },
};

export default plugin;
