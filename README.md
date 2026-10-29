# Andén

Retrasos, avisos e incidencias de trenes en España, en directo y con datos oficiales.

## Estructura

| Carpeta o archivo | Qué es |
|---|---|
| `site/` | La web: páginas, estilos, scripts, fuentes, iconos y datos |
| `site/data/accidentes.json` | Registro de accidentes con sus fuentes |
| `site/data/sucesos.json` | Suceso en curso: cifras, historial y fuente de cada cifra |
| `partials/` | Cabecera, pie y etiquetas comunes que se insertan en todas las páginas |
| `scripts/build.js` | Genera `dist/`: inserta los parciales, crea las páginas legales, `sitemap.xml` y `robots.txt` |
| `scripts/pages.js` | Contenido de las páginas de texto (fuentes, aviso legal, privacidad, cookies, accesibilidad) |
| `api/live.js` | Función de Vercel: `GET /api/live` resume los feeds en directo de Renfe (caché de 30 s) |
| `lib/renfe.js` | Lectura de los feeds GTFS-Realtime de Renfe |

## Actualización automática de sucesos

`api/cron/sucesos.js` revisa cada 5 minutos titulares sobre sucesos ferroviarios (`lib/news.js`), pide a Gemini (plan gratuito de Google AI Studio) las cifras y quién las da (`lib/extract.js`) y aplica las reglas de `lib/merge.js`:

- Una cifra solo se publica si la noticia la atribuye a un organismo oficial.
- Un suceso nuevo necesita al menos dos medios distintos y una cifra oficial.
- Los enlaces solo pueden ser de las noticias recibidas.
- Un suceso sin novedades en 72 horas deja de mostrarse como "en curso".
- Se excluyen los atropellos de personas aisladas.

El resultado se guarda en Upstash Redis y se sirve en `GET /api/sucesos`. Si Redis no está configurado, la web usa `site/data/sucesos.json`.

### Variables de entorno en Vercel

| Variable | Para qué | Obligatoria |
|---|---|---|
| `GEMINI_API_KEY` | Extracción de cifras con Gemini (gratis, sin facturación vinculada) | Para la actualización automática |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Upstash Redis (las crea Vercel al conectarlo) | Para la actualización automática |
| `CRON_SECRET` | Contraseña que protege `/api/cron/sucesos` | Para la actualización automática |
| `DEPLOY_HOOK_URL` | Republica la web cuando cambian las cifras, para que Google las vea | Recomendada |
| `SITE_URL` | Dominio público | Recomendada |
| `GA_MEASUREMENT_ID` | Google Analytics 4 (`G-...`) | No |
| `GSC_VERIFICATION` | Código de verificación de Search Console | No |
| `CONTACT_EMAIL`, `OWNER_NAME`, `OWNER_NIF` | Datos de las páginas legales | No |
| `GEMINI_MODELS`, `GEMINI_MIN_INTERVAL_MIN` | Modelos gratuitos a probar en orden y minutos mínimos entre consultas (por defecto 10) | No |
| `NEWS_FEEDS` | RSS oficiales adicionales, separados por comas | No |

### Programar la revisión cada 5 minutos

El plan gratuito de Vercel solo permite un cron al día (ya configurado en `vercel.json` como respaldo). Para revisar cada 5 minutos, crea una tarea gratuita en [cron-job.org](https://cron-job.org):

- URL: `https://TU-DOMINIO/api/cron/sucesos`
- Frecuencia: cada 5 minutos
- Cabecera: `Authorization: Bearer TU_CRON_SECRET`

Coste: 0 €. Gemini solo se consulta cuando hay titulares nuevos, como mucho cada 10 minutos, y si se agota el cupo gratuito se pausa una hora. Sin cuenta de facturación vinculada al proyecto de Google, nunca se cobra.

## Publicar en Vercel

Vercel lo detecta solo gracias a `vercel.json`: ejecuta `node scripts/build.js` y publica `dist/`.

- **Dominio propio:** añade la variable de entorno `SITE_URL` (por ejemplo `https://anden.es`) para que las etiquetas SEO, el sitemap y las imágenes para compartir usen ese dominio. Sin ella, se usa el dominio de producción de Vercel.

## Probar en local

```bash
npm run preview
```

```bash
npm run live
```

## Páginas para buscadores

- `/accidente-tren-hoy` y una página por suceso (`/accidente-tren-toledo`, o `/accidente-tren/<id>` para los detectados automáticamente), con FAQ y datos estructurados `NewsArticle` y `FAQPage`.
- `/cercanias/<red>` para las 12 redes de Cercanías de `site/data/redes.json`.

## Accesibilidad

- Tipografía Atkinson Hyperlegible a 18 px, con botón para agrandar el texto.
- Modo claro y oscuro (por defecto, el del dispositivo).
- Contraste mínimo AA, botones de al menos 44 px y estados indicados siempre con texto, no solo con color.
- Vista de lista además del mapa y buscador compatible con lectores de pantalla.
