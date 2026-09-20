# AR Balloons

Deja **etiquetas flotantes en Realidad Aumentada**, ancladas a **superficies reales**
(mesa, pared, piso, electrodomesticos). Apunta con la camara a un objeto, deja un globo con
su nombre y queda fijo en ese lugar, flotando a poca altura.

- **Sin cuentas, sin nube, sin API keys, sin costo**: 100% web, nada de backend.
- **Vanilla JS + Three.js (CDN) + WebXR**: las etiquetas se anclan al mundo real con
  *hit-test* de superficie (se detectan con la camara del celular).
- **Persistencia local**: los globos que guardas vuelven a aparecer al volver a entrar
  (se guardan en el almacenamiento del dispositivo, clave `argps.v1`).
- **Version actual**: v0.8.1

> La calidad del anclaje depende del *hit-test* del dispositivo (ARCore en Android, ARKit
> en iPhone): necesita una superficie detectable e iluminacion decente.
> Nota: en este momento el soporte optimo es **Android Chrome** (el HUD sobre la camara usa
> el modulo WebXR `dom-overlay`, disponible en Chromium).

## Requisitos del celular

- **Android**: Chrome reciente + **ARCore** instalado.
- **iPhone**: Safari 17+ con ARKit (WebXR basico; el HUD sobre la camara puede no mostrarse
  porque Safari no implementa `dom-overlay`).
- WebXR (AR) solo funciona por **HTTPS** y con camara trasera.

## Arrancar el servidor

En PowerShell, dentro de esta carpeta:

```powershell
.\servir.ps1 -Tunnel
```

Copia la URL `https://xxx.trycloudflare.com` que imprime y abrela en el celular.
Es un tunel HTTPS publico hacia tu PC; no hay que instalar nada en el telefono.

> Opcion local (misma red WiFi, sin Cloudflare): `.\servir.ps1` sirve `http://<IP>:8080`.
> Solo util para desarrollo, no para AR (requiere HTTPS).

## Como usar

1. Pulsa **Comenzar Realidad Aumentada** (se pide permiso de camara y se abre la sesion WebXR).
2. La camara abre a **pantalla completa**; la **reticula** se muestra en el centro sobre la
   superficie detectada. Abajo hay un HUD flotante con los botones.
3. Pulsa **Agregar globo** (o toca la pantalla) para dejar el globo en el punto de la reticula.
4. Escribe el nombre en la tarjeta y pulsa **Aceptar**: el globo queda fijo con su etiqueta.
5. Pulsa **Mis globos (N)** para ver la lista; usa **Eliminar** para borrar un globo
   (se quita de la escena y de la persistencia).
6. Al volver a entrar, los globos guardados aparecen de nuevo en su lugar.

## QR de acceso

La tarjeta de inicio muestra un QR con la URL de la app para abrirla rapido en el celular
(solo aparece cuando se publica en GitHub Pages).

## Checkpoint

Estado estable en la rama `main`.

- **v0.8.1** (`fef5054`) — checkpoint actual. Fullscreen + HUD sobre la camara, reticula
  siempre visible, boton Agregar globo + input en tarjeta, lista Mis globos con eliminar,
  guard contra select doble al tocar el HUD, persistencia local, debug visual.
- **v0.8.0** (`754655d`) — eliminar globos (lista Mis globos + persistencia).
- **v0.7.0** (`de8445c`) — fullscreen limpio, se elimina el recorte "cuadrado" que rompia
  el render (scissor/offsetRay), HUD flotante funcional.
- **v0.6.4** (`6f1a6e0`) — intento de confinar el render al cuadrado (scissor) — superado.

## Deploy (GitHub Pages)

El workflow `.github/workflows/pages.yml` publica automaticamente el contenido de `main`
en GitHub Pages en cada push.