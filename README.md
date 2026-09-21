# AR Balloons

Deja **etiquetas flotantes en Realidad Aumentada**, ancladas a **superficies reales**
(mesa, pared, piso, electrodomesticos). Apunta con la camara a un objeto, deja un globo con
su nombre y queda fijo en ese lugar, flotando a poca altura.

- **Sin cuentas, sin nube, sin API keys, sin costo**: 100% web, nada de backend.
- **Vanilla JS + Three.js (CDN) + WebXR**: las etiquetas se anclan al mundo real con
  *hit-test* de superficie (se detectan con la camara del celular).
- **Persistencia local**: los globos que guardas vuelven a aparecer al volver a entrar
  (se guardan en el almacenamiento del dispositivo, clave `argps.v1`).
- **Dos tipos de globo**: **marcador** (fija un lugar con su nombre) y **way tracker**
  (punto de paso). Con dos marcadores A y B creas un **camino** ("Sala -> Cocina") y lo
  trazas con way trackers; cada camino dibuja su propia linea 3D.
- **Version actual**: v0.11.0

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

1. Elige el modo en la tarjeta inicial (se pide permiso de camara y se abre la sesion WebXR):
   - **Registrar**: coloca marcadores, crea caminos y edita (pasos 2-6).
   - **Ver mapa**: solo mira globos y caminos, sin poder modificar nada (lista de solo lectura).
2. La camara abre a **pantalla completa**; la **reticula** se muestra en el centro sobre la
   superficie detectada. Abajo hay un HUD flotante con los botones.
3. Elige el tipo en el HUD (el boton activo queda resaltado):
   - **Agregar marcador**: fija un lugar. Despues de colocarlo escribe el nombre y pulsa **Aceptar**.
   - **Agregar way tracker**: deja un punto de paso instantaneo (sin nombre) dentro del
     camino que estes editando.
4. Tambien puedes **tocar la pantalla** para colocar el tipo activo en el punto de la reticula.
5. Para crear un camino: abre **Mis globos (N)**, marca dos marcadores con **A** y **B**,
   y pulsa **Crear camino**. Entras en modo edicion (chip "Camino: A -> B" en el HUD):
   cada way que coloques se agrega al final de ese tramo. Pulsa **Salir** para terminar.
6. La lista muestra **Caminos** (nombre, puntos, [Editar], [Eliminar], con sus ways anidados)
   y **Marcadores** (nombre, [A] [B], [Eliminar]). Borrar un extremo A/B elimina el camino
   con sus ways; borrar un punto del medio reconecta la linea.
7. Al volver a entrar, los globos, los caminos y el camino en edicion aparecen de nuevo.

## QR de acceso

La tarjeta de inicio muestra un QR con la URL de la app para abrirla rapido en el celular
(solo aparece cuando se publica en GitHub Pages).

## Checkpoint

Estado estable en la rama `main`.

- **v0.11.0** (checkpoint actual) — modos al inicio: **Registrar** (edicion completa)
  y **Ver mapa** (RA solo-lectura, sin debug ni controles de edicion, lista de solo lectura).
  Sesion WebXR propia sin ARButton; guards de solo-lectura en colocar/crear/borrar.
- **v0.10.0** (`b2e8564`) — caminos A->B: eliges dos marcadores en Mis globos
  y creas un camino ("Sala -> Cocina") que editas con way trackers; una linea 3D por camino,
  chip de camino en edicion en el HUD, lista en secciones Caminos/Marcadores. Persistencia v2
  (globs + caminos en `argps.v1`) con migracion de datos v0.9.0 a "Camino 1". Borrar un extremo
  elimina el camino con sus ways; borrar del medio reconecta.
- **v0.9.0** (`5dcd462`) — dos tipos de globo: **marcador** (fija un lugar con su
  nombre) y **way tracker** (punto de paso sin nombre). El camino se dibuja como una linea
  3D (fat lines) que une los globos en orden de colocacion y se reconecta al borrar. HUD
  con dos botones + tipo activo resaltado (el toque coloca el tipo activo). Migracion de
  globos antiguos a marcadores. Fix: el guard anti-select de v0.8.1 bloqueaba tambien el
  click de los botones del HUD; ahora distingue boton vs select de WebXR.
- **v0.8.1** (`fef5054`) — Fullscreen + HUD sobre la camara, reticula
  siempre visible, boton Agregar globo + input en tarjeta, lista Mis globos con eliminar,
  guard contra select doble al tocar el HUD, persistencia local, debug visual.
- **v0.8.0** (`754655d`) — eliminar globos (lista Mis globos + persistencia).
- **v0.7.0** (`de8445c`) — fullscreen limpio, se elimina el recorte "cuadrado" que rompia
  el render (scissor/offsetRay), HUD flotante funcional.
- **v0.6.4** (`6f1a6e0`) — intento de confinar el render al cuadrado (scissor) — superado.

## Deploy (GitHub Pages)

El workflow `.github/workflows/pages.yml` publica automaticamente el contenido de `main`
en GitHub Pages en cada push.