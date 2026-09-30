import { describe, expect, it } from 'vitest';
import { runCli } from './run-cli.js';

describe('removed commands', () => {
  it('does not offer clone, ui, doctor, push, pull, or the settings wizard', async () => {
    const help = await runCli(['--help']);
    expect(help.exitCode).toBe(0);

    const commands = help.stdout.split('Commands:')[1] ?? '';
    expect(commands).toContain('add');
    expect(commands).toContain('list');
    expect(commands).toContain('unregister');
    expect(commands).not.toContain('clone');
    expect(commands).not.toContain('ui');
    expect(commands).not.toContain('doctor');
    expect(commands).not.toContain('push');
    expect(commands).not.toContain('pull');
    expect(commands).not.toContain('settings');
    expect(commands).not.toContain('setup');
  });

  it('fails when clone, ui, doctor, push, pull, or the settings wizard is invoked', async () => {
    const invocations = [
      ['clone', 'https://example.com/demo.git'],
      ['ui'],
      ['doctor'],
      ['push'],
      ['pull'],
      ['settings', 'wizard'],
      ['setup'],
    ];

    for (const args of invocations) {
      const result = await runCli(args);
      expect(result.exitCode).toBe(1);
    }
  });
});
