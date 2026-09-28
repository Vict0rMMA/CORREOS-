# PAULA CORREOS

Herramienta web para **redactar, corregir y traducir** correos y textos entre espanol e ingles.
Escribes o pegas un texto, eliges una accion y obtienes el resultado listo para copiar,
descargar en Word o PDF, o imprimir.

- **Dictado por voz**: hablas y el texto se escribe solo, en vivo.
- **Reportes con fotos**: adjunta imagenes con pie de foto y salen en el Word, el PDF y la impresion.
- Correccion de ortografia, gramatica, puntuacion y redaccion.
- Traduccion natural (no literal) espanol <-> ingles.
- Mejora de redaccion conservando la intencion original.
- Generacion de correos completos a partir de una idea corta.
- Seis tonos y siete tipos de texto.
- Sugerencia de asuntos para correos.
- Acciones rapidas de un clic, historial local y atajos de teclado.
- Tema claro / oscuro, disenado para movil, tablet y escritorio.

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

Donde aparece:

- En los correos de **Generar correo**, despues de la despedida.
- Al final del **Word**, el **PDF** y la **impresion**, sea cual sea el texto.
  Si el texto ya termina con ella (un correo generado), no se repite.
- **No** se anade al resultado en pantalla ni a lo que se copia: ahi queda
  exactamente lo que devolvio la IA.

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
- **Pie de pagina** con el nombre de la aplicacion, la fecha y "Pagina X de Y".
- **Anexo fotografico** al final cuando el tipo es Reporte.

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

## Atajos de teclado

| Atajo                   | Accion                              |
| ----------------------- | ----------------------------------- |
| `Ctrl / Cmd + Enter`    | Procesar el texto                   |
| `Ctrl / Cmd + Shift + C`| Copiar el resultado                 |
| `Esc`                   | Cerrar la ventana o cancelar        |

## Estructura del proyecto

```
app/
  api/process/route.ts   Procesa el texto y devuelve la respuesta en streaming
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
  export/docx.ts         Generacion de .docx real (libreria docx)
  export/pdf.ts          Generacion de PDF real (jsPDF)
types/                   Tipos compartidos
```

## Personalizar el nombre

El nombre y el subtitulo estan en `lib/config.ts`:

```ts
export const APP_NAME = "PAULA CORREOS";
export const APP_TAGLINE = "Write better. Translate naturally.";
```
