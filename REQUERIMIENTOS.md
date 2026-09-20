# Hoja de Requerimientos - AR Balloons

**Estado:** v0.9.0 (estado actual de la app)
**Costo:** $0 (sin API keys, sin servicios de pago, sin build)

---

## 1. Objetivo y alcance

Aplicacion web **mobile-first** que permite **etiquetar objetos y superficies reales** con
**globos flotantes en Realidad Aumentada**. Al tocar una superficie en la camara, el globo
queda anclado a ese lugar del mundo real (a traves del *hit-test* de WebXR).

Existen **dos tipos de globo**:

- **Marcador**: fija un lugar con un nombre flotante (p. ej. TV, cama, enchufe).
- **Way tracker**: punto de paso sin nombre que, junto con los demas globos, forma un
  **camino** visible (linea 3D) que une los globos en el orden en que se colocaron.

- **Caso de uso principal:** marcar lugares y trazar rutas entre ellos (p. ej. camino de
  la sala a la cocina), sin fotos, solo con la camara.
- **Alcance v0.9.0:** lo que la app hace hoy (2 tipos de globo + camino + persistencia local).
- **Uso:** un solo dispositivo.

### Fuera de alcance
- Multiusuario / sincronizacion en nube / backend.
- Posicionamiento GPS / brujula / ARCore Geospatial.
- Edicion (renombrar/mover) de globos ya colocados.
- Anclas WebXR persistentes (WebXR Anchors).
- Deteccion/oclusion de superficies detalladas (solo el *hit-test* basico).
- Varias rutas independientes: hay un solo camino continuo en orden de colocacion.

---

## 2. Requerimientos funcionales

- **RF1 - Entrada a RA:** boton que pide permiso de camara y abre una sesion WebXR inmersiva.
- **RF2 - HUD sobre la camara:** en la sesion, botones flotantes sobre la camara
  (**Agregar marcador**, **Agregar way tracker**, **Mis globos**) en fullscreen.
- **RF3 - Colocacion por reticula + boton/toque:** la reticula marca la superficie detectada;
  el globo se coloca al pulsar el boton del tipo activo o al tocar la pantalla (el toque
  coloca el tipo activo; el boton activo queda resaltado).
- **RF4 - Tipo activo:** el HUD tiene 2 botones; pulsar uno lo activa Y coloca. El toque
  en pantalla repite el ultimo tipo usado.
- **RF5 - Marcador con nombre:** al colocar un marcador, el input de nombre se despliega
  en la pantalla; al aceptar, la etiqueta se dibuja flotando sobre el globo.
- **RF6 - Way tracker:** se coloca al instante como punto rosado pequeno, sin pedir nombre,
  y se confirma con un toast.
- **RF7 - Camino:** linea 3D cian que une cada globo con el siguiente en orden de
  colocacion, a la altura de los globos. Al borrar un globo del medio, la ruta se reconecta
  (los vecinos quedan unidos).
- **RF8 - Persistencia local:** los globos (con su tipo y posicion) se almacenan en el
  dispositivo (localStorage, clave `argps.v1`) y vuelven a aparecer al volver a entrar.
  Los globos guardados en versiones anteriores (sin tipo) se migran a marcadores.
- **RF9 - Lista y verificacion:** "Mis globos (N)" muestra la lista con tipo (marcador por
  nombre / "Punto N" para ways) y boton Eliminar por globo; la tarjeta de inicio muestra
  cuantos globos se dejaron y la version para verificar el deploy.
- **RF10 - QR de acceso:** la tarjeta de inicio muestra un QR con la URL publica de la app.
- **RF11 - Debug visual:** malla de planos detectados, rejilla en el origen, rayo de
  colocacion y marca de camara (para depurar el hit-test).

---

## 3. Requerimientos no funcionales

- **RNF1 - Rendimiento:** 60 fps en celulares medianos; texturas de globo y etiqueta
  generadas en canvas (sin assets externos).
- **RNF2 - Sin dependencias de backend:** Three.js, ARButton y lineas del camino
  (Line2/LineMaterial) se cargan por CDN.
- **RNF3 - Compatibilidad:** Android (Chrome + ARCore) e iOS (Safari 17+ / ARKit); el HUD
  sobre la camara usa `dom-overlay` (Chromium).
- **RNF4 - Seguridad:** solo HTTPS para WebXR; sin almacenar datos fuera del dispositivo.
- **RNF5 - Codigo:** JS vanilla en un solo archivo (`app.js`), ASCII puro, sin emojis
  en el codigo (evita problemas de codificacion al editar en distintos editores).

---

## 4. Estructura del repo

| Archivo | Proposito |
|---------|-----------|
| `index.html` | Estructura y HUD (buttons de tipo, lista, tarjeta de nombre) |
| `style.css` | Estilos del HUD, tarjeta de inicio, lista y toast |
| `app.js` | Toda la logica: WebXR, hit-test, tipos de globo, camino, persistencia, QR, debug |
| `servir.ps1` | Servidor local (opcional tunel HTTPS con Cloudflare) |
| `.github/workflows/pages.yml` | Deploy automatico a GitHub Pages |