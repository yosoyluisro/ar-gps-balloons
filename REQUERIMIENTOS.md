# Hoja de Requerimientos - AR Balloons

**Estado:** v0.11.0 (estado actual de la app)
**Costo:** $0 (sin API keys, sin servicios de pago, sin build)

---

## 1. Objetivo y alcance

Aplicacion web **mobile-first** que permite **etiquetar objetos y superficies reales** con
**globos flotantes en Realidad Aumentada**. Al tocar una superficie en la camara, el globo
queda anclado a ese lugar del mundo real (a traves del *hit-test* de WebXR).

Existen **dos tipos de globo**:

- **Marcador**: fija un lugar con un nombre flotante (p. ej. TV, cama, enchufe).
- **Way tracker**: punto de paso sin nombre que pertenece a un **camino** y ayuda a
  trazarlo entre sus dos marcadores extremos.

Un **camino** une dos marcadores A y B ("Sala -> Cocina") y se traza colocando way
trackers entre ellos. Cada camino dibuja su propia linea 3D (A -> ways -> B). Los
marcadores son globales y pueden ser extremo de varios caminos.

- **Caso de uso principal:** marcar lugares y trazar rutas entre ellos (p. ej. camino de
  la sala a la cocina), sin fotos, solo con la camara.
- **Alcance v0.11.0:** lo que la app hace hoy (2 tipos de globo + caminos A->B + modos Registrar/Ver + persistencia local).
- **Uso:** un solo dispositivo.

### Fuera de alcance
- Multiusuario / sincronizacion en nube / backend.
- Posicionamiento GPS / brujula / ARCore Geospatial.
- Edicion (renombrar/mover) de globos ya colocados.
- Anclas WebXR persistentes (WebXR Anchors).
- Deteccion/oclusion de superficies detalladas (solo el *hit-test* basico).

---

## 2. Requerimientos funcionales

- **RF1 - Entrada a RA:** dos botones que piden permiso de camara y abren una sesion
  WebXR inmersiva: **Registrar** (edicion completa) y **Ver mapa** (solo lectura, sin
  debug ni controles de edicion, lista sin acciones). El modo solo se elige al inicio.
- **RF2 - HUD sobre la camara:** en la sesion, botones flotantes sobre la camara
  (**Agregar marcador**, **Agregar way tracker**, **Mis globos**) en fullscreen, mas el
  chip del camino en edicion ("Camino: A -> B" + **Salir**).
- **RF3 - Colocacion por reticula + boton/toque:** la reticula marca la superficie detectada;
  el globo se coloca al pulsar el boton del tipo activo o al tocar la pantalla (el toque
  coloca el tipo activo; el boton activo queda resaltado).
- **RF4 - Tipo activo:** el HUD tiene 2 botones; pulsar uno lo activa Y coloca. El toque
  en pantalla repite el ultimo tipo usado.
- **RF5 - Marcador con nombre:** al colocar un marcador, el input de nombre se despliega
  en la pantalla; al aceptar, la etiqueta se dibuja flotando sobre el globo.
- **RF6 - Way tracker:** se coloca al instante como punto rosado pequeno, sin pedir nombre,
  dentro del camino en edicion, y se confirma con un toast. Sin camino en edicion no se
  coloca (toast de aviso).
- **RF7 - Caminos A->B:** en "Mis globos" se eligen dos marcadores (**A** y **B**) y se pulsa
  **Crear camino**; el nombre se genera solo ("Sala -> Cocina"). La app entra en modo edicion
  de ese camino: cada way colocado se agrega al final del tramo. Cada camino dibuja su propia
  linea 3D cian (A -> ways -> B) a la altura de los globos.
- **RF8 - Borrado con reglas:** borrar un extremo A/B elimina el camino completo con sus ways
  (los marcadores sobreviven); borrar un punto del medio reconecta la linea; el boton Eliminar
  de un camino lo borra con sus ways pero conserva los marcadores.
- **RF9 - Persistencia local:** globos y caminos se almacenan en el dispositivo
  (localStorage, clave `argps.v1`, formato v2) y vuelven a aparecer al volver a entrar,
  incluyendo el camino en edicion. Los datos de v0.9.0 se migran a un "Camino 1".
- **RF10 - Lista y verificacion:** "Mis globos (N)" muestra secciones **Caminos** (nombre,
  puntos, [Editar], [Eliminar], ways anidados) y **Marcadores** (nombre, [A] [B], [Eliminar]);
  la tarjeta de inicio muestra cuantos globos se dejaron y la version para verificar el deploy.
- **RF11 - QR de acceso:** la tarjeta de inicio muestra un QR con la URL publica de la app.
- **RF12 - Debug visual:** malla de planos detectados, rejilla en el origen, rayo de
  colocacion y marca de camara (para depurar el hit-test).

---

## 3. Requerimientos no funcionales

- **RNF1 - Rendimiento:** 60 fps en celulares medianos; texturas de globo y etiqueta
  generadas en canvas (sin assets externos).
- **RNF2 - Sin dependencias de backend:** Three.js y lineas del camino
  (Line2/LineMaterial) se cargan por CDN; la sesion WebXR se pide directo sin librerias.
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
| `app.js` | Toda la logica: WebXR, hit-test, tipos de globo, caminos, persistencia, QR, debug |
| `servir.ps1` | Servidor local (opcional tunel HTTPS con Cloudflare) |
| `.github/workflows/pages.yml` | Deploy automatico a GitHub Pages |