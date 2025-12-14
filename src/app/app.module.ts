import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { MapComponent } from './map/map.component';
import { HttpClientModule } from '@angular/common/http';
import { LoadGpxComponent } from './load-gpx/load-gpx.component';
import { FormsModule } from '@angular/forms';
import { DialogoConfiguracionComponent } from './dialogo-configuracion/dialogo-configuracion.component';
import { TrackMetadataDialogComponent } from './track-metadata-dialog/track-metadata-dialog.component';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations'; // Importar FormsModule
import { MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { RouteMismatchDialogComponent } from './route-mismatch-dialog/route-mismatch-dialog.component';
import { EventSearchDialogComponent } from './event-search-dialog/event-search-dialog.component';
import { EventCreateDialogComponent } from './event-create-dialog/event-create-dialog.component';
import { HomeComponent } from './home/home.component';
import { LoginDialogComponent } from './login-dialog/login-dialog.component';
import { RegisterDialogComponent } from './register-dialog/register-dialog.component';

@NgModule({
  declarations: [
    AppComponent,
    MapComponent,
    LoadGpxComponent,
    DialogoConfiguracionComponent,
    TrackMetadataDialogComponent,
    RouteMismatchDialogComponent,
    EventSearchDialogComponent,
    EventCreateDialogComponent,
    HomeComponent,
    LoginDialogComponent,
    RegisterDialogComponent
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
