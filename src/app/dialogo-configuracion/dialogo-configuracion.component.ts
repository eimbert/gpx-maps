import { Component, Inject } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { DialogoConfiguracionData } from '../interfaces/estructuras';

@Component({
  selector: 'app-dialogo-configuracion',
  templateUrl: './dialogo-configuracion.component.html',
  styleUrls: ['./dialogo-configuracion.component.scss']
})
export class DialogoConfiguracionComponent {
  colors: string[] = ['#0000ff', '#ff0000'];

  eliminarPausasLargas = false;
  anadirLogoTitulos = false;
  activarMusica = true;
  permitirAdversarioVirtual = false;
  incluirAdversarioVirtual = false;
  tiempoAdversarioVirtual = '00:45';

   constructor(
    private dialogRef: MatDialogRef<DialogoConfiguracionComponent, DialogoConfiguracionData>,
    @Inject(MAT_DIALOG_DATA) public data: Partial<DialogoConfiguracionData> | null
  ) {
    // valores iniciales opcionales
    if (data) {
      this.eliminarPausasLargas = !!data.eliminarPausasLargas;
      this.anadirLogoTitulos   = !!data.anadirLogoTitulos;
      this.permitirAdversarioVirtual = !!data.permitirAdversarioVirtual;
      this.incluirAdversarioVirtual = !!data.incluirAdversarioVirtual;
      this.tiempoAdversarioVirtual = data.tiempoAdversarioVirtual ?? this.tiempoAdversarioVirtual;
      if (Array.isArray(data.colors) && data.colors.length >= 2) {
        this.colors = data.colors.slice(0, 2) as string[];
      }
    }
  }


  cancelar(): void { this.dialogRef.close(); }

  guardar(): void {
    this.dialogRef.close({
      eliminarPausasLargas: this.eliminarPausasLargas,
      anadirLogoTitulos: this.anadirLogoTitulos,
      activarMusica: this.activarMusica,
      colors: this.colors,
      permitirAdversarioVirtual: this.permitirAdversarioVirtual,
      incluirAdversarioVirtual: this.incluirAdversarioVirtual,
      tiempoAdversarioVirtual: this.tiempoAdversarioVirtual
    });
  }

}
