import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { LoadGpxComponent } from './load-gpx/load-gpx.component';
import { MapComponent } from './map/map.component';

const routes: Routes = [
  { path: '', redirectTo: 'load', pathMatch: 'full' },
  { path: 'load', component: LoadGpxComponent },
  { path: 'map', component: MapComponent },
  { path: '**', redirectTo: 'load' }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule {}
