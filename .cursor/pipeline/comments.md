# Comentarios que escribís vos (pipeline Hermes)

Pensado para **no programadores**. Usá el cuadro de comentario del **hilo del PR** (la propuesta de cambio), abajo de todo. No hace falta comentar sobre una línea de código.

## Antes de comentar

1. Leé la sección **“En 3 líneas”** del PR (si el agent cumplió con la plantilla).
2. Mirá las **decisiones de negocio** numeradas (1, 2, 3…). Cada una debería tener opción A y B en español claro.
3. Elegí con las palabras mágicas de abajo (mayúsculas).

---

## `APROBADO` — “Dale, construí con estas reglas”

Significa: **acepto el plan** (o el plan + las opciones que marqué) y **podés pasar a construir**.

### Si hay decisiones abiertas

En el **mismo** comentario:

```text
APROBADO
DECISIONES
1A
2B
3A
```

- `1A` = en la decisión 1 elijo la opción A  
- Cambiá las letras a lo que **vos** quieras  

### Si el plan no pide ninguna decisión

```text
APROBADO
```

### Qué pasa después (sin jerga)

El ayudante de IA debería **armar el cambio real** y dejarte otra propuesta lista. Después **vos** decidís si va a la versión oficial (merge). No mergea solo.

---

## `REHACER` — “El plan no me gusta; rearmalo”

```text
REHACER
Escribí en español simple. No quiero tocar los precios. Solo el listado de pacientes.
```

Debajo de `REHACER` podés escribir con tus palabras: qué falta, qué sobra, qué no entendiste.

**No** debería empezar a programar features: **solo** rehacer el plan.

---

## `DECISIONES` — “Eligo entre A y B sin ambigüedad”

Cuando el plan te pregunta cosas de negocio (¿opción A o B?).

```text
DECISIONES
1A
2B
```

Podés mandarlo **solo**, o **junto** con `APROBADO` (recomendado cuando ya querés que construya).

### Importante

Si el agent “recomienda” la A pero **vos no escribís** `DECISIONES`, **no** debe asumir y construir. Tiene que frenar y pedirte que elijas.

---

## Cosas que **no** cuentan como aprobación

| Escribís… | ¿Sirve? |
| --- | --- |
| ok / dale / lgtm / 👍 | No |
| Solo mergear el draft del plan | No (eso no es el mando “construí”) |
| Un emoji | No |

Tiene que figurar la palabra **`APROBADO`**, **`REHACER`** o **`DECISIONES`** en su propia línea.

---

## ¿Dónde me enteró de que hay plan?

Notificaciones de **GitHub** (mail o la campanita en github.com), o el link al PR que te mande el agent / el chat.

Si el agent no pudo etiquetar el ticket por permisos, igualmente el **PR** es la propuesta a revisar.

---

## ¿Y si no entiendo el PR?

Contestá con `REHACER` y pedí: *“Reescribí todo en español simple, con ‘En 3 líneas’ y sin jerga.”*  
Desde las plantillas del Orchestrator, los agents deberían hacerlo así desde el primer mensaje.
