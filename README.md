# FaceEdit

**Análisis facial inteligente** en una única vista web. Activa la cámara o sube
una fotografía para detectar rostros, estimar la edad aparente y reconocer la
emoción predominante.

La interfaz es una SPA ligera (HTML5 + CSS3 + JavaScript vanilla) y todo el
procesamiento ocurre en el equipo local con **Python + OpenCV + DeepFace**.

---

## Funcionalidades

- Vista única, responsive y sin navegación adicional.
- Cámara web con análisis periódico (sin procesar cada fotograma).
- Carga de fotografías **JPG, JPEG y PNG** con validación de tipo, tamaño y
  contenido.
- Detección de varios rostros con el detector neuronal **YuNet** y análisis
  independiente de cada uno. Incluye filtros de confianza, tamaño, proporción y
  puntos faciales para evitar detecciones falsas en fondos y objetos.
- Edad aparente, emoción dominante, porcentaje de confianza y desglose de las
  siete emociones.
- **Estabilización temporal en cámara**: cada rostro se sigue entre análisis y
  la edad y la emoción se suavizan para que no salten con movimientos pequeños.
- Recuadros de detección dibujados sobre la imagen o el vídeo.
- Mensajes claros para permisos de cámara, archivos inválidos, errores de red y
  ausencia de rostros.
- Procesamiento en memoria: **las imágenes no se guardan**.
- Sin envío de imágenes a servicios externos.

## Tecnologías

| Capa | Tecnología |
| --- | --- |
| Servidor | Flask 3.1 |
| Visión artificial | OpenCV 4.13 |
| Detección facial | YuNet de OpenCV Zoo (ONNX, incluido en `facial/models/`) |
| Edad | MiVOLO v2 (ONNX incluido) |
| Emoción | DeepFace 0.0.104 |
| Inferencia | ONNX Runtime (CPU) |
| Interfaz | HTML5, CSS3 y JavaScript vanilla |

DeepFace 0.0.104 puede ejecutarse con ONNX Runtime, por lo que **no necesita
TensorFlow**. Esto permite usar Python 3.11 o superior, incluido Python 3.14.

---

## Requisitos

- Python **3.11 o superior**.
- Cámara web (opcional; la carga de fotos funciona sin cámara).
- Navegador moderno: Chrome, Edge, Firefox o Safari reciente.
- Conexión a Internet **solo la primera vez** para descargar los pesos de los
  modelos de DeepFace. Después quedan en la caché local (`~/.deepface/weights`).
  El modelo de detección YuNet ya está incluido en el proyecto y no requiere
  conexión.

## Instalación en Windows

Desde la carpeta del proyecto:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

Si PowerShell bloquea la activación del entorno virtual:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\.venv\Scripts\Activate.ps1
```

## Ejecución

```powershell
python app.py
```

Abre <http://127.0.0.1:5000> en el navegador. El servidor escucha únicamente en
localhost por defecto.

La primera vez que se analiza una imagen, DeepFace descarga el modelo de
emoción. La aplicación intenta precargarlo al arrancar; después queda en la
caché local (`~/.deepface/weights`) y los análisis son más rápidos. Los modelos
MiVOLO v2 para edad y YuNet para detección ya están incluidos en el proyecto.
No se envían imágenes a ningún servicio externo.

### Variables de entorno opcionales

| Variable | Valor por defecto | Descripción |
| --- | --- | --- |
| `FACEDIT_HOST` | `127.0.0.1` | Interfaz de red del servidor |
| `FACEDIT_PORT` | `5000` | Puerto HTTP |
| `FACEDIT_WARMUP` | `1` | `0` desactiva la precarga de modelos |
| `FACEDIT_DEBUG` | `0` | `1` activa el modo debug de Flask |

Ejemplo con otro puerto:

```powershell
$env:FACEDIT_PORT = "5001"
python app.py
```

> Para usar la cámara desde otro equipo de la red, el navegador exige HTTPS o un
> contexto seguro. Para uso local, `http://127.0.0.1:5000` es suficiente.

---

## Uso

1. Pulsa **Activar cámara** y concede el permiso al navegador, o pulsa
   **Subir fotografía**.
2. Colócate frente a la cámara con buena iluminación. La cámara analiza un
   fotograma aproximadamente cada 2,4 segundos; nunca se solapan peticiones.
3. Consulta el panel derecho:
   - número de rostros detectados,
   - edad estimada,
   - emoción dominante y confianza,
   - desglose emocional.
4. Pulsa **Detener cámara** para liberar el dispositivo.

Las imágenes de la cámara y las fotografías se procesan en memoria y se
descartan al terminar la petición.

---

## Estructura

```text
informatica/
├── app.py                  # Servidor Flask, validación y API
├── requirements.txt
├── README.md
├── facial/
│   ├── __init__.py
│   ├── detector.py         # Detección facial con YuNet (OpenCV)
│   ├── analyzer.py         # Edad con MiVOLO y emoción con DeepFace
│   └── models/
│       ├── mivolo_v2_age.onnx
│       └── face_detection_yunet_2023mar.onnx
├── templates/
│   └── index.html          # Vista única
└── static/
    ├── css/
    │   └── style.css
    ├── js/
    │   └── main.js
    └── assets/
```

## API local

### `GET /api/health`

Devuelve el estado del motor de IA y los límites de carga.

### `POST /api/analyze`

Recibe `multipart/form-data` con el campo `image`.

Respuesta correcta (ejemplo simplificado):

```json
{
  "ok": true,
  "image": { "width": 1280, "height": 853 },
  "face_count": 1,
  "processing_ms": 742,
  "message": "1 rostro detectado.",
  "faces": [
    {
      "face_index": 1,
      "box": { "x": 0.31, "y": 0.18, "w": 0.24, "h": 0.36 },
      "age": 31,
      "emotion_key": "happy",
      "emotion_label": "Feliz",
      "confidence": 94.2,
      "scores": [
        { "key": "happy", "label": "Feliz", "score": 94.2 }
      ],
      "error": null
    }
  ]
}
```

Las coordenadas `box` son relativas (0–1), por lo que funcionan con cualquier
tamaño de visualización.

Errores habituales:

| Código | Motivo |
| --- | --- |
| `400` | Archivo ausente, vacío, formato no admitido o imagen inválida |
| `413` | Solicitud superior a 8 MB |
| `503` | DeepFace/ONNX Runtime no disponibles |
| `500` | Error inesperado durante el procesamiento |

---

## Privacidad y rendimiento

- Las imágenes se leen en memoria con `cv2.imdecode`; nunca se escriben en disco.
- El servidor no registra las imágenes ni las envía a APIs externas.
- La cámara envía fotogramas JPEG reducidos (máximo 960 px de ancho) cada
  2,4 segundos, con una única petición en curso.
- Las fotos se reducen en el navegador a un máximo de 1600 px por lado.
- El análisis de edad/emoción se serializa con un candado para evitar picos de
  CPU y condiciones de carrera.
- La detección se ejecuta en OpenCV y el análisis se hace solo sobre los
  recortes de rostro.

## Solución de problemas

**El motor de IA aparece como no disponible**

Comprueba que estás usando el entorno virtual y reinstala dependencias:

```powershell
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m pip check
```

**La cámara no se activa**

- Concede permiso de cámara en el navegador.
- Abre la página en `localhost` o `127.0.0.1` (no mediante `file://`).
- Cierra otras aplicaciones que estén usando la cámara.

**El primer análisis tarda**

Es normal si los modelos aún no están en `~/.deepface/weights`. Espera a que
termine la descarga. Los siguientes análisis serán más rápidos.

**El puerto 5000 está ocupado**

```powershell
$env:FACEDIT_PORT = "5001"
python app.py
```

**No se detecta el rostro**

Busca luz frontal, evita contraluz, acerca el rostro y mantén la cara de frente.
YuNet funciona mejor con rostros frontales, nítidos y de al menos unos 40 px.
Si el modelo `facial/models/face_detection_yunet_2023mar.onnx` falta, la app usa
Haar como respaldo, pero con más falsos positivos.

---

## Nota sobre las estimaciones

La edad y la emoción son **estimaciones estadísticas** del modelo. Pueden variar
con la iluminación, el ángulo, la resolución, los accesorios o la expresión. No
deben usarse para decisiones sensibles ni como diagnóstico.

En la cámara, FaceEdit aplica una estabilización temporal: sigue cada rostro
entre análisis, calcula la mediana de la edad de los últimos fotogramas y solo
la actualiza cuando el cambio supera un margen de dos años. La emoción usa un
promedio ponderado de los últimos análisis. Las fotografías muestran el
resultado directo del modelo, sin este suavizado.
