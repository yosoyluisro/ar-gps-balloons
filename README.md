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