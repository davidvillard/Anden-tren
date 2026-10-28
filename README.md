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

## Datos legales pendientes

En `scripts/pages.js` hay marcadores `[...]` (titular, NIF, domicilio y correo) que hay que rellenar antes de lanzar la web, porque la LSSI obliga a mostrarlos.

## Accesibilidad

- Tipografía Atkinson Hyperlegible a 18 px, con botón para agrandar el texto.
- Modo claro y oscuro (por defecto, el del dispositivo).
- Contraste mínimo AA, botones de al menos 44 px y estados indicados siempre con texto, no solo con color.
- Vista de lista además del mapa y buscador compatible con lectores de pantalla.
