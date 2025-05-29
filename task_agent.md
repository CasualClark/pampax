# 🚀 Task Agent - PAMPA Reorganization

## 📋 Lista de Tareas

### ✅ Completadas

-   [x] Solución de bugs MCP (undefined params, emojis, etc.)
-   [x] **Tarea 1**: Reorganizar tests en carpeta `test/` + npm test + husky

    -   **Commit**: `test: 🧪 move tests to test/ folder and setup npm test with husky`
    -   [x] Crear carpeta `test/`
    -   [x] Mover archivos de test
    -   [x] Configurar package.json scripts
    -   [x] Setup husky para pre-commit

### 🔄 En Progreso

-   [ ] **Tarea 2**: Convertir proyecto a inglés + README bilingüe

    -   **Commit**: `feat: 🌍 convert project to english with bilingual README`
    -   [ ] Convertir todos los textos a inglés
    -   [ ] Crear README.md en inglés
    -   [ ] Mantener README_es.md en español
    -   [ ] Links cruzados entre idiomas

-   [ ] **Tarea 3**: Reestructurar README con nuevas secciones

    -   **Commit**: `docs: 📚 restructure README with MCP and CLI sections`
    -   [ ] Intro
    -   [ ] Instalación MCP
    -   [ ] Instalación y uso CLI
    -   [ ] Contribución y código de conducta
    -   [ ] Bandera argentina al final

-   [ ] **Tarea 4**: Crear archivos de contribución

    -   **Commit**: `docs: 📝 add CONTRIBUTING.md and CODE_OF_CONDUCT.md`
    -   [ ] CONTRIBUTING.md
    -   [ ] CODE_OF_CONDUCT.md
    -   [ ] LICENSE (verificar)

-   [ ] **Tarea 5**: Reorganizar estructura de carpetas

    -   **Commit**: `refactor: 📁 reorganize project structure (docs/, test/, examples/)`
    -   [ ] Crear carpetas: docs/, test/, examples/
    -   [ ] Mover archivos correspondientes
    -   [ ] Limpiar root con solo JS propios

-   [ ] **Tarea 6**: Separar providers en archivo dedicado

    -   **Commit**: `refactor: 🔧 extract providers to dedicated providers.js file`
    -   [ ] Crear providers.js
    -   [ ] Mover clases de providers
    -   [ ] Actualizar imports

-   [ ] **Tarea 7**: Hacer funciones agnósticas (separar lógica de presentación)

    -   **Commit**: `refactor: 🎯 make functions agnostic, separate logic from presentation`
    -   [ ] Renombrar indexer.js → service.js
    -   [ ] Separar lógica de mensajes/logging
    -   [ ] CLI maneja console.log
    -   [ ] MCP-server maneja respuestas JSON

-   [ ] **Tarea 8**: Push final
    -   **Commit**: `feat: 🎉 complete project reorganization and internationalization`

## 📝 Formato de Commits

`{type}: {emoji} {description}`

### Tipos Permitidos

-   `feat`: Nueva funcionalidad
-   `fix`: Corrección de bugs
-   `refactor`: Refactoring sin cambios de funcionalidad
-   `docs`: Cambios en documentación
-   `test`: Agregar o modificar tests
-   `chore`: Tareas de mantenimiento

## 🎯 Objetivo Final

Proyecto PAMPA completamente reorganizado, bilingüe (inglés/español), con estructura limpia y funciones agnósticas para soportar tanto CLI como MCP server.
