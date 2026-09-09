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

Realidad Aumentada pura: dejas **globos de ubicación** (puntos flotantes con nombre, icono, color y altura) **100% estáticos** con la cámara. **Sin GPS, sin mapa 2D, sin rutas y sin detectar superficies**: el globo queda clavado a 2 m hacia donde mires en el momento del toque (posición de la cámara del WebXR, no se mide el entorno).

URL: `https://yosoyluisro.github.io/air-draw/mapa/`

## Cómo se usa

1. **📷 Iniciar RA**: se abre la cámara. Cada sesión comienza con el origen en el punto donde estás parado (espacio `local-floor`).
2. **Agregar globo**: toca la pantalla donde quieras que flote (aparece el punto de mira en el centro; el globo se deja a 2 m en esa dirección) o pulsa **📍 Punto aquí** → **✔ Fijar**. Luego el editor (nombre, nota, color, icono, altura). El globo queda **fijo** en el aire, no usa el entorno.
3. **Toca un globo** → tarjeta:
   - **✋ Ajustar**: arrastra el globo en el plano horizontal para dejarlo exacto y pulsa **🔒 Fijar**; ▲/▼ cambian su altura.
   - **◉ Anclar aquí** (si al volver no coincide con el lugar real): apunta hacia donde debe estar y pulsa **✔ Fijar** (o toca la pantalla) → todos los globos se trasladan con esa referencia. Usa **⟲ −1°/ +1° ⟳** para afinar la orientación.
   - **Editar** / **Borrar**.
4. **🗑️** borra todos los globos. **⤓ / ⤒** exporta/importa la escena (respaldo JSON).

## Precisión (honestidad técnica)

- Los globos son **poses de cámara**: quedan clavados a la posición donde la cámara estaba al tocar (más 2 m de distancia de reposo) y **nunca se mueven solos** dentro de la sesión (SLAM solo estabiliza la escena). En caminatas largas, si el SLAM deriva, ajusta con `✋ Ajustar`.
- **Entre días** no existe posición absoluta gratis (requeriría ARCore Geospatial o marcadores físicos/QR): **empieza la sesión parado en el mismo sitio** y los globos reaparecen donde los dejaste; si no, **◉ Anclar aquí** los recoloca con un gesto.

## Datos

Guardados en `localStorage` (`airmap.v2`): globos con `{id, name, note, icon, color, alt, rel:{x,y,z}}`. `rel` es la posición flotante **relativa al origen de la sesión** — nunca hay coordenadas GPS ni posiciones de superficie.