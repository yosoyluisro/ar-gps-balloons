# 🎈 Hoja de Requerimientos — AR GPS Balloons

**Branch:** `ar-gps-ballons`
**Estado:** borrador v1
**Costo:** ¢0 (sin API keys, sin servicios de pago, sin build)

---

## 1. Objetivo y alcance

Aplicación web **mobile-first** que permite dejar **globos informativos** flotando en Realidad
Aumentada, anclados a **coordenadas GPS reales** (latitud, longitud, altitud) en lugar de "poses
de cámara". Al volver al mismo lugar, los globos reaparecen en su ubicación geográfica.

- **Caso de uso principal:** globos informativos en el espacio real (campus, eventos, señalización turística, rutas).
- **Alcance V1:** mínima viable.
- **Uso:** un solo dispositivo, datos **locales** (navegador). No hay cuentas ni nube.

### Fuera de alcance (v1)
- Multiusuario / sincronización en nube / backend.
- Navegación dirigida por flecha hacia un globo.
- ARCore Geospatial (requeriría API key de Google).
- Búsqueda por cercanía y filtros avanzados.
- Detección de superficies / oclusión real.

---

## 2. Requisitos funcionales

### RF-01 · Iniciar sesión AR con origen GPS
Al pulsar "Comenzar AR":
- Se pide permiso de geolocalización y de cámara.
- Se toma la **posición GPS actual** como **origen del mundo 3D** (centro de la escena).
- Se abre una sesión WebXR (`immersive-ar`).
- Si no hay señal GPS o se deniega el permiso: se muestra mensaje claro y no se inicia AR.

### RF-02 · Colocar un globo en la posición actual
- Un punto de mira en el centro de la pantalla indica el lugar de colocación.
- Al confirmar (botón o toque en pantalla), se crea un globo con:
  - **lat / lng / alt** capturados en el instante de la colocación.
  - Editor con: **nombre** (obligatorio), **nota** (opcional), **icono** (emoji), **color**.
- El globo queda flotando a una altura configurable (por defecto 1.6 m sobre el suelo).

### RF-03 · Ver todos los globos en AR desde la posición actual
- Todos los globos guardados se posicionan en la escena según su **delta real** con el origen:
  - diferencia de lat/lng → distancia en metros (fórmula de haversine),
  - diferencia de alt → altura (y).
- La **orientación** del mundo se alinea con la **brújula** (DeviceOrientation), de modo que un
  globo al norte aparece realmente al norte.
- A medida que el usuario camina, la cámara WebXR mantiene la escena fija en el espacio.

### RF-04 · Lista y gestión de globos
- Panel que lista todos los globos (nombre, icono, fecha, distancia aproximada).
- Acciones por globo: **Editar** (abre el editor) y **Eliminar** (con confirmación).
- Acción global: **borrar todo** (con confirmación).

### RF-05 · Re-anclar el origen a la posición actual
- Botón "Re-anclar a mi posición" que recalcula el origen con el GPS actual y re-posiciona todos
  los globos (corrige deriva del GPS y del SLAM).
- Debe poder usarse durante una sesión AR activa.

### RF-06 · Persistencia y respaldo
- Guardado en `localStorage` (clave `argps.v1`).
- **Exportar** a JSON y **importar** desde JSON (respaldo/migración).

### RF-07 · Modo 3D de escritorio
- Sin WebXR: modo "Probar en 3D" con cámara orbitable, para previsualizar la escena completa.
- Permite ver y mover el editor también desde escritorio (los globos usan la última posición GPS
  del dispositivo al exportar).

---

## 3. Requisitos no funcionales

| ID | Requisito |
|---|---|
| RNF-01 | **100 % gratuito.** Sin API keys, sin backend de pago, sin servicios externos. |
| RNF-02 | **HTTPS obligatorio** para WebXR. Se sirve con túnel gratuito (Cloudflare) para pruebas en celular. |
| RNF-03 | **Plataformas:** Android (Chrome reciente + ARCore) e iOS (Safari 17+ con ARKit). |
| RNF-04 | **Sin compilación:** Vanilla JS (ES modules), HTML y CSS; Three.js vía CDN. |
| RNF-05 | **Datos solo en el dispositivo:** nada sale del navegador salvo el túnel HTTPS de transporte. |
| RNF-06 | **Responsive mobile-first**, pantalla completa sin scroll, touch-friendly. |
| RNF-07 | Rendimiento fluido: pocos objetos, reutilización de recursos, límite razonable de globos (sugerido ≤ 100). |
| RNF-08 | Código en español, comentarios mínimos, sin dependencias locales. |

---

## 4. Restricciones técnicas (honestidad)

- **Precisión del GPS del celular: ~5–10 m** (a veces peor en interiores o con señales reflejadas).
  La posición de los globos es **aproximada**, no milimétrica.
- La **brújula** requiere calibración manual (girar el teléfono en ∞) y se degrada con el movimiento.
- No se usa ARCore Geospatial: el mundo se **reinicia** en cada sesión desde el GPS actual. Si dos
  sesiones empiezan en lugares diferentes, el mundo queda desplazado proporcionalmente.
- La altitud GPS es poco precisa (sin barómetro puede variar varios metros).
- WebXR **solo funciona por HTTPS**. Sin señal GPS, la app no puede anclar globos.
- Entre sesiones: **pararse en el mismo punto** para que los globos aparezcan donde se dejaron.

---

## 5. Modelo de datos

```jsonc
// localStorage: argps.v1  ->  { version: 1, balloons: [ ... ] }

{
  "id": "b1710000000000-abcdef",
  "name": "Biblioteca",
  "note": "Horario 8–21",
  "icon": "📚",
  "color": "#29fff0",
  "lat": 19.432608,
  "lng": -99.133209,
  "alt": 8.5,          // metros sobre en el nivel GPS (solo informativa/altura relativa)
  "altOffset": 1.6,    // metros sobre el suelo para mostrarlo en AR
  "createdAt": 1710000000000
}
```

Deltas de la sesión AR (no persistidos):
```
dx = haversineDeltaX(lng)  → metro en eje X (este)
dz = haversineDeltaY(lat)  → metro en eje Z (norte)
y  = originAlt - alt + altOffset
```

---

## 6. UI / UX

| Pantalla | Contenido |
|---|---|
| **Inicio** | Logo 🎈, descripción corta, botón "▶ Comenzar AR", botón "Probar en 3D", estado de soporte WebXR. |
| **AR activa** | Cámara en vivo, punto de mira centrado, HUD: botón "📍 Dejar globo aquí", botón "📍 A mi posición", lista de globos, "⟲ Re-anclar a mi posición", ⤓/⤒. |
| **Editor de globo** | Nombre, nota, selector de icono (emoji), paleta de colores, altura sobre el suelo (m). Guardar / Cancelar. |
| **Lista de globos** | Tarjetas con icono, nombre, nota corta, distancia aprox., fecha. Editar / Eliminar. |
| **Al tocar un globo en AR** | Tarjeta con acciones: ver info, editar, borrar. |

---

## 7. Criterios de aceptación

| Req | Criterio |
|---|---|
| RF-01 | Con permiso y señal, al pulsar Comenzar AR se abre la cámara y un globo de prueba colocado cerca aparece en su dirección. |
| RF-02 | Colocar un globo crea una entrada en `argps.v1` con lat/lng/alt correctos y el editor guarda nombre/nota/icono/color. |
| RF-03 | Dos globos a 10 m entre sí se ven a esa distancia real; un globo al norte aparece apuntando al norte (brújula estimada). |
| RF-04 | Editar modifica y re-renderiza; eliminar pide confirmación y borra. |
| RF-05 | Re-anclar recoloca todos los globos según el nuevo origen sin duplicarlos. |
| RF-06 | Exportar produce un JSON importable; importar reemplaza/mezcla sin romper el formato. |
| RF-07 | En escritorio se orbita la escena y se pueden crear/editar globos. |

---

## 8. Riesgos y mitigación

| Riesgo | Mitigación |
|---|---|
| GPS impreciso en interiores | Mensaje de "precisión baja" si `accuracy > 20 m`; botón re-anclar. |
| Brújula descalibrada | Sugerir calibración; el usuario puede rotar el mundo con botones ±1° (opcional). |
| Deriva SLAM en caminatas largas | Re-anclar origen frecuente; globos a distancias cortas (campus). |
| Sin señal / permisos denegados | No iniciar AR, mostrar instrucciones. |
| WebXR no soportado | Fallback 3D de escritorio y mensajes claros. |

---

## 9. Roadmap por sprints

### Sprint 1 — "El globo aparece donde lo dejé" (en curso)
Validar el ciclo básico real (GPS + brújula + WebXR) con el mínimo de UI.

- [x] **T1** Infraestructura y esqueleto (`servir.ps1`, `index.html`, `style.css`, `app.js`, `package.json`, `.gitignore`).
- [x] **T2** RF-01: iniciar AR fijando el GPS actual como origen; avisos de permisos/`accuracy > 20 m`/sin señal.
- [x] **T3** RF-02 (mínimo): "📍 Dejar globo aquí" (botón o toque en pantalla) → editor solo con nombre; icono 🎈 y color por defecto; globo a 1.6 m de altura.
- [x] **T4** RF-03 (core): `geo.js` con haversine/`deltaMeters`/rumbo; globos posicionados por delta real relativo al origen; alineación con brújula vía `pivot.rotation.y` + botones de calibración ±1°.
- [x] **T5** Persistencia `localStorage` (`argps.v1`) + exportar/importar JSON.
- [x] **T6** Tests de `geo.js` (Node, `npm test`): 15 casos, todos pasando.
- [ ] **T7** Validación manual en celular (checklist abajo) y ajuste fino de la fórmula de brújula.

**Fuera del Sprint 1:** editor completo, lista con distancias/editar/borrar (RF-04), re-anclar (RF-05), modo 3D escritorio (RF-07).

### Checklist de validación (Sprint 1)
- [ ] `.\servir.ps1 -Tunnel` y abrir la URL HTTPS en el celular.
- [ ] Sin permiso de ubicación → no se colocan globos y se avisa.
- [ ] Precisiones `> 20 m` → aviso visible.
- [ ] Colocar 1 globo, caminar 10–20 m, volver → globo ~en su lugar (tol. 10 m).
- [ ] Colocar 3 globos a distancias distintas → separación correlativa.
- [ ] Alineación con brújula aceptable (o corregible con ⟲/⟳).
- [ ] Cerrar y reabrir la app → los globos reaparecen.
- [ ] Exportar/importar JSON intercambia globos sin romper formato.

### Sprint 2 — Gestión completa
- RF-04 lista de globos (nombre, icono, distancia aprox.) con editar/borrar/borrar todo.
- RF-02 editor completo: nota, icono (emoji), paleta de color, altura configurable.
- RF-05 re-anclar origen a la posición actual.
- RF-07 modo 3D de escritorio (OrbitControls).

### Sprint 3 — Ajuste de precisión y pulido
- Pruebas de campo realistas, calibración de brújula por dispositivo, tolerancias.
- Opcionales: navegación por flecha, filtros por cercanía (fuera de alcance v1).