const plugin = {
  name: 'setup-db',
  async postWorktreeCreate(ctx: { branch: string; worktreePath: string }): Promise<void> {
    console.log(`[setup-db] Would prepare a database for ${ctx.branch} in ${ctx.worktreePath}`);
  },
};

export default plugin;
