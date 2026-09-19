# 🎈 Hoja de Requerimientos — AR Balloons

**Estado:** v2 (estado actual de la app)
**Costo:** ¢0 (sin API keys, sin servicios de pago, sin build)

---

## 1. Objetivo y alcance

Aplicación web **mobile-first** que permite **etiquetar objetos y superficies reales** con
**globos flotantes en Realidad Aumentada**. Al tocar una superficie en la cámara, el globo
queda anclado a ese lugar del mundo real (a través del *hit-test* de WebXR) con su nombre
flotando cerca. Es una app de **etiquetado visual de entorno**, no de posicionamiento
geográfico.

- **Caso de uso principal:** marcar objetos familiares (TV, cama, enchufe, plantas…) al
  momento, sin fotos, solo con la cámara.
- **Alcance v2:** lo que la app hace hoy (pinneado en superficie + nombre).
- **Uso:** un solo dispositivo, **datos efímeros** (en memoria). No hay cuentas ni nube.

### Fuera de alcance
- Multiusuario / sincronización en nube / backend.
- Persistencia entre sesiones (`localStorage`).
- Posicionamiento GPS / brújula / ARCore Geospatial.
- Edición y borrado de globos ya colocados.
- Anclas WebXR persistentes (WebXR Anchors).
- Detección/oclusión de superficies detalladas (solo el *hit-test* básico).

---

## 2. Requisitos funcionales

### RF-01 · Iniciar sesión AR
Al pulsar "Comenzar AR":
- Se pide permiso de cámara (vía WebXR) y se abre una sesión `immersive-ar`.
- El *reference space* usado es `local` (world-locked en el arranque).
- Si WebXR no está disponible o se rechaza: el botón se deshabilita con un mensaje claro.

### RF-02 · Colocar un globo en una superficie real
- Tocar la pantalla genera un *hit-test* transitorio (`transient input`); también un evento
  `select` sin retículo válido coloca el globo a distancia fija delante de la cámara.
- Un retículo anillado indica dónde quedará anclado el globo cuando se detecta superficie.
- El globo queda flotando a una altura fija sobre la superficie.
- Si no hay superficie detectable, el globo se coloca en el aire a distancia fija.

### RF-03 · Nombrar el globo
- Al colocar el globo se abre un overlay DOM con un campo de texto (autofocus, máx. 22
  caracteres) para escribir el nombre.
- Por defecto propone `Globo N` (contador de la sesión).
- Al aceptar (botón o Enter), la etiqueta flotante del globo muestra el nombre.

### RF-04 · Ver globos con etiquetas ancladas
- Cada globo se renderiza como un sprite brillante + un sprite de etiqueta (texto) justo
  debajo, "ahogado" al mundo (world-locked) mientras la cámara se mueve.
- Todas las etiquetas de la sesión permanecen visibles y en su lugar.

---

## 3. Requisitos no funcionales

| ID | Requisito |
|---|---|
| RNF-01 | **100 % gratuito.** Sin API keys, sin backend de pago, sin servicios externos. |
| RNF-02 | **HTTPS obligatorio** para WebXR. Se sirve con túnel gratuito (Cloudflare) para pruebas en celular. |
| RNF-03 | **Plataformas:** Android (Chrome + ARCore con *hit-test*) e iOS (Safari 17+ / ARKit). |
| RNF-04 | **Sin compilación:** Vanilla JS (ES modules), HTML y CSS; Three.js vía CDN. |
| RNF-05 | **Datos efímeros:** nada sale del navegador ni se persiste entre sesiones. |
| RNF-06 | **Responsive mobile-first**, pantalla completa sin scroll, touch-friendly. |
| RNF-07 | Rendimiento fluido: pocos objetos (sprites), reutilización de texturas de etiqueta. |
| RNF-08 | Código en español, comentarios mínimos, sin dependencias locales. |

---

## 4. Restricciones técnicas (honestidad)

- La anclación depende del ***hit-test* del dispositivo** (ARCore/ARKit): requiere superficies
  detectables y luz suficiente. No es posicionamiento milimétrico de GPS ni anclas persistentes.
- Al usar `local` reference space, el mundo se **reinicia en cada sesión** desde donde arrancas.
- **Sin persistencia**: al recargar o cerrar la pestaña, todos los globos desaparecen.
- WebXR **solo funciona por HTTPS** y con cámara trasera.
- La etiqueta es un *sprite* frontal (billboard 2D) con `depthTest` activo: puede quedar
  tapada parcialmente por objetos.

---

## 5. Modelo de datos (en memoria)

No hay modelo persistido. Un globo en una sesión es un grupo de Three.js:

```
Group                      // makeBallGroup()
├─ Sprite "globo"          // textura radial (gradiente ORB), escala 0.35
│    position.y = FLOAT_ABOVE (0.2 m sobre la superficie)
└─ Sprite "etiqueta"       // textura canvas (texto en caja redondeada)
     position.y = FLOAT_ABOVE - LABEL_GAP (0.32 m hacia abajo)
     alto = LABEL_H (0.11 m)
```

- `group.position` = punto de la superficie detectado por el *hit-test*
  (o el `aimPoint(PLACE_DIST)` a 2.2 m si no hay superficie).
- `color` / tamaño fijos del globo: textura radial `rgba(41,255,240)`.

---

## 6. UI / UX

| Pantalla | Contenido |
|---|---|
| **Inicio** | Logo 🎈, descripción corta, botón "▶ Comenzar Realidad Aumentada" (o estado "RA no disponible"), contador de etiquetas de la última sesión. |
| **AR activa** | Cámara en vivo, retículo de anclaje (anillo) al detectar superficie, tap en pantalla para colocar. |
| **Prompt de nombre** | Overlay DOM centrado sobre la cámara (sin salir de AR, `dom-overlay`), input autofocus máx. 22 caracteres, botón Aceptar / Enter. |

---

## 7. Criterios de aceptación

| Req | Criterio |
|---|---|
| RF-01 | Con dispositivo compatible y HTTPS, al pulsar Comenzar AR se abre la cámara y se ve el retículo. |
| RF-02 | Tocar una superficie (mesa, piso, pared) coloca un globo en ese punto; sin superficie, se coloca a 2.2 m delante. |
| RF-03 | Al aceptar el nombre, la etiqueta del globo lo muestra; vacío queda `Globo N`. |
| RF-04 | Moviendo la cámara, varios globos permanecen fijos en su lugar con sus etiquetas visibles. |

---

## 8. Riesgos y mitigación

| Riesgo | Mitigación |
|---|---|
| *Hit-test* sin superficie (suelo oscuro, poca luz) | Fallback a `aimPoint` a distancia fija; retículo indica cuándo hay anclaje. |
| WebXR no soportado / permisos denegados | Botón deshabilitado con mensaje; instrucciones de requerimientos. |
| Sesión interrumpida (cambio de pestaña) | Al volver se reanuda; si se pierde, se reinicia la sesión. |
| *Dom-overlay* no anulado en el dispositivo | El input aparece sobre la cámara; si falla, el globo se nombra automáticamente `Globo N`. |