import { ElevationQualityComponent } from './elevation-quality/elevation-quality.component';
import { ProximityOriginDialogComponent } from './proximity-origin-dialog/proximity-origin-dialog.component';
import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { MapComponent } from './map/map.component';
import { DiscoverRouteComponent } from './discover-route/discover-route.component';
import { HTTP_INTERCEPTORS, HttpClientModule } from '@angular/common/http';
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
import { MatMenuModule } from '@angular/material/menu';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { PrimengStubsModule } from './primeng-stubs/primeng-stubs.module';
import { RouteMismatchDialogComponent } from './route-mismatch-dialog/route-mismatch-dialog.component';
import { EventSearchDialogComponent } from './event-search-dialog/event-search-dialog.component';
import { EventCreateDialogComponent } from './event-create-dialog/event-create-dialog.component';
import { HomeComponent } from './home/home.component';
import { InstallPromptComponent } from './install-prompt/install-prompt.component';
import { LoginDialogComponent } from './login-dialog/login-dialog.component';
import { RegisterDialogComponent } from './register-dialog/register-dialog.component';
import { InfoDialogComponent } from './info-dialog/info-dialog.component';
import { VerificationDialogComponent } from './verification-dialog/verification-dialog.component';
import { AuthGuard } from './services/auth.guard';
import { AuthInterceptor } from './services/auth.interceptor';
import { MyTracksDialogComponent } from './my-tracks-dialog/my-tracks-dialog.component';
import { EventTrackUploadDialogComponent } from './event-track-upload-dialog/event-track-upload-dialog.component';
import { StandaloneTrackUploadDialogComponent } from './standalone-track-upload-dialog/standalone-track-upload-dialog.component';
import { PlanOutingComponent } from './plan-outing/plan-outing.component';
import { RouteComparisonComponent } from './route-comparison/route-comparison.component';
import { PlanTrackDialogComponent } from './plan-track-dialog/plan-track-dialog.component';
import { ForgotPasswordDialogComponent } from './forgot-password-dialog/forgot-password-dialog.component';
import { ResetPasswordComponent } from './reset-password/reset-password.component';
import { RoundTripOptionsDialogComponent } from './roundtrip-options-dialog/roundtrip-options-dialog.component';
import { PrivacyPolicyComponent } from './privacy-policy/privacy-policy.component';
import { RouteAnalyzerComponent } from './route-analyzer/route-analyzer.component';
import { GarminSyncComponent } from './garmin-sync/garmin-sync.component';
import { IncorporateRideDialogComponent } from './garmin-sync/incorporate-ride-dialog.component';
import { WahooInboxComponent } from './garmin-sync/wahoo-inbox.component';
import { PolarInboxComponent } from './garmin-sync/polar-inbox.component';
import { AssistantWidgetComponent } from './assistant-widget/assistant-widget.component';
import { AnimationGateComponent } from './animation-gate/animation-gate.component';
import localeEs from '@angular/common/locales/es';
import localeEn from '@angular/common/locales/en';
import localeCa from '@angular/common/locales/ca';
import localeGl from '@angular/common/locales/gl';
import localeEu from '@angular/common/locales/eu';
import { LOCALE_ID } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import { UiTextPipe } from './services/screen-texts';
import { LanguageService } from './services/language.service';
import { LanguageSelectorComponent } from './language-selector/language-selector.component';

registerLocaleData(localeEs);
registerLocaleData(localeEn);
registerLocaleData(localeCa);
registerLocaleData(localeGl);
registerLocaleData(localeEu);

@NgModule({
  declarations: [
    LanguageSelectorComponent,
    UiTextPipe,
    AppComponent,
    MapComponent,
    DiscoverRouteComponent,
    LoadGpxComponent,
    DialogoConfiguracionComponent,
    TrackMetadataDialogComponent,
    RouteMismatchDialogComponent,
    EventSearchDialogComponent,
    EventCreateDialogComponent,
    HomeComponent,
    InstallPromptComponent,
    LoginDialogComponent,
    RegisterDialogComponent,
    InfoDialogComponent,
    VerificationDialogComponent,
    MyTracksDialogComponent,
    EventTrackUploadDialogComponent,
    StandaloneTrackUploadDialogComponent,
    ProximityOriginDialogComponent,
    PlanOutingComponent,
    RouteComparisonComponent,
    PlanTrackDialogComponent,
    ForgotPasswordDialogComponent,
    ResetPasswordComponent,
    RoundTripOptionsDialogComponent,
    PrivacyPolicyComponent,
    RouteAnalyzerComponent,
    GarminSyncComponent,
    PolarInboxComponent,
    WahooInboxComponent,
    IncorporateRideDialogComponent,
    AssistantWidgetComponent,
    AnimationGateComponent
  ],
  imports: [
    ElevationQualityComponent,
    MatCheckboxModule,
    MatMenuModule,
    MatIconModule,
    MatTooltipModule,
    MatDatepickerModule,
    MatNativeDateModule,
    PrimengStubsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatDialogModule,
    BrowserModule,
    AppRoutingModule,
    HttpClientModule, // Asegúrate de incluir HttpClientModule aquí
    FormsModule, BrowserAnimationsModule
  ],
  providers: [
    AuthGuard,
    {
      provide: HTTP_INTERCEPTORS,
      useClass: AuthInterceptor,
      multi: true
    }, { provide: LOCALE_ID, useFactory: (language: LanguageService) => language.current, deps: [LanguageService] }
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }
