# ✒️ Dibuja en el Aire — Galería AR 3D

Dibuja trazos flotantes en el aire (estilo filtro de TikTok) manteniendo el dedo presionado sobre la cámara, guárdalos y vuelve a verlos flotando en una galería de Realidad Aumentada.

Archivos: `index.html`, `style.css`, `app.js` (sin dependencias locales: Three.js vía CDN).

## Requisitos del celular

- **Android**: Chrome reciente con **ARCore** instalado.
- **iPhone**: Safari 17+ con ARKit.

El modo AR (**WebXR**) solo funciona por **HTTPS**.

## Arrancar el servidor

En PowerShell, dentro de esta carpeta:

```powershell
.\servir.ps1 -Tunnel
```

Copia la URL `https://xxx.trycloudflare.com` que imprime y ábrela en el celular. No hace falta instalar nada en el teléfono: es un túnel HTTPS público hacia tu PC.

> Opción local (misma red WiFi, sin Cloudflare): `.\servir.ps1` sirve `http://<IP>:8080`. Sirve solo para ver el modo **3D (escritorio)**, no el AR con cámara (requiere HTTPS).

## Cómo usar

1. **Comenzar AR**: botón "▶ Comenzar Realidad Aumentada". Permite el permiso de cámara.
2. **Dibujar**: toca y mantén el dedo; mueve el dedo para trazar en el aire. Al soltar se cierra el trazo.
3. **Paleta**: cambia el color antes de cada trazo.
4. **Guardar**: 💾 Guardar → nombre → aparece en la galería.
5. **Galería**: botón 🖼 → cada tarjeta con "Ver en AR" (posiciona ese dibujo o los todos frente a ti y camina alrededor) y "Eliminar".
6. En escritorio: "Probar en 3D" permite orbitar y dibujar con mouse (rueda = profundidad, botón ✏️ ON/OFF).
7. **Respaldo**: ⤓ exporta `dibujos_aire.json`, ⤒ importa.

## Dónde se guardan los dibujos

En `localStorage` de tu navegador (clave `airdraw.v1`), como coordenadas mundiales `[x, y, z]` de cada trazo. Se pierden si borras datos del navegador → usa Exportar para respaldar.

Nota: el AR ancla los dibujos al punto donde iniciaste la sesión (`local` reference space). Para que la galería quede fija en el mismo lugar, inicia la sesión parado en el mismo punto.

---

# 🗺️ Nivel 2 — Mapa Campus AR (`mapa/`)

Mapa interactivo con Realidad Aumentada: en vez de dibujar, dejas **globos de ubicación** (waypoints con nombre, icono, color y altitud) en **coordenadas GPS reales**, los conectas en **rutas** (trazadas tocando los globos en orden) y al volver los encuentras en su sitio con RA, incluyendo subidas y bajadas.

URL: `https://yosoyluisro.github.io/air-draw/mapa/`

## Cómo se usa

1. **Mapa 2D** (edita sin salir): ves todo el campus, arrastra para mover, rueda para zoom.
   - `➕ Global` → toca el mapa (o "toca el globo" en tu ubicación con `📍 Global aquí` en RA) para crear un globo; se abre el editor (nombre, nota, color, icono, altitud).
   - `🧭 Rutas` → `Nueva` → toca los globos en orden → `Finalizar` y ponle nombre.
   - `◉ Origen` fija el punto base (con GPS o centro de la vista).
   - `🛰️ Demo GPS` simula tu posición (útil para probar sin salir).
   - `⤓ / ⤒` exporta/importa respaldo JSON.
2. **RA** (`▶ Comenzar RA`): camina; los globos flotan en su sitio real (etiquetas + varilla al suelo que marca la altura). Tocar un globo muestra su nota y distancia. `🧭 Calibrar` alinea la rotación con la brújula (`Alinear con brújula`, `±1°`) y permite fijar el origen en tu posición.

## Precisión (honestidad técnica)

- Horizontales: GPS `±3–15 m`; con calibración de rumbo `~2–5 m`.
- Vertical (altitud): GPS/barómetro `±2–8 m`; por globo puedes corregirla a mano en el editor.
- Exactitud al centímetro gratis en Android+iOS no existe: requiere ARCore Geospatial (solo Android) o marcadores físicos (QR).

## Datos

Guardados en `localStorage` (`airmap.v1`): globos con `{id, name, lat, lng, alt, icon, color, note}` y rutas con `{id, name, color, pointIds[]}`. Los globos preservan su posición entre días porque se guardan sus coordenadas geográficas reales, no las relativas a una sesión.