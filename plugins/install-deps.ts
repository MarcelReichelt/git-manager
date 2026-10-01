const plugin = {
  name: 'install-deps',
  async postMerge(): Promise<void> {
    console.log('[install-deps] Run yarn/npm install after merge');
  },
};

export default plugin;
