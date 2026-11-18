"""Configuración local de FaceEdit (config.ini junto al ejecutable).

El instalador de Windows crea este archivo con los datos de la cámara Tapo.
Las variables de entorno TAPO_* ya definidas tienen prioridad sobre el archivo.

    [tapo]
    ip = 192.168.1.50
    user = usuario_de_camara
    password = clave_de_camara
    stream = stream1
"""

from __future__ import annotations

import configparser
import logging
import os
import sys
from pathlib import Path

logger = logging.getLogger(__name__)

_KEYS = {
    "ip": "TAPO_IP",
    "user": "TAPO_USER",
    "password": "TAPO_PASSWORD",
    "stream": "TAPO_STREAM",
    "port": "TAPO_PORT",
}


def app_dir() -> Path:
    """Carpeta de la aplicación: la del .exe si está empaquetada."""

    override = os.environ.get("FACEDIT_HOME")
    if override:
        return Path(override)
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent.parent


def config_path() -> Path:
    return app_dir() / "config.ini"


def config_exists() -> bool:
    return config_path().is_file()


def current_config() -> dict[str, object]:
    """Valores actuales (la contraseña nunca se devuelve, solo si existe)."""

    return {
        "ip": os.environ.get("TAPO_IP", ""),
        "user": os.environ.get("TAPO_USER", ""),
        "stream": os.environ.get("TAPO_STREAM", "stream1") or "stream1",
        "has_password": bool(os.environ.get("TAPO_PASSWORD")),
    }


def save_local_config(ip: str, user: str, password: str, stream: str = "stream1") -> None:
    """Guarda config.ini y actualiza el entorno del proceso en marcha.

    Con ``ip`` vacío se guarda un archivo sin cámara Tapo: marca que la
    configuración inicial ya se hizo (uso con webcam o fotos).
    """

    parser = configparser.ConfigParser(interpolation=None)
    parser["tapo"] = {"ip": ip, "user": user, "password": password, "stream": stream}
    path = config_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        parser.write(handle)

    for key, env_name in _KEYS.items():
        value = {"ip": ip, "user": user, "password": password, "stream": stream}.get(key)
        if value is None:
            continue
        if value:
            os.environ[env_name] = value
        else:
            os.environ.pop(env_name, None)


def load_local_config() -> Path | None:
    """Carga config.ini en las variables de entorno. Devuelve su ruta si existe."""

    path = app_dir() / "config.ini"
    if not path.is_file():
        return None

    parser = configparser.ConfigParser(interpolation=None)
    try:
        parser.read(path, encoding="utf-8-sig")
    except (configparser.Error, OSError):
        logger.warning("No se pudo leer %s", path, exc_info=True)
        return None

    if not parser.has_section("tapo"):
        return path

    for key, env_name in _KEYS.items():
        value = parser.get("tapo", key, fallback="").strip()
        if value and not os.environ.get(env_name):
            os.environ[env_name] = value
    return path
