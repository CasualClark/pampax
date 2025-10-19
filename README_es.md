# PAMPA – Protocolo para Memoria Aumentada de Artefactos de Proyecto

**Versión 1.12.x** · **Búsqueda Semántica** · **Compatible con MCP** · **Node.js**

<p align="center">
  <img src="assets/pampa_banner.jpg" alt="Agent Rules Kit Logo" width="729" />
</p>

<p align="center">
  <img src="https://img.shields.io/npm/v/pampa.svg" alt="Version" />
  <img src="https://img.shields.io/npm/dm/pampa.svg" alt="Downloads" />
  <img src="https://img.shields.io/github/license/tecnomanu/pampa" alt="License" />
  <img src="https://img.shields.io/github/last-commit/tecnomanu/pampa" alt="Last Commit" />
  <img src="https://img.shields.io/github/actions/workflow/status/tecnomanu/pampa/CI" alt="Build Status" />
</p>

Dale a tus agentes de IA una memoria siempre actualizada y consultable de cualquier base de código – con **búsqueda semántica inteligente** y **aprendizaje automático** – en un comando `npx`.

> 🇪🇸 **Versión en Español** | 🇺🇸 **[English Version](README.md)** | 🤖 **[Agent Version](README_FOR_AGENTS.md)**

## 🌟 Novedades en v1.12 - Búsqueda Avanzada y Soporte Multi-Proyecto

🎯 **Filtros de Búsqueda con Alcance** - Filtrar por `path_glob`, `tags`, `lang` para resultados precisos

🔄 **Búsqueda Híbrida** - Fusión BM25 + Vector con combinación de ranking recíproco (habilitado por defecto)

🧠 **Re-Rankeador Cross-Encoder** - Rerankeador Transformers.js para mejoras de precisión

👀 **Observador de Archivos** - Indexado incremental en tiempo real con hashing tipo Merkle

📦 **Paquetes de Contexto** - Alcances de búsqueda reutilizables con integración CLI + MCP

🛠️ **CLI Multi-Proyecto** - Aliases `--project` y `--directory` para mayor claridad

🏆 **[Análisis de Rendimiento](BENCHMARK_v1.12.md)** - Comparación arquitectural con herramientas generales de IDE

**Mejoras principales:**

-   **40% indexado más rápido** con actualizaciones incrementales
-   **60% mejor precisión** con búsqueda híbrida + rerankeador
-   **3x más rápido multi-proyecto** con rutas explícitas
-   **90% reducción en duplicación** de funciones con symbol boost
-   **Arquitectura especializada** para búsqueda semántica de código

## 🌟 ¿Por qué PAMPA?

Los agentes de modelos de lenguaje grandes pueden leer miles de tokens, pero los proyectos fácilmente alcanzan millones de caracteres. Sin una capa de recuperación inteligente, los agentes:

-   **Recrean funciones** que ya existen
-   **Nombran mal las APIs** (newUser vs. createUser)
-   **Desperdician tokens** cargando código repetitivo (`vendor/`, `node_modules/`...)
-   **Fallan** cuando el repositorio crece

PAMPA resuelve esto convirtiendo tu repositorio en un **grafo de memoria de código**:

1. **Chunking** – Cada función/clase se convierte en un chunk atómico
2. **Embedding** – Los chunks se vectorizan con modelos de embedding avanzados
3. **Indexing** – Vectores + metadatos viven en SQLite local
4. **Codemap** – Un `pampa.codemap.json` ligero se commitea a git para que el contexto siga al repo
5. **Serving** – Un servidor MCP expone herramientas para buscar y obtener código

Cualquier agente compatible con MCP (Cursor, Claude, etc.) ahora puede buscar, obtener y mantenerse sincronizado – sin escanear todo el árbol.

## 🤖 Para Agentes de IA y Humanos

> **🤖 Si eres un agente de IA:** Lee la [guía completa de configuración para agentes →](README_FOR_AGENTS.md)
> or
> **👤 Si eres humano:** Comparte la [guía para agentes](README_FOR_AGENTS.md) con tu asistente de IA para configurar PAMPA automáticamente!

## 📚 Índice

-   [🚀 Instalación como MCP (Recomendado)](#-instalación-como-mcp-recomendado)
-   [💻 Uso Directo con CLI](#-uso-directo-con-cli)
-   [📝 Lenguajes Soportados](#-lenguajes-soportados)
-   [🧠 Proveedores de Embeddings](#-proveedores-de-embeddings)
-   [🏆 Benchmark de Rendimiento](#-benchmark-de-rendimiento)
-   [🏗️ Arquitectura](#️-arquitectura)
-   [🔧 Herramientas MCP Disponibles](#-herramientas-mcp-disponibles)
-   [📊 Recursos MCP Disponibles](#-recursos-mcp-disponibles)
-   [🎯 Prompts MCP Disponibles](#-prompts-mcp-disponibles)

## 📝 Lenguajes Soportados

PAMPA puede indexar y buscar código en varios lenguajes de forma nativa:

-   JavaScript / TypeScript (`.js`, `.ts`, `.tsx`, `.jsx`)
-   PHP (`.php`)
-   Python (`.py`)
-   Go (`.go`)
-   Java (`.java`)

## 🚀 Instalación como MCP (Recomendado)

### 1. Configura tu cliente MCP

#### Claude Desktop

Agrega a tu configuración de Claude Desktop (`~/Library/Application Support/Claude/claude_desktop_config.json` en macOS):

```json
{
	"mcpServers": {
		"pampa": {
			"command": "npx",
			"args": ["-y", "pampa", "mcp"]
		}
	}
}
```

**Opcional**: Agrega `"--debug"` a args para logging detallado: `["-y", "pampa", "mcp", "--debug"]`

#### Cursor

Configura Cursor creando o editando el archivo `mcp.json` en tu directorio de configuración:

```json
{
	"mcpServers": {
		"pampa": {
			"command": "npx",
			"args": ["-y", "pampa", "mcp"]
		}
	}
}
```

### 2. Deja que tu agente de IA maneje el indexado

**Tu agente de IA debería automáticamente:**

-   Verificar si el proyecto está indexado con `get_project_stats`
-   Indexar el proyecto con `index_project` si es necesario
-   Mantenerlo actualizado con `update_project` después de cambios

**¿Necesitas indexar manualmente?** Ver sección [Uso Directo con CLI](#-uso-directo-con-cli).

### 3. Instala la regla de uso para tu agente

**Además, instala esta regla en tu aplicación para que use PAMPA efectivamente:**

Copia el contenido de [RULE_FOR_PAMPAX_MCP.md](RULE_FOR_PAMPAX_MCP.md) (en inglés para mejor compatibilidad) en las instrucciones de tu agente o sistema de IA.

### 4. ¡Listo! Tu agente ahora puede buscar código

Una vez configurado, tu agente de IA puede:

```
🔍 Buscar: "función de autenticación"
📄 Obtener código: Usar el SHA de los resultados de búsqueda
📊 Estadísticas: Obtener resumen del proyecto
🔄 Actualizar: Mantener la memoria sincronizada
```

## 💻 Uso Directo con CLI

Para uso directo desde terminal o indexado manual del proyecto:

### Indexado Inicial del Proyecto

```bash
# Con modelo local (gratis, privado)
npx pampa index --provider transformers

# O con OpenAI (mejor calidad, configura OPENAI_API_KEY primero)
export OPENAI_API_KEY="tu-api-key"
npx pampa index --provider openai

# O auto-detectar el mejor disponible
npx pampa index
```

### Comandos Disponibles

| Comando                                  | Propósito                                                 |
| ---------------------------------------- | --------------------------------------------------------- |
| `npx pampa index [path] [--provider X]`  | Escanear proyecto, actualizar SQLite y pampa.codemap.json |
| `npx pampa update [path] [--provider X]` | Actualizar índice después de cambios (recomendado)        |
| `npx pampa mcp`                          | Iniciar servidor MCP (stdio)                              |
| `npx pampa search <query> [-k N] [-p X]` | Búsqueda vectorial local rápida (debug)                   |
| `npx pampa info`                         | Mostrar estadísticas del proyecto indexado                |

### Ejemplo de Uso

```bash
# Indexar tu proyecto
npx pampa index

# Ver estadísticas
npx pampa info

# Buscar funciones
npx pampa search "validación de usuario"

# Iniciar servidor MCP para agentes
npx pampa mcp
```

## 🧠 Proveedores de Embeddings

PAMPA soporta múltiples proveedores para generar embeddings de código:

| Proveedor           | Costo                    | Privacidad | Instalación                                                 |
| ------------------- | ------------------------ | ---------- | ----------------------------------------------------------- |
| **Transformers.js** | 🟢 Gratis                | 🟢 Total   | `npm install @xenova/transformers`                          |
| **Ollama**          | 🟢 Gratis                | 🟢 Total   | [Instalar Ollama](https://ollama.ai) + `npm install ollama` |
| **OpenAI**          | 🔴 ~$0.10/1000 funciones | 🔴 Ninguna | Configurar `OPENAI_API_KEY`                                 |
| **OpenAI-Compatible** | 🟡 Varía              | 🟡 Varía   | Configurar `OPENAI_API_KEY` + `OPENAI_BASE_URL`            |
| **Cohere**          | 🟡 ~$0.05/1000 funciones | 🔴 Ninguna | Configurar `COHERE_API_KEY` + `npm install cohere-ai`       |

**Recomendación:** Usa **Transformers.js** para desarrollo personal (gratis y privado) u **OpenAI** para máxima calidad.

### Usar APIs Compatibles con OpenAI

PAMPA soporta cualquier endpoint de API compatible con OpenAI a través de variables de entorno:

```bash
# LM Studio (local)
export OPENAI_BASE_URL="http://localhost:1234/v1"
export OPENAI_API_KEY="lm-studio"  # Puede ser cualquier valor para servidores locales

# Azure OpenAI
export OPENAI_BASE_URL="https://TU_RECURSO.openai.azure.com/openai/deployments/TU_DEPLOYMENT"
export OPENAI_API_KEY="tu-clave-azure-api"

# LocalAI
export OPENAI_BASE_URL="http://localhost:8080/v1"
export OPENAI_API_KEY="no-necesaria"

# Ollama con compatibilidad OpenAI
export OPENAI_BASE_URL="http://localhost:11434/v1"
export OPENAI_API_KEY="ollama"
```

Luego indexa con el proveedor OpenAI:
```bash
npx pampa index --provider openai
```

**Servicios Soportados:**
- ✅ LM Studio
- ✅ LocalAI
- ✅ Azure OpenAI
- ✅ Ollama (con compatibilidad OpenAI)
- ✅ DeepSeek
- ✅ Cualquier gateway o proxy compatible con la API de OpenAI

Ver [PROVEEDORES_EMBEDDINGS.md](./PROVEEDORES_EMBEDDINGS.md) para detalles completos.

## 🏆 Análisis de Rendimiento

PAMPAX v1.12 utiliza una arquitectura especializada para búsqueda semántica de código con resultados medibles.

### 📊 Métricas de Rendimiento

**Resultados del Benchmark Sintético:**

```
| Configuración | P@1   | MRR@5 | nDCG@10 |
| ------------- | ----- | ----- | ------- |
| Base          | 0.750 | 0.833 | 0.863   |
| Híbrida       | 0.875 | 0.917 | 0.934   |
| Híbrida+CE    | 1.000 | 0.958 | 0.967   |
```

### 🎯 Ejemplos de Búsqueda

```bash
# Búsqueda de funciones de autenticación
pampa search "user authentication"
→ AuthController::login, UserService::authenticate, etc.

# Búsqueda de procesamiento de pagos
pampa search "payment processing"
→ PaymentService::process, CheckoutController::create, etc.

# Búsqueda con filtros específicos
pampa search "database operations" --lang php --path_glob "app/Models/**"
→ UserModel::save, OrderModel::find, etc.
```

**[📈 Leer Análisis Completo →](BENCHMARK_v1.12.md)**

### 🚀 Ventajas Arquitecturales

1. **Indexado Especializado** - Índice persistente con granularidad a nivel función
2. **Búsqueda Híbrida** - Combinación BM25 + Vector + Cross-encoder reranking
3. **Consciencia del Código** - Symbol boosting, análisis AST, firmas de funciones
4. **Multi-Proyecto** - Soporte nativo para contexto entre diferentes bases de código

**Resultado: Arquitectura optimizada** para búsqueda semántica de código con métricas verificables.

## 🏗️ Arquitectura

```
┌──────────── Repo (git) ─────────-──┐
│ app/… src/… package.json etc.      │
│ pampa.codemap.json                 │
│ .pampa/chunks/*.gz(.enc)          │
│ .pampa/pampa.db (SQLite)           │
└────────────────────────────────────┘
          ▲       ▲
          │ write │ read
┌─────────┴─────────┐   │
│ indexer.js        │   │
│ (pampa index)     │   │
└─────────▲─────────┘   │
          │ store       │ vector query
┌─────────┴──────────┐  │ gz fetch
│ SQLite (local)     │  │
└─────────▲──────────┘  │
          │ read        │
┌─────────┴──────────┐  │
│ mcp-server.js      │◄─┘
│ (pampa mcp)        │
└────────────────────┘
```

### Componentes Clave

| Capa             | Rol                                                                 | Tecnología                        |
| ---------------- | ------------------------------------------------------------------- | --------------------------------- |
| **Indexer**      | Corta código en chunks semánticos, embeds, escribe codemap y SQLite | tree-sitter, openai@v4, sqlite3   |
| **Codemap**      | JSON amigable con Git con {file, symbol, sha, lang} por chunk       | JSON plano                        |
| **Chunks dir**   | Cuerpos .gz (o .gz.enc si está cifrado) (carga perezosa)            | gzip → AES-256-GCM si está activo |
| **SQLite**       | Almacena vectores y metadatos                                       | sqlite3                           |
| **Servidor MCP** | Expone herramientas y recursos sobre el protocolo MCP estándar      | @modelcontextprotocol/sdk         |

## 🔧 Herramientas MCP Disponibles

El servidor MCP expone las siguientes herramientas que los agentes pueden usar:

### `search_code`

Busca código semánticamente en el proyecto indexado.

-   **Parámetros**:
    -   `query` (string) - Consulta de búsqueda semántica (ej: "función de autenticación", "manejo de errores")
    -   `limit` (number, opcional) - Número máximo de resultados (default: 10)
    -   `provider` (string, opcional) - Proveedor de embedding (default: "auto")
    -   `path` (string, opcional) - **DIRECTORIO RAÍZ** del proyecto donde está la base de datos PAMPA
-   **Ubicación DB**: `{path}/.pampa/pampa.db`
-   **Retorna**: Lista de chunks de código coincidentes con scores de similitud y SHAs

### `get_code_chunk`

Obtiene el código completo de un chunk específico.

-   **Parámetros**:
    -   `sha` (string) - SHA del chunk de código a obtener (obtenido de search_code)
    -   `path` (string, opcional) - **DIRECTORIO RAÍZ** del proyecto (mismo que en search_code)
-   **Ubicación Chunk**: `{path}/.pampa/chunks/{sha}.gz` o `{sha}.gz.enc`
-   **Retorna**: Código fuente completo

### `index_project`

Indexa un proyecto desde el agente.

-   **Parámetros**:
    -   `path` (string, opcional) - **DIRECTORIO RAÍZ** del proyecto a indexar (creará subdirectorio .pampa/)
    -   `provider` (string, opcional) - Proveedor de embedding (default: "auto")
-   **Crea**:
    -   `{path}/.pampa/pampa.db` (base de datos SQLite con embeddings)
    -   `{path}/.pampa/chunks/` (chunks de código comprimidos)
    -   `{path}/pampa.codemap.json` (índice ligero para control de versiones)
-   **Efecto**: Actualiza base de datos y codemap

### `update_project`

**🔄 CRÍTICO: ¡Usa esta herramienta frecuentemente para mantener tu memoria de IA actualizada!**

Actualiza el índice del proyecto después de cambios de código (herramienta recomendada de flujo de trabajo).

-   **Parámetros**:
    -   `path` (string, opcional) - **DIRECTORIO RAÍZ** del proyecto a actualizar (mismo que en index_project)
    -   `provider` (string, opcional) - Proveedor de embedding (default: "auto")
-   **Actualiza**:
    -   Re-escanea todos los archivos en busca de cambios
    -   Actualiza embeddings para funciones modificadas
    -   Elimina funciones borradas de la base de datos
    -   Agrega nuevas funciones a la base de datos
-   **Cuándo usar**:
    -   ✅ Al inicio de sesiones de desarrollo
    -   ✅ Después de crear nuevas funciones
    -   ✅ Después de modificar funciones existentes
    -   ✅ Después de eliminar funciones
    -   ✅ Antes de tareas importantes de análisis de código
    -   ✅ Después de refactorizar código
-   **Efecto**: Mantiene la memoria de código de tu agente sincronizada con el estado actual

### `get_project_stats`

Obtiene estadísticas del proyecto indexado.

-   **Parámetros**:
    -   `path` (string, opcional) - **DIRECTORIO RAÍZ** del proyecto donde está la base de datos PAMPA
-   **Ubicación DB**: `{path}/.pampa/pampa.db`
-   **Retorna**: Estadísticas por lenguaje y archivo

## 📊 Recursos MCP Disponibles

### `pampa://codemap`

Acceso al mapa de código completo del proyecto.

### `pampa://overview`

Resumen de las principales funciones del proyecto.

## 🎯 Prompts MCP Disponibles

### `analyze_code`

Plantilla para analizar código encontrado con enfoque específico.

### `find_similar_functions`

Plantilla para encontrar funciones existentes similares.

## 🔍 Cómo Funciona la Recuperación

-   **Búsqueda vectorial** – Similitud coseno con embeddings avanzados de alta dimensionalidad
-   **Fallback de resumen** – Si un agente envía una consulta vacía, PAMPA retorna los resúmenes de nivel superior para que el agente entienda el territorio
-   **Granularidad de chunk** – Por defecto = función/método/clase. Ajustable por lenguaje

## 📝 Decisiones de Diseño

-   **Solo Node** → Los devs ejecutan todo via `npx`, sin Python, sin Docker
-   **SQLite sobre HelixDB** → Una base de datos local para vectores y relaciones, sin dependencias externas
-   **Codemap commiteado** → El contexto viaja con el repo → clonar funciona offline
-   **Granularidad de chunk** → Por defecto = función/método/clase. Ajustable por lenguaje
-   **Solo lectura por defecto** → El servidor solo expone métodos de lectura. La escritura se hace via CLI

## 🧩 Extendiendo PAMPA

| Idea                          | Pista                                                                                           |
| ----------------------------- | ----------------------------------------------------------------------------------------------- |
| **Más lenguajes**             | Instala la gramática tree-sitter y agrégala a `LANG_RULES`                                      |
| **Embeddings personalizados** | Exporta `OPENAI_API_KEY` o cambia OpenAI por cualquier proveedor que retorne `vector: number[]` |
| **Seguridad**                 | Ejecuta detrás de un proxy reverso con autenticación                                            |
| **Plugin VS Code**            | Apunta un cliente MCP WebView a tu servidor local                                               |

## 🤝 Contribuyendo

1. **Fork** → crear rama de feature (`feat/...`)
2. **Ejecutar** `npm test` (próximamente) & `npx pampa index` antes del PR
3. **Abrir PR** con contexto: por qué + screenshots/logs

Todas las discusiones en GitHub Issues.

## 📜 Licencia

MIT – haz lo que quieras, solo mantén el copyright.

¡Feliz hacking! 💙

---

🇦🇷 **Hecho con ❤️ en Argentina** | 🇦🇷 **Made with ❤️ in Argentina**
