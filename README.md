# Atlas Ferroviario de España

Web con trenes de Cercanías en directo, avisos de Renfe y un registro de accidentes ferroviarios graves en España. Solo usa datos públicos y oficiales: no admite avisos de usuarios ni publica datos personales.

## Estructura

- `site/`: la web estática (HTML, CSS y JS, sin paso de compilación).
- `site/data/accidentes.json`: registro de accidentes con sus fuentes. Se edita a mano.
- `api/live.js`: función de Vercel. `GET /api/live` consulta los feeds GTFS-Realtime de Renfe y devuelve un resumen. Vercel guarda la respuesta 30 segundos en caché.
- `lib/renfe.js`: descarga y lectura de los feeds de Renfe.

## Publicar en Vercel

1. En Vercel, **Add New → Project** e importa este repositorio.
2. Deja **Framework Preset** en "Other". `vercel.json` ya indica que la web está en `site/`.
3. Pulsa **Deploy**.

No necesita variables de entorno ni claves.

## Probar en local

```bash
npm run live
```

```bash
npx vercel dev
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
