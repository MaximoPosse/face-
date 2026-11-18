(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const els = {
    form: $("setupForm"),
    ip: $("ip"),
    user: $("user"),
    password: $("password"),
    stream: $("stream"),
    message: $("message"),
    test: $("testBtn"),
    save: $("saveBtn"),
    skip: $("skipBtn"),
    hint: $("passwordHint"),
  };

  let hasSavedPassword = false;

  function show(text, tone = "info") {
    els.message.hidden = !text;
    els.message.textContent = text || "";
    els.message.dataset.tone = tone;
  }

  function setBusy(busy) {
    [els.test, els.save, els.skip].forEach((button) => {
      button.disabled = busy;
    });
  }

  async function post(url, body) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const payload = await response.json().catch(() => null);
    return { response, payload };
  }

  function values() {
    return {
      ip: els.ip.value.trim(),
      user: els.user.value.trim(),
      password: els.password.value,
      stream: els.stream.value,
    };
  }

  async function load() {
    try {
      const response = await fetch("/api/config", { cache: "no-store" });
      const data = await response.json();
      els.ip.value = data.ip || "";
      els.user.value = data.user || "";
      els.stream.value = data.stream || "stream1";
      hasSavedPassword = Boolean(data.has_password);
      if (hasSavedPassword) {
        els.password.placeholder = "•••••••• (déjala vacía para conservarla)";
      }
    } catch {
      /* sin datos previos */
    }
  }

  els.test.addEventListener("click", async () => {
    const { ip } = values();
    if (!ip) {
      show("Escribe primero la dirección IP.", "error");
      return;
    }
    setBusy(true);
    show("Comprobando conexión…");
    try {
      const { payload } = await post("/api/config/test", { ip });
      show(payload?.message || "No se pudo comprobar la conexión.", payload?.reachable ? "ok" : "error");
    } catch {
      show("No se pudo comprobar la conexión.", "error");
    } finally {
      setBusy(false);
    }
  });

  async function save(body) {
    setBusy(true);
    show("Guardando…");
    try {
      const { response, payload } = await post("/api/config", body);
      if (!response.ok || !payload?.ok) {
        show(payload?.error?.message || "No se pudo guardar la configuración.", "error");
        return;
      }
      show("Configuración guardada.", "ok");
      window.setTimeout(() => {
        window.location.href = "/";
      }, 600);
    } catch {
      show("No se pudo guardar la configuración.", "error");
    } finally {
      setBusy(false);
    }
  }

  els.form.addEventListener("submit", (event) => {
    event.preventDefault();
    const body = values();
    if (!body.ip) {
      show("Escribe la dirección IP o pulsa «Usar sin cámara Tapo».", "error");
      return;
    }
    if (!body.user || (!body.password && !hasSavedPassword)) {
      show("Escribe el usuario y la contraseña de la cuenta de cámara.", "error");
      return;
    }
    save(body);
  });

  els.skip.addEventListener("click", () => {
    save({ ip: "", user: "", password: "", stream: "stream1" });
  });

  load();
})();
