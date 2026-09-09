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

Realidad Aumentada pura: dejas **globos de ubicación** (puntos flotantes con nombre, icono, color y altura) **clavados al mundo real** con la cámara. **Sin GPS, sin mapa 2D, sin rutas**: el mundo no se mueve nunca solo, cada globo queda pegado a la superficie que apuntes con el centro de la pantalla (SLAM ARCore/ARKit).

URL: `https://yosoyluisro.github.io/air-draw/mapa/`

## Cómo se usa

1. **🅿📷 Iniciar RA**: se abre la cámara. Cada vez que entras la escena la sesión comienza con el origen en el punto donde estás parado.
2. **📍 Punto aquí** → aparece una retícula en el centro. Apunta al lugar exacto y pulsa **✔ Fijar** (o **Poner en piso** si no detecta superficie) → se abre el editor (nombre, nota, color, icono, altura). El globo queda **clavado** a ese punto real.
3. **Toca un globo** → tarjeta:
   - **✋ Ajustar**: arrastra el globo sobre el piso para dejarlo exacto y pulsa **🔒 Fijar**; ▲/▼ cambian su altura.
   - **◉ Anclar aquí** (recuperar posición entre días): apunta con la retícula al lugar físico donde debe estar ese globo y pulsa **✔ Fijar** → todos los puntos se trasladan con esa referencia. Usa **⟲ −1°/ +1° ⟳** en ese modal para afinar la orientación si hace falta.
   - **Editar** / **Borrar**.
4. **⤓ / ⤒** exporta/importa la escena (respaldo JSON).

## Precisión (honestidad técnica)

- **Dentro de una sesión**: los globos quedan clavados a la superficie real con precisión de centímetros (anclaje por SLAM). Si el SLAM deriva en caminatas largas, el ajuste manual `✋ Ajustar` lo corrige en segundos.
- **Entre días** no existe posición absoluta gratis (requeriría ARCore Geospatial o marcadores físicos/QR): **empieza la sesión parado en el mismo sitio** y los globos reaparecen donde los dejaste; si no, **◉ Anclar aquí** los re-coloca con un solo gesto.

## Datos

Guardados en `localStorage` (`airmap.v1`): globos con `{id, name, note, icon, color, alt, rel:{x,y,z}}`. `rel` es la posición flotante **relativa al origen de la sesión** — nunca hay coordenadas GPS. Punto donde apuntes, el globo queda.