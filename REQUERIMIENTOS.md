# Hoja de Requerimientos - AR Balloons

**Estado:** v0.6.0 (estado actual de la app)
**Costo:** $0 (sin API keys, sin servicios de pago, sin build)

---

## 1. Objetivo y alcance

Aplicacion web **mobile-first** que permite **etiquetar objetos y superficies reales** con
**globos flotantes en Realidad Aumentada**. Al tocar una superficie en la camara, el globo
queda anclado a ese lugar del mundo real (a traves del *hit-test* de WebXR) con su nombre
flotando cerca. Es una app de **etiquetado visual de entorno**.

- **Caso de uso principal:** marcar objetos familiares (TV, cama, enchufe, plantas) al
  momento, sin fotos, solo con la camara.
- **Alcance v0.6.0:** lo que la app hace hoy (pinneado en superficie + nombre + persistencia local).
- **Uso:** un solo dispositivo.

### Fuera de alcance
- Multiusuario / sincronizacion en nube / backend.
- Posicionamiento GPS / brujula / ARCore Geospatial.
- Edicion y borrado de globos ya colocados.
- Anclas WebXR persistentes (WebXR Anchors).
- Deteccion/oclusion de superficies detalladas (solo el *hit-test* basico).

---

## 2. Requerimientos funcionales

- **RF1 - Entrada a RA:** boton que pide permiso de camara y abre una sesion WebXR inmersiva.
- **RF2 - Layout dividido 50/50:** mitad superior = camara enmarcada en cuadrado (letterbox);
  mitad inferior = panel de control opaco con el boton **Agregar globo**.
- **RF3 - Colocacion por boton + reticula:** al pulsar **Agregar globo** se activa la reticula;
  al tocar una superficie detectada, el globo se coloca ahi.
- **RF4 - Nombre inline:** al colocar el globo, el input de nombre se despliega en el panel
  inferior; al aceptar, la etiqueta se dibuja flotando sobre el globo.
- **RF5 - Persistencia local:** los globos guardados se almacenan en el dispositivo
  (localStorage, clave `argps.v1`) y vuelven a aparecer al volver a entrar.
- **RF6 - Cuenta y contador:** la tarjeta de inicio muestra cuantos globos se dejaron en la
  sesion.
- **RF7 - QR de acceso:** la tarjeta de inicio muestra un QR con la URL publica de la app.
- **RF8 - Version visible:** la tarjeta muestra la version (p. ej. v0.6.0) para verificar el deploy.
- **RF9 - Debug visual:** malla de planos detectados, rejilla en el origen, rayo de
  colocacion y marca de camara (para depurar el hit-test).

---

## 3. Requerimientos no funcionales

- **RNF1 - Rendimiento:** 60 fps en celulares medianos; texturas de globo y etiqueta
  generadas en canvas (sin assets externos).
- **RNF2 - Sin dependencias de backend:** Three.js y ARButton se cargan por CDN.
- **RNF3 - Compatibilidad:** Android (Chrome + ARCore) e iOS (Safari 17+ / ARKit).
- **RNF4 - Seguridad:** solo HTTPS para WebXR; sin almacenar datos fuera del dispositivo.
- **RNF5 - Codigo:** JS vanilla en un solo archivo (`app.js`), ASCII puro, sin emojis
  en el codigo (evita problemas de codificacion al editar en distintos editores).

---

## 4. Estructura del repo

| Archivo | Proposito |
|---------|-----------|
| `index.html` | Estructura y layout 50/50 (camara arriba, panel abajo) |
| `style.css` | Estilos del layout, tarjeta de inicio, panel y toast |
| `app.js` | Toda la logica: WebXR, hit-test, colocacion, persistencia, QR, debug |
| `servir.ps1` | Servidor local (opcional tunel HTTPS con Cloudflare) |
| `.github/workflows/pages.yml` | Deploy automatico a GitHub Pages |