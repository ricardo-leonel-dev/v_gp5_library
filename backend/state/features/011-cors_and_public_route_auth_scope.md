---
feature_number: 11
name: cors_and_public_route_auth_scope
title: Fix CORS + alcance del middleware de auth en rutas públicas
status: done
created_at: 2026-09-26T06:57:42.000Z
updated_at: 2026-09-26T07:27:57.000Z
---

## Description
El backend no tiene middleware CORS, así que el frontend Angular (otro origen, ej. http://localhost:4200) no puede llamarlo desde el navegador: el preflight OPTIONS a rutas públicas como /auth/register y /auth/login devuelve 401 "Token required", porque requireAuth se monta como middleware global en protectedRouter (app.route('/', protectedRouter)) y su .use('*', requireAuth) intercepta cualquier método en cualquier path bajo '/', incluyendo OPTIONS en rutas que no son protegidas. Agregar middleware hono/cors global (antes del mount de protectedRouter) para que el preflight OPTIONS se maneje de forma uniforme y los headers Access-Control-* se seteen correctamente tanto en rutas públicas como protegidas, con orígenes permitidos configurables por stage (frontend dev server http://localhost:4200 para dev, siguiendo el patrón stage-aware de la feature 10).

## Acceptance
- [ ] OPTIONS preflight a cualquier ruta (pública o protegida) devuelve respuesta CORS-compliant (204/200 con Access-Control-Allow-Origin/-Methods/-Headers) y nunca 401, para un origen permitido
- [ ] POST /auth/register y /auth/login reales desde un origen permitido (ej. http://localhost:4200) responden con Access-Control-Allow-Origin reflejando el origin real (no wildcard, porque se usa header Authorization en otras rutas)
- [ ] Rutas protegidas siguen exigiendo Bearer token válido en requests no-OPTIONS; comportamiento de auth existente sin cambios
- [ ] Origen(es) permitidos configurables por stage (stages.json/env var), default http://localhost:4200 en dev
- [ ] Tests cubren: preflight en ruta pública, preflight en ruta protegida, headers en request real cross-origin, y que rutas protegidas sigan rechazando token faltante/inválido en requests no-OPTIONS
