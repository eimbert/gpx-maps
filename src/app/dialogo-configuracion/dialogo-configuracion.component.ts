import { Component, Inject } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { DialogoConfiguracionData } from '../interfaces/estructuras';
import { color } from 'html2canvas/dist/types/css/types/color';

@Component({
  selector: 'app-dialogo-configuracion',
  templateUrl: './dialogo-configuracion.component.html',
  styleUrls: ['./dialogo-configuracion.component.scss']
})
export class DialogoConfiguracionComponent {
  colors: string[] = ['#0000ff', '#ff0000'];

  eliminarPausasLargas = false;
  anadirLogoTitulos = false;
  activarMusica = true

   constructor(
    private dialogRef: MatDialogRef<DialogoConfiguracionComponent, DialogoConfiguracionData>,
    @Inject(MAT_DIALOG_DATA) public data: Partial<DialogoConfiguracionData> | null
  ) {
    // valores iniciales opcionales
    if (data) {
      this.eliminarPausasLargas = !!data.eliminarPausasLargas;
      this.anadirLogoTitulos   = !!data.anadirLogoTitulos;
    }
  }


  cancelar(): void { this.dialogRef.close(); }

  guardar(): void {
    this.dialogRef.close({
      eliminarPausasLargas: this.eliminarPausasLargas,
      anadirLogoTitulos: this.anadirLogoTitulos,
      activarMusica: this.activarMusica,
      colors: this.colors
    });
  }

}
