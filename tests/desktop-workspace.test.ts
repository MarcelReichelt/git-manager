import { TestBed } from '@angular/core/testing';
import { WorkspaceComponent } from '../src/desktop/workspace.component';

describe('desktop workspace toolchain', () => {
  it('renders the Angular workspace', async () => {
    await TestBed.configureTestingModule({
      imports: [WorkspaceComponent],
    }).compileComponents();

    const fixture = TestBed.createComponent(WorkspaceComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('git-manager');
  });
});
