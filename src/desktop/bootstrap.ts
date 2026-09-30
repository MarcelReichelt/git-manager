import { bootstrapApplication } from '@angular/platform-browser';
import { Workspace } from './workspace.js';

bootstrapApplication(Workspace).catch((error: unknown) => {
  console.error(error);
});
