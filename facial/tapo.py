"""Lectura de una cámara IP TP-Link Tapo (C200) por RTSP.

La cámara se lee en un hilo en segundo plano que conserva solo el último
fotograma. Así el análisis siempre trabaja con una imagen reciente y no se
acumula retraso aunque la IA tarde más que el vídeo.

Configuración por variables de entorno (nunca se guardan en el código):

    TAPO_IP        IP local de la cámara, p. ej. 192.168.1.50
    TAPO_USER      usuario de "Cuenta de cámara" creado en la app Tapo
    TAPO_PASSWORD  contraseña de esa cuenta de cámara
    TAPO_STREAM    stream1 (HD, por defecto) o stream2 (calidad baja, más ligero)
    TAPO_PORT      puerto RTSP, 554 por defecto
"""

from __future__ import annotations

import logging
import os
import threading
import time
from urllib.parse import quote

import cv2
import numpy as np

logger = logging.getLogger("faceedit.tapo")

MAX_STREAM_SIDE = 1280
RECONNECT_DELAY = 3.0
STALE_AFTER = 8.0


class TapoCamera:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._frame: np.ndarray | None = None
        self._frame_at = 0.0
        self._thread: threading.Thread | None = None
        self._stop = threading.Event()
        self._error: str | None = None
        self._connected = False

    # -- configuración --------------------------------------------------

    @staticmethod
    def _settings() -> dict[str, str]:
        return {
            "ip": os.environ.get("TAPO_IP", "").strip(),
            "user": os.environ.get("TAPO_USER", "").strip(),
            "password": os.environ.get("TAPO_PASSWORD", ""),
            "stream": os.environ.get("TAPO_STREAM", "stream1").strip() or "stream1",
            "port": os.environ.get("TAPO_PORT", "554").strip() or "554",
        }

    def configured(self) -> bool:
        s = self._settings()
        return bool(s["ip"] and s["user"] and s["password"])

    def _url(self) -> str:
        s = self._settings()
        return (
            f"rtsp://{quote(s['user'], safe='')}:{quote(s['password'], safe='')}"
            f"@{s['ip']}:{s['port']}/{s['stream']}"
        )

    # -- ciclo de vida --------------------------------------------------

    def start(self) -> None:
        if not self.configured():
            raise RuntimeError(
                "Faltan TAPO_IP, TAPO_USER o TAPO_PASSWORD. Define las variables "
                "de entorno y reinicia la aplicación."
            )
        with self._lock:
            if self._thread and self._thread.is_alive():
                return
            self._stop.clear()
            self._error = None
            self._thread = threading.Thread(
                target=self._run, name="faceedit-tapo", daemon=True
            )
            self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        with self._lock:
            self._frame = None
            self._connected = False

    def _run(self) -> None:
        url = self._url()
        while not self._stop.is_set():
            capture = cv2.VideoCapture(url, cv2.CAP_FFMPEG)
            if not capture.isOpened():
                capture.release()
                self._set_error(
                    "No se pudo abrir la cámara. Revisa IP, usuario y contraseña "
                    "de la cuenta de cámara, y que el PC esté en la misma red."
                )
                if self._stop.wait(RECONNECT_DELAY):
                    break
                continue

            logger.info("Conectado a la cámara Tapo.")
            self._set_connected()
            failures = 0
            while not self._stop.is_set():
                ok, frame = capture.read()
                if not ok or frame is None:
                    failures += 1
                    if failures > 30:
                        break
                    time.sleep(0.05)
                    continue
                failures = 0
                height, width = frame.shape[:2]
                side = max(height, width)
                if side > MAX_STREAM_SIDE:
                    scale = MAX_STREAM_SIDE / side
                    frame = cv2.resize(
                        frame,
                        (int(width * scale), int(height * scale)),
                        interpolation=cv2.INTER_AREA,
                    )
                with self._lock:
                    self._frame = frame
                    self._frame_at = time.monotonic()
            capture.release()
            self._set_error("Se perdió la señal de la cámara. Reconectando…")
            self._stop.wait(RECONNECT_DELAY)

    def _set_error(self, message: str) -> None:
        with self._lock:
            self._error = message
            self._connected = False
        logger.warning(message)

    def _set_connected(self) -> None:
        with self._lock:
            self._error = None
            self._connected = True

    # -- acceso a fotogramas -------------------------------------------

    def latest(self) -> np.ndarray | None:
        with self._lock:
            if self._frame is None:
                return None
            if time.monotonic() - self._frame_at > STALE_AFTER:
                return None
            return self._frame.copy()

    def latest_jpeg(self, quality: int = 92) -> bytes | None:
        frame = self.latest()
        if frame is None:
            return None
        ok, buffer = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, quality])
        return buffer.tobytes() if ok else None

    def status(self) -> dict:
        with self._lock:
            running = bool(self._thread and self._thread.is_alive()) and not self._stop.is_set()
            has_frame = (
                self._frame is not None
                and time.monotonic() - self._frame_at <= STALE_AFTER
            )
            return {
                "configured": self.configured(),
                "running": running,
                "connected": self._connected and has_frame,
                "error": self._error,
            }


tapo_camera = TapoCamera()
