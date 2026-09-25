# ADR 002 — Profiles allowlist con user_id nullable

## Context

El contrato pedía `profiles` 1:1 con `auth.users` y allowlist pre-cargada por el admin. Google OAuth asigna el `auth.users.id` solo en el primer login, así que no se puede pre-insertar la PK como FK a Auth.

## Decision

- `profiles.id` = PK estable del CRM.
- `profiles.user_id` nullable → `auth.users(id)`; lo setea `link_my_profile()` en el callback OAuth si email + `is_active`.
- Email no allowlisted: sign-out + intento de `auth.admin.deleteUser` (service_role server-only).

## Consequences

- S8 CRUD opera sobre filas de email sin exigir Auth previo.
- Políticas RLS usan `user_id = auth.uid()` vía `is_active_member()` / `is_admin()`.
- Contrato (`architecture.md`) actualizado para reflejar `user_id`.
