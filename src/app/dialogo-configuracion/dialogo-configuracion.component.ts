import { Component, Inject } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { DialogoConfiguracionData } from '../interfaces/estructuras';

@Component({
  selector: 'app-dialogo-configuracion',
  templateUrl: './dialogo-configuracion.component.html',
  styleUrls: ['./dialogo-configuracion.component.scss']
})
export class DialogoConfiguracionComponent {
  eliminarPausasLargas = true;
  marcarPausasLargas = false;
  umbralPausaMinutos = 4;
  anadirLogoTitulos = false;
  activarMusica = true;
  grabarAnimacion = false;
  relacionAspectoGrabacion: '16:9' | '9:16' = '16:9';
  permitirAdversarioVirtual = false;
  incluirAdversarioVirtual = false;
  tiempoAdversarioVirtual = '00:45';
  modoVisualizacion: 'general' | 'zoomCabeza' = 'general';
  mostrarPerfil = true;

   constructor(
    private dialogRef: MatDialogRef<DialogoConfiguracionComponent, DialogoConfiguracionData>,
    @Inject(MAT_DIALOG_DATA) public data: Partial<DialogoConfiguracionData> | null
  ) {
    // valores iniciales opcionales
    if (data) {
      this.eliminarPausasLargas = true;
      this.marcarPausasLargas = data.marcarPausasLargas ?? this.marcarPausasLargas;
      const umbralPausaSegundos = data.umbralPausaSegundos ?? this.umbralPausaMinutos * 60;
      // this.umbralPausaMinutos = Math.max(1, Math.round(umbralPausaSegundos / 60));
      this.anadirLogoTitulos   = !!data.anadirLogoTitulos;
      this.permitirAdversarioVirtual = !!data.permitirAdversarioVirtual;
      this.incluirAdversarioVirtual = !!data.incluirAdversarioVirtual;
      this.tiempoAdversarioVirtual = data.tiempoAdversarioVirtual ?? this.tiempoAdversarioVirtual;
      this.grabarAnimacion = !!data.grabarAnimacion;
      this.relacionAspectoGrabacion = data.relacionAspectoGrabacion ?? this.relacionAspectoGrabacion;
      this.modoVisualizacion = data.modoVisualizacion ?? this.modoVisualizacion;
      this.mostrarPerfil = data.mostrarPerfil ?? this.mostrarPerfil;
    }
  }


  cancelar(): void { this.dialogRef.close(); }

  guardar(): void {
    this.dialogRef.close({
      eliminarPausasLargas: this.eliminarPausasLargas,
      marcarPausasLargas: this.marcarPausasLargas,
      umbralPausaSegundos: Math.max(60, Math.trunc(this.umbralPausaMinutos) * 60),
      anadirLogoTitulos: this.anadirLogoTitulos,
      activarMusica: this.activarMusica,
      grabarAnimacion: this.grabarAnimacion,
      relacionAspectoGrabacion: this.relacionAspectoGrabacion,
      permitirAdversarioVirtual: this.permitirAdversarioVirtual,
      incluirAdversarioVirtual: this.incluirAdversarioVirtual,
      tiempoAdversarioVirtual: this.tiempoAdversarioVirtual,
      modoVisualizacion: this.modoVisualizacion,
      mostrarPerfil: this.mostrarPerfil
    });
  }

}
