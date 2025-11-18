import { Component, OnInit } from '@angular/core';

@Component({
  selector: 'app-dialogo-configuracion',
  templateUrl: './dialogo-configuracion.component.html',
  styleUrls: ['./dialogo-configuracion.component.scss']
})
export class DialogoConfiguracionComponent implements OnInit {

  eliminarPausasLargas = false;
  anadirLogoTitulos = false;

  constructor() { }

  ngOnInit(): void {
  }

}
