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

1. Sube el proyecto a GitHub.
2. En <https://vercel.com/new> importa el repositorio (Vercel detecta Next.js solo).
3. En **Settings -> Environment Variables** agrega `AI_API_KEY` con tu clave
   (y `AI_MODEL` si quieres otro modelo). Marca los entornos Production,
   Preview y Development.
4. **Deploy**. No hace falta `vercel.json`.

Cada vez que cambies una variable de entorno hay que volver a desplegar.

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

Pulsa **Dictar** en el panel izquierdo y habla. Mientras grabas ves el
cronometro y un medidor que confirma que el microfono esta entrando. Al pulsar
**Listo**, el audio se transcribe y el texto aparece en el cuadro; **Descartar**
tira la grabacion sin transcribir.

- La transcripcion la hace la misma IA, asi que **llega con puntuacion, tildes y
  mayusculas correctas** (el reconocimiento del navegador no hace eso).
- Funciona en cualquier navegador con microfono, tambien en movil.
- El audio se graba, se pasa a WAV mono de 16 kHz y se envia solo al procesarlo;
  no se guarda en ningun sitio.
- Maximo 3 minutos por grabacion: se corta sola al llegar.
- La primera vez el navegador pide permiso del microfono. Fuera de `localhost`
  requiere HTTPS (en Vercel ya lo es).
- **Consume cuota de la API** (una peticion por grabacion), a diferencia del
  resto de acciones de texto que tambien la consumen.
- Puedes dictar la puntuacion en voz alta ("coma", "punto", "nueva linea").

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
