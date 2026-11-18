"""Punto de entrada del ejecutable de Windows (FaceEdit.exe)."""

from __future__ import annotations

import os
import socket
import sys
import threading
import time
import webbrowser
from pathlib import Path

FROZEN = getattr(sys, "frozen", False)

if FROZEN:
    # Los pesos de emoción de DeepFace viajan dentro del paquete.
    os.environ.setdefault("DEEPFACE_HOME", str(Path(getattr(sys, "_MEIPASS", "."))))
else:
    # Instalación con Python: los pesos pueden venir junto a la aplicación.
    _bundled = Path(__file__).resolve().parent / "deepface_home"
    if _bundled.is_dir():
        os.environ.setdefault("DEEPFACE_HOME", str(_bundled))

if FROZEN or sys.stdout is None or sys.stderr is None:
    # Sin consola (pythonw o .exe) no hay stdout/stderr: se usa un archivo de registro.
    log_dir = Path(os.environ.get("LOCALAPPDATA", str(Path.home()))) / "FaceEdit"
    log_dir.mkdir(parents=True, exist_ok=True)
    _log = open(log_dir / "faceedit.log", "a", encoding="utf-8", buffering=1)
    sys.stdout = _log
    sys.stderr = _log

HOST = os.environ.get("FACEDIT_HOST", "127.0.0.1")
PORT = int(os.environ.get("FACEDIT_PORT", "5000"))
URL = f"http://{HOST}:{PORT}"


def _port_in_use() -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.5)
        return sock.connect_ex((HOST, PORT)) == 0


def _open_browser_when_ready(path: str) -> None:
    for _ in range(80):
        if _port_in_use():
            webbrowser.open(URL + path)
            return
        time.sleep(0.5)


def main() -> None:
    if _port_in_use():
        # Ya hay una instancia en marcha: solo se abre el navegador.
        webbrowser.open(URL)
        return

    import app as faceedit
    from facial.config import config_exists
    from facial.tapo import tapo_camera

    # Primer arranque sin configuración: se abre directamente la página de ajuste.
    first_run = not config_exists() and not tapo_camera.configured()
    threading.Thread(
        target=_open_browser_when_ready,
        args=("/setup" if first_run else "",),
        daemon=True,
    ).start()
    faceedit.app.run(host=HOST, port=PORT, debug=False, threaded=True, use_reloader=False)


if __name__ == "__main__":
    main()
