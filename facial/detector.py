"""Detección de rostros con OpenCV.

El detector principal es YuNet, una red neuronal ligera incluida en OpenCV Zoo
que se ejecuta localmente y ofrece muchos menos falsos positivos que Haar.
Como respaldo, si el modelo no estuviera disponible, se usa el clasificador
Haar con filtros estrictos. Las cajas devueltas están en píxeles y se pueden
normalizar para dibujarlas en el navegador a cualquier resolución.
"""

from __future__ import annotations

import logging
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

import cv2
import numpy as np

logger = logging.getLogger(__name__)

_MODEL_PATH = (
    Path(__file__).resolve().parent
    / "models"
    / "face_detection_yunet_2023mar.onnx"
)

# Umbral de confianza de YuNet. Los valores bajos son la principal causa de
# detecciones en fondos, muebles o texturas; 0.80 mantiene rostros reales.
_SCORE_THRESHOLD = 0.80
_NMS_THRESHOLD = 0.30
_MIN_ASPECT_RATIO = 0.50
_MAX_ASPECT_RATIO = 1.90


@dataclass(frozen=True, slots=True)
class FaceBox:
    """Región rectangular de un rostro dentro de una imagen."""

    x: int
    y: int
    w: int
    h: int

    @property
    def area(self) -> int:
        return max(0, self.w) * max(0, self.h)

    def normalized(self, image_width: int, image_height: int) -> dict[str, float]:
        """Devuelve la caja con coordenadas relativas (0-1)."""

        if image_width <= 0 or image_height <= 0:
            raise ValueError("Las dimensiones de la imagen deben ser positivas.")

        return {
            "x": round(max(0.0, self.x / image_width), 5),
            "y": round(max(0.0, self.y / image_height), 5),
            "w": round(max(0.0, self.w / image_width), 5),
            "h": round(max(0.0, self.h / image_height), 5),
        }


def _iou(first: FaceBox, second: FaceBox) -> float:
    left = max(first.x, second.x)
    top = max(first.y, second.y)
    right = min(first.x + first.w, second.x + second.w)
    bottom = min(first.y + first.h, second.y + second.h)

    intersection = max(0, right - left) * max(0, bottom - top)
    if intersection == 0:
        return 0.0

    union = first.area + second.area - intersection
    return intersection / union if union else 0.0


def _deduplicate(boxes: Iterable[FaceBox], threshold: float = 0.38) -> list[FaceBox]:
    """Elimina detecciones casi idénticas devueltas a varias escalas."""

    remaining = sorted(boxes, key=lambda box: box.area, reverse=True)
    kept: list[FaceBox] = []

    for candidate in remaining:
        if all(_iou(candidate, accepted) <= threshold for accepted in kept):
            kept.append(candidate)

    return sorted(kept, key=lambda box: (box.x, box.y))


def _to_gray(image_bgr: np.ndarray) -> np.ndarray:
    if image_bgr.ndim == 2:
        return image_bgr
    if image_bgr.ndim == 3 and image_bgr.shape[2] == 3:
        return cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
    if image_bgr.ndim == 3 and image_bgr.shape[2] == 4:
        return cv2.cvtColor(image_bgr, cv2.COLOR_BGRA2GRAY)
    raise ValueError("Formato de imagen no compatible para detección facial.")


class FaceDetector:
    """Detector de rostros frontal basado en YuNet (OpenCV)."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._yunet: cv2.FaceDetectorYN | None = None
        self._cascade: cv2.CascadeClassifier | None = None

        if _MODEL_PATH.is_file():
            try:
                self._yunet = cv2.FaceDetectorYN.create(
                    str(_MODEL_PATH),
                    "",
                    (320, 320),
                    _SCORE_THRESHOLD,
                    _NMS_THRESHOLD,
                    5000,
                )
            except cv2.error as exc:
                logger.warning("No se pudo cargar el modelo YuNet: %s", exc)

        if self._yunet is None:
            logger.warning(
                "YuNet no está disponible en %s; se usará Haar con filtros estrictos.",
                _MODEL_PATH,
            )
            cascade_path = (
                Path(cv2.data.haarcascades) / "haarcascade_frontalface_alt2.xml"
            )
            cascade = cv2.CascadeClassifier(str(cascade_path))
            if cascade.empty():
                raise RuntimeError(
                    "No se pudo cargar ningún detector facial de OpenCV. "
                    "Reinstala opencv-contrib-python-headless y verifica "
                    "facial/models/face_detection_yunet_2023mar.onnx."
                )
            self._cascade = cascade

    def detect(self, image_bgr: np.ndarray) -> list[FaceBox]:
        """Detecta todos los rostros frontales de una imagen BGR."""

        if image_bgr is None or image_bgr.size == 0:
            return []

        height, width = image_bgr.shape[:2]
        short_side = min(width, height)
        min_face = max(40, min(120, int(short_side * 0.04)))

        if self._yunet is not None:
            boxes = self._detect_yunet(image_bgr, min_face)
        else:
            boxes = self._detect_haar(image_bgr, min_face)

        return _deduplicate(boxes, threshold=0.30)

    # ------------------------------------------------------------------
    # YuNet
    # ------------------------------------------------------------------
    def _detect_yunet(self, image_bgr: np.ndarray, min_face: int) -> list[FaceBox]:
        height, width = image_bgr.shape[:2]
        boxes: list[FaceBox] = []

        with self._lock:
            self._yunet.setInputSize((width, height))
            _, detections = self._yunet.detect(image_bgr)

        if detections is None:
            return []

        for detection in detections:
            x, y, box_w, box_h = (float(value) for value in detection[:4])
            score = float(detection[-1])

            if score < _SCORE_THRESHOLD:
                continue
            if box_w < min_face or box_h < min_face:
                continue

            aspect = box_w / box_h if box_h > 0 else 0.0
            if not _MIN_ASPECT_RATIO <= aspect <= _MAX_ASPECT_RATIO:
                continue
            if not self._landmarks_plausible(detection, box_w, box_h):
                continue

            left = max(0, int(round(x)))
            top = max(0, int(round(y)))
            right = min(width, int(round(x + box_w)))
            bottom = min(height, int(round(y + box_h)))
            clipped_w = right - left
            clipped_h = bottom - top

            if clipped_w < min_face or clipped_h < min_face:
                continue

            boxes.append(FaceBox(left, top, clipped_w, clipped_h))

        return boxes

    @staticmethod
    def _landmarks_plausible(
        detection: np.ndarray, box_w: float, box_h: float
    ) -> bool:
        """Descarta cajas cuyos puntos faciales no forman un rostro coherente.

        YuNet devuelve: ojo derecho, ojo izquierdo, nariz y comisuras de la
        boca. En un rostro frontal los ojos quedan por encima de la nariz y
        esta por encima de la boca. Esto elimina texturas y objetos del fondo
        que ocasionalmente superan el umbral de confianza.
        """

        if detection.shape[0] < 14:
            return True

        right_eye = detection[4:6]
        left_eye = detection[6:8]
        nose = detection[8:10]
        right_mouth = detection[10:12]
        left_mouth = detection[12:14]

        eye_y = (float(right_eye[1]) + float(left_eye[1])) / 2.0
        mouth_y = (float(right_mouth[1]) + float(left_mouth[1])) / 2.0
        nose_y = float(nose[1])

        if not (eye_y < nose_y < mouth_y):
            return False

        eye_distance = abs(float(left_eye[0]) - float(right_eye[0]))
        if eye_distance < box_w * 0.15:
            return False

        mouth_width = abs(float(left_mouth[0]) - float(right_mouth[0]))
        if mouth_width < box_w * 0.12:
            return False

        return True

    # ------------------------------------------------------------------
    # Respaldo Haar
    # ------------------------------------------------------------------
    def _detect_haar(self, image_bgr: np.ndarray, min_face: int) -> list[FaceBox]:
        gray = cv2.equalizeHist(_to_gray(image_bgr))
        height, width = gray.shape[:2]

        with self._lock:
            detections = self._cascade.detectMultiScale(
                gray,
                scaleFactor=1.10,
                minNeighbors=8,
                minSize=(min_face, min_face),
                flags=cv2.CASCADE_SCALE_IMAGE,
            )

        boxes: list[FaceBox] = []
        for (x, y, box_w, box_h) in detections:
            if box_w < min_face or box_h < min_face:
                continue

            aspect = box_w / box_h if box_h > 0 else 0.0
            if not _MIN_ASPECT_RATIO <= aspect <= _MAX_ASPECT_RATIO:
                continue

            left = max(0, int(x))
            top = max(0, int(y))
            right = min(width, int(x + box_w))
            bottom = min(height, int(y + box_h))

            if right - left < min_face or bottom - top < min_face:
                continue

            boxes.append(FaceBox(left, top, right - left, bottom - top))

        return boxes
