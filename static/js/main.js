/* ==========================================================================
   FaceEdit — lógica de la vista única
   ========================================================================== */

(() => {
  "use strict";

  const CONFIG = {
    cameraInterval: 2400,
    cameraRetryInterval: 5200,
    cameraMaxWidth: 1280,
    uploadMaxSide: 1600,
    maxFileBytes: 8 * 1024 * 1024,
    jpegQuality: 0.9,
    requestTimeout: 120000,
    stabilization: {
      ageHistory: 6,
      ageTolerance: 2,
      ageMinSamples: 3,
      emotionHistory: 3,
      emotionTolerance: 3,
      boxAlpha: 0.55,
      trackTtl: 12000,
    },
  };

  const FACE_COLORS = ["#8B1E1E", "#5C0F0F", "#A62B2B", "#7A7474", "#5A5555", "#C97A7A"];

  const EMOTIONS = {
    happy: {
      label: "Feliz",
      color: "#8B1E1E",
      icon: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6"/><path d="M8.5 10h.01M15.5 10h.01" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M8.4 14.2c1.8 2.3 5.4 2.3 7.2 0" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>`,
    },
    sad: {
      label: "Triste",
      color: "#5A5555",
      icon: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6"/><path d="M8.5 10h.01M15.5 10h.01" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M8.6 16c1.7-2 5.1-2 6.8 0" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>`,
    },
    angry: {
      label: "Enojado",
      color: "#5C0F0F",
      icon: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6"/><path d="M8.2 8.8 10 10M15.8 8.8 14 10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M9 15.5c1.7-1.2 4.3-1.2 6 0" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>`,
    },
    surprise: {
      label: "Sorprendido",
      color: "#A62B2B",
      icon: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6"/><path d="M8.5 9.5h.01M15.5 9.5h.01" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><circle cx="12" cy="15.2" r="2.1" stroke="currentColor" stroke-width="1.5"/></svg>`,
    },
    fear: {
      label: "Asustado",
      color: "#5A5555",
      icon: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6"/><path d="M8.3 8.7c.6-.6 1.5-.6 2.1 0M13.6 8.7c.6-.6 1.5-.6 2.1 0" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M9.3 15.5c1.5-1.6 3.9-1.6 5.4 0" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`,
    },
    disgust: {
      label: "Disgustado",
      color: "#A62B2B",
      icon: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6"/><path d="M8.5 9.7h.01M15.5 9.7h.01" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M8.7 15.3c1.3-.8 2.2-.8 3.3 0 1.1.8 2 .8 3.3 0" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
    },
    neutral: {
      label: "Neutral",
      color: "#5A5555",
      icon: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6"/><path d="M8.5 10h.01M15.5 10h.01" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M8.7 15h6.6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>`,
    },
  };

  const ENGINE_LABELS = {
    checking: "Comprobando motor IA",
    ready: "IA local · lista",
    available: "IA local · disponible",
    unavailable: "IA no disponible",
    error: "Error del motor IA",
  };

  const $ = (id) => document.getElementById(id);

  const els = {
    stage: $("stage"),
    emptyState: $("emptyState"),
    emptyCameraBtn: $("emptyCameraBtn"),
    emptyUploadBtn: $("emptyUploadBtn"),
    cameraFeed: $("cameraFeed"),
    photoCanvas: $("photoCanvas"),
    overlayCanvas: $("overlayCanvas"),
    scanLine: $("scanLine"),
    stageHud: $("stageHud"),
    liveBadge: $("liveBadge"),
    modeLabel: $("modeLabel"),
    faceBadge: $("faceBadge"),
    faceBadgeText: $("faceBadgeText"),
    stageStatus: $("stageStatus"),
    stageStatusText: $("stageStatusText"),
    startCameraBtn: $("startCameraBtn"),
    uploadBtn: $("uploadBtn"),
    stopBtn: $("stopBtn"),
    fileInput: $("fileInput"),
    enginePill: $("enginePill"),
    engineLabel: $("engineLabel"),
    resultsPanel: $("resultsPanel"),
    resultsMeta: $("resultsMeta"),
    resultsEmpty: $("resultsEmpty"),
    resultsLoading: $("resultsLoading"),
    resultsNoFace: $("resultsNoFace"),
    resultsList: $("resultsList"),
    noFaceTitle: $("noFaceTitle"),
    noFaceText: $("noFaceText"),
    retryPhotoBtn: $("retryPhotoBtn"),
    toastStack: $("toastStack"),
  };

  const state = {
    mode: "idle", // idle | camera | photo
    stream: null,
    cameraStarting: false,
    timer: null,
    requestSeq: 0,
    activeRequest: null,
    epoch: 0,
    lastResults: null,
    lastSource: null,
    sourceWidth: 0,
    sourceHeight: 0,
    fileBusy: false,
    engineBroken: false,
    lastErrorAt: 0,
    statusTimer: null,
    tracks: new Map(),
    nextTrackId: 1,
  };

  const frameCanvas = document.createElement("canvas");
  const timeFormatter = new Intl.DateTimeFormat("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  /* ------------------------------------------------------------------
     Utilidades
     ------------------------------------------------------------------ */

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function getEmotionMeta(key) {
    return EMOTIONS[key] || EMOTIONS.neutral;
  }

  function readAge(face) {
    const value = face?.age;
    if (value === null || value === undefined || value === "") {
      return null;
    }
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.round(numeric) : null;
  }

  function setEngineState(engineState) {
    const safeState = ENGINE_LABELS[engineState] ? engineState : "error";
    els.enginePill.dataset.state = safeState;
    els.engineLabel.textContent = ENGINE_LABELS[safeState];
  }

  function toast(message, type = "info", duration = 4800) {
    const node = document.createElement("div");
    node.className = "toast";
    node.dataset.type = type;
    node.textContent = message;
    els.toastStack.append(node);

    window.setTimeout(() => {
      node.classList.add("is-leaving");
      window.setTimeout(() => node.remove(), 270);
    }, duration);
  }

  function showStageStatus(message, tone = "working", autoHide = 0) {
    window.clearTimeout(state.statusTimer);
    els.stageStatus.hidden = false;
    els.stageStatus.dataset.state = tone;
    els.stageStatusText.textContent = message;

    if (autoHide > 0) {
      state.statusTimer = window.setTimeout(() => {
        els.stageStatus.hidden = true;
      }, autoHide);
    }
  }

  function setResultsView(view) {
    els.resultsEmpty.hidden = view !== "empty";
    els.resultsLoading.hidden = view !== "loading";
    els.resultsNoFace.hidden = view !== "noFace";
    els.resultsList.hidden = view !== "list";
  }

  function setAnalyzing(active) {
    els.stage.classList.toggle("is-analyzing", active);
    els.resultsMeta.classList.toggle("is-working", active);

    if (active) {
      els.resultsMeta.textContent = "Analizando…";
      showStageStatus("Analizando rostro…", "working", 0);
      if (!state.lastResults) {
        setResultsView("loading");
      }
    }
  }

  function updateFaceBadge(count) {
    if (!Number.isFinite(count)) {
      els.faceBadge.hidden = true;
      return;
    }

    els.faceBadge.hidden = false;
    els.faceBadgeText.textContent =
      count === 0 ? "Sin rostro" : `${count} rostro${count === 1 ? "" : "s"}`;
  }

  function clearOverlay() {
    const ctx = els.overlayCanvas.getContext("2d");
    ctx.clearRect(0, 0, els.overlayCanvas.width, els.overlayCanvas.height);
    els.overlayCanvas.hidden = true;
  }

  function clearResults() {
    state.lastResults = null;
    state.lastSource = null;
    state.tracks.clear();
    state.nextTrackId = 1;
    setResultsView("empty");
    els.resultsList.replaceChildren();
    els.resultsMeta.textContent = "En espera";
    els.resultsMeta.classList.remove("is-working");
    els.faceBadge.hidden = true;
    els.stageStatus.hidden = true;
    window.clearTimeout(state.statusTimer);
    clearOverlay();
  }

  function setButtonState() {
    const cameraActive = state.mode === "camera";
    els.startCameraBtn.disabled = cameraActive || state.cameraStarting;
    els.startCameraBtn.setAttribute("aria-busy", String(state.cameraStarting));
    els.stopBtn.disabled = !cameraActive;
    els.uploadBtn.disabled = state.fileBusy;
    els.emptyCameraBtn.disabled = state.cameraStarting;
  }

  /* ------------------------------------------------------------------
     Estado visual del escenario
     ------------------------------------------------------------------ */

  function showMediaMode(mode) {
    state.mode = mode;
    els.emptyState.hidden = true;
    els.cameraFeed.hidden = mode !== "camera";
    els.photoCanvas.hidden = mode !== "photo";
    els.stageHud.hidden = false;
    els.modeLabel.textContent = mode === "camera" ? "EN VIVO" : "IMAGEN";
    els.scanLine.hidden = mode !== "camera";
    els.stage.classList.toggle("is-camera", mode === "camera");
    els.stage.classList.toggle("is-photo", mode === "photo");
    updateFaceBadge(undefined);
    setButtonState();
  }

  function resetUI() {
    state.epoch += 1;
    state.mode = "idle";
    state.cameraStarting = false;
    state.stream = null;
    window.clearTimeout(state.timer);
    state.timer = null;
    invalidateActiveRequest();

    els.cameraFeed.pause();
    els.cameraFeed.srcObject = null;
    els.cameraFeed.hidden = true;
    els.photoCanvas.hidden = true;
    els.overlayCanvas.hidden = true;
    els.emptyState.hidden = false;
    els.stageHud.hidden = true;
    els.scanLine.hidden = true;
    els.stageStatus.hidden = true;
    els.stage.classList.remove("is-camera", "is-photo", "is-analyzing");
    clearResults();
    setButtonState();
  }

  function stopCamera({ reset = true } = {}) {
    if (state.stream) {
      const stream = state.stream;
      state.stream = null;
      stream.getTracks().forEach((track) => track.stop());
    }

    state.cameraStarting = false;
    window.clearTimeout(state.timer);
    state.timer = null;
    state.epoch += 1;
    invalidateActiveRequest();

    els.cameraFeed.pause();
    els.cameraFeed.srcObject = null;
    els.cameraFeed.hidden = true;

    if (reset) {
      resetUI();
    } else {
      state.mode = "idle";
      setButtonState();
    }
  }

  function invalidateActiveRequest() {
    state.requestSeq += 1;
    if (state.activeRequest) {
      state.activeRequest.controller.abort();
      state.activeRequest = null;
    }
    setAnalyzing(false);
  }

  function cancelScheduledAnalysis() {
    window.clearTimeout(state.timer);
    state.timer = null;
  }

  /* ------------------------------------------------------------------
     Cámara
     ------------------------------------------------------------------ */

  function cameraErrorMessage(error) {
    switch (error?.name) {
      case "NotAllowedError":
      case "SecurityError":
        return "Permiso de cámara denegado. Habilítalo en el navegador y vuelve a intentarlo.";
      case "NotFoundError":
        return "No se encontró ninguna cámara disponible en este equipo.";
      case "NotReadableError":
        return "La cámara está en uso por otra aplicación. Ciérrala e inténtalo de nuevo.";
      case "OverconstrainedError":
        return "La cámara no admite la configuración solicitada. Prueba con otra cámara.";
      default:
        return "No se pudo acceder a la cámara. Revisa los permisos del navegador.";
    }
  }

  function waitForVideoMetadata(video) {
    return new Promise((resolve, reject) => {
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        resolve();
        return;
      }

      const timer = window.setTimeout(() => {
        cleanup();
        reject(new Error("La cámara tardó demasiado en iniciar."));
      }, 12000);

      const cleanup = () => {
        window.clearTimeout(timer);
        video.removeEventListener("loadedmetadata", onLoaded);
        video.removeEventListener("error", onError);
      };

      const onLoaded = () => {
        cleanup();
        resolve();
      };

      const onError = () => {
        cleanup();
        reject(new Error("No se pudo iniciar la señal de la cámara."));
      };

      video.addEventListener("loadedmetadata", onLoaded, { once: true });
      video.addEventListener("error", onError, { once: true });
    });
  }

  async function startCamera() {
    if (state.mode === "camera" || state.cameraStarting) {
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      toast(
        "Este navegador no permite acceder a la cámara. Usa Chrome, Edge o Firefox en localhost o HTTPS.",
        "error",
        6500,
      );
      return;
    }

    stopCamera({ reset: true });
    state.cameraStarting = true;
    const epoch = state.epoch;
    setButtonState();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });

      if (epoch !== state.epoch) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      state.stream = stream;
      state.cameraStarting = false;

      stream.getVideoTracks().forEach((track) => {
        track.addEventListener("ended", () => {
          if (state.stream === stream) {
            stopCamera({ reset: true });
            toast(
              "La cámara se desconectó. Vuelve a activarla para continuar.",
              "warning",
              6000,
            );
          }
        });
      });

      els.cameraFeed.srcObject = stream;
      showMediaMode("camera");

      try {
        await els.cameraFeed.play();
      } catch {
        // El atributo muted permite autoplay en la mayoría de navegadores.
      }

      await waitForVideoMetadata(els.cameraFeed);
      if (epoch !== state.epoch) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      syncOverlayToVideo();
      els.resultsMeta.textContent = "Esperando rostro";
      showStageStatus("Cámara activa · buscando rostro", "success", 2400);
      scheduleCameraAnalysis(500);
    } catch (error) {
      if (epoch === state.epoch) {
        stopCamera({ reset: true });
        toast(cameraErrorMessage(error), "error", 6500);
      }
    } finally {
      if (state.cameraStarting) {
        state.cameraStarting = false;
        setButtonState();
      }
    }
  }

  function syncOverlayToVideo() {
    const width = els.cameraFeed.videoWidth;
    const height = els.cameraFeed.videoHeight;
    if (!width || !height) {
      return;
    }

    state.sourceWidth = width;
    state.sourceHeight = height;
    els.overlayCanvas.width = width;
    els.overlayCanvas.height = height;
  }

  function scheduleCameraAnalysis(delay = CONFIG.cameraInterval) {
    cancelScheduledAnalysis();
    if (state.mode !== "camera") {
      return;
    }

    state.timer = window.setTimeout(analyzeCameraFrame, delay);
  }

  async function analyzeCameraFrame() {
    if (state.mode !== "camera") {
      return;
    }

    if (state.activeRequest) {
      scheduleCameraAnalysis(400);
      return;
    }

    const blob = await captureCameraFrame();
    if (!blob) {
      scheduleCameraAnalysis(1200);
      return;
    }

    const success = await runAnalysis(blob, "camera");
    if (state.mode !== "camera") {
      return;
    }

    const delay = success
      ? CONFIG.cameraInterval
      : state.engineBroken
        ? 15000
        : CONFIG.cameraRetryInterval;
    scheduleCameraAnalysis(delay);
  }

  async function captureCameraFrame() {
    const video = els.cameraFeed;
    if (!video.videoWidth || !video.videoHeight || video.readyState < 2) {
      return null;
    }

    const scale = Math.min(1, CONFIG.cameraMaxWidth / video.videoWidth);
    frameCanvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    frameCanvas.height = Math.max(1, Math.round(video.videoHeight * scale));

    const ctx = frameCanvas.getContext("2d", { alpha: false });
    ctx.drawImage(video, 0, 0, frameCanvas.width, frameCanvas.height);
    return canvasToBlob(frameCanvas, "image/jpeg", 0.92);
  }

  /* ------------------------------------------------------------------
     Carga de fotografía
     ------------------------------------------------------------------ */

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const image = new Image();

      image.onload = () => {
        URL.revokeObjectURL(url);
        resolve(image);
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("No se pudo abrir la imagen. Prueba con otro archivo JPG o PNG."));
      };
      image.src = url;
    });
  }

  function canvasToBlob(canvas, type = "image/jpeg", quality = CONFIG.jpegQuality) {
    return new Promise((resolve) => {
      if (typeof canvas.toBlob !== "function") {
        resolve(null);
        return;
      }
      canvas.toBlob((blob) => resolve(blob), type, quality);
    });
  }

  function validateFile(file) {
    const extension = file.name.split(".").pop()?.toLowerCase() || "";
    const allowedExtensions = ["jpg", "jpeg", "png"];
    const allowedMimes = ["image/jpeg", "image/jpg", "image/png", ""];

    if (!allowedExtensions.includes(extension) || !allowedMimes.includes(file.type)) {
      return "Formato no admitido. Sube una imagen JPG, JPEG o PNG.";
    }
    if (file.size > CONFIG.maxFileBytes) {
      return "La imagen supera el límite de 8 MB.";
    }
    if (file.size === 0) {
      return "El archivo está vacío.";
    }
    return null;
  }

  async function handleFile(file) {
    if (!file || state.fileBusy) {
      return;
    }

    const validationError = validateFile(file);
    if (validationError) {
      toast(validationError, "error");
      els.fileInput.value = "";
      return;
    }

    state.fileBusy = true;
    setButtonState();

    try {
      const image = await loadImage(file);
      if (image.width < 64 || image.height < 64) {
        throw new Error("La imagen es demasiado pequeña. Usa al menos 64 × 64 px.");
      }

      stopCamera({ reset: false });
      clearResults();

      const scale = Math.min(1, CONFIG.uploadMaxSide / Math.max(image.width, image.height));
      const width = Math.max(1, Math.round(image.width * scale));
      const height = Math.max(1, Math.round(image.height * scale));

      els.photoCanvas.width = width;
      els.photoCanvas.height = height;
      els.overlayCanvas.width = width;
      els.overlayCanvas.height = height;
      state.sourceWidth = width;
      state.sourceHeight = height;

      const ctx = els.photoCanvas.getContext("2d", { alpha: false });
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(image, 0, 0, width, height);

      showMediaMode("photo");
      els.resultsMeta.textContent = "Preparando…";
      showStageStatus("Preparando imagen…", "working", 0);

      const blob = (await canvasToBlob(els.photoCanvas, "image/jpeg", 0.92)) || file;
      await runAnalysis(blob, "photo");
    } catch (error) {
      if (state.mode === "idle") {
        resetUI();
      }
      toast(error?.message || "No se pudo cargar la imagen.", "error", 6000);
    } finally {
      state.fileBusy = false;
      els.fileInput.value = "";
      setButtonState();
    }
  }

  /* ------------------------------------------------------------------
     Análisis
     ------------------------------------------------------------------ */

  async function runAnalysis(blob, source) {
    if (!blob || (state.mode !== "camera" && state.mode !== "photo")) {
      return false;
    }

    const epoch = state.epoch;
    const requestId = ++state.requestSeq;

    if (state.activeRequest) {
      state.activeRequest.controller.abort();
    }

    const controller = new AbortController();
    let timedOut = false;
    const timeout = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, CONFIG.requestTimeout);

    state.activeRequest = { controller, requestId };
    setAnalyzing(true);

    const formData = new FormData();
    formData.append("image", blob, source === "camera" ? "camera.jpg" : "photo.jpg");

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        body: formData,
        cache: "no-store",
        signal: controller.signal,
      });

      let payload = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }

      if (epoch !== state.epoch || requestId !== state.requestSeq) {
        return false;
      }

      if (!response.ok || !payload?.ok) {
        const message =
          payload?.error?.message || "No se pudo completar el análisis de la imagen.";
        if (response.status === 503) {
          state.engineBroken = true;
          setEngineState("error");
        }
        const error = new Error(message);
        error.status = response.status;
        throw error;
      }

      state.engineBroken = false;
      setEngineState("ready");
      applyResults(payload);
      return true;
    } catch (error) {
      if (error?.name === "AbortError") {
        if (timedOut && epoch === state.epoch) {
          toast("El análisis tardó demasiado. Inténtalo de nuevo.", "warning", 6000);
          showStageStatus("Tiempo de espera agotado", "warning", 3500);
          if (!state.lastResults) {
            setResultsView("empty");
          }
        }
        return false;
      }

      if (epoch !== state.epoch || requestId !== state.requestSeq) {
        return false;
      }

      const now = Date.now();
      if (now - state.lastErrorAt > 7000) {
        state.lastErrorAt = now;
        toast(error?.message || "No se pudo analizar la imagen.", "error", 6000);
      }

      showStageStatus("No se pudo completar el análisis", "warning", 3500);
      els.resultsMeta.textContent = state.lastResults ? "Sin actualizar" : "Error";
      els.resultsMeta.classList.remove("is-working");
      if (!state.lastResults) {
        setResultsView("empty");
      }
      return false;
    } finally {
      window.clearTimeout(timeout);
      if (requestId === state.requestSeq) {
        state.activeRequest = null;
        setAnalyzing(false);
      }
    }
  }

  /* ------------------------------------------------------------------
     Estabilización temporal (solo cámara)

     DeepFace estima la edad y la emoción fotograma a fotograma y esos
     valores oscilan con cambios mínimos de luz, postura o encuadre. Para
     evitarlo se sigue cada rostro entre análisis y se suavizan sus datos:
     mediana de edad con histéresis, promedio ponderado de emociones y
     cajas interpoladas.
     ------------------------------------------------------------------ */

  function median(values) {
    if (!Array.isArray(values) || values.length === 0) {
      return null;
    }
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 1
      ? sorted[middle]
      : (sorted[middle - 1] + sorted[middle]) / 2;
  }

  function boxIou(first, second) {
    if (!first || !second) {
      return 0;
    }
    const left = Math.max(first.x, second.x);
    const top = Math.max(first.y, second.y);
    const right = Math.min(first.x + first.w, second.x + second.w);
    const bottom = Math.min(first.y + first.h, second.y + second.h);
    const intersection = Math.max(0, right - left) * Math.max(0, bottom - top);
    if (intersection <= 0) {
      return 0;
    }
    const union = first.w * first.h + second.w * second.h - intersection;
    return union > 0 ? intersection / union : 0;
  }

  function boxCenter(box) {
    return { x: box.x + box.w / 2, y: box.y + box.h / 2 };
  }

  function smoothBox(previous, next, alpha) {
    if (!previous) {
      return { ...next };
    }
    const factor = clamp(alpha, 0, 1);
    return {
      x: previous.x + (next.x - previous.x) * factor,
      y: previous.y + (next.y - previous.y) * factor,
      w: previous.w + (next.w - previous.w) * factor,
      h: previous.h + (next.h - previous.h) * factor,
    };
  }

  function weightedAverageScores(history) {
    const totals = new Map();
    let weightSum = 0;

    history.forEach((scores, index) => {
      const weight = index + 1;
      weightSum += weight;
      scores.forEach((value, key) => {
        totals.set(key, (totals.get(key) || 0) + value * weight);
      });
    });

    const averaged = new Map();
    if (weightSum <= 0) {
      return averaged;
    }
    totals.forEach((total, key) => averaged.set(key, total / weightSum));
    return averaged;
  }

  function expireTracks(now = Date.now()) {
    const ttl = CONFIG.stabilization.trackTtl;
    state.tracks.forEach((track, id) => {
      if (now - track.lastSeen > ttl) {
        state.tracks.delete(id);
      }
    });
  }

  function findTrackForBox(box, used) {
    let best = null;
    let bestScore = 0;

    state.tracks.forEach((track) => {
      if (used.has(track.id)) {
        return;
      }

      const iou = boxIou(track.box, box);
      const previousCenter = boxCenter(track.box);
      const nextCenter = boxCenter(box);
      const size = Math.max(track.box.w, track.box.h, box.w, box.h, 1e-6);
      const distance =
        Math.hypot(previousCenter.x - nextCenter.x, previousCenter.y - nextCenter.y) / size;

      // Un movimiento pequeño conserva el IoU; si el rostro se desplaza algo
      // más, la cercanía entre centros evita crear un seguimiento nuevo.
      if (iou < 0.12 && distance > 0.85) {
        return;
      }

      const score = iou + Math.max(0, 1 - distance) * 0.35;
      if (score > bestScore) {
        best = track;
        bestScore = score;
      }
    });

    return best;
  }

  function createTrack(box) {
    const track = {
      id: state.nextTrackId++,
      box: { ...box },
      lastSeen: Date.now(),
      ageHistory: [],
      stableAge: null,
      emotionHistory: [],
      stableEmotionKey: null,
    };
    state.tracks.set(track.id, track);
    return track;
  }

  function updateTrack(track, face) {
    const settings = CONFIG.stabilization;
    const rawBox =
      face.box && Number.isFinite(Number(face.box.w)) && Number(face.box.w) > 0
        ? face.box
        : track.box;

    track.box = smoothBox(track.box, rawBox, settings.boxAlpha);
    track.lastSeen = Date.now();

    const stabilized = { ...face, box: { ...track.box } };

    const rawAge =
      face.age === null || face.age === undefined || face.age === ""
        ? Number.NaN
        : Number(face.age);
    if (Number.isFinite(rawAge) && rawAge >= 0) {
      track.ageHistory.push(rawAge);
      if (track.ageHistory.length > settings.ageHistory) {
        track.ageHistory.shift();
      }
    }

    if (track.ageHistory.length > 0) {
      const center = median(track.ageHistory);
      if (track.stableAge === null) {
        track.stableAge = center;
      } else if (
        track.ageHistory.length >= settings.ageMinSamples &&
        Math.abs(center - track.stableAge) > settings.ageTolerance
      ) {
        // Solo se acepta un cambio cuando la mediana se aleja más de la
        // tolerancia y hay muestras suficientes; así una variación de uno
        // o dos años no hace saltar la cifra en pantalla.
        track.stableAge = center;
      }
      stabilized.age = Math.round(track.stableAge);
    } else {
      stabilized.age = null;
    }

    const scoreEntries = (Array.isArray(face.scores) ? face.scores : [])
      .map((entry) => ({
        key: String(entry?.key || ""),
        label: entry?.label,
        score: Number(entry?.score),
      }))
      .filter((entry) => entry.key && Number.isFinite(entry.score));

    if (!face.error && scoreEntries.length > 0) {
      const latest = new Map(
        scoreEntries.map((entry) => [entry.key, clamp(entry.score, 0, 100)]),
      );
      const labels = new Map(
        scoreEntries.map((entry) => [entry.key, entry.label || getEmotionMeta(entry.key).label]),
      );

      track.emotionHistory.push(latest);
      if (track.emotionHistory.length > settings.emotionHistory) {
        track.emotionHistory.shift();
      }

      const averaged = weightedAverageScores(track.emotionHistory);
      const ranked = [...averaged.entries()].sort((a, b) => b[1] - a[1]);
      let dominant = ranked[0]?.[0] || null;

      if (dominant) {
        const previous = track.stableEmotionKey;
        if (previous && averaged.has(previous)) {
          const previousScore = averaged.get(previous);
          const topScore = averaged.get(dominant);
          if (topScore - previousScore < settings.emotionTolerance) {
            dominant = previous;
          }
        }

        track.stableEmotionKey = dominant;
        stabilized.emotion_key = dominant;
        stabilized.emotion_label = labels.get(dominant) || getEmotionMeta(dominant).label;
        stabilized.confidence = Math.round((averaged.get(dominant) || 0) * 10) / 10;
        stabilized.scores = ranked.map(([key, score]) => ({
          key,
          label: labels.get(key) || getEmotionMeta(key).label,
          score: Math.round(score * 10) / 10,
        }));
      }
    }

    return stabilized;
  }

  function stabilizeCameraFaces(faces) {
    expireTracks();

    const used = new Set();
    return faces.map((face) => {
      const box = face?.box;
      const validBox =
        box &&
        Number.isFinite(Number(box.x)) &&
        Number.isFinite(Number(box.y)) &&
        Number.isFinite(Number(box.w)) &&
        Number.isFinite(Number(box.h)) &&
        Number(box.w) > 0 &&
        Number(box.h) > 0;

      if (!validBox) {
        return face;
      }

      let track = findTrackForBox(box, used);
      if (!track) {
        track = createTrack(box);
      }
      used.add(track.id);
      return updateTrack(track, face);
    });
  }

  function applyResults(payload) {
    const rawFaces = Array.isArray(payload.faces) ? payload.faces : [];
    const faces = state.mode === "camera" ? stabilizeCameraFaces(rawFaces) : rawFaces;
    payload.faces = faces;
    state.lastResults = payload;
    state.lastSource = state.mode;

    updateFaceBadge(faces.length);
    drawOverlay(faces);
    renderResults(faces, payload);

    els.resultsMeta.textContent = `Actualizado ${timeFormatter.format(new Date())}`;
    els.resultsMeta.classList.remove("is-working");

    if (faces.length > 0) {
      showStageStatus(
        `${faces.length} rostro${faces.length === 1 ? "" : "s"} analizado${faces.length === 1 ? "" : "s"}`,
        "success",
        2300,
      );
    } else {
      showStageStatus("No se detectó ningún rostro", "warning", 2800);
    }
  }

  /* ------------------------------------------------------------------
     Resultados
     ------------------------------------------------------------------ */

  function formatDuration(milliseconds) {
    const value = Number(milliseconds);
    if (!Number.isFinite(value) || value < 0) {
      return "Análisis completado";
    }
    if (value < 1000) {
      return `Procesado en ${Math.round(value)} ms`;
    }
    return `Procesado en ${(value / 1000).toFixed(1).replace(".", ",")} s`;
  }

  function renderResults(faces, payload) {
    if (faces.length === 0) {
      configureNoFaceView();
      setResultsView("noFace");
      return;
    }

    setResultsView("list");
    els.resultsList.replaceChildren();

    const summary = document.createElement("div");
    summary.className = "results-summary";
    summary.innerHTML = `
      <span class="summary-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none">
          <path d="M8.5 4.5h-3A1.5 1.5 0 0 0 4 6v2.5M15.5 4.5h3A1.5 1.5 0 0 1 20 6v2.5M8.5 19.5h-3A1.5 1.5 0 0 1 4 18v-2.5M15.5 19.5h3a1.5 1.5 0 0 0 1.5-1.5v-2.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
          <circle cx="9.2" cy="10.3" r=".9" fill="currentColor"/>
          <circle cx="14.8" cy="10.3" r=".9" fill="currentColor"/>
          <path d="M9.3 14.4c1.6 1.2 3.8 1.2 5.4 0" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
      </span>
      <span class="summary-copy">
        <strong>${faces.length} rostro${faces.length === 1 ? "" : "s"} detectado${faces.length === 1 ? "" : "s"}</strong>
        <span>${escapeHtml(formatDuration(payload.processing_ms))}</span>
      </span>
      <span class="summary-time">Ahora</span>
    `;
    els.resultsList.append(summary);

    faces.forEach((face, index) => {
      els.resultsList.append(createFaceCard(face, index));
    });
  }

  function configureNoFaceView() {
    const isPhoto = state.mode === "photo";
    els.noFaceTitle.textContent = isPhoto ? "No encontramos un rostro" : "Aún no hay un rostro visible";
    els.noFaceText.textContent = isPhoto
      ? "Prueba con una foto más cercana, con buena iluminación y el rostro de frente."
      : "La cámara seguirá buscando automáticamente. Acércate y mantén el rostro de frente.";
    els.retryPhotoBtn.hidden = !isPhoto;
  }

  function createFaceCard(face, index) {
    const card = document.createElement("article");
    card.className = "face-card";
    card.style.setProperty("--face-accent", FACE_COLORS[index % FACE_COLORS.length]);
    card.style.animationDelay = `${Math.min(index * 60, 240)}ms`;

    const meta = getEmotionMeta(face.emotion_key);
    const age = readAge(face);
    const confidence = clamp(Number(face.confidence) || 0, 0, 100);
    const faceNumber = String(index + 1).padStart(2, "0");

    if (face.error) {
      card.innerHTML = `
        <div class="face-card__top">
          <span class="face-index">
            <span class="face-index__dot" aria-hidden="true"></span>
            Rostro ${faceNumber}
          </span>
          <span class="emotion-chip" style="--emotion-color:${EMOTIONS.neutral.color}">Sin datos</span>
        </div>
        <div class="face-card__error">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 8v5M12 16.5h.01" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
            <path d="M10.3 4.9 2.8 18a1.8 1.8 0 0 0 1.6 2.7h15.2a1.8 1.8 0 0 0 1.6-2.7L13.7 4.9a2 2 0 0 0-3.4 0Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
          </svg>
          <span>${escapeHtml(face.error)}</span>
        </div>
      `;
      return card;
    }

    const scoreRows = (Array.isArray(face.scores) ? face.scores : [])
      .map((entry) => {
        const scoreMeta = getEmotionMeta(entry.key);
        const score = clamp(Number(entry.score) || 0, 0, 100);
        return `
          <div class="emotion-bar" style="--emotion-color:${scoreMeta.color}">
            <span>${escapeHtml(scoreMeta.label)}</span>
            <div class="emotion-bar__track">
              <div class="emotion-bar__fill" style="width:${score}%"></div>
            </div>
            <span class="emotion-bar__value">${score.toFixed(1)}%</span>
          </div>
        `;
      })
      .join("");

    card.innerHTML = `
      <div class="face-card__top">
        <span class="face-index">
          <span class="face-index__dot" aria-hidden="true"></span>
          Rostro ${faceNumber}
        </span>
        <span class="emotion-chip" style="--emotion-color:${meta.color}">
          ${meta.icon}
          ${escapeHtml(meta.label)}
        </span>
      </div>

      <div class="face-card__metrics">
        <div class="metric metric--age">
          <span class="metric__label">Edad estimada</span>
          <div class="metric__value">
            <strong>${age === null ? "—" : age}</strong>
            <span>${age === null ? "sin datos" : "años"}</span>
          </div>
        </div>

        <div class="metric metric--emotion">
          <span class="metric__label">Emoción dominante</span>
          <div class="metric__value">
            <span class="emotion-face" style="--emotion-color:${meta.color}">${meta.icon}</span>
            <strong>${escapeHtml(meta.label)}</strong>
          </div>
          <div class="confidence">
            <div class="confidence__head">
              <span>Confianza</span>
              <strong>${confidence.toFixed(1)}%</strong>
            </div>
            <div class="confidence__track">
              <div class="confidence__fill" style="width:${confidence}%"></div>
            </div>
          </div>
        </div>
      </div>

      ${
        scoreRows
          ? `<details class="breakdown">
              <summary>
                Desglose emocional
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="m7 9.5 5 5 5-5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </summary>
              <div class="emotion-bars">${scoreRows}</div>
            </details>`
          : ""
      }
    `;

    return card;
  }

  /* ------------------------------------------------------------------
     Dibujo de cajas sobre el rostro
     ------------------------------------------------------------------ */

  function roundedRect(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") {
      ctx.roundRect(x, y, width, height, r);
      return;
    }
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
  }

  function drawOverlay(faces) {
    const canvas = els.overlayCanvas;
    const ctx = canvas.getContext("2d");
    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    if (!Array.isArray(faces) || faces.length === 0 || !width || !height) {
      canvas.hidden = true;
      return;
    }

    canvas.hidden = false;
    const mirrored = state.mode === "camera";
    const baseLine = Math.max(2, width / 540);
    const labelFont = clamp(width * 0.0165, 13, 21);

    faces.forEach((face, index) => {
      const box = face.box;
      if (!box) {
        return;
      }

      const boxWidth = clamp(Number(box.w) || 0, 0, 1) * width;
      const boxHeight = clamp(Number(box.h) || 0, 0, 1) * height;
      const rawX = clamp(Number(box.x) || 0, 0, 1) * width;
      const y = clamp(Number(box.y) || 0, 0, 1) * height;
      if (boxWidth < 2 || boxHeight < 2) {
        return;
      }

      const x = mirrored ? width - rawX - boxWidth : rawX;
      const color = FACE_COLORS[index % FACE_COLORS.length];
      const radius = Math.min(14, boxWidth * 0.08, boxHeight * 0.08);

      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = baseLine;
      ctx.shadowColor = "rgba(92, 15, 15, 0.28)";
      ctx.shadowBlur = 8;
      roundedRect(ctx, x, y, boxWidth, boxHeight, radius);
      ctx.stroke();

      const corner = Math.min(boxWidth, boxHeight) * 0.17;
      ctx.lineWidth = baseLine * 2.1;
      ctx.beginPath();
      ctx.moveTo(x, y + corner);
      ctx.lineTo(x, y);
      ctx.lineTo(x + corner, y);
      ctx.moveTo(x + boxWidth - corner, y);
      ctx.lineTo(x + boxWidth, y);
      ctx.lineTo(x + boxWidth, y + corner);
      ctx.moveTo(x + boxWidth, y + boxHeight - corner);
      ctx.lineTo(x + boxWidth, y + boxHeight);
      ctx.lineTo(x + boxWidth - corner, y + boxHeight);
      ctx.moveTo(x + corner, y + boxHeight);
      ctx.lineTo(x, y + boxHeight);
      ctx.lineTo(x, y + boxHeight - corner);
      ctx.stroke();
      ctx.restore();

      const ageValue = readAge(face);
      const age = ageValue === null ? "sin datos" : `${ageValue} años`;
      const emotion = face.error ? "sin datos" : face.emotion_label || "Neutral";
      const label = `${String(index + 1).padStart(2, "0")} · ${age} · ${emotion}`;

      ctx.save();
      ctx.font = `600 ${labelFont}px "Segoe UI", system-ui, sans-serif`;
      ctx.textBaseline = "middle";
      const textWidth = ctx.measureText(label).width;
      const padX = labelFont * 0.7;
      const pillHeight = labelFont * 1.85;
      const pillWidth = textWidth + padX * 2;
      let pillX = x;
      if (pillX + pillWidth > width - 6) {
        pillX = Math.max(6, width - pillWidth - 6);
      }
      let pillY = y - pillHeight - 8;
      if (pillY < 6) {
        pillY = Math.min(height - pillHeight - 6, y + 8);
      }

      ctx.fillStyle = "rgba(255, 255, 255, 0.94)";
      ctx.shadowColor = "rgba(92, 15, 15, 0.2)";
      ctx.shadowBlur = 8;
      roundedRect(ctx, pillX, pillY, pillWidth, pillHeight, pillHeight / 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.9;
      ctx.lineWidth = Math.max(1, baseLine * 0.8);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#5C0F0F";
      ctx.fillText(label, pillX + padX, pillY + pillHeight / 2 + 0.5);
      ctx.restore();
    });
  }

  /* ------------------------------------------------------------------
     Salud del motor
     ------------------------------------------------------------------ */

  async function checkHealth() {
    try {
      const response = await fetch("/api/health", { cache: "no-store" });
      if (!response.ok) {
        throw new Error("El servidor no respondió correctamente.");
      }
      const payload = await response.json();
      const engineState = payload?.engine?.state || "error";
      setEngineState(engineState);

      if (engineState === "unavailable" || engineState === "error") {
        toast(
          "El motor de IA no está disponible. Revisa las dependencias y reinicia la aplicación.",
          "warning",
          8000,
        );
      }
    } catch {
      setEngineState("error");
    }
  }

  /* ------------------------------------------------------------------
     Eventos e inicialización
     ------------------------------------------------------------------ */

  function bindEvents() {
    els.startCameraBtn.addEventListener("click", startCamera);
    els.emptyCameraBtn.addEventListener("click", startCamera);
    els.stopBtn.addEventListener("click", () => stopCamera({ reset: true }));

    const openFilePicker = () => {
      if (!state.fileBusy) {
        els.fileInput.click();
      }
    };
    els.uploadBtn.addEventListener("click", openFilePicker);
    els.emptyUploadBtn.addEventListener("click", openFilePicker);
    els.retryPhotoBtn.addEventListener("click", openFilePicker);

    els.fileInput.addEventListener("change", () => {
      const file = els.fileInput.files?.[0];
      if (file) {
        handleFile(file);
      }
    });

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        cancelScheduledAnalysis();
      } else if (state.mode === "camera" && !state.activeRequest) {
        scheduleCameraAnalysis(350);
      }
    });

    window.addEventListener("beforeunload", () => {
      if (state.stream) {
        state.stream.getTracks().forEach((track) => track.stop());
      }
      if (state.activeRequest) {
        state.activeRequest.controller.abort();
      }
    });
  }

  function init() {
    bindEvents();
    setResultsView("empty");
    setButtonState();
    checkHealth();
  }

  init();
})();
