export type CamaraDescubrir = 'actual' | 'cercana';
export type VelocidadDescubrir = 1 | 2;

export interface DialogoConfiguracionData {
  eliminarPausasLargas: boolean;
  marcarPausasLargas?: boolean;
  umbralPausaSegundos?: number;
  anadirLogoTitulos: boolean;
  activarMusica: boolean;
  permitirAdversarioVirtual?: boolean;
  incluirAdversarioVirtual?: boolean;
  tiempoAdversarioVirtual?: string;
  grabarAnimacion?: boolean;
  relacionAspectoGrabacion?: '16:9' | '9:16';
  modoVisualizacion?: 'general' | 'zoomCabeza';
  mostrarPerfil?: boolean;
  tipoAnimacion?: 'carrera' | 'descubrir';
  tipoAnimacionFijado?: boolean;
  camaraDescubrir?: CamaraDescubrir;
  velocidadDescubrir?: VelocidadDescubrir;
  nombresTracks?: string[];

}
