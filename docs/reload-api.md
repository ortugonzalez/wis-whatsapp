# Actualizar la API sin reconectar WhatsApp

Para cargar cambios del servidor local:

```powershell
rtk npm run local:reload-api
```

El supervisor conserva el proceso del worker y cierra únicamente el servidor HTTP. Espera su salida antes de iniciar el reemplazo, y confirma el resultado cuando el nuevo servidor informa que está escuchando. Durante ese intervalo breve el panel puede reintentar sus lecturas; la conexión de WhatsApp sigue en el mismo proceso.

El comando no carga cambios de `worker.mjs` ni de sus dependencias. Para ellos sigue siendo necesario detener e iniciar la instalación de forma ordenada. Los archivos estáticos del panel pueden actualizarse con una recarga de Chrome.

Las solicitudes se identifican individualmente para no aceptar confirmaciones anteriores. No se interpreta el simple inicio de un proceso como disponibilidad de la API. La recarga no ejecuta consultas, mensajes ni cambios de cuenta.

Si el servidor no cierra o no confirma disponibilidad dentro del plazo, el supervisor detiene la instalación de forma ordenada y la recarga informa un fallo. No reinicia procesos en un ciclo ilimitado. La conservación del worker se garantiza para una recarga completada correctamente, no para fallos que obligan a detener el servicio.

Validación del 27 de septiembre de 2026: 51 pruebas locales aprobadas, incluida una integración aislada de arranque, bloqueo contra supervisores duplicados, recarga mediante CLI y apagado. Revisión independiente del supervisor: 6/6 pruebas aprobadas. En la instalación real se confirmó el mismo supervisor y worker, un servidor nuevo, salida del servidor anterior y estado `ready`; el dashboard volvió a cargar en Chrome. Fue necesario un único reinicio ordenado inicial para instalar este supervisor.
