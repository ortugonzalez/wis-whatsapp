# Detalles comerciales guardados

Las consultas `/api/v1/products?id=ID` y `/api/v1/collections?id=ID` resuelven el identificador exacto del registro local. Antes el parámetro se ignoraba y se devolvía la lista. Un ID vacío es un error; un registro ausente devuelve 404 sin consultar WhatsApp.

`/api/v1/collection-products?collection_id=ID` pagina únicamente los productos anidados recibidos en esa colección. No vincula productos por nombre ni presupone que una colección contiene todo el catálogo. Si los productos no fueron recopilados, debe indicarlo aunque exista un arreglo vacío. La paginación local no recupera páginas remotas.

El panel obtiene el detalle actualizado al abrirlo. La disponibilidad y antigüedad dependen del registro y del resultado de la consulta comercial correspondiente a su propietario. Una actualización fallida no vuelve actuales los datos anteriores. No se descargan imágenes, no se editan productos y no se realizan pedidos.

Python admite `detail('products', id)`, `detail('collections', id)` e `iter_records('collection-products', collection_id=id)`. Los IDs propios de WIS incluyen el propietario y no son intercambiables con los IDs del contrato de WHAPI.

Referencias consultadas el 2026-09-27: https://whapi.readme.io/reference/getproduct y https://whapi.readme.io/reference/getcollectionproductlist . La cobertura es parcial: datos persistidos, sin equivalencia completa ni administración del catálogo privado.

La base real no contenía productos ni colecciones al implementar esta mejora. La comprobación usa fixtures aislados; no acredita recuperación real de esos objetos desde esta cuenta.
