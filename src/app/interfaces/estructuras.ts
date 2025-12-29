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

}