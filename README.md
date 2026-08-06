# 🍀 Cocina SAET

App para organizar las labores del equipo de cocina del **Salón Asambleas El Trébol (SAET)**.

El equipo trabaja los **jueves** y cocina para ~50 personas. La app permite:

- 🏠 **Hoy** — cronograma del jueves por turnos (Almuerzo · Intermedio · Tarde), con tareas asignadas por cocinero, colores y checklist de avance.
- 📅 **Menús** — calendario completo del mes (almuerzos), onces por jueves y el desayuno del viernes.
- 🥐 **Desayuno** — menú fijo del viernes y checklist para adelantarlo el jueves.
- ⋯ **Más** — equipo y colores, lista de compras, compartir cronograma, carga del menú mensual en PDF.
- 🔑 **Modo administrador** protegido con clave (solo quien edita).

Todo funciona en el navegador del celular y usa Firebase para compartir los cambios del equipo en tiempo real.

## Uso

Abre la página publicada en GitHub Pages. Para usar los datos compartidos, toca el punto de conexión e inicia sesión con una cuenta autorizada. Para editar la pauta, entra al modo administrador con tu clave.

## Mantención

- Ejecutar pruebas: `npm test`.
- Seguridad y activación de usuarios: [SECURITY_MIGRATION.md](SECURITY_MIGRATION.md).
- Flujo de despliegue y estructura: [MAINTENANCE.md](MAINTENANCE.md).

> Hecho con cariño para el equipo de cocina del Trébol.
