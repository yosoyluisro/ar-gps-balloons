# AR Balloons

Deja **etiquetas flotantes en Realidad Aumentada**, ancladas a **superficies reales**
(mesa, pared, piso, electrodomesticos). Toca el objeto que quieras etiquetar, escribe su
nombre y queda fijo en ese lugar, flotando a poca altura.

- **Sin cuentas, sin nube, sin API keys, sin costo**: 100% web, nada de backend.
- **Vanilla JS + Three.js (CDN) + WebXR**: las etiquetas se anclan al mundo real con
  *hit-test* de superficie (se detectan con la camara del celular).
- **Persistencia local**: los globos que guardas vuelven a aparecer al volver a entrar
  (se guardan en el almacenamiento del dispositivo, clave `argps.v1`).

> La calidad del anclaje depende del *hit-test* del dispositivo (ARCore en Android, ARKit
> en iPhone): necesita una superficie detectable e iluminacion decente.

## Requisitos del celular

- **Android**: Chrome reciente + **ARCore** instalado.
- **iPhone**: Safari 17+ con ARKit.
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
2. La pantalla queda dividida 50/50: arriba la camara, abajo el panel de control.
3. Pulsa **Agregar globo** (panel inferior) para activar la reticula de anclaje.
4. Apunta a una superficie con la camara y toca la pantalla: el globo queda colocado.
5. Escribe el nombre en el panel inferior y pulsa **Aceptar**: el globo queda fijo con su etiqueta.
6. Al volver a entrar, los globos guardados aparecen de nuevo en su lugar.

## QR de acceso

La tarjeta de inicio muestra un QR con la URL de la app para abrirla rapido en el celular
(solo aparece cuando se publica en GitHub Pages).

## Deploy (GitHub Pages)

El workflow `.github/workflows/pages.yml` publica automaticamente el contenido de `main`
en GitHub Pages en cada push.