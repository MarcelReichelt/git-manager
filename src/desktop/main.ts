import 'zone.js';
import { bootstrapApplication } from '@angular/platform-browser';
import { WorkspaceComponent } from './workspace.component';

bootstrapApplication(WorkspaceComponent).catch((error: unknown) => {
  console.error(error);
});
