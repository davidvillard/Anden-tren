# Atlas Ferroviario de España

Web con trenes de Cercanías en directo, avisos de Renfe y un registro de accidentes ferroviarios graves en España. Solo usa datos públicos y oficiales: no admite avisos de usuarios ni publica datos personales.

## Cómo funciona

- `site/`: la web estática (HTML, CSS y JS, sin dependencias de compilación).
- `site/data/accidentes.json`: registro de accidentes con sus fuentes. Se edita a mano.
- `scripts/fetch-renfe.mjs`: descarga los feeds GTFS-Realtime de Renfe y genera `site/data/live.json`.
- `.github/workflows/publicar.yml`: publica la web en GitHub Pages al subir cambios y cada 5 minutos, con los datos de Renfe recién descargados.

GitHub puede retrasar las ejecuciones programadas unos minutos, así que los datos en directo tienen un retraso de entre 5 y 15 minutos.

## Probar en local

```bash
node scripts/fetch-renfe.mjs site/data/live.json
```

```bash
python3 -m http.server 8000 --directory site
```

## Fuentes

| Fuente | Uso |
|---|---|
| Renfe GTFS-Realtime (`gtfsrt.renfe.com`): posiciones, retrasos y avisos de Cercanías | En directo |
| Renfe `trip_updates_LD.json`: retrasos de larga distancia | En prueba; falta confirmar que es oficial |
| CIAF y ERA: informes de accidentes | Registro |
| OpenStreetMap: mapa base | Mapa (para mucho tráfico, cambiar a un proveedor de teselas propio) |

## Privacidad

Solo cifras agregadas (fallecidos y heridos). Nada de nombres, edades, fotos ni datos que permitan identificar a nadie.
