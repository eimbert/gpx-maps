# Persistencia de dureza de tracks (propuesta)

Objetivo: evitar recalcular la dureza en cada carga de tracks y enviarla ya resuelta en el JSON de importación.

## Campo recomendado en BBDD

Añadir en la tabla de tracks:

- `difficulty_score` `NUMERIC(5,2)` NULL
  - Guarda el score continuo de 0 a 100 calculado en importación.
- `difficulty_level` `SMALLINT` NULL
  - Nivel discreto para pintar UI y filtrar.
  - Convención sugerida:
    - `0` = unknown
    - `1` = easy
    - `2` = medium
    - `3` = hard
    - `4` = very-hard

Opcional para trazabilidad:

- `difficulty_version` `SMALLINT` NOT NULL DEFAULT 1
  - Permite recalcular en lote si cambia la fórmula en el futuro.

## Campo recomendado en JSON de importación

Extender payload de importación con:

- `difficulty_score`: number | null
- `difficulty_level`: number | null
- `difficulty_version`: number (opcional)

## Índices sugeridos

Si habrá filtros por dureza:

- índice simple: `(difficulty_level)`
- índice compuesto para listados por carpeta: `(folder_id, difficulty_level)`

## Notas

- Mantener `desnivel`, `distance_km` y `moving_time_sec` como métricas base para poder recalcular cuando convenga.
- `difficulty_level` como entero es más estable y barato que guardar etiquetas de texto.
