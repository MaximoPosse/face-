"""Análisis de edad y emoción con modelos locales.

La edad se estima con MiVOLO v2 cuando el modelo está disponible y, en caso
contrario, con DeepFace. La emoción se obtiene con DeepFace. Ambos modelos se
ejecutan con ONNX Runtime en CPU y no envían imágenes fuera del equipo.
"""

from __future__ import annotations

import importlib.util
import logging
import math
import os
import sys
import threading
from pathlib import Path
from typing import Any

import cv2
import numpy as np

from .detector import FaceBox

# La consola de Windows puede usar cp1252 por defecto. DeepFace imprime emojis
# al descargar sus modelos; evitamos que un error de codificación interrumpa
# la carga sin importar la terminal utilizada.
for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        try:
            _stream.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, OSError):
            pass

# Debe configurarse antes de importar DeepFace.
os.environ.setdefault("DEEPFACE_BACKEND_ENGINE", "onnx")
os.environ.setdefault("DEEPFACE_ONNX_PROVIDERS", "cpu")
os.environ.setdefault("TQDM_DISABLE", "1")

logger = logging.getLogger(__name__)

EMOTION_LABELS = {
    "happy": "Feliz",
    "sad": "Triste",
    "angry": "Enojado",
    "surprise": "Sorprendido",
    "fear": "Asustado",
    "disgust": "Disgustado",
    "neutral": "Neutral",
}

ENGINE_NAME = "MiVOLO v2 + DeepFace · ONNX Runtime"

_AGE_MODEL_PATH = Path(__file__).resolve().parent / "models" / "mivolo_v2_age.onnx"
_AGE_INPUT_SIZE = 384
_AGE_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
_AGE_STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)


class AnalyzerUnavailable(RuntimeError):
    """El motor de IA no puede utilizarse en este entorno."""


class FaceAnalyzer:
    """Analiza edad y emoción de cada caja facial detectada."""

    def __init__(self) -> None:
        self._deepface: Any | None = None
        self._lock = threading.Lock()
        self._load_error: str | None = None
        self._loaded = False
        self._age_session: Any | None = None
        self._age_input: str | None = None
        self._age_output: str | None = None
        self._age_body: np.ndarray | None = None
        self._age_backend: str | None = None

    # ------------------------------------------------------------------
    # Estado del motor
    # ------------------------------------------------------------------
    def status(self) -> dict[str, Any]:
        """Informa del estado sin importar DeepFace ni cargar los modelos."""

        if self._loaded:
            return {
                "state": "ready",
                "engine": ENGINE_NAME,
                "detail": "Modelos de edad (MiVOLO v2) y emoción (DeepFace) cargados.",
            }

        if self._load_error:
            return {
                "state": "error",
                "engine": ENGINE_NAME,
                "detail": self._load_error,
            }

        dependencies = {
            "deepface": importlib.util.find_spec("deepface") is not None,
            "onnxruntime": importlib.util.find_spec("onnxruntime") is not None,
        }
        if all(dependencies.values()):
            return {
                "state": "available",
                "engine": ENGINE_NAME,
                "detail": "Dependencias disponibles. Los modelos se cargan al analizar.",
            }

        missing = ", ".join(name for name, found in dependencies.items() if not found)
        return {
            "state": "unavailable",
            "engine": ENGINE_NAME,
            "detail": f"Faltan dependencias: {missing}. Ejecuta: pip install -r requirements.txt",
        }

    # ------------------------------------------------------------------
    # Carga y precalentamiento
    # ------------------------------------------------------------------
    def _load_backend(self) -> Any:
        if self._deepface is not None:
            return self._deepface

        try:
            from deepface import DeepFace
        except Exception as exc:  # pragma: no cover - depende del entorno
            self._load_error = (
                "No se pudo importar DeepFace. Revisa la instalación de "
                "requirements.txt y que onnxruntime esté disponible."
            )
            raise AnalyzerUnavailable(self._load_error) from exc

        self._deepface = DeepFace
        self._loaded = True
        self._load_error = None
        return DeepFace

    def _load_models(self) -> None:
        """Carga MiVOLO v2 para edad y el modelo de emoción de DeepFace."""

        from deepface.modules import modeling

        if self._age_backend is None:
            self._age_backend = "mivolo" if self._create_age_session() else "deepface"

        modeling.build_model(task="facial_attribute", model_name="Emotion")
        if self._age_backend == "deepface":
            modeling.build_model(task="facial_attribute", model_name="Age")

    def _create_age_session(self) -> bool:
        """Carga el modelo ONNX de edad. Devuelve False si no está disponible."""

        if not _AGE_MODEL_PATH.is_file():
            logger.warning(
                "No se encontró el modelo MiVOLO v2 en %s; "
                "la edad se calculará con DeepFace.",
                _AGE_MODEL_PATH,
            )
            return False

        try:
            import onnxruntime as ort

            session = ort.InferenceSession(
                str(_AGE_MODEL_PATH),
                providers=["CPUExecutionProvider"],
            )
            inputs = session.get_inputs()
            outputs = session.get_outputs()
            if not inputs or not outputs:
                raise RuntimeError("El modelo MiVOLO no expone entradas o salidas.")

            body = np.zeros((_AGE_INPUT_SIZE, _AGE_INPUT_SIZE, 3), dtype=np.float32)
            body = (body - _AGE_MEAN) / _AGE_STD

            self._age_session = session
            self._age_input = inputs[0].name
            self._age_output = outputs[0].name
            self._age_body = np.transpose(body, (2, 0, 1))
            logger.info("Modelo de edad MiVOLO v2 cargado desde %s.", _AGE_MODEL_PATH)
            return True
        except Exception:
            logger.exception(
                "No se pudo cargar MiVOLO v2; la edad se calculará con DeepFace."
            )
            self._age_session = None
            self._age_body = None
            return False

    def warmup(self) -> None:
        """Carga los modelos de edad y emoción en segundo plano."""

        with self._lock:
            self._load_backend()
            try:
                self._load_models()
            except Exception as exc:  # pragma: no cover - depende de la red/caché
                self._load_error = (
                    "No se pudieron cargar los modelos de IA. Comprueba la conexión "
                    "a Internet en el primer inicio y vuelve a intentarlo."
                )
                raise AnalyzerUnavailable(self._load_error) from exc
            self._load_error = None

        logger.info("Modelos de edad y emoción precargados.")

    # ------------------------------------------------------------------
    # Análisis
    # ------------------------------------------------------------------
    def analyze_faces(
        self, image_bgr: np.ndarray, boxes: list[FaceBox]
    ) -> list[dict[str, Any]]:
        """Analiza cada rostro por separado y devuelve resultados serializables."""

        if not boxes:
            return []

        image_height, image_width = image_bgr.shape[:2]

        # ONNX Runtime y los modelos se comparten; una sola inferencia a la vez
        # evita picos de CPU y condiciones de carrera.
        with self._lock:
            deepface = self._load_backend()
            try:
                self._load_models()
            except Exception as exc:  # pragma: no cover - depende de la red/caché
                self._load_error = (
                    "No se pudieron cargar los modelos de IA. Comprueba la conexión "
                    "a Internet en el primer inicio y vuelve a intentarlo."
                )
                raise AnalyzerUnavailable(self._load_error) from exc
            self._load_error = None
            results: list[dict[str, Any]] = []

            for index, box in enumerate(boxes, start=1):
                region = box.normalized(image_width, image_height)
                base_result: dict[str, Any] = {
                    "face_index": index,
                    "box": region,
                    "age": None,
                    "emotion_key": None,
                    "emotion_label": "Sin datos",
                    "confidence": 0.0,
                    "scores": [],
                    "error": None,
                }

                try:
                    crop = self._crop_face(image_bgr, box)
                    actions = (
                        ("emotion",)
                        if self._age_backend == "mivolo"
                        else ("age", "emotion")
                    )
                    raw = deepface.analyze(
                        crop,
                        actions=actions,
                        enforce_detection=False,
                        detector_backend="skip",
                        align=False,
                        silent=True,
                    )
                    item = self._first_result(raw)
                    if self._age_backend == "mivolo":
                        item = {**item, "age": self._estimate_age(crop)}
                    result = self._normalize_result(item, base_result)
                    results.append(result)
                except Exception:
                    logger.exception("No se pudo analizar el rostro %d", index)
                    base_result["error"] = (
                        "No se pudo analizar este rostro. Intenta con mejor luz y resolución."
                    )
                    results.append(base_result)

            return results

    def _estimate_age(self, face_bgr: np.ndarray) -> float:
        """Estima la edad con la entrada facial del modelo MiVOLO v2."""

        if (
            self._age_session is None
            or self._age_input is None
            or self._age_output is None
            or self._age_body is None
        ):
            raise RuntimeError("El modelo MiVOLO de edad no está inicializado.")

        face = self._prepare_age_face(face_bgr)
        # MiVOLO expects face and body channels; the detector only provides faces.
        model_input = np.concatenate((face, self._age_body), axis=0)[None, ...]
        raw_age = self._age_session.run(
            [self._age_output], {self._age_input: model_input}
        )[0]
        age = float(np.asarray(raw_age).reshape(-1)[0])
        if not math.isfinite(age):
            raise ValueError("MiVOLO devolvió una edad no numérica.")
        return age

    @staticmethod
    def _prepare_age_face(face_bgr: np.ndarray) -> np.ndarray:
        """Prepara el rostro con el letterbox y la normalización de MiVOLO."""

        height, width = face_bgr.shape[:2]
        if height <= 0 or width <= 0:
            raise ValueError("Recorte facial vacío.")

        scale = min(_AGE_INPUT_SIZE / width, _AGE_INPUT_SIZE / height)
        resized_width = max(1, int(round(width * scale)))
        resized_height = max(1, int(round(height * scale)))
        resized = cv2.resize(
            face_bgr,
            (resized_width, resized_height),
            interpolation=cv2.INTER_LINEAR,
        )

        letterboxed = np.zeros(
            (_AGE_INPUT_SIZE, _AGE_INPUT_SIZE, 3), dtype=np.uint8
        )
        left = (_AGE_INPUT_SIZE - resized_width) // 2
        top = (_AGE_INPUT_SIZE - resized_height) // 2
        letterboxed[top : top + resized_height, left : left + resized_width] = resized

        face_rgb = cv2.cvtColor(letterboxed, cv2.COLOR_BGR2RGB).astype(np.float32)
        face_rgb = face_rgb / 255.0
        face_rgb = (face_rgb - _AGE_MEAN) / _AGE_STD
        return np.ascontiguousarray(np.transpose(face_rgb, (2, 0, 1)))

    @staticmethod
    def _crop_face(image_bgr: np.ndarray, box: FaceBox, margin: float = 0.16) -> np.ndarray:
        """Recorta el rostro con un pequeño margen para el modelo."""

        image_height, image_width = image_bgr.shape[:2]
        margin_x = int(box.w * margin)
        margin_y = int(box.h * margin)

        left = max(0, box.x - margin_x)
        top = max(0, box.y - margin_y)
        right = min(image_width, box.x + box.w + margin_x)
        bottom = min(image_height, box.y + box.h + margin_y)

        crop = image_bgr[top:bottom, left:right]
        if crop.size == 0:
            raise ValueError("Recorte facial vacío.")
        return crop

    @staticmethod
    def _first_result(raw: Any) -> dict[str, Any]:
        if isinstance(raw, dict):
            return raw
        if isinstance(raw, list) and raw and isinstance(raw[0], dict):
            return raw[0]
        raise ValueError("DeepFace devolvió una respuesta inesperada.")

    @classmethod
    def _normalize_result(
        cls, item: dict[str, Any], base: dict[str, Any]
    ) -> dict[str, Any]:
        """Convierte la respuesta de DeepFace a un contrato estable para la web."""

        scores: dict[str, float] = {}
        raw_scores = item.get("emotion", {})
        if isinstance(raw_scores, dict):
            for key, value in raw_scores.items():
                try:
                    numeric = float(value)
                except (TypeError, ValueError):
                    continue
                if math.isfinite(numeric):
                    scores[str(key)] = max(0.0, min(100.0, numeric))

        dominant = str(item.get("dominant_emotion") or "").lower()
        if dominant not in EMOTION_LABELS and scores:
            dominant = max(scores, key=scores.get)
        if dominant not in EMOTION_LABELS:
            dominant = "neutral"

        age: int | None
        try:
            age = int(round(float(item.get("age"))))
            age = max(0, min(120, age))
        except (TypeError, ValueError):
            age = None

        ordered_scores = sorted(
            (
                {
                    "key": key,
                    "label": EMOTION_LABELS.get(key, key.capitalize()),
                    "score": round(score, 1),
                }
                for key, score in scores.items()
            ),
            key=lambda entry: entry["score"],
            reverse=True,
        )

        return {
            **base,
            "age": age,
            "emotion_key": dominant,
            "emotion_label": EMOTION_LABELS[dominant],
            "confidence": round(scores.get(dominant, 0.0), 1),
            "scores": ordered_scores,
            "error": None,
        }
