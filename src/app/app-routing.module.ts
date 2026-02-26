import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { HomeComponent } from './home/home.component';
import { LoadGpxComponent } from './load-gpx/load-gpx.component';
import { MapComponent } from './map/map.component';
import { AuthGuard } from './services/auth.guard';
import { PlanOutingComponent } from './plan-outing/plan-outing.component';
import { ResetPasswordComponent } from './reset-password/reset-password.component';

const routes: Routes = [
  { path: '', component: HomeComponent, pathMatch: 'full' },
  { path: 'load', component: LoadGpxComponent },
  { path: 'events', component: LoadGpxComponent, canActivate: [AuthGuard], data: { mode: 'events' } },
  { path: 'plan', component: PlanOutingComponent, canActivate: [AuthGuard] },
  { path: 'map', component: MapComponent },
  { path: 'reset-password', component: ResetPasswordComponent },
  { path: '**', redirectTo: '' }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule {}
