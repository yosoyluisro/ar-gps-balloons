# 🎈 AR Balloons

Deja **etiquetas flotantes en Realidad Aumentada**, ancladas a **superficies reales** (mesa,
pared, piso, electrodomésticos…). Toca el objeto que quieras etiquetar, escribe su nombre y
queda fijo en ese lugar flotando a poca altura.

- **Sin cuentas, sin nube, sin API keys, sin costo**: 100 % web, nada de backend.
- **Vanilla JS + Three.js (CDN) + WebXR**: las etiquetas se anclan al mundo real con
  *hit-test* de superficie (se detectan con la cámara del celular).
- Los globos viven **solo durante la sesión**: al cerrar la app se pierden (sin persistencia).

> ⚠️ La calidad de la anclación depende del *hit-test* del dispositivo (ARCore en Android,
> ARKit en iPhone): necesita una superficie detectable e iluminación decente. No se usa
> ARCore Geospatial ni anclas persistentes.

## Requisitos del celular

- **Android**: Chrome reciente + **ARCore** instalado.
- **iPhone**: Safari 17+ con ARKit.
- WebXR (AR) solo funciona por **HTTPS** y con cámara trasera.

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

1. **▶ Comenzar Realidad Aumentada** → se pide permiso de cámara y se abre la sesión WebXR.
2. Toca una superficie en pantalla (o pulsa) → se coloca un globo con el retículo de anclaje.
3. Escribe el nombre en el cuadro → el globo queda fijo en ese lugar, con su etiqueta flotando.
4. Repite para dejar todas las etiquetas que quieras; sal y vuelve a entrar para recargar.

> Los nombres por defecto son `Globo 1`, `Globo 2`, … y el contador se reinicia en cada sesión.

## Estructura

```
REQUERIMIENTOS.md   # especificación técnica del estado actual
app.js              # lógica principal (Three.js + WebXR + hit-test + etiquetas)
index.html          # interfaz
style.css           # estilos
servir.ps1          # servidor local + túnel HTTPS
.github/workflows/  # deploy de GitHub Pages
```

## Algunos detalles

- El pinneado es de tipo "world-locked": que no se pierda con el movimiento lo decide el
  *hit-test* del dispositivo (sin anclas WebXR persistentes, se usa `local` reference space).
- La altura de la etiqueta sobre la superficie y la separación con el globo están fijadas en
  `app.js` (`FLOAT_ABOVE`, `LABEL_GAP`, `LABEL_H`).
- No hay guardado: al cerrar la pestaña las etiquetas desaparecen.