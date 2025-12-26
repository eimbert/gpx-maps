import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { HomeComponent } from './home/home.component';
import { LoadGpxComponent } from './load-gpx/load-gpx.component';
import { MapComponent } from './map/map.component';
import { AuthGuard } from './services/auth.guard';

const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'load', component: LoadGpxComponent },
  { path: 'events', component: LoadGpxComponent, canActivate: [AuthGuard], data: { mode: 'events' } },
  { path: 'map', component: MapComponent },
  { path: '**', redirectTo: '' }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule {}
