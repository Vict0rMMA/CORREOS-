# PAULA CORREOS

Herramienta web para **redactar, corregir y traducir** correos y textos entre espanol e ingles.
Escribes o pegas un texto, eliges una accion y obtienes el resultado listo para copiar,
descargar en Word, PDF o Excel, o imprimir.

- **Dictado por voz**: hablas y el texto se escribe solo, en vivo.
- **Reportes con fotos**: adjunta imagenes con pie de foto y salen en el Word, el PDF y la impresion.
- **Planillas a Excel**: una cuadricula como la de Excel donde escribes el turno
  en espanol; un boton la pasa al ingles y descarga un `.xlsx` con el logo de
  American Airlines, listo para imprimir. Las matriculas, las horas y los codigos
  se conservan exactos.
- Correccion de ortografia, gramatica, puntuacion y redaccion.
- Traduccion natural (no literal) espanol <-> ingles.
- Mejora de redaccion conservando la intencion original.
- Generacion de correos completos a partir de una idea corta.
- Seis tonos y tres tipos de texto: correo, reporte y mensaje.
- Sugerencia de asuntos para correos.
- Acciones rapidas de un clic, historial local y atajos de teclado.
- Interfaz oscura, disenada para movil, tablet y escritorio.
- Se instala en el telefono como una aplicacion mas.

Stack: **Next.js 16 (App Router) + TypeScript + Tailwind CSS 4 + Google Gemini**.
Sin base de datos: las preferencias, el borrador y el historial viven en el navegador.

---

## 1. Instalacion

Requisitos: Node.js 20 o superior.

```bash
npm install
```

## 2. Variables de entorno

Copia el ejemplo y rellena tu clave:

```bash
cp .env.example .env.local
```

| Variable             | Obligatoria | Por defecto                | Para que sirve                    |
| -------------------- | ----------- | -------------------------- | --------------------------------- |
| `AI_API_KEY`         | Si          | —                          | Clave de la API de Google Gemini  |
| `AI_MODEL`           | No          | `gemini-flash-lite-latest` | Modelo a usar                     |
| `AI_MAX_INPUT_CHARS` | No          | `12000`                    | Limite de caracteres por peticion |

La clave **solo se usa en el servidor** (rutas `app/api/*`); nunca se envia al navegador.
`.env.local` esta ignorado por git.

## 3. Conectar la API de IA

1. Entra en <https://aistudio.google.com/apikey> con tu cuenta de Google.
2. Pulsa **Create API key** y copia la clave (empieza por `AIza...`).
3. Pegala en `.env.local`:

   ```env
   AI_API_KEY=AIza...
   ```

4. Reinicia el servidor de desarrollo.

> La suscripcion de Gemini en la app o en la web **no** incluye acceso por API:
> la clave de AI Studio es aparte y tiene una capa gratuita.

### Que modelo elegir

La capa gratuita limita las peticiones **por modelo y por dia**, y el limite
cambia mucho de uno a otro:

| Modelo                     | Velocidad | Calidad   | Cuota gratuita        |
| -------------------------- | --------- | --------- | --------------------- |
| `gemini-flash-lite-latest` | ~1 s      | Muy buena | La mas amplia (por defecto) |
| `gemini-flash-latest`      | ~2-3 s    | Superior  | Muy baja (~20 al dia) |
| `gemini-pro-latest`        | ~4 s      | Maxima    | Requiere plan de pago |

Para uso diario, el modelo por defecto es el adecuado. Si ves el mensaje
"Demasiadas peticiones", has agotado la cuota de ese modelo por hoy: espera,
cambia de modelo o activa la facturacion en Google AI Studio.

Para cambiar de proveedor de IA (OpenAI, Anthropic, etc.) solo hay que reescribir
`lib/ai.ts` manteniendo las funciones `streamCompletion` y `completion`.
El resto de la aplicacion no sabe quien responde.

## 4. Desarrollo local

```bash
npm run dev
```

Abre <http://localhost:3000>.

## 5. Build y produccion

```bash
npm run build
npm run start
```

## 6. Despliegue en Vercel

1. Entra en <https://vercel.com/new> e importa el repositorio de GitHub.
   Vercel detecta Next.js solo: no toques el framework, el build ni el output.
2. Antes de pulsar Deploy, abre **Environment Variables** y agrega:

   | Nombre       | Valor                    |
   | ------------ | ------------------------ |
   | `AI_API_KEY` | tu clave de Google Gemini |

   (opcional: `AI_MODEL`). Deja marcados Production, Preview y Development.
3. **Deploy**. No hace falta `vercel.json` ni ninguna otra configuracion.

Notas:

- Si cambias una variable de entorno hay que **volver a desplegar** para que
  tenga efecto.
- El microfono y el portapapeles necesitan HTTPS: en Vercel ya viene por defecto.
- Las tres rutas de API corren en Node con un maximo de 60 s, de sobra para
  cualquier texto o dictado.

---

## Como traducir

Arriba del editor hay dos selectores:

- **Mi texto esta en**: el idioma en el que escribes (se detecta solo, y puedes
  corregirlo a mano).
- **Traducir a**: el idioma al que quieres el resultado.

El boton dice siempre a donde va: **Traducir a English**. El boton del medio (⇄)
intercambia los dos idiomas de una vez.

Las demas acciones (Corregir, Mejorar, Generar correo) **no cambian el idioma**:
responden en el idioma en el que escribiste. Si el resultado sale identico a tu
texto, aparece el aviso *"Sin cambios: tu texto ya estaba bien"*.

## Las acciones se encadenan

Cada resultado se convierte en el texto de trabajo, asi que las acciones se
pueden ir aplicando una detras de otra:

```
texto en espanol -> Traducir a ingles -> Generar correo  ->  correo en ingles
```

Sin esto, generar el correo despues de traducir volvia a partir del texto
original y el correo salia en espanol.

Al encadenar, el idioma se ajusta solo: tras traducir al ingles, "Mi texto esta
en" pasa a English y el boton ofrece traducir de vuelta al espanol. El texto
anterior no se pierde: esta en **Recientes** y hay un boton **Deshacer** en la
cabecera del panel para volver atras.

## Tu firma

La aplicacion es de una sola persona, asi que la firma **viene puesta** y se
anade sola. Para cambiarla hay dos sitios:

- El campo **Tu firma**, que aparece junto al asunto cuando el tipo es Correo.
  Lo que se escriba ahi queda guardado en el navegador.
- `DEFAULT_SIGNATURE` en `lib/config.ts`, que es el valor de partida.

### Firma escaneada

La firma a mano esta fija en `public/firma.png`: basta una foto del movil
sobre papel, sin recortar. La aplicacion la prepara sola al abrirse:

- Mide el brillo del papel en los bordes y ajusta el umbral, asi le da igual
  que la hoja sea blanca, gris o amarillenta.
- Deja el trazo con su color y el resto transparente.
- Quita las rayas rectas (la linea del renglon, la sombra del borde de la
  hoja) y recorta a la tinta.

Para cambiarla, se reemplaza ese archivo. Si se quita, los documentos siguen
saliendo bien, solo que sin la firma dibujada.

Con **Subir firma escaneada** se puede poner una foto de la firma a mano. La
aplicacion recorta la imagen a la zona con tinta y le quita el papel del fondo,
asi que en el documento se ve el trazo solo, dibujado **sobre la linea**, como
en un documento firmado de verdad.

Sirve una foto del movil: no hace falta escaner ni fondo blanco perfecto.
Se guarda en el navegador y se puede cambiar o quitar cuando se quiera.

Donde aparece:

- En los correos de **Generar correo**, despues de la despedida.
- Al final del **Word**, el **PDF** y la **impresion**, sea cual sea el texto.
  Si el texto ya termina con ella (un correo generado), no se repite.
- **No** se anade al resultado en pantalla ni al boton Copiar: ahi queda
  exactamente lo que devolvio la IA.
- El boton **Con firma** copia el texto con el nombre escrito al final, listo
  para pegar en el correo (donde no se puede pegar la firma dibujada). Si el
  texto ya la trae, no se repite.

Un correo generado queda asi:

```
Atentamente,

Paula Andrea Ochoa
Administradora
```

La coma despues de la despedida es lo correcto en espanol: la formula va con
coma y el nombre en la linea siguiente. Y si la firma ya empieza por una
despedida ("Cordialmente,", "Saludos,"), no se escribe otra encima.

## Como salen los documentos

El Word, el PDF y la impresion usan el mismo formato de documento formal:

- **Encabezado** con el tipo de documento en mayusculas y la fecha a la
  derecha, separados del cuerpo por una linea.
- **Cuerpo** del texto.
- **Bloque de firma**: la despedida, un espacio en blanco para firmar a mano,
  una linea, el nombre en negrita y el cargo debajo en gris.
- **Pie de pagina** con la fecha y "Pagina X de Y". Los documentos no llevan
  ninguna marca de la aplicacion, y el autor del archivo es quien firma.
- **Anexo fotografico** al final cuando el tipo es Reporte.
- **Logo de American Airlines** arriba. Se quita con la casilla *Incluir el logo
  de American Airlines en los documentos*. Si el archivo del logo no se puede
  leer, el documento se descarga igual, solo que sin el.

**El documento se escribe en el idioma del resultado.** Si el texto salio en
ingles, el documento dice "Subject:", "Page 1 of 1" y "October 13, 2026"; si
salio en espanol, "Asunto:", "Pagina 1 de 1" y "13 de octubre de 2026". Las
etiquetas estan todas en `lib/export/i18n.ts`, en un solo sitio.

Si el texto ya termina con la firma (un correo generado), no se repite: se
reconoce, se retira del cuerpo y se vuelve a escribir con formato.

## Reportes con fotos

Elige **Reporte** en *Tipo de texto* y aparece el bloque de fotos:

- Arrastra las imagenes o pulsa **Agregar fotos** (hasta 8, de cualquier formato
  que abra el navegador: JPG, PNG, WEBP...).
- Cada foto lleva su **pie de foto** editable.
- Al descargar, las fotos van al final del documento bajo el titulo
  *Anexos fotograficos*, centradas, numeradas (*Foto 1, Foto 2...*) y con su pie.
  En el PDF cada foto nunca se separa de su pie al cambiar de pagina.
- Las fotos se normalizan a JPEG de 1600 px de ancho como maximo y se corrige la
  rotacion de las fotos de movil, asi el archivo no se dispara de tamano.
- Se quedan en la pestana mientras trabajas; **no se guardan** al cerrar la pagina
  (el historial local solo guarda texto).

## Planillas: una hoja de calculo de verdad

La pestana **Planillas** no es una caja de texto: es una **cuadricula editable**,
como Excel. Se trabaja en espanol, y cuando la planilla esta lista un boton la
pasa al ingles y deja el `.xlsx` listo para descargar.

### La cuadricula

- Para escribir basta **tocar la casilla** (un toque en el celular, o volver
  a pulsar la que ya esta elegida), o empezar a teclear. Tambien hay una
  **barra arriba de la tabla**, como la de Excel, donde se ve y se escribe lo
  que tiene la casilla elegida con espacio de sobra.
- Se navega con las **flechas**, con **Tab** y **Mayus+Tab**, con Inicio y Fin.
- Botones **Copiar**, **Pegar** y **Copiar tabla** para quien no use atajos.
  Lo copiado se pega en Excel como celdas y en Gmail u Outlook como una tabla
  con sus bordes.
- **Ctrl+V** pega un bloque entero copiado de Excel, aunque no se haya elegido
  ninguna casilla antes. Si lo pegado no cabe, la cuadricula **crece**: nunca
  se pierde una fila. Lo copiado de un PDF o de una pantalla (con espacios en
  vez de tabuladores) tambien se reparte por columnas.
- **Supr** vacia las celdas sin tocar la estructura.
- Se anaden y se quitan filas y columnas, se cambian los encabezados y se
  arrastra el borde de una columna para darle mas ancho.
- **Ctrl+Z** y **Ctrl+Shift+Z** deshacen y rehacen (hasta 60 pasos).

### Las plantillas

Salen del archivo real de AVX (`MODELO_TABLAS_SALIDA_EN.xlsx`), cada una con
sus propias columnas:

| Plantilla | Columnas |
| --- | --- |
| **Terminal** | EMPLEADO, ALMUERZO, AVION, PUERTA, HORA ASIGNADO, AVION 2, PUERTA 2, NOTAS |
| **Hangar** | EMPLEADO, ESTADO, AVION, PUERTA, HORA ASIGNADO, HORA SALIDA, AVION 2, NOTAS |
| **Turnos nocturnos** | TIPO, AVION, ESTACION, TRIPULACION, PUERTA, FALLA DIFERIDA, TECNICO AVX, N.o EMPLEADO, HORA ASIGNADO, y ademas los bloques de personal del dia, horas extra y vehiculos |
| **En blanco** | las que quieras |

Las plantillas empiezan **vacias**: las filas del archivo de referencia son
ejemplos, no asignaciones de nadie.

### El flujo

1. Eliges plantilla. La **supervisora** (Paula Andrea Ochoa) y la **fecha de
   hoy** ya vienen puestas; solo falta el turno.
2. Escribes o pegas la planilla **en espanol**.
3. Pulsas **Traducir y generar Excel en ingles**.
4. El resultado aparece en la pestana *Resultado en ingles*, **tambien
   editable**: ahi se corrige cualquier traduccion antes de descargar.
5. **Descargar Excel** genera el `.xlsx` con lo que hay en ese momento en la
   cuadricula en ingles, nunca con una respuesta anterior.

La fecha cambia de orden al pasar al ingles: el 14/10/2026 en espanol sale
como 10/14/2026, que es como se lee en Estados Unidos y como la trae el modelo
de AVX. Sin eso, el 05/10 (5 de octubre) se leeria como 10 de mayo.

Si cambias la entrada despues de traducir, el resultado queda marcado como
**desactualizado** hasta que vuelvas a traducir. Y si corriges el resultado a
mano, esa es la version que se descarga: no se pisa sola.

### Que pasa por la IA y que no

- **No pasan**: matriculas (`N123AV`), puertas (`B4`), horas (`07:30`), fechas,
  numeros, codigos (`MEL-21`, `P-0`), nombres de persona (`J. Perez`) y las
  celdas vacias. Se copian caracter a caracter.
- **No pasan tampoco** los encabezados de la plantilla ni los valores de
  siempre (PRESENTE, VACACIONES, SI/NO, DIA/NOCHE...): salen de una tabla fija
  en `lib/tabla.ts`, asi son iguales todos los dias.
- **Si pasan** las celdas con texto de verdad, y solo esas. El modelo recibe una
  lista de celdas con identificador y devuelve la misma lista: no ve la tabla,
  asi que no puede mover una fila ni inventarse una columna.

### Antes de dejarte descargar nada

Cada respuesta se revisa celda por celda:

1. **Estructura**: mismas filas, mismas columnas, cada celda en su sitio, y las
   vacias siguen vacias.
2. **Datos protegidos**: un dato que no debia cambiar tiene que volver
   identico, y ningun codigo, hora o numero puede faltar.
3. **Idioma**: nada en espanol donde deberia haber ingles, sin confundir un
   apellido o una matricula con un error.

Si algo falla se reintenta **una vez** diciendole al modelo exactamente que
fallo. Si persiste, la aplicacion **senala la celda en rojo y dice que pasa**,
y no deja descargar el archivo hasta que se corrija.

Esto detecta inconsistencias tecnicas; no sustituye la revision de quien firma
la planilla.

### El archivo .xlsx

El boton **Descargar Excel** genera un `.xlsx` de verdad (libreria `exceljs`):

- Logo a la izquierda y titulo a la derecha en azul marino, con la fecha, el
  turno y el supervisor debajo.
- Encabezado azul `1F3864` con letra blanca, filas alternas, bordes finos y
  texto ajustado. Cada bloque va con su titulo.
- Las **horas se guardan como hora** (`07:30` con formato `hh:mm`), asi se
  pueden ordenar y restar en Excel. Las matriculas y los codigos se quedan como
  texto para que Excel no los convierta en fechas ni en numeros.
- Panel inmovilizado bajo el encabezado, autofiltro y anchos automaticos.
- Preparado para imprimir: horizontal, ajustado a una pagina de ancho, con el
  encabezado repetido y "Page X of Y" en el pie.
- El archivo se llama `<titulo>-AAAA-MM-DD.xlsx`.

Antes de descargarlo, el archivo **se vuelve a abrir y se comprueba** que sus
encabezados, sus filas y sus datos son los mismos que los de la cuadricula. Si
no coinciden, no se descarga.

La planilla tambien sale en **Word**, en **PDF** y por impresora, apaisada y con
el mismo formato. Un **Reporte** de la pestana de correos tambien se puede bajar
a Excel: sale numerado en una tabla `#` / `Description`, sin volver a llamar a
la IA.

### Donde se guarda

En ningun sitio. La planilla vive mientras la pagina este abierta; no se guarda
en el navegador ni en la nube. (La base de datos llegara mas adelante.)

## Guardar en la nube (Supabase)

Opcional. Sin configurar, la aplicacion funciona igual que siempre: los
correos guardados viven en el navegador y la planilla mientras la pagina este
abierta. Con Supabase:

- **Las planillas se guardan solas** unos segundos despues de cada cambio
  (junto al titulo se ve "Guardada · 10:42"). Si se vuelve el mismo dia, se
  sigue donde se dejo, y en **Mis planillas** estan las anteriores para
  reabrirlas.
- **Los correos guardados se suben a la nube**, tambien los que ya estaban en
  el navegador, asi no se pierden si se limpia.

**Como esta protegido, sin inicio de sesion.** El navegador nunca habla con la
base: lo hace el servidor de la aplicacion con la clave secreta, que no sale
de Vercel. Las tablas tienen la seguridad por filas activada y ningun permiso
publico, asi que con la clave publica no se puede leer ni borrar nada. Y
borrar no borra: solo marca la fecha (`borrado_en`), y todo se recupera desde
el panel de Supabase. Ni siquiera el servidor tiene permiso para borrar de
verdad.

**Para activarlo:**

1. Crear las tablas: en Supabase, *SQL Editor*, pegar y ejecutar los dos
   archivos de `supabase/migrations/`, en orden. (En CORREOS ya estan
   creadas.)
2. Poner dos variables, en `.env.local` y en Vercel (*Settings > Environment
   Variables*), y volver a desplegar:

   | Variable | Donde esta |
   | --- | --- |
   | `SUPABASE_URL` | *Project Settings > Data API > Project URL* |
   | `SUPABASE_SECRET_KEY` | *Project Settings > API Keys > Secret keys* (`sb_secret_...`) |

   La clave secreta nunca va en una variable `NEXT_PUBLIC_` ni se pega en un
   chat.

   Como CORREOS se creo desde Vercel, la integracion suele dejar puestas
   `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`: la aplicacion tambien las
   acepta, asi que en Vercel puede que no haga falta anadir nada.

**Las pruebas no tocan la nube.** Cada prueba ve las rutas de guardado como
"no configuradas"; solo `pruebas/nube.mjs` habla con Supabase, y lo que crea
lo deja marcado como borrado. Sin la clave, esa prueba se omite.

**Ojo con el plan gratuito:** Supabase pausa un proyecto gratuito tras una
semana sin uso. Si pasa, la aplicacion sigue funcionando con lo del navegador
y avisa de que no pudo guardar; basta con reactivarlo desde el panel.

## Dictado por voz

Pulsa **Dictar** y habla con naturalidad. El texto va apareciendo **mientras
sigues hablando**: no hay que parar para ver el resultado. **Listo** cierra el
dictado y **Descartar** tira lo que quedaba sin transcribir.

Como funciona por dentro:

- **Sin limite de duracion.** La grabacion se parte sola en segmentos, y el
  corte se hace **en tus pausas** (un silencio de algo mas de un segundo), de
  modo que nunca se corta a mitad de una palabra. Si hablas sin parar, corta a
  los 90 s y sigue grabando sin interrupcion.
- Cada segmento se transcribe por separado pero el texto se escribe **en
  orden**, aunque uno tarde mas que otro.
- Antes de enviar, el audio se pasa a mono de 16 kHz, se recortan los silencios
  y **se iguala el volumen**. Esto ultimo se nota: con la voz lejos del
  microfono la transcripcion se comia letras (una placa "AX4471" salia
  "X4471"), y nivelando el audio vuelve a salir completa.
- La transcripcion la hace la misma IA, asi que llega con **puntuacion, tildes
  y mayusculas correctas**, y con los numeros escritos como se escriben en
  espanol (1.250.000, 15 dias, 9:00).
- Si un trozo no trae voz, **no se envia**: ante el silencio los modelos
  tienden a inventar frases, y aqui no se inventa nada.
- Si falla la red, ese trozo se reintenta solo una vez.
- Funciona en cualquier navegador con microfono, tambien en movil. La primera
  vez el navegador pide permiso; fuera de `localhost` requiere HTTPS (en Vercel
  ya lo es).
- **Consume cuota de la API**: una peticion por segmento dictado.
- Puedes dictar la puntuacion en voz alta ("coma", "punto", "nueva linea").

## Guardados y buscador

Todo lo que se procesa queda guardado en el navegador, hasta 400 textos. Cada
uno guarda lo que se escribio, el resultado, el asunto, la accion, el idioma y
la fecha.

- **Buscador**: filtra por cualquier palabra del texto, del resultado o del
  asunto. No hace falta poner tildes ("vibracion" encuentra "vibración").
- Se muestran los 8 mas recientes y **Ver mas** va ampliando.
- Al pulsar uno se recupera en el editor; la **X** de la derecha borra solo
  ese, y **Borrar todo** vacia la lista.
- Si el navegador se quedara sin espacio, se van soltando los mas antiguos en
  vez de dejar de guardar.

> Se guarda **en ese navegador**, no en una cuenta: desde otro equipo o
> telefono no se ven los mismos textos. Para eso haria falta una base de datos.

## Instalarla en el telefono

En el navegador del movil, menu -> **Anadir a pantalla de inicio**. Queda con
su icono y se abre a pantalla completa, sin barra de direcciones.

Una vez instalada, **abre aunque no haya conexion** para consultar lo guardado
(procesar texto si necesita internet).

## Abrir en el correo

El boton **Correo** del panel de resultado abre la aplicacion de correo con el
asunto y el texto ya escritos, listo para poner el destinatario y enviar. Si el
texto es muy largo para el enlace, se copia al portapapeles y se avisa.

## Si va lento

La lentitud no suele venir de la aplicacion sino del **plan gratuito de la
API**, que estrangula segun la hora: medido con llamadas directas a Google, el
mismo texto ha tardado 0,5 s por la manana y mas de 40 s por la noche.

Lo que hace la aplicacion para defenderse:

- Llama a `/api/calentar` al abrirse, para que la funcion de Vercel este
  despierta cuando se pulse un boton.
- Reintenta sola ante fallos pasajeros y, si el modelo principal sigue sin
  responder, prueba con `AI_MODEL_FALLBACK`.
- Avisa en pantalla si la espera pasa de cuatro segundos.

Si hace falta que vaya siempre rapido, la solucion real es activar la
facturacion de la API en Google AI Studio: con este uso el coste es minimo y
desaparece el estrangulamiento.

## Pruebas

```bash
npm run dev        # en una terminal
npm test           # en otra: pruebas que no gastan cuota de la IA
npm run test:todo  # todas, incluidas las que llaman a la IA
```

Las pruebas manejan un Chrome de verdad contra la aplicacion: escriben, tocan
botones, descargan el Word, el PDF y el Excel y miran lo que sale (el `.xlsx`
se vuelve a abrir con `exceljs` y el PDF se descomprime para leer su texto).
Cubren la interfaz en cinco tamanos, el celular, los tipos de texto, la
traduccion, el encadenado, los documentos y su idioma, el logo, la cuadricula
de planillas (escribir, pegar, deshacer, filas y columnas), el flujo completo de
una planilla hasta su Excel, la firma escaneada, el buscador y el dictado.

Si Chrome no esta en la ruta habitual se indica con `PAULA_CHROME`, y para
probar contra otra direccion, con `PAULA_URL`.

## Atajos de teclado

| Atajo                   | Accion                              |
| ----------------------- | ----------------------------------- |
| `Ctrl / Cmd + Enter`    | Procesar el texto                   |
| `Ctrl / Cmd + Shift + C`| Copiar el resultado                 |
| `Esc`                   | Cerrar la ventana o cancelar        |

En la cuadricula de Planillas:

| Atajo                    | Accion                             |
| ------------------------ | ---------------------------------- |
| Flechas, `Tab`, `Inicio` | Moverse entre celdas               |
| `Enter`, `F2`            | Escribir en la celda               |
| `Supr`                   | Vaciar sin borrar la fila          |
| `Ctrl + C` / `Ctrl + V`  | Copiar y pegar un bloque           |
| `Ctrl + Z` / `Ctrl + Shift + Z` | Deshacer y rehacer          |

## Cambiar los colores

La aplicacion es siempre oscura. Todos los colores estan en el bloque `:root`
de `app/globals.css`: cambiando esas variables cambia la interfaz entera.

## Estructura del proyecto

```
app/
  api/process/route.ts   Procesa el texto y devuelve la respuesta en streaming
  api/planilla/route.ts  Traduce la planilla celda a celda y la revisa
  api/planillas/         Guarda, abre y borra planillas en Supabase
  api/guardados/         Los correos guardados en Supabase
  api/subject/route.ts   Sugiere 3 asuntos de correo
  layout.tsx             Tema, tipografia y metadatos
  page.tsx               Abre directamente el editor
components/              Interfaz (paneles, acciones, historial, dialogos)
  ui/                    Primitivas reutilizables (Button, Select, Toast...)
lib/
  ai.ts                  Capa de servicio de IA (unico punto con el proveedor)
  prompts.ts             Prompt del sistema y construccion de instrucciones
  actions.ts             Catalogo de acciones, tonos y tipos de texto
  detect-language.ts     Deteccion local de idioma
  storage.ts             Preferencias, borrador e historial en localStorage
  clipboard.ts           Copiar y pegar con Clipboard API y respaldo
  planilla.ts            Modelo de la planilla y operaciones de la cuadricula
  supabase.ts            Conexion con Supabase (solo en el servidor)
  nube.ts                Lo que el navegador le pide a la nube, via /api
  plantillas.ts          Las plantillas de AVX (terminal, hangar, noches)
  tabla.ts               Mapas de traduccion fija y validacion celda a celda
  export/i18n.ts         Etiquetas y fechas de los documentos (es / en)
  export/logo.ts         Logo de American Airlines, leido una sola vez
  export/docx.ts         Generacion de .docx real (libreria docx)
  export/pdf.ts          Generacion de PDF real (jsPDF)
  export/xlsx.ts         Generacion de .xlsx real (exceljs)
types/                   Tipos compartidos
```

## Personalizar el nombre

El nombre y el subtitulo estan en `lib/config.ts`:

```ts
export const APP_NAME = "PAULA CORREOS";
export const APP_TAGLINE = "Write better. Translate naturally.";
```
