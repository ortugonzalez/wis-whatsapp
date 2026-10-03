# Selector de asociaciones

2026-10-03, ejecución 02:37 UTC. Ruta 4: selector Chat/Mensajes en Etiquetas → Asociaciones. La API conserva Chat como valor predeterminado; la pantalla solicita el tipo elegido y reinicia la paginación. Presenta referencias observadas, no mensajes completos ni inventario completo de WHAPI.

Cada carga tiene una versión: respuestas anteriores no sobrescriben la selección actual. QA detectó que la tabla anterior podía persistir al fallar una nueva selección. Se corrigió limpiando los resultados, mostrando carga y deshabilitando paginación; el fallo vigente muestra un error genérico sin datos privados. El siguiente refresco puede recuperar la vista. Revisión independiente posterior: PASS, 1/1 regresión.

Prueba de interfaz mediante VM: selección, paginación, respuestas fuera de orden, fallo y ausencia de detalles privados. Pruebas focales de interfaz y matriz: 22/22 PASS. La comprobación estática anterior que fijaba el texto solo para chat se actualizó para ambos tipos. No se afirma validación visual productiva del selector: aún no está desplegado.

Estado productivo leído: HTTP 200, connected y error nulo; Chrome muestra Etiquetas sin filas y datos no recopilados. EasyPanel conserva el despliegue anterior. Esto no demuestra recepción reciente. No se reinició el worker ni se solicitaron nuevas lecturas de WhatsApp.

Suite completa final: 300/300 PASS. Diff sin errores de formato.

Próxima ruta: integrar el paquete revisado, comprobar ausencia de operaciones en curso antes de desplegar y verificar selector, sesión y cobertura en la instancia productiva. Mantener diferencias entre pruebas simuladas y datos observados; no afirmar paridad WHAPI ni recuperación completa.
