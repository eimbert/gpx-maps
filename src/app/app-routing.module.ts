import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { HomeComponent } from './home/home.component';
import { LoadGpxComponent } from './load-gpx/load-gpx.component';
import { MapComponent } from './map/map.component';
import { DiscoverRouteComponent } from './discover-route/discover-route.component';
import { AuthGuard } from './services/auth.guard';
import { PlanOutingComponent } from './plan-outing/plan-outing.component';
import { ResetPasswordComponent } from './reset-password/reset-password.component';
import { PrivacyPolicyComponent } from './privacy-policy/privacy-policy.component';
import { RouteAnalyzerComponent } from './route-analyzer/route-analyzer.component';
import { GarminSyncComponent } from './garmin-sync/garmin-sync.component';

const routes: Routes = [
  { path: '', component: HomeComponent, pathMatch: 'full' },
  { path: 'load', component: LoadGpxComponent },
  { path: 'analysis', component: RouteAnalyzerComponent, canActivate: [AuthGuard] },
  { path: 'plan', component: PlanOutingComponent, canActivate: [AuthGuard] },
  { path: 'map', component: MapComponent },
  { path: 'discover', component: DiscoverRouteComponent },
  { path: 'reset-password', component: ResetPasswordComponent },
  { path: 'privacy-policy', component: PrivacyPolicyComponent },
  { path: 'garmin', component: GarminSyncComponent, canActivate: [AuthGuard] },
  { path: '**', redirectTo: '' }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule {}
