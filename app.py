"""FaceEdit - servidor Flask y API de análisis facial local."""

from __future__ import annotations

import logging
import os
import sys
import threading
import time
from pathlib import Path

import cv2
import numpy as np
from flask import Flask, jsonify, redirect, render_template, request, url_for
from werkzeug.exceptions import RequestEntityTooLarge

from facial import AnalyzerUnavailable, FaceAnalyzer, FaceDetector

# La consola de Windows puede usar cp1252 por defecto. DeepFace imprime emojis
# al descargar sus modelos; evitamos que un error de codificación interrumpa
# la carga sin importar la terminal utilizada.
for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        try:
            _stream.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, OSError):
            pass

BASE_DIR = Path(__file__).resolve().parent
MAX_IMAGE_BYTES = 8 * 1024 * 1024
MAX_REQUEST_BYTES = 9 * 1024 * 1024
MAX_IMAGE_SIDE = 1600
MAX_IMAGE_PIXELS = 40_000_000
MIN_IMAGE_SIDE = 64
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png"}
ALLOWED_MIME_TYPES = {"image/jpeg", "image/jpg", "image/png", "application/octet-stream"}

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-7s | %(name)s | %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("faceedit")

app = Flask(__name__)
app.config.update(
    MAX_CONTENT_LENGTH=MAX_REQUEST_BYTES,
    TEMPLATES_AUTO_RELOAD=False,
)
app.json.ensure_ascii = False
app.json.sort_keys = False

detector = FaceDetector()
analyzer = FaceAnalyzer()


class ImageValidationError(ValueError):
    """La imagen recibida no cumple el formato o los límites permitidos."""

    def __init__(self, message: str, code: str = "invalid_image") -> None:
        super().__init__(message)
        self.code = code


def _json_error(message: str, status: int, code: str) -> tuple:
    return jsonify({"ok": False, "error": {"code": code, "message": message}}), status


def _looks_like_supported_image(data: bytes) -> bool:
    if data.startswith(b"\xff\xd8\xff"):
        return True
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return True
    return False


def _read_validated_image(upload) -> np.ndarray:
    """Lee, valida y normaliza una imagen en memoria. Nunca la guarda en disco."""

    if upload is None or not upload.filename:
        raise ImageValidationError("No se recibió ninguna imagen.", "missing_image")

    suffix = Path(upload.filename).suffix.lower()
    if suffix and suffix not in ALLOWED_EXTENSIONS:
        raise ImageValidationError(
            "Formato no admitido. Sube una imagen JPG, JPEG o PNG.", "unsupported_format"
        )

    mime = (upload.mimetype or "").lower()
    if mime and mime not in ALLOWED_MIME_TYPES:
        raise ImageValidationError(
            "El tipo de archivo no es compatible. Usa JPG, JPEG o PNG.", "unsupported_format"
        )

    data = upload.stream.read(MAX_IMAGE_BYTES + 1)
    if not data:
        raise ImageValidationError("El archivo está vacío.", "empty_file")
    if len(data) > MAX_IMAGE_BYTES:
        raise ImageValidationError(
            "La imagen supera el límite de 8 MB.", "file_too_large"
        )
    if not _looks_like_supported_image(data):
        raise ImageValidationError(
            "El contenido no corresponde a una imagen JPG o PNG válida.",
            "invalid_content",
        )

    buffer = np.frombuffer(data, dtype=np.uint8)
    image = cv2.imdecode(buffer, cv2.IMREAD_COLOR)
    if image is None or image.size == 0:
        raise ImageValidationError(
            "No se pudo decodificar la imagen. El archivo puede estar dañado.",
            "decode_error",
        )

    height, width = image.shape[:2]
    if width < MIN_IMAGE_SIDE or height < MIN_IMAGE_SIDE:
        raise ImageValidationError(
            "La imagen es demasiado pequeña. Usa una imagen de al menos 64 × 64 px.",
            "image_too_small",
        )
    if width * height > MAX_IMAGE_PIXELS:
        raise ImageValidationError(
            "La imagen tiene una resolución excesiva.", "image_too_large"
        )

    # Reducir imágenes grandes acelera la detección y la inferencia.
    if max(width, height) > MAX_IMAGE_SIDE:
        scale = MAX_IMAGE_SIDE / max(width, height)
        image = cv2.resize(
            image,
            (max(1, int(width * scale)), max(1, int(height * scale))),
            interpolation=cv2.INTER_AREA,
        )

    return image


@app.get("/")
def index():
    return render_template("index.html")


@app.get("/api/health")
def health():
    return jsonify(
        {
            "ok": True,
            "engine": analyzer.status(),
            "limits": {
                "max_image_bytes": MAX_IMAGE_BYTES,
                "max_image_side": MAX_IMAGE_SIDE,
                "formats": ["JPG", "JPEG", "PNG"],
            },
        }
    )


@app.post("/api/analyze")
def analyze():
    started = time.perf_counter()

    try:
        image = _read_validated_image(request.files.get("image"))
    except ImageValidationError as exc:
        return _json_error(str(exc), 400, exc.code)

    try:
        boxes = detector.detect(image)
        faces = analyzer.analyze_faces(image, boxes) if boxes else []
    except AnalyzerUnavailable as exc:
        logger.warning("Motor de IA no disponible: %s", exc)
        return _json_error(
            "El motor de IA no está disponible. Revisa que las dependencias "
            "estén instaladas y reinicia la aplicación.",
            503,
            "engine_unavailable",
        )
    except Exception:
        logger.exception("Error inesperado durante el análisis facial")
        return _json_error(
            "Ocurrió un error al procesar la imagen. Inténtalo de nuevo.",
            500,
            "analysis_error",
        )

    height, width = image.shape[:2]
    elapsed_ms = int((time.perf_counter() - started) * 1000)
    face_count = len(faces)

    return jsonify(
        {
            "ok": True,
            "image": {"width": width, "height": height},
            "face_count": face_count,
            "faces": faces,
            "processing_ms": elapsed_ms,
            "message": (
                f"{face_count} rostro{'s' if face_count != 1 else ''} detectado"
                f"{'s' if face_count != 1 else ''}."
                if face_count
                else "No se detectó ningún rostro en la imagen."
            ),
        }
    )


@app.after_request
def add_security_headers(response):
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    response.headers.setdefault("Permissions-Policy", "camera=(self), microphone=()")

    if request.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"

    if response.mimetype == "text/html":
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "img-src 'self' blob: data:; "
            "media-src 'self' blob:; "
            "style-src 'self' 'unsafe-inline'; "
            "script-src 'self'; "
            "connect-src 'self'; "
            "font-src 'self'; "
            "object-src 'none'; "
            "base-uri 'self'; "
            "form-action 'self'; "
            "frame-ancestors 'none'"
        )

    return response


@app.errorhandler(RequestEntityTooLarge)
def request_too_large(_error):
    return _json_error(
        "La solicitud supera el límite permitido de 8 MB.", 413, "request_too_large"
    )


@app.errorhandler(404)
def not_found(_error):
    if request.path.startswith("/api/"):
        return _json_error("Ruta de API no encontrada.", 404, "not_found")
    return redirect(url_for("index"))


def _warm_up_models() -> None:
    try:
        analyzer.warmup()
    except Exception:
        logger.warning(
            "No se pudieron precargar los modelos. Se intentará de nuevo "
            "en el primer análisis.",
            exc_info=True,
        )


def _start_warmup() -> None:
    if os.environ.get("FACEDIT_WARMUP", "1").lower() in {"0", "false", "no", "off"}:
        return
    thread = threading.Thread(
        target=_warm_up_models,
        name="faceedit-model-warmup",
        daemon=True,
    )
    thread.start()


_start_warmup()


if __name__ == "__main__":
    host = os.environ.get("FACEDIT_HOST", "127.0.0.1")
    port = int(os.environ.get("FACEDIT_PORT", "5000"))
    debug = os.environ.get("FACEDIT_DEBUG", "0") == "1"

    logger.info("FaceEdit iniciando en http://%s:%s", host, port)
    logger.info("El análisis se ejecuta localmente con OpenCV + DeepFace (ONNX).")
    app.run(host=host, port=port, debug=debug, threaded=True, use_reloader=False)
