const plugin = {
  name: 'merge-guard',
  async preMerge(ctx: { direction: string; sourceBranch: string }): Promise<'abort' | void> {
    if (ctx.direction === 'into-primary' && ctx.sourceBranch.includes('wip')) {
      console.log('[merge-guard] Blocking merge from WIP branch');
      return 'abort';
    }
  },
};

export default plugin;
