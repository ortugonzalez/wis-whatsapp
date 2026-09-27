# Comunidades y solicitudes de ingreso: consultas

Las consultas se limitan a grupos y comunidades ya conocidos por la sesión. El administrador puede solicitar una actualización de lectura; los clientes con permiso `read` consultan los resultados persistidos. Consultar no aprueba ni rechaza solicitudes, no incorpora participantes y no crea enlaces de invitación.

Baileys 7.0.0-rc14 expone lecturas de subgrupos y solicitudes, pero sus parsers pueden devolver una lista vacía ante un contenedor ausente. WIS valida la respuesta IQ y el contenedor esperado antes de aceptar un resultado vacío. Una respuesta ausente, inválida o vencida se conserva como fallo, no como prueba de que no haya elementos.

La disponibilidad depende de la pertenencia a la comunidad, los permisos de la cuenta y la respuesta de WhatsApp. Los datos corresponden a la última consulta; no constituyen una garantía de completitud histórica. Los códigos de invitación y otros campos no permitidos se excluyen del contrato.

Validación 2026-09-27: 38 pruebas locales y 13 de QA aprobadas, revisión independiente y build válido. En Chrome se consultaron las solicitudes de un grupo conocido: WhatsApp devolvió un error y el panel mostró información no expuesta, sin convertirlo en una lista vacía. No se aprobaron ni rechazaron solicitudes. La lectura de subgrupos se validó con fixtures; no se declara comprobada con una comunidad real en esta instalación.
