import { AppLanguage } from '../services/language.service';

interface ProviderTexts {
  linked: string; pending: string; unavailable: string; automatic: string; checkNow: string;
}

export const providerTranslations: Record<AppLanguage, ProviderTexts> = {
  es: { linked: 'Vinculado', pending: 'Pendiente de vincular', unavailable: 'No disponible',
    automatic: 'Las nuevas actividades GPS de Polar Flow llegan automáticamente a esta bandeja. Se comprueban cada cinco minutos; primero deben haberse sincronizado con Polar Flow. Puedes revisarlas antes de incorporarlas al archivo.', checkNow: 'Comprobar ahora' },
  en: { linked: 'Linked', pending: 'Not linked yet', unavailable: 'Unavailable',
    automatic: 'New GPS activities from Polar Flow arrive automatically in this inbox. We check every five minutes, once they have synced to Polar Flow. Review them before adding them to your archive.', checkNow: 'Check now' },
  ca: { linked: 'Vinculat', pending: 'Pendent de vincular', unavailable: 'No disponible',
    automatic: 'Les noves activitats GPS de Polar Flow arriben automàticament a aquesta safata. Es comproven cada cinc minuts; primer s’han de sincronitzar amb Polar Flow. Pots revisar-les abans d’incorporar-les a l’arxiu.', checkNow: 'Comprova ara' },
  gl: { linked: 'Vinculado', pending: 'Pendente de vincular', unavailable: 'Non dispoñible',
    automatic: 'As novas actividades GPS de Polar Flow chegan automaticamente a esta bandexa. Compróbanse cada cinco minutos, despois de sincronizarse con Polar Flow. Podes revisalas antes de incorporalas ao arquivo.', checkNow: 'Comprobar agora' },
  eu: { linked: 'Lotuta', pending: 'Lotzeko zain', unavailable: 'Ez dago erabilgarri',
    automatic: 'Polar Flow-ko GPS jarduera berriak automatikoki iristen dira sarrera-ontzira. Bost minuturo egiaztatzen dira, Polar Flow-rekin sinkronizatu ondoren. Berrikusi artxiboan gehitu aurretik.', checkNow: 'Egiaztatu orain' }
};
