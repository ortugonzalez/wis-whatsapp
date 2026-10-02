# Presencia histórica por participante

2026-10-02. Ruta 4: hacer comprensible la información pasiva existente.

El detalle de contacto y conversación reemplaza la presentación genérica de presencia (`Consultado`) por una tabla de observaciones históricas: participante, estado recibido, fecha individual, último valor de conexión del proveedor y contador informado. No convierte lastSeen a una fecha sin verificar unidades. No usa la fecha global de guardado como fecha de todos los participantes.

No se suscribe presencia ni se hacen consultas remotas. Desconocidos y ausencia de registros no se presentan como desconexión. El límite conservado de 512 no demuestra exhaustividad; cuando la API marca truncamiento se muestra un aviso explícito. No cambia permisos, datos ni equivalencias WHAPI.

Prueba focal: fecha individual frente a snapshot posterior, ceros, desconocidos, escape HTML, vacío y truncamiento. Suite completa 284/284 antes del ajuste final de aviso, focal ampliada 1/1 después. Revisión independiente final PASS.

EasyPanel Success 2026-10-02 22:57:05 UTC. Chrome, detalle de contacto: tarjeta con título Presencia observada, etiqueta Registro histórico y aclaración correcta de ausencia de datos. No se encontró una observación real en el contacto inspeccionado; filas con datos siguen validadas mediante fixture. Evidencia de despliegue capturada sin información personal. No se pulsó verificar/actualizar ni se solicitó información nueva a WhatsApp.

Próxima ruta: validar observaciones reales por uso normal, sin provocar eventos; continuar evaluación de campos WHAPI sin acreditar equivalencias por etiquetas traducidas.
