import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { MapComponent } from './map/map.component';
import { HttpClientModule } from '@angular/common/http';
import { LoadGpxComponent } from './load-gpx/load-gpx.component';
import { FormsModule } from '@angular/forms'; // Importar FormsModule

@NgModule({
  declarations: [
    AppComponent,
    MapComponent,
    LoadGpxComponent
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    HttpClientModule, // Asegúrate de incluir HttpClientModule aquí
    FormsModule
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule { }
