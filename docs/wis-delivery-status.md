# Estado de entrega WIS WhatsApp

Actualizado: **2026-09-30**. Estado integral: **PARCIAL**. El panel está desplegado en EasyPanel y la sesión de WhatsApp figura conectada con identidad verificada. El sistema está operativo para consulta y administración; no se declara paridad completa con WHAPI.

## Verificado en producción

- URL: `https://wis-whatsapp-wis.xbgh9n.easypanel.host/`.
- El panel reportó `Conectado · identidad verificada`; el estado local de autenticación se actualizó el 30/9/2026 a las 09:57 (hora de Buenos Aires). No se guardan el teléfono completo, QR ni credenciales en este informe.
- Conteos visibles en el resumen tras la nueva implementación: 864 contactos, 567 conversaciones, 1.512 mensajes y 18 grupos. La interfaz excluye contenido de conversaciones y datos personales de ese resumen. Los mensajes pasaron de 1.462 a 1.512 durante la observación; no se infiere su dirección por ese conteo.
- El snapshot más reciente se escribió el 30/9/2026 a las 10:15; el panel muestra 378 campos, 27 tipos de datos y 28 lecturas fallidas registradas. El recolector indica que está dentro del intervalo y su próxima ruta es Catálogo comercial.
- Una consulta manual de solo lectura al catálogo terminó con `read_timeout` (408). La respuesta guardada continúa identificada como catálogo público; el timeout de la alternativa Baileys no demuestra que el catálogo privado esté vacío. La pantalla de productos ahora debe mostrar por separado alcance, origen y resultado del último intento.
- La recepción entrante más reciente que muestra el panel es del 28/9/2026 a las 16:32. No se usa ese evento anterior para afirmar que hubo un mensaje después de la reconexión del 30/9.
- El historial completo anterior a la vinculación no está garantizado. El panel distingue hora de escritura de snapshot de hora de observación de cada campo.
- Envíos salientes y dispatcher de webhooks siguen desactivados en la imagen Docker. La vinculación y las lecturas no envían mensajes.
- Pruebas: `npm test`, compilación/verificación estática de JavaScript y `git diff --check` pasaron en esta revisión.

## Brechas abiertas

- El inventario público de WHAPI contiene 182 métodos. La matriz WIS registra 61 parciales, 120 pendientes y 1 no soportado; ninguno está certificado como equivalente completo. Esto es una brecha funcional explícita, no una métrica de disponibilidad de la cuenta.
- No hay evidencia suficiente para prometer cobertura de llamadas, recuperación total de historial, estados históricos, administración de catálogo, todas las funciones Business, ni contrato intercambiable con WHAPI.
- El estado conectado solo confirma sesión e identidad. La ausencia de un mensaje posterior a la reconexión no se toma como prueba de recepción en vivo.
- La lectura privada del catálogo sigue sin respuesta verificable por timeout; no se infiere que falten productos ni que no exista un catálogo Business.
- La prueba productiva de recepción requiere que llegue un mensaje legítimo a la línea; los envíos de prueba continúan deshabilitados.
- Python y n8n tienen contratos HTTP documentados, pero aún necesitan integración y aceptación en las instancias reales del usuario. Sus workflows de ejemplo no están activados.

## Próximos pasos

1. Mantener el servicio actual y verificar recepción cuando llegue actividad normal, sin enviar mensajes de prueba.
2. Priorizar el catálogo por lecturas seguras que Baileys exponga con correlación verificable; registrar estado, datos disponibles, límites y pruebas por método.
3. Cerrar primero lectura de capacidades para administración y APIs. Mantener bloqueadas las funciones de escritura hasta revisión y aprobación específica.
4. Revisar y corregir cualquier error de lectura persistente en el panel antes de habilitar nuevas consultas de cuenta.
5. Validar los ejemplos de Python y n8n en entornos de prueba y documentar credenciales y permisos sin almacenarlos en Git.

Referencias: [matriz de campos WHAPI](whapi-reference-fields.md), [cobertura de datos](data-coverage.md), [manual de SQLite](sqlite-local.md), [despliegue EasyPanel](easypanel.md).
