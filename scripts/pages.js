// Páginas de texto (fuentes, legal, accesibilidad). Cada una se genera en el build
// con la misma plantilla: cabecera, título, contenido y pie.

const page = ({ path, title, metaTitle, description, lead, body }) => ({
  path,
  html: `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>${metaTitle || title + " · Andén"}</title>
<meta name="description" content="${description}">
<link rel="canonical" href="__SITE_URL__${path}">
<meta property="og:type" content="article">
<meta property="og:title" content="${title} · Andén">
<meta property="og:description" content="${description}">
<meta property="og:url" content="__SITE_URL__${path}">
<!--#head-->
</head>
<body>
<!--#header-->
<main id="contenido">
  <section class="page-head band">
    <div class="container">
      <p class="crumbs"><a href="/">Inicio</a> › ${title}</p>
      <h1>${title}</h1>
      ${lead ? `<p>${lead}</p>` : ""}
    </div>
  </section>
  <section class="section">
    <div class="container"><div class="prose">
${body}
    </div></div>
  </section>
</main>
<!--#footer-->
</body>
</html>
`,
});

const mail = (cfg) => `<a href="mailto:${cfg.contact}">${cfg.contact}</a>`;
const titular = (cfg) => cfg.ownerName ? `${cfg.ownerName}, responsable del proyecto Andén` : "la persona física responsable del proyecto Andén";

export const pages = (cfg) => [
  page({
    path: "/fuentes",
    title: "Fuentes de datos y uso legal",
    description: "De dónde salen los datos de Andén, cada cuánto se actualizan y con qué permiso se usan: Renfe, CIAF, Eurostat y otros organismos oficiales.",
    lead: "Todo lo que ves en Andén sale de datos públicos de organismos oficiales. Aquí explicamos de dónde viene cada dato y con qué permiso lo usamos.",
    body: `
<h2>Datos en directo</h2>
<div class="table-wrap"><table>
<thead><tr><th>Fuente</th><th>Qué datos</th><th>Actualización</th><th>Permiso de uso</th></tr></thead>
<tbody>
<tr><td><strong>Renfe · GTFS-Realtime Cercanías</strong><br><span class="small muted">gtfsrt.renfe.com</span></td><td>Posición de los trenes, retrasos y avisos de servicio de Cercanías y Rodalies</td><td>Unos 30 segundos</td><td><span class="tag ok">Datos abiertos</span><br><span class="small muted">Portal de datos abiertos de Renfe, citando la fuente</span></td></tr>
<tr><td><strong>Renfe · retrasos de larga distancia</strong><br><span class="small muted">gtfsrt.renfe.com</span></td><td>Retrasos de AVE, Alvia y otros trenes de larga distancia</td><td>Unos 30 segundos</td><td><span class="tag warn">En revisión</span><br><span class="small muted">Pendiente de confirmar como fuente oficial</span></td></tr>
<tr><td><strong>Sucesos en curso</strong></td><td>Cifras de fallecidos y heridos, estado de la circulación</td><td>Revisión automática cada 5 minutos</td><td><span class="tag ok">Información pública</span><br><span class="small muted">Servicios 112, gobiernos, Ministerio de Transportes, CIAF</span></td></tr>
</tbody></table></div>

<h2>Registro de accidentes</h2>
<div class="table-wrap"><table>
<thead><tr><th>Fuente</th><th>Qué datos</th><th>Actualización</th><th>Permiso de uso</th></tr></thead>
<tbody>
<tr><td><strong>CIAF</strong><br><span class="small muted">Comisión de Investigación de Accidentes Ferroviarios</span></td><td>Informes de cada accidente investigado, causas y recomendaciones, y memorias anuales</td><td>Al publicarse cada informe</td><td><span class="tag ok">Información pública</span><br><span class="small muted">Reutilizable según la Ley 37/2007, citando la fuente</span></td></tr>
<tr><td><strong>Agencia Ferroviaria de la UE (ERA)</strong><br><span class="small muted">Base de datos ERAIL</span></td><td>Copia europea de los informes de investigación</td><td>Al publicarse cada informe</td><td><span class="tag ok">Acceso libre</span></td></tr>
<tr><td><strong>Eurostat</strong><br><span class="small muted">tran_sf_railac, tran_sf_railvi</span></td><td>Accidentes y víctimas por país, para comparar con Europa</td><td>Anual</td><td><span class="tag ok">Reutilización libre</span><br><span class="small muted">Próximamente en Andén</span></td></tr>
</tbody></table></div>

<h2>Otros datos</h2>
<div class="table-wrap"><table>
<thead><tr><th>Fuente</th><th>Qué datos</th><th>Estado</th></tr></thead>
<tbody>
<tr><td><strong>Renfe · horarios (GTFS)</strong></td><td>Horarios de Cercanías, alta velocidad, larga y media distancia</td><td><span class="tag info">Próximamente</span></td></tr>
<tr><td><strong>Renfe · informes de puntualidad</strong></td><td>Puntualidad mensual por tipo de servicio</td><td><span class="tag info">Próximamente</span></td></tr>
<tr><td><strong>Adif · red ferroviaria</strong></td><td>Trazado de las vías (servicio de mapas en la IDEE)</td><td><span class="tag info">Próximamente</span></td></tr>
<tr><td><strong>Adif · incidencias y obras</strong></td><td>Averías, cortes y obras programadas</td><td><span class="tag none">No disponible</span><br><span class="small muted">Adif no publica estos datos en abierto</span></td></tr>
<tr><td><strong>OpenStreetMap</strong></td><td>Mapa base</td><td><span class="tag ok">Licencia ODbL</span></td></tr>
</tbody></table></div>

<h2>Cómo tratamos las cifras de un suceso</h2>
<ul>
<li>Un sistema automático revisa cada 5 minutos las noticias sobre trenes. Una inteligencia artificial (Gemini, de Google) extrae de ellas las cifras y el organismo que las da.</li>
<li>Solo se publica una cifra si la noticia la atribuye a un organismo oficial (servicios de emergencias, gobiernos, ministerios, Guardia Civil, CIAF u operadores).</li>
<li>Un suceso nuevo solo aparece si lo cuentan al menos dos medios distintos.</li>
<li>Cada cifra indica qué organismo la ha dado y cuándo.</li>
<li>Mientras no haya un balance oficial definitivo, las cifras se marcan como provisionales.</li>
<li>Guardamos cómo han ido cambiando las cifras para que se vea su evolución.</li>
<li>Solo publicamos cifras agregadas, nunca datos de personas concretas.</li>
</ul>

<h2>Ver un error</h2>
<p>Si ves un dato incorrecto, escríbenos a ${mail(cfg)} indicando la página y la fuente correcta.</p>
`,
  }),

  page({
    path: "/aviso-legal",
    title: "Aviso legal",
    description: "Información legal sobre Andén: titular del sitio, condiciones de uso y responsabilidad sobre los datos mostrados.",
    body: `
<h2>Titular del sitio</h2>
<ul>
<li><strong>Nombre del sitio:</strong> Andén</li>
<li><strong>Titular:</strong> ${cfg.ownerName || "persona física, a título particular"}</li>
${cfg.ownerNif ? `<li><strong>NIF:</strong> ${cfg.ownerNif}</li>` : ""}
<li><strong>Naturaleza:</strong> proyecto personal, gratuito y sin ánimo de lucro. No vende productos ni servicios y no incluye publicidad.</li>
<li><strong>Correo electrónico:</strong> ${mail(cfg)}</li>
</ul>

<h2>Objeto</h2>
<p>Andén es un servicio informativo gratuito que muestra datos públicos sobre la circulación de trenes y los accidentes ferroviarios en España. No vende billetes ni representa a ningún operador.</p>

<h2>Relación con Renfe, Adif y otros organismos</h2>
<p>Andén es un proyecto independiente. No tiene relación con Renfe, Adif, Iryo, Ouigo ni con ningún organismo público. Los nombres de estas entidades se usan solo para identificar el origen de los datos.</p>

<h2>Exactitud de la información</h2>
<p>Los datos proceden de fuentes oficiales y se muestran tal como las publican. Pueden tener retrasos, errores o cambios posteriores. Para decisiones importantes (por ejemplo, si sale o no un tren), consulta siempre los canales oficiales del operador. El titular no se hace responsable de los daños derivados del uso de la información.</p>

<h2>Propiedad intelectual</h2>
<p>El diseño, el logotipo y el código de Andén pertenecen a su titular. Los datos de terceros mantienen su licencia original, indicada en <a href="/fuentes">Fuentes de datos</a>.</p>

<h2>Legislación aplicable</h2>
<p>Este aviso se rige por la legislación española.</p>
`,
  }),

  page({
    path: "/privacidad",
    title: "Política de privacidad",
    description: "Qué datos trata Andén y cómo. No pedimos registro ni usamos cookies de seguimiento.",
    body: `
<h2>Resumen</h2>
<ul>
<li>No hace falta registrarse.</li>
<li>No usamos cookies de publicidad.${cfg.ga ? " Las de analítica solo se activan si las aceptas." : " Tampoco de analítica."}</li>
<li>No vendemos ni cedemos datos.</li>
</ul>

<h2>Responsable del tratamiento</h2>
<p>${titular(cfg)}. Contacto: ${mail(cfg)}.</p>

<h2>Qué datos se tratan</h2>
<ul>
<li><strong>Datos técnicos de la conexión:</strong> al visitar la web, el servidor (Vercel Inc.) registra la dirección IP y datos del navegador para servir la página y protegerla frente a abusos. Base legal: interés legítimo (art. 6.1.f RGPD).</li>
<li><strong>Mapa:</strong> las imágenes del mapa se cargan desde los servidores de OpenStreetMap, que reciben tu dirección IP para enviarlas.</li>
<li><strong>Preferencias:</strong> el tamaño de texto y el tema (claro u oscuro) se guardan solo en tu navegador. No nos llegan.</li>
<li><strong>Búsquedas:</strong> lo que escribes en el buscador se procesa en tu navegador y no se guarda.</li>
${cfg.ga ? `<li><strong>Estadísticas de visitas (solo si las aceptas):</strong> Google Analytics recoge de forma agregada qué páginas se visitan, desde qué tipo de dispositivo y de qué país, para mejorar la web. Base legal: tu consentimiento (art. 6.1.a RGPD), que puedes retirar en cualquier momento con el enlace «Configurar cookies» del pie de página.</li>` : ""}
</ul>

<h2>Proveedores</h2>
<ul>
<li>Vercel Inc. (alojamiento), con garantías para transferencias internacionales según el RGPD.</li>
<li>Fundación OpenStreetMap (imágenes del mapa).</li>
${cfg.ga ? "<li>Google Ireland Ltd. (Google Analytics), solo con tu consentimiento.</li>" : ""}
</ul>

<h2>Tus derechos</h2>
<p>Puedes ejercer tus derechos de acceso, rectificación, supresión, oposición, limitación y portabilidad escribiendo a ${mail(cfg)}. También puedes reclamar ante la Agencia Española de Protección de Datos (aepd.es).</p>

<h2>Personas mencionadas en sucesos</h2>
<p>Andén solo publica cifras agregadas de víctimas. No publica nombres, imágenes ni ningún dato que permita identificar a personas afectadas.</p>
`,
  }),

  page({
    path: "/cookies",
    title: "Política de cookies",
    description: "Andén no usa cookies de seguimiento ni de publicidad.",
    body: `
<h2>¿Usa cookies Andén?</h2>
${cfg.ga ? `<p>Andén no usa cookies de publicidad. Solo usa cookies de <strong>Google Analytics</strong> para contar visitas de forma agregada, y únicamente si las aceptas en el aviso que aparece al entrar.</p>
<div class="table-wrap"><table><thead><tr><th>Cookie</th><th>De quién</th><th>Para qué</th><th>Duración</th></tr></thead><tbody>
<tr><td>_ga</td><td>Google Analytics</td><td>Distinguir visitantes de forma anónima</td><td>2 años</td></tr>
<tr><td>_ga_*</td><td>Google Analytics</td><td>Mantener el estado de la visita</td><td>2 años</td></tr>
</tbody></table></div>
<p>Puedes cambiar tu decisión cuando quieras con el enlace «Configurar cookies» del pie de página.</p>` : `<p>No. Andén no instala cookies de publicidad, analítica ni seguimiento, por eso no te mostramos ningún aviso de cookies.</p>`}

<h2>Almacenamiento local</h2>
<p>Si cambias el tamaño del texto o el tema, tu navegador guarda esa preferencia en su almacenamiento local para recordarla la próxima vez. Es un dato técnico necesario para la función que has pedido, no sale de tu dispositivo y puedes borrarlo desde los ajustes del navegador.</p>

<h2>Servicios de terceros</h2>
<p>Las imágenes del mapa vienen de OpenStreetMap, que no instala cookies al servirlas.</p>

<h2>Cambios</h2>
<p>Si añadimos otras cookies que necesiten tu permiso, lo indicaremos aquí y te lo pediremos antes de usarlas.</p>
`,
  }),

  page({
    path: "/accesibilidad",
    title: "Accesibilidad",
    description: "Cómo hemos diseñado Andén para que cualquier persona pueda usarlo, y cómo avisarnos si algo no funciona bien.",
    lead: "Queremos que Andén sea fácil de usar para todo el mundo, tenga la edad que tenga.",
    body: `
<h2>Qué hemos hecho</h2>
<ul>
<li><strong>Letra grande y clara:</strong> usamos la tipografía Atkinson Hyperlegible, creada para personas con baja visión, a 18 píxeles como mínimo.</li>
<li><strong>Tamaño ajustable:</strong> el botón «Texto» de la parte de arriba agranda toda la web en dos pasos.</li>
<li><strong>Modo claro y oscuro:</strong> por defecto se usa el tema de tu dispositivo, y puedes cambiarlo con el botón de arriba.</li>
<li><strong>Contraste alto:</strong> los colores cumplen como mínimo el nivel AA de las pautas WCAG 2.2.</li>
<li><strong>Nada depende solo del color:</strong> los retrasos siempre se indican también con texto («En hora», «+7 min»).</li>
<li><strong>Botones grandes:</strong> todos los botones y enlaces miden al menos 44 píxeles, para pulsarlos con facilidad en el móvil.</li>
<li><strong>Lista además del mapa:</strong> los trenes se pueden ver en una lista ordenada, sin necesidad de usar el mapa.</li>
<li><strong>Teclado y lectores de pantalla:</strong> toda la web se puede usar con el teclado, y el buscador funciona con lectores de pantalla.</li>
<li><strong>Sin animaciones molestas:</strong> si tu dispositivo tiene activado «reducir movimiento», la web lo respeta.</li>
</ul>

<h2>Limitaciones conocidas</h2>
<ul>
<li>El mapa es difícil de usar con lector de pantalla. Para eso está la vista de lista.</li>
<li>Los textos de los avisos vienen de Renfe y no podemos cambiar su redacción.</li>
</ul>

<h2>Avísanos</h2>
<p>Si algo no te funciona o te cuesta leerlo, escríbenos a ${mail(cfg)}. Intentaremos arreglarlo.</p>
`,
  }),

  {
    path: "/404",
    noindex: true,
    html: `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Página no encontrada · Andén</title>
<meta name="robots" content="noindex">
<!--#head-->
</head>
<body>
<!--#header-->
<main id="contenido">
  <section class="page-head band"><div class="container">
    <h1>Esta página no existe</h1>
    <p>Puede que el enlace esté mal escrito o que la página se haya movido.</p>
  </div></section>
  <section class="section"><div class="container"><a class="btn" href="/">Volver al inicio</a></div></section>
</main>
<!--#footer-->
</body>
</html>
`,
  },
];
