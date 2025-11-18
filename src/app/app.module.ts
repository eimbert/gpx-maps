import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { MapComponent } from './map/map.component';
import { HttpClientModule } from '@angular/common/http';
import { LoadGpxComponent } from './load-gpx/load-gpx.component';
import { FormsModule } from '@angular/forms';
import { DialogoConfiguracionComponent } from './dialogo-configuracion/dialogo-configuracion.component';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations'; // Importar FormsModule
import { MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatCheckboxModule } from '@angular/material/checkbox';

@NgModule({
  declarations: [
    AppComponent,
    MapComponent,
    LoadGpxComponent,
    DialogoConfiguracionComponent
  ],
  imports: [
    MatCheckboxModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatDialogModule,
    BrowserModule,
    AppRoutingModule,
    HttpClientModule, // Asegúrate de incluir HttpClientModule aquí
    FormsModule, BrowserAnimationsModule
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule { }
