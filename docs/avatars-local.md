# Fotos de perfil · lectura y caché privada

Las fotos se consultan manualmente para la cuenta vinculada o identificadores de contactos y grupos ya conocidos por la instalación. No se exploran números arbitrarios ni se ejecutan barridos automáticos de la agenda. La consulta respeta lo que WhatsApp expone a la sesión.

El worker utiliza `profilePictureUrl` de la versión fijada de Baileys. Esa función consulta `w:profile:picture` y conserva el tratamiento de privacidad propio de Baileys; no se sustituyen sus tokens de privacidad. Una URL ausente o un timeout no prueban que una persona carezca de foto.

La URL del proveedor es temporal. No se guarda en SQLite, no se envía al navegador ni se imprime en registros. El worker descarga únicamente desde hosts HTTPS de WhatsApp expresamente permitidos, con DNS público fijado, sin redirecciones y con límites de tamaño y tiempo. El archivo se guarda en `.local/avatars` y se sirve por una ruta autenticada ligada al identificador conocido, nunca mediante una ruta de archivo arbitraria.

El host `pps.whatsapp.net` está descrito como origen de fotografías del CDN de Meta en la [investigación técnica publicada por SBA Research](https://publications.sba-research.org/publications/Hey_there_You_are_using_WhatsApp_NDSS_extende_Gabriel%20Gegenhuber.pdf). La implementación mantiene una lista exacta, sin aceptar subdominios nuevos automáticamente. La respuesta real debe superar además controles de formato antes de registrarse como imagen disponible.

La caché puede quedar desactualizada después de un cambio de foto o de privacidad en WhatsApp. Se muestra su fecha y se conserva el estado del último intento. Un fallo de actualización no se presenta como una foto recién comprobada. La carpeta participa en el respaldo integral de `.local`, protegido por las mismas ACL que el resto de los datos privados. No incluir las imágenes en Git ni en reportes de QA.

Consultar una foto no modifica el perfil, no marca mensajes como leídos y no envía mensajes al contacto. No se implementa edición de fotos en este incremento.

## Validación de esta instalación

El 27/09/2026 se solicitó desde Chrome únicamente la foto de la cuenta vinculada. El worker obtuvo la imagen y el navegador confirmó un archivo local cargado de 96 × 96 píxeles mediante la ruta autenticada. No se guardó una captura ni se incluyó la URL temporal en informes. Las consultas de fotos de terceros y grupos se validaron con transportes simulados, sin barrido real.

La suite local y QA completó 40 pruebas aprobadas; la revisión independiente cubrió destinos parecidos, mezcla de DNS público/privado, pérdida de autorización, permisos, formato y rutas. El reinicio conservó la sesión y el contador de operaciones salientes permaneció en cero.
