# AMOS Fantasy · LaLiga AMOS v2

Dashboard de la liga Fantasy: https://sitoflexi.github.io/fantasy-dashboard/

Pestañas: **Clasificación** (puntos por jornada y evolución), **Pagos** (lo que pone cada uno al bote),
**Jornadas** (detalle de cada jornada) y **Estadísticas**.

## Pagos
- Posición en la jornada: el 1º paga 0 € y cada puesto 0,50 € más (el 7º paga 3 €).
- Jornada 19: escala ×4 (0–12 €). Jornada 38: escala ×8 (0–24 €).
- +1 € por cada tarjeta roja y +1 € por cada jugador no alineado.
- Empates: comparten la mejor posición.

Todo se calcula solo a partir de `data.json` (puntos, rojas y no alineados de cada jornada).
`extras` guarda importes de rojas / no alineados sin desglosar (jornadas antiguas) y `ajuste`
correcciones a mano. Una jornada con `"estado": "provisional"` se muestra rayada (falta algún partido).

## Admin
`/admin.html` con la contraseña de admin. Al guardar se hace un commit de `data.json` y la web se
actualiza en 1–2 minutos. La contraseña descifra un token de GitHub (fine-grained, solo este repo,
Contents read/write) guardado cifrado en `key.json` (PBKDF2 600k + AES-GCM). La primera vez (o cuando
caduque) se configura desde el mismo panel.
