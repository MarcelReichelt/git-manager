const plugin = {
  name: 'setup-db',
  async postWorktreeCreate(ctx: {
    branch: string;
    hookConfig?: { database_port?: number };
  }): Promise<void> {
    const port = ctx.hookConfig?.database_port ?? 5432;
    console.log(`[setup-db] Would start database on port ${port} for ${ctx.branch}`);
  },
};

export default plugin;
