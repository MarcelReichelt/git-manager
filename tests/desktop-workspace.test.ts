import { TestBed } from '@angular/core/testing';
import { WorkspaceComponent } from '../src/desktop/workspace.component';

describe('desktop workspace', () => {
  async function render() {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [WorkspaceComponent],
    }).compileComponents();

    const fixture = TestBed.createComponent(WorkspaceComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('shows a centered repository card and no branch list on first start', async () => {
    const fixture = await render();
    const card = fixture.nativeElement.querySelector('[data-testid="repository-card"]');

    expect(card).not.toBeNull();
    const frame = getComputedStyle(card.parentElement);
    expect(frame.display).toBe('flex');
    expect(frame.justifyContent).toBe('center');
    expect(frame.alignItems).toBe('center');
    expect(fixture.nativeElement.querySelector('[data-testid="branch-list"]')).toBeNull();

    const names = [...card.querySelectorAll('[data-testid="repository"]')].map((element) =>
      element.getAttribute('data-name'),
    );
    expect(names).toEqual(['Harbor', 'Atlas']);
    expect(card.textContent).toContain('Harbor');
    expect(card.textContent).toContain('Atlas');
  });

  it('shows the Harbor workspace after choosing Harbor', async () => {
    const fixture = await render();
    const harbor = fixture.nativeElement.querySelector(
      '[data-testid="repository"][data-name="Harbor"]',
    );

    harbor.click();
    fixture.detectChanges();

    const workspace = fixture.nativeElement.querySelector('[data-testid="workspace"]');
    expect(workspace).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="repository-name"]').textContent).toContain(
      'Harbor',
    );
  });

  it('switches from Harbor to Atlas through a centered repository overlay', async () => {
    const fixture = await render();
    fixture.nativeElement.querySelector('[data-testid="repository"][data-name="Harbor"]').click();
    fixture.detectChanges();

    fixture.nativeElement.querySelector('[data-testid="switch-repository"]').click();
    fixture.detectChanges();

    const overlay = fixture.nativeElement.querySelector('[data-testid="switching-overlay"]');
    expect(overlay).not.toBeNull();
    const card = overlay.querySelector('[data-testid="repository-card"]');
    const frame = getComputedStyle(card.parentElement);
    expect(frame.display).toBe('flex');
    expect(frame.justifyContent).toBe('center');
    expect(frame.alignItems).toBe('center');
    const names = [...card.querySelectorAll('[data-testid="repository"]')].map((element) =>
      element.getAttribute('data-name'),
    );
    expect(names).toEqual(['Harbor', 'Atlas']);

    overlay.querySelector('[data-testid="repository"][data-name="Atlas"]').click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="repository-name"]').textContent).toContain(
      'Atlas',
    );
    expect(fixture.nativeElement.querySelector('[data-testid="switching-overlay"]')).toBeNull();
  });

  it('pins the content sheet to the top, right, and bottom after a repository is chosen', async () => {
    const fixture = await render();
    expect(fixture.nativeElement.querySelector('[data-testid="content-sheet"]')).toBeNull();

    fixture.nativeElement.querySelector('[data-testid="repository"][data-name="Harbor"]').click();
    fixture.detectChanges();

    const sheet = fixture.nativeElement.querySelector('[data-testid="content-sheet"]');
    const style = getComputedStyle(sheet);
    expect(style.position).toBe('fixed');
    expect(style.top).toBe('0px');
    expect(style.right).toBe('0px');
    expect(style.bottom).toBe('0px');
  });

  it('lists every Harbor branch with status, changed files, and commits ahead and behind', async () => {
    const fixture = await render();
    fixture.nativeElement.querySelector('[data-testid="repository"][data-name="Harbor"]').click();
    fixture.detectChanges();

    const rows = [...fixture.nativeElement.querySelectorAll('[data-testid="branch-row"]')];
    expect(rows.map((row) => row.getAttribute('data-branch'))).toEqual([
      'feature/login',
      'wip',
      'origin/release',
      'abandoned',
      'rename-docs',
    ]);
    expect(rows.map((row) => row.getAttribute('data-status'))).toEqual([
      'local-and-remote',
      'local-only',
      'remote-only',
      'remote-deleted',
      'local-and-remote',
    ]);
    expect(rowText(rows, 'changed-file-count')).toEqual(['2', '0', '0', '1', '1']);
    expect(rowText(rows, 'ahead')).toEqual(['3', '0', '4', '2', '1']);
    expect(rowText(rows, 'behind')).toEqual(['1', '0', '0', '0', '0']);
    expect(fixture.nativeElement.querySelector('[data-branch="HEAD"]')).toBeNull();
  });

  it('colors a branch row by status and shows no text badge', async () => {
    const fixture = await render();
    fixture.nativeElement.querySelector('[data-testid="repository"][data-name="Harbor"]').click();
    fixture.detectChanges();

    const background = (branch: string) =>
      getComputedStyle(
        fixture.nativeElement.querySelector(`[data-testid="branch-row"][data-branch="${branch}"]`),
      ).backgroundColor;

    expect(background('wip')).toBe('rgb(173, 216, 230)');
    expect(background('feature/login')).toBe('rgb(0, 128, 0)');
    expect(background('origin/release')).toBe('rgb(255, 255, 0)');
    expect(background('abandoned')).toBe('rgb(255, 0, 0)');

    for (const row of fixture.nativeElement.querySelectorAll('[data-testid="branch-row"]')) {
      expect(row.textContent).not.toMatch(/local only|local-only|remote only|remote-only|gone|remote-deleted/i);
    }
  });

  it('shows a terminal count only while that branch has running terminals', async () => {
    const fixture = await render();
    fixture.nativeElement.querySelector('[data-testid="repository"][data-name="Harbor"]').click();
    fixture.detectChanges();

    const login = fixture.nativeElement.querySelector('[data-branch="feature/login"]');
    expect(login.querySelector('[data-testid="terminal-count"]').textContent.trim()).toBe('2');

    for (const branch of ['wip', 'origin/release', 'abandoned', 'rename-docs']) {
      const row = fixture.nativeElement.querySelector(`[data-branch="${branch}"]`);
      expect(row.querySelector('[data-testid="terminal-count"]')).toBeNull();
    }
  });

  it('places create after the branch list as the last sidebar control', async () => {
    const fixture = await render();
    fixture.nativeElement.querySelector('[data-testid="repository"][data-name="Harbor"]').click();
    fixture.detectChanges();

    const sidebar = fixture.nativeElement.querySelector('[data-testid="workspace"] aside');
    const branchList = sidebar.querySelector('[data-testid="branch-list"]');
    const create = sidebar.querySelector('[data-testid="create-worktree"]');
    expect(create).not.toBeNull();
    expect(branchList.compareDocumentPosition(create) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);

    const controls = [...sidebar.querySelectorAll('button, a, input, select, textarea')];
    expect(controls.at(-1)).toBe(create);
  });
});

function rowText(rows: Element[], testId: string): string[] {
  return rows.map((row) => row.querySelector(`[data-testid="${testId}"]`)?.textContent?.trim() ?? '');
}
