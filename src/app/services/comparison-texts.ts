export const COMPARISON_TEXTS = {
  comparisonMethod: {
    es: 'Pendientes sobre distancia horizontal, con perfil suavizado cada 10 m. Máximas sostenidas en ventanas de 100, 250 y 500 m; «Sin datos» indica que falta un tramo continuo suficiente. Ascensiones: ≥12 m y ≥60 m, con inversión de 8 m. Repechos: ≤600 m y pendiente media ≥4 %. Cambios bruscos: ≥4 puntos entre ventanas de 50 m.',
    en: 'Gradients use horizontal distance and a profile smoothed every 10 m. Sustained maxima use 100, 250 and 500 m windows; “No data” means there is no sufficiently long continuous section. Climbs: ≥12 m and ≥60 m, with an 8 m reversal. Short climbs: ≤600 m and average gradient ≥4%. Sharp changes: ≥4 percentage points between 50 m windows.',
    ca: 'Pendents sobre distància horitzontal, amb perfil suavitzat cada 10 m. Màximes sostingudes en finestres de 100, 250 i 500 m; «Sense dades» indica que falta un tram continu suficient. Ascensions: ≥12 m i ≥60 m, amb inversió de 8 m. Repetjons: ≤600 m i pendent mitjà ≥4 %. Canvis bruscos: ≥4 punts entre finestres de 50 m.',
    gl: 'Pendentes sobre distancia horizontal, con perfil suavizado cada 10 m. Máximas sostidas en xanelas de 100, 250 e 500 m; «Sen datos» indica que falta un tramo continuo suficiente. Ascensións: ≥12 m e ≥60 m, con inversión de 8 m. Ramplas: ≤600 m e pendente media ≥4 %. Cambios bruscos: ≥4 puntos entre xanelas de 50 m.',
    eu: 'Maldak distantzia horizontalean eta 10 m-ro leundutako profilean kalkulatzen dira. Gehieneko jarraituak 100, 250 eta 500 m-ko tarteetan; «Daturik ez» agertzen da tarte jarraitu nahikorik ez dagoenean. Igoerak: ≥12 m eta ≥60 m, 8 m-ko alderantzikatzearekin. Igoera laburrak: ≤600 m eta batez besteko malda ≥% 4. Aldaketa bortitzak: ≥4 puntu 50 m-ko tarteen artean.'
  },
  comparisonIrpMethod: {
    es: 'IRP: 25 % frecuencia de repechos, 25 % pendiente de repechos, 20 % encadenamiento con separación ≤300 m, 15 % desnivel en repechos y 15 % concentración final. La separación es distancia potencial de recuperación, no descanso garantizado.',
    en: 'IRP: 25% short-climb frequency, 25% short-climb gradient, 20% linked climbs with gaps ≤300 m, 15% ascent on short climbs and 15% final concentration. Gaps represent potential recovery distance, not guaranteed rest.',
    ca: 'IRP: 25 % freqüència de repetjons, 25 % pendent de repetjons, 20 % encadenament amb separació ≤300 m, 15 % desnivell en repetjons i 15 % concentració final. La separació és distància potencial de recuperació, no descans garantit.',
    gl: 'IRP: 25 % frecuencia de ramplas, 25 % pendente de ramplas, 20 % encadeamento con separación ≤300 m, 15 % desnivel en ramplas e 15 % concentración final. A separación é distancia potencial de recuperación, non descanso garantido.',
    eu: 'IRP: % 25 igoera laburren maiztasuna, % 25 haien malda, % 20 ≤300 m-ko tartearekin lotutako igoerak, % 15 igoera laburren desnibela eta % 15 amaierako kontzentrazioa. Tartea atseden hartzeko aukera da, ez atseden bermatua.'
  },
  comparisonFailed: { en: 'Could not complete the comparison. Please try again.', es: 'No se ha podido completar la comparación. Puedes volver a intentarlo.', ca: 'No s’ha pogut completar la comparació. Torna-ho a provar.', gl: 'Non se puido completar a comparación. Téntao de novo.', eu: 'Ezin izan da konparazioa osatu. Saiatu berriro.' },
  comparisonLimit: { en: 'Your report limit has been reached or you do not have permission to generate reports.', es: 'Has alcanzado el límite de informes de tu plan o no tienes permiso para generarlos.', ca: 'Has arribat al límit d’informes o no tens permís per generar-ne.', gl: 'Acadaches o límite de informes ou non tes permiso para xeralos.', eu: 'Txostenen mugara iritsi zara edo ez duzu sortzeko baimenik.' },
  comparisonSignIn: { en: 'Sign in again to compare routes.', es: 'Inicia sesión de nuevo para comparar las rutas.', ca: 'Torna a iniciar la sessió per comparar rutes.', gl: 'Inicia sesión de novo para comparar as rutas.', eu: 'Hasi saioa berriro ibilbideak alderatzeko.' },
  comparisonRouteMissing: { en: 'A route no longer exists or you cannot access it.', es: 'Alguna ruta ya no existe o no tienes acceso a ella.', ca: 'Alguna ruta ja no existeix o no hi tens accés.', gl: 'Algunha ruta xa non existe ou non tes acceso a ela.', eu: 'Ibilbide bat ez dago edo ez duzu sarbiderik.' },
  comparisonRouteChanged: { en: 'A route has changed. Select it again and repeat the comparison.', es: 'Una ruta ha cambiado. Selecciónala de nuevo y repite la comparación.', ca: 'Una ruta ha canviat. Torna a seleccionar-la i repeteix la comparació.', gl: 'Unha ruta cambiou. Selecciónaa de novo e repite a comparación.', eu: 'Ibilbide bat aldatu da. Hautatu berriro eta errepikatu konparazioa.' },
  comparisonInvalidGpx: { en: 'Could not analyze the GPX files. Check that both contain points and are no larger than 12 MB each.', es: 'No se han podido analizar los GPX. Comprueba que ambas rutas contienen puntos y no superan 12 MB cada una.', ca: 'No s’han pogut analitzar els GPX. Comprova que contenen punts i no superen 12 MB cadascun.', gl: 'Non se puideron analizar os GPX. Comproba que conteñen puntos e non superan 12 MB cada un.', eu: 'Ezin izan dira GPXak aztertu. Egiaztatu puntuak dituztela eta bakoitzak 12 MB baino gehiago ez dituela.' },
  comparisonReportMissing: { en: 'The report or one of its routes is no longer available.', es: 'El informe o alguna de sus rutas ya no está disponible.', ca: 'L’informe o alguna de les rutes ja no està disponible.', gl: 'O informe ou algunha das súas rutas xa non está dispoñible.', eu: 'Txostena edo bere ibilbide bat ez dago erabilgarri.' },
  comparisonReportFailed: { en: 'Could not open the saved report.', es: 'No se ha podido abrir el informe guardado.', ca: 'No s’ha pogut obrir l’informe desat.', gl: 'Non se puido abrir o informe gardado.', eu: 'Ezin izan da gordetako txostena ireki.' },
  pdfDownloaded: { en: 'PDF downloaded.', es: 'PDF descargado.', ca: 'PDF descarregat.', gl: 'PDF descargado.', eu: 'PDFa deskargatuta.' },
  comparisonPdfFailed: { en: 'Could not prepare the PDF. Please try again.', es: 'No se ha podido preparar el PDF. Inténtalo de nuevo.', ca: 'No s’ha pogut preparar el PDF. Torna-ho a provar.', gl: 'Non se puido preparar o PDF. Téntao de novo.', eu: 'Ezin izan da PDFa prestatu. Saiatu berriro.' },
  comparisonTitle: { en: 'Route comparison', es: 'Comparación de rutas', ca: 'Comparació de rutes', gl: 'Comparación de rutas', eu: 'Ibilbideen konparazioa' },
  comparisonDescription: { en: 'Difficulty comparison of two GPX routes.', es: 'Comparación de dificultad de dos rutas GPX.', ca: 'Comparació de dificultat de dues rutes GPX.', gl: 'Comparación de dificultade de dúas rutas GPX.', eu: 'Bi GPX ibilbideren zailtasun konparazioa.' },
  "compareLabel": {
    "en": "Compare the demands of two routes",
    "es": "Comparar la exigencia de dos rutas",
    "ca": "Compara l’exigència de dues rutes",
    "gl": "Comparar a esixencia de dúas rutas",
    "eu": "Alderatu bi ibilbideren eskakizuna"
  },
  "compareKicker": {
    "en": "TWO ROUTES · ONE DECISION",
    "es": "DOS RUTAS · UNA DECISIÓN",
    "ca": "DUES RUTES · UNA DECISIÓ",
    "gl": "DÚAS RUTAS · UNHA DECISIÓN",
    "eu": "BI IBILBIDE · ERABAKI BAT"
  },
  "compareQuestion": {
    "en": "Which is harder on your legs?",
    "es": "¿Cuál castiga más las piernas?",
    "ca": "Quina castiga més les cames?",
    "gl": "Cal castiga máis as pernas?",
    "eu": "Zein da gogorragoa hankentzat?"
  },
  "compareSelectTwo": {
    "en": "Select 2 tracks to compare.",
    "es": "Selecciona 2 tracks para comparar.",
    "ca": "Selecciona 2 tracks per comparar.",
    "gl": "Selecciona 2 tracks para comparar.",
    "eu": "Hautatu 2 track alderatzeko."
  },
  "compareTooMany": {
    "en": "Compare two at a time. You have {count} routes selected.",
    "es": "Solo se pueden comparar de dos en dos. Tienes {count} rutas seleccionadas.",
    "ca": "Compara-les de dues en dues. Tens {count} rutes seleccionades.",
    "gl": "Compara de dúas en dúas. Tes {count} rutas seleccionadas.",
    "eu": "Alderatu binaka. {count} ibilbide hautatu dituzu."
  },
  "hideReport": {
    "en": "Hide report",
    "es": "Ocultar informe",
    "ca": "Amaga l’informe",
    "gl": "Agochar informe",
    "eu": "Ezkutatu txostena"
  },
  "showReport": {
    "en": "Show report",
    "es": "Mostrar informe",
    "ca": "Mostra l’informe",
    "gl": "Mostrar informe",
    "eu": "Erakutsi txostena"
  },
  "preparingReport": {
    "en": "Preparing report…",
    "es": "Elaborando informe…",
    "ca": "Elaborant l’informe…",
    "gl": "Elaborando informe…",
    "eu": "Txostena prestatzen…"
  },
  "regenerateReport": {
    "en": "Generate again",
    "es": "Volver a generar",
    "ca": "Torna a generar",
    "gl": "Xerar de novo",
    "eu": "Sortu berriro"
  },
  "compareWithAi": {
    "en": "Compare with AI",
    "es": "Comparar con IA",
    "ca": "Compara amb IA",
    "gl": "Comparar con IA",
    "eu": "Alderatu AArekin"
  },
  "openingReport": {
    "en": "Opening saved report…",
    "es": "Abriendo informe guardado…",
    "ca": "Obrint l’informe desat…",
    "gl": "Abrindo o informe gardado…",
    "eu": "Gordetako txostena irekitzen…"
  },
  "comparisonBusy": {
    "en": "Calculating the profile and writing the comparison. This may take up to two minutes.",
    "es": "Calculando el perfil y redactando la comparación. Puede tardar hasta dos minutos.",
    "ca": "Calculant el perfil i redactant la comparació. Pot trigar fins a dos minuts.",
    "gl": "Calculando o perfil e redactando a comparación. Pode tardar ata dous minutos.",
    "eu": "Profila kalkulatzen eta konparazioa idazten. Bi minutu arte iraun dezake."
  },
  "comparisonReport": {
    "en": "Comparison report",
    "es": "Informe comparativo",
    "ca": "Informe comparatiu",
    "gl": "Informe comparativo",
    "eu": "Konparazio txostena"
  },
  "physicalDemandReport": {
    "en": "PHYSICAL DEMAND REPORT",
    "es": "INFORME DE EXIGENCIA FÍSICA",
    "ca": "INFORME D’EXIGÈNCIA FÍSICA",
    "gl": "INFORME DE ESIXENCIA FÍSICA",
    "eu": "ESKAKIZUN FISIKOAREN TXOSTENA"
  },
  "reportLabel": {
    "en": "Report",
    "es": "Informe",
    "ca": "Informe",
    "gl": "Informe",
    "eu": "Txostena"
  },
  "comparisonNoAi": {
    "en": "AI writing is unavailable. The calculated metrics and IRP have been saved. No AI report credit was used.",
    "es": "La redacción de IA no está disponible. Aquí tienes los cálculos objetivos; el IRP calculado queda guardado. No se ha consumido un informe de IA.",
    "ca": "La redacció d’IA no està disponible. Les mètriques i l’IRP calculats s’han desat. No s’ha consumit cap informe d’IA.",
    "gl": "A redacción de IA non está dispoñible. As métricas e o IRP calculados quedaron gardados. Non se consumiu un informe de IA.",
    "eu": "AAren testua ez dago erabilgarri. Kalkulatutako datuak eta IRPa gorde dira. Ez da AA txostenaren krediturik erabili."
  },
  "legBreakerIndex": {
    "en": "Leg-breaker index",
    "es": "Índice Rompepiernas",
    "ca": "Índex trencacames",
    "gl": "Índice rompepernas",
    "eu": "Hankak nekatzen dituen indizea"
  },
  "estimatedRating": {
    "en": "Estimated rating",
    "es": "Valoración estimada",
    "ca": "Valoració estimada",
    "gl": "Valoración estimada",
    "eu": "Balorazio estimatua"
  },
  "climbsLabel": {
    "en": "climbs",
    "es": "ascensiones",
    "ca": "ascensions",
    "gl": "ascensións",
    "eu": "igoera"
  },
  "irpUnavailable": {
    "en": "The profile is incomplete, too short or too sparsely sampled. No IRP is assigned; available metrics are indicative.",
    "es": "Perfil incompleto, demasiado corto o con puntos muy separados. No se asigna IRP; los indicadores disponibles son orientativos.",
    "ca": "Perfil incomplet, massa curt o amb punts massa separats. No s’assigna IRP; els indicadors disponibles són orientatius.",
    "gl": "Perfil incompleto, demasiado curto ou con puntos moi separados. Non se asigna IRP; os indicadores dispoñibles son orientativos.",
    "eu": "Profila osatugabea, laburregia edo lagin gutxikoa da. Ez da IRPrik esleitzen; datuak orientagarriak dira."
  },
  "sameScaleProfile": {
    "en": "Profiles on the same scale",
    "es": "El perfil, a la misma escala",
    "ca": "Els perfils a la mateixa escala",
    "gl": "Os perfís á mesma escala",
    "eu": "Profilak eskala berean"
  },
  "comparisonProfileLabel": {
    "en": "Elevation profiles of routes A and B in metres over horizontal distance in kilometres",
    "es": "Perfiles de altitud de las rutas A y B en metros, sobre distancia horizontal en kilómetros",
    "ca": "Perfils d’altitud de les rutes A i B en metres sobre distància horitzontal en quilòmetres",
    "gl": "Perfís de altitude das rutas A e B en metros sobre distancia horizontal en quilómetros",
    "eu": "A eta B ibilbideen altitude profilak metrotan, distantzia horizontala kilometrotan"
  },
  "altitudeLabel": {
    "en": "elevation",
    "es": "de altitud",
    "ca": "d’altitud",
    "gl": "de altitude",
    "eu": "altitudea"
  },
  "profileLineLegend": {
    "en": "A: solid gold line · B: dashed green line. GPX gaps are preserved.",
    "es": "A: línea dorada continua · B: línea verde discontinua. Las interrupciones del GPX se conservan.",
    "ca": "A: línia daurada contínua · B: línia verda discontínua. Es conserven els buits del GPX.",
    "gl": "A: liña dourada continua · B: liña verde descontinua. Consérvanse os ocos do GPX.",
    "eu": "A: urrezko lerro jarraitua · B: lerro berde etena. GPX hutsuneak mantentzen dira."
  },
  "effortKinds": {
    "en": "The effort each route requires",
    "es": "Qué tipo de esfuerzo pide cada ruta",
    "ca": "Quin esforç demana cada ruta",
    "gl": "Que esforzo pide cada ruta",
    "eu": "Ibilbide bakoitzak eskatzen duen ahalegina"
  },
  "effortScoresHelp": {
    "en": "Estimated scores from 0 to 10. A higher regularity score means it is easier to maintain your pace.",
    "es": "Puntuaciones estimadas de 0 a 10. En regularidad, más puntos significa mayor facilidad para mantener el ritmo.",
    "ca": "Puntuacions estimades de 0 a 10. En regularitat, més punts vol dir més facilitat per mantenir el ritme.",
    "gl": "Puntuacións estimadas de 0 a 10. En regularidade, máis puntos significa maior facilidade para manter o ritmo.",
    "eu": "0tik 10era bitarteko puntuazio estimatuak. Erregulartasun handiagoak erritmoa mantentzea errazagoa dela adierazten du."
  },
  "allIndicators": {
    "en": "All metrics",
    "es": "Todos los indicadores",
    "ca": "Tots els indicadors",
    "gl": "Todos os indicadores",
    "eu": "Adierazle guztiak"
  },
  "indicatorLabel": {
    "en": "Metric",
    "es": "Indicador",
    "ca": "Indicador",
    "gl": "Indicador",
    "eu": "Adierazlea"
  },
  "routeA": {
    "en": "Route A",
    "es": "Ruta A",
    "ca": "Ruta A",
    "gl": "Ruta A",
    "eu": "A ibilbidea"
  },
  "routeB": {
    "en": "Route B",
    "es": "Ruta B",
    "ca": "Ruta B",
    "gl": "Ruta B",
    "eu": "B ibilbidea"
  },
  "detectedClimbs": {
    "en": "Climbs on {route} · {count} detected",
    "es": "Ascensiones de {route} · {count} detectadas",
    "ca": "Ascensions de {route} · {count} detectades",
    "gl": "Ascensións de {route} · {count} detectadas",
    "eu": "{route} ibilbideko igoerak · {count} hautemanda"
  },
  "noDetectedClimbs": {
    "en": "No climbs exceeding 12 m of ascent and 60 m in length were detected in the available profile.",
    "es": "No se detectan ascensiones que superen el umbral de 12 m de desnivel y 60 m de longitud en el perfil disponible.",
    "ca": "No es detecten ascensions que superin 12 m de desnivell i 60 m de longitud en el perfil disponible.",
    "gl": "Non se detectan ascensións que superen 12 m de desnivel e 60 m de lonxitude no perfil dispoñible.",
    "eu": "Ez da 12 m-ko igoera eta 60 m-ko luzera gainditzen duen igoerarik hauteman profilean."
  },
  "startFinish": {
    "en": "Start–finish",
    "es": "Inicio–fin",
    "ca": "Inici–final",
    "gl": "Inicio–fin",
    "eu": "Hasiera–amaiera"
  },
  "averageLabel": {
    "en": "Average",
    "es": "Media",
    "ca": "Mitjana",
    "gl": "Media",
    "eu": "Batezbestekoa"
  },
  "characterLabel": {
    "en": "Character",
    "es": "Carácter",
    "ca": "Caràcter",
    "gl": "Carácter",
    "eu": "Izaera"
  },
  "cyclingComparison": {
    "en": "The comparison, in cycling terms",
    "es": "La comparación, en lenguaje ciclista",
    "ca": "La comparació, en llenguatge ciclista",
    "gl": "A comparación, en linguaxe ciclista",
    "eu": "Konparazioa, txirrindularien hizkeran"
  },
  "verdictLabel": {
    "en": "VERDICT",
    "es": "VEREDICTO",
    "ca": "VEREDICTE",
    "gl": "VEREDICTO",
    "eu": "EPAIA"
  },
  "recordedActivity": {
    "en": "Recorded activity data",
    "es": "Datos de la actividad grabada",
    "ca": "Dades de l’activitat enregistrada",
    "gl": "Datos da actividade gravada",
    "eu": "Grabatutako jardueraren datuak"
  },
  "recordedActivityHelp": {
    "en": "These describe the rider and that outing; they do not affect IRP or route difficulty.",
    "es": "Describen al ciclista y a aquella salida; no modifican el IRP ni la dificultad del recorrido.",
    "ca": "Descriuen el ciclista i aquella sortida; no modifiquen l’IRP ni la dificultat del recorregut.",
    "gl": "Describen o ciclista e aquela saída; non modifican o IRP nin a dificultade do percorrido.",
    "eu": "Txirrindularia eta irteera hori deskribatzen dituzte; ez dute IRPa edo ibilbidearen zailtasuna aldatzen."
  },
  "recordedTime": {
    "en": "Recorded time",
    "es": "Tiempo registrado",
    "ca": "Temps enregistrat",
    "gl": "Tempo rexistrado",
    "eu": "Grabatutako denbora"
  },
  "heartRateMeanMax": {
    "en": "Mean / maximum heart rate",
    "es": "Pulso medio / máximo",
    "ca": "Pols mitjà / màxim",
    "gl": "Pulso medio / máximo",
    "eu": "Batez besteko / gehieneko pultsua"
  },
  "powerMeanMax": {
    "en": "Mean / maximum power",
    "es": "Potencia media / máxima",
    "ca": "Potència mitjana / màxima",
    "gl": "Potencia media / máxima",
    "eu": "Batez besteko / gehieneko potentzia"
  },
  "samplesLabel": {
    "en": "samples",
    "es": "muestras",
    "ca": "mostres",
    "gl": "mostras",
    "eu": "lagin"
  },
  "methodLimitations": {
    "en": "Method and limitations",
    "es": "Método y limitaciones",
    "ca": "Mètode i limitacions",
    "gl": "Método e limitacións",
    "eu": "Metodoa eta mugak"
  },
  "gainMetric": {
    "en": "Elevation gain",
    "es": "Desnivel positivo",
    "ca": "Desnivell positiu",
    "gl": "Desnivel positivo",
    "eu": "Igoera metatua"
  },
  "lossMetric": {
    "en": "Elevation loss",
    "es": "Desnivel negativo",
    "ca": "Desnivell negatiu",
    "gl": "Desnivel negativo",
    "eu": "Jaitsiera metatua"
  },
  "minAltitudeMetric": {
    "en": "Minimum elevation",
    "es": "Altitud mínima",
    "ca": "Altitud mínima",
    "gl": "Altitude mínima",
    "eu": "Gutxieneko altitudea"
  },
  "maxAltitudeMetric": {
    "en": "Maximum elevation",
    "es": "Altitud máxima",
    "ca": "Altitud màxima",
    "gl": "Altitude máxima",
    "eu": "Gehieneko altitudea"
  },
  "uphillGradeMetric": {
    "en": "Average uphill gradient",
    "es": "Pendiente media en subida",
    "ca": "Pendent mitjà de pujada",
    "gl": "Pendente media en subida",
    "eu": "Igoerako batez besteko malda"
  },
  "max100Metric": {
    "en": "Maximum sustained · 100 m",
    "es": "Máxima sostenida · 100 m",
    "ca": "Màxima sostinguda · 100 m",
    "gl": "Máxima sostida · 100 m",
    "eu": "Gehieneko jarraitua · 100 m"
  },
  "max250Metric": {
    "en": "Maximum sustained · 250 m",
    "es": "Máxima sostenida · 250 m",
    "ca": "Màxima sostinguda · 250 m",
    "gl": "Máxima sostida · 250 m",
    "eu": "Gehieneko jarraitua · 250 m"
  },
  "max500Metric": {
    "en": "Maximum sustained · 500 m",
    "es": "Máxima sostenida · 500 m",
    "ca": "Màxima sostinguda · 500 m",
    "gl": "Máxima sostida · 500 m",
    "eu": "Gehieneko jarraitua · 500 m"
  },
  "climbCountMetric": {
    "en": "Significant climbs",
    "es": "Ascensiones relevantes",
    "ca": "Ascensions rellevants",
    "gl": "Ascensións relevantes",
    "eu": "Igoera esanguratsuak"
  },
  "descentCountMetric": {
    "en": "Significant descents",
    "es": "Descensos relevantes",
    "ca": "Descensos rellevants",
    "gl": "Descensos relevantes",
    "eu": "Jaitsiera esanguratsuak"
  },
  "uphillMetric": {
    "en": "Uphill distance",
    "es": "Recorrido en subida",
    "ca": "Recorregut de pujada",
    "gl": "Percorrido en subida",
    "eu": "Igoerako distantzia"
  },
  "downhillMetric": {
    "en": "Downhill distance",
    "es": "Recorrido en bajada",
    "ca": "Recorregut de baixada",
    "gl": "Percorrido en baixada",
    "eu": "Jaitsierako distantzia"
  },
  "flatMetric": {
    "en": "Flat distance (±1.5%)",
    "es": "Recorrido llano (±1,5 %)",
    "ca": "Recorregut pla (±1,5 %)",
    "gl": "Percorrido chan (±1,5 %)",
    "eu": "Distantzia laua (±% 1,5)"
  },
  "punchCountMetric": {
    "en": "Significant short climbs",
    "es": "Repechos significativos",
    "ca": "Repetjons significatius",
    "gl": "Ramplas significativas",
    "eu": "Igoera labur esanguratsuak"
  },
  "punchesKmMetric": {
    "en": "Short climbs per kilometre",
    "es": "Repechos por kilómetro",
    "ca": "Repetjons per quilòmetre",
    "gl": "Ramplas por quilómetro",
    "eu": "Igoera laburrak kilometroko"
  },
  "directionChangesMetric": {
    "en": "Uphill / downhill transitions",
    "es": "Alternancias subida / bajada",
    "ca": "Alternances pujada / baixada",
    "gl": "Alternancias subida / baixada",
    "eu": "Igoera / jaitsiera txandaketak"
  },
  "sharpChangesMetric": {
    "en": "Sharp gradient changes",
    "es": "Cambios bruscos de pendiente",
    "ca": "Canvis bruscos de pendent",
    "gl": "Cambios bruscos de pendente",
    "eu": "Malda aldaketa bortitzak"
  },
  "recoveryMetric": {
    "en": "Mean gap between climbs",
    "es": "Separación media entre subidas",
    "ca": "Separació mitjana entre pujades",
    "gl": "Separación media entre subidas",
    "eu": "Igoeren arteko batez besteko tartea"
  },
  "chainedClimbsMetric": {
    "en": "Linked climbs with ≤300 m recovery",
    "es": "Enlaces con ≤300 m de recuperación",
    "ca": "Enllaços amb ≤300 m de recuperació",
    "gl": "Enlaces con ≤300 m de recuperación",
    "eu": "≤300 m-ko atseden tartea duten igoerak"
  },
  "finalGainMetric": {
    "en": "Elevation gain in the final third",
    "es": "Desnivel positivo en el último tercio",
    "ca": "Desnivell positiu a l’últim terç",
    "gl": "Desnivel positivo no último terzo",
    "eu": "Azken herenean metatutako igoera"
  },
  "coverageMetric": {
    "en": "Elevation coverage",
    "es": "Cobertura altimétrica",
    "ca": "Cobertura altimètrica",
    "gl": "Cobertura altimétrica",
    "eu": "Altitude estaldura"
  },
  "overallEffort": {
    "en": "Overall demand",
    "es": "Exigencia global",
    "ca": "Exigència global",
    "gl": "Esixencia global",
    "eu": "Eskakizun orokorra"
  },
  "enduranceEffort": {
    "en": "Endurance",
    "es": "Resistencia",
    "ca": "Resistència",
    "gl": "Resistencia",
    "eu": "Erresistentzia"
  },
  "explosiveEffort": {
    "en": "Explosiveness",
    "es": "Explosividad",
    "ca": "Explosivitat",
    "gl": "Explosividade",
    "eu": "Leherkortasuna"
  },
  "fatigueEffort": {
    "en": "Accumulated fatigue",
    "es": "Fatiga acumulada",
    "ca": "Fatiga acumulada",
    "gl": "Fatiga acumulada",
    "eu": "Neke metatua"
  },
  "regularityEffort": {
    "en": "Ease of maintaining pace",
    "es": "Facilidad para mantener el ritmo",
    "ca": "Facilitat per mantenir el ritme",
    "gl": "Facilidade para manter o ritmo",
    "eu": "Erritmoa mantentzeko erraztasuna"
  },
  "finalEffort": {
    "en": "Final demand",
    "es": "Exigencia final",
    "ca": "Exigència final",
    "gl": "Esixencia final",
    "eu": "Amaierako eskakizuna"
  },
  "questionOverall": {
    "en": "Which is harder overall?",
    "es": "¿Cuál es globalmente más dura?",
    "ca": "Quina és globalment més dura?",
    "gl": "Cal é globalmente máis dura?",
    "eu": "Zein da oro har gogorragoa?"
  },
  "questionPunches": {
    "en": "Which has the hardest short climbs?",
    "es": "¿Cuál tiene los repechos más exigentes?",
    "ca": "Quina té els repetjons més exigents?",
    "gl": "Cal ten as ramplas máis esixentes?",
    "eu": "Zeinek ditu igoera labur gogorrenak?"
  },
  "questionClimbs": {
    "en": "Which has longer, sustained climbs?",
    "es": "¿Cuál tiene subidas más largas y sostenidas?",
    "ca": "Quina té pujades més llargues i sostingudes?",
    "gl": "Cal ten subidas máis longas e sostidas?",
    "eu": "Zeinek ditu igoera luzeago eta jarraituagoak?"
  },
  "questionLegs": {
    "en": "Which is harder on your legs?",
    "es": "¿Cuál es más rompepiernas?",
    "ca": "Quina és més trencacames?",
    "gl": "Cal é máis rompepernas?",
    "eu": "Zeinek nekatzen ditu gehiago hankak?"
  },
  "questionPace": {
    "en": "Which makes it easier to maintain pace?",
    "es": "¿Cuál permite mantener mejor el ritmo?",
    "ca": "Quina permet mantenir millor el ritme?",
    "gl": "Cal permite manter mellor o ritmo?",
    "eu": "Zeinek errazten du erritmoa mantentzea?"
  },
  "questionRecovery": {
    "en": "Which needs more recovery between efforts?",
    "es": "¿Cuál exige más recuperación entre esfuerzos?",
    "ca": "Quina exigeix més recuperació entre esforços?",
    "gl": "Cal esixe máis recuperación entre esforzos?",
    "eu": "Zeinek eskatzen du atseden gehiago ahaleginen artean?"
  },
  "questionFatigue": {
    "en": "Which leaves you more tired for the final section?",
    "es": "¿En cuál llegarías con más fatiga al tramo final?",
    "ca": "En quina arribaries amb més fatiga al tram final?",
    "gl": "En cal chegarías con máis fatiga ao tramo final?",
    "eu": "Zein ibilbidetan iritsiko zinateke nekatuago azken tartera?"
  },
  "questionRider": {
    "en": "Which suits an endurance or explosive rider?",
    "es": "¿Cuál encaja con un ciclista resistente o explosivo?",
    "ca": "Quina encaixa amb un ciclista resistent o explosiu?",
    "gl": "Cal encaixa cun ciclista resistente ou explosivo?",
    "eu": "Zein da egokiagoa txirrindulari erresistente edo leherkor batentzat?"
  }
} as const;
