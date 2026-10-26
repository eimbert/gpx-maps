import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class DashboardStateService {
  routeCount = 0;
  pendingCount = 0;
  accountOpen = false;
}
