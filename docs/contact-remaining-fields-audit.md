# Cinco brechas del contacto — 2026-10-03 06:07 UTC

Frente 2: comparación semántica con el catálogo versionado, sin nuevas lecturas
de WhatsApp. EasyPanel conserva Success del despliegue `4b5ffae`. Chrome muestra
lease vigente, conexión verificada, última escritura de snapshot a las 03:04
America/Buenos_Aires. Último entrante almacenado con origen live conserva fecha
2/10 12:06; ninguna de estas señales acredita recepción reciente.

## Referencia y evidencia

`public/whapi-fields.json` enumera diez campos de respuesta 200 de `getContact`.
La vista productiva conserva cinco observados por equivalencia y cinco sin
equivalencia revisada. El catálogo visto antes de navegar conservaba 979 contactos;
el inventario de snapshots posteriormente mostró 980. Son observaciones tomadas
en momentos distintos, no una discrepancia reconciliada ni una prueba de mensaje
nuevo. No se calcularon porcentajes combinando ambos denominadores.

| Campo pendiente | Fuente local inspeccionada | Decisión |
| --- | --- | --- |
| is_business | contactKeys conserva verifiedName, no un booleano de negocio | Un nombre verificado no demuestra una clasificación exhaustiva. No inferir false si falta. |
| profile_pic | avatar.filename: 14 registros con texto entre 22 snapshots | El nombre de archivo privado no es una URL de imagen ni prueba existencia actual del archivo. No crear alias directo. |
| profile_pic_full | worker solicita profilePictureUrl con tipo preview | No hay evidencia de imagen completa. No mapear la miniatura a esta variable. |
| phonebook | contactos observados y nombres disponibles | La presencia en snapshots no prueba pertenencia actual a la libreta. No inferir true. |
| saved | contacto persistido en SQLite | Persistencia local no prueba el significado de guardado en WhatsApp. Sin equivalencia demostrada. |

En producción: avatar.available y avatar.stale existen en 22 registros, pero
esta tabla cuenta presencia de campos, no valores booleanos verdaderos/falsos.
No equivale a 22 fotos disponibles. avatar.filename figura en 14 registros;
última escritura de ese campo 2/10 21:11 BA. Último intento agregado de avatar
3/10 00:42 BA y ocho fallos registrados provider_error. No se reintentaron.

`local/server.mjs` verifica ruta privada, existencia, tamaño y coherencia entre
extensión y MIME declarado antes de exponer metadata/content_url autenticado.
La firma real de los bytes se comprueba con mediaMatches al solicitar contenido;
la metadata por sí sola no prueba el MIME real. El inventario genérico de snapshots
no ejecuta esas comprobaciones. `local/worker.mjs` admite contactos, grupos y perfil
propio como destinos de avatar; contar todos los snapshots avatar como fotos de
contactos sería otra sobreestimación.

## Próxima ruta

Frente 4: agregar un resumen agregado de fotos de contactos que distinga
archivo verificado, snapshot sin archivo, obsoleto y no recolectado, reutilizando
la validación existente sin publicar rutas, URLs, destinos ni contenido. Probar
con archivos sintéticos válidos/ausentes y excluir grupos antes de considerar
una equivalencia semántica. No solicitar más fotos ni alterar programación.

Sin cambio de cobertura, despliegue, sesión o permisos en esta ejecución. La
referencia versionada define tipos, pero no contiene descripción suficiente
para cerrar el significado de phonebook/saved; revisar fuente oficial antes de
implementar su equivalencia. No se afirma paridad WHAPI.

QA independiente detectó y se corrigió la distinción entre MIME declarado y
firma real del archivo. Inspección de procesos locales: cero Node con
local/worker.mjs en su comando; el lease productivo se obtuvo del panel, no de
esa inspección local. Sin pruebas ejecutadas: solo documentación e inspección.
