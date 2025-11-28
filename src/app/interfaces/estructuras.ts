export interface DialogoConfiguracionData {
  eliminarPausasLargas: boolean;
  anadirLogoTitulos: boolean;
  activarMusica: boolean;
  permitirAdversarioVirtual?: boolean;
  incluirAdversarioVirtual?: boolean;
  tiempoAdversarioVirtual?: string;
  grabarAnimacion?: boolean;
  relacionAspectoGrabacion?: '16:9' | '9:16';
  modoVisualizacion?: 'general' | 'zoomCabeza';

}