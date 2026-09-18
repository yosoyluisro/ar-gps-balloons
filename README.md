# 🎈 AR GPS Balloons

Deja **globos informativos flotando en Realidad Aumentada**, anclados a tu **posición GPS real**.
Colocas un globo (nombre, icono, color, nota) en el lugar donde estás; al volver al mismo sitio,
los globos aparecen donde los dejaste, en su ubicación geográfica.

- **Sin cuentas, sin nube, sin API keys, sin costo**: todo queda en tu navegador y sale en un JSON de respaldo.
- **100 % web**: Vanilla JS + Three.js (CDN) + WebXR. Nada que instalar en el celular.

> ⚠️ La **precisión es la del GPS del celular (~5–10 m)** y la alineación con la brújula se puede
> calibrar manualmente (±1°). No se usa ARCore Geospatial: esto es una app **gratuita**, no de
> posicionamiento milimétrico. Detalles en `REQUERIMIENTOS.md`.

## Requisitos del celular

- **Android**: Chrome reciente + **ARCore** instalado.
- **iPhone**: Safari 17+ con ARKit.
- WebXR (AR) solo funciona por **HTTPS** y necesita **señal GPS**.

## Arrancar el servidor

En PowerShell, dentro de esta carpeta:

```powershell
.\servir.ps1 -Tunnel
```

Copia la URL `https://xxx.trycloudflare.com` que imprime y ábrela en el celular.
Es un túnel HTTPS público hacia tu PC; no hay que instalar nada en el teléfono.

> Opción local (misma red WiFi, sin Cloudflare): `.\servir.ps1` sirve `http://<IP>:8080`.
> Solo útil para desarrollo, no para AR (requiere HTTPS).

## Cómo usar

1. **▶ Comenzar Realidad Aumentada** → se piden permisos de cámara y de ubicación.
   El origen del mundo queda anclado a tu **GPS actual**.
2. **📍 Dejar globo aquí** (o toca la pantalla) → escribe el nombre → el globo queda fijado
   a tu posición GPS, flotando a 1.6 m.
3. **⟲ / ⟳** rotan el mundo ±1° para calibrar la brújula si algo no apunta bien.
4. **⤓ / ⤒** exportan/importan tu respaldo JSON.

## Estructura

```
REQUERIMIENTOS.md   # especificación técnica y roadmap de sprints
geo.js              # utilidades geográficas puras (haversine, deltas, rumbo)
app.js              # lógica principal (Three.js + WebXR + GPS + brújula)
index.html          # interfaz
style.css           # estilos
servir.ps1          # servidor local + túnel HTTPS
test/geo.test.js    # tests de geo.js (Node, sin dependencias) → npm test
```

## Tests

```powershell
npm test
```

## Roadmap

- **Sprint 1 (hecho)**: ciclo básico — colocar globo en tu GPS actual y verlo reaparecer en AR.
- **Sprint 2**: gestión completa — lista con editar/borrar, editor completo (nota/icono/color/altura), re-anclar origen, modo 3D escritorio.
- **Sprint 3**: calibración de precisión y pulido.

## Honestidad técnica

- El GPS es **aproximado** (~5–10 m). Los globos son **coordenadas geográficas reales**, no poses de cámara.
- La altitud GPS es poco fiable: los globos se muestran a altura fija sobre el origen.
- Entre sesiones, estando en el mismo punto, los globos reaparecen donde se dejaron; si no, "Re-anclar a mi posición" (Sprint 2) los recoloca.
- Los datos viven en `localStorage` (clave `argps.v1`): usa ⤓ para respaldar.