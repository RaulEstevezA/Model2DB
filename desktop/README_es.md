# Model2DB · Escritorio

Versión de escritorio de Model2DB: Python + PySide6.

Hace lo mismo que la versión web, en tu equipo y sin navegador: pasa los mismos casos de prueba de [`shared/test-cases/`](../shared/README.md), propone el mismo diseño y escribe exactamente los mismos archivos para cada salida, motor y opción.

Qué hace la herramienta y su filosofía están en el [README principal](../README_es.md).

## Descarga

Todavía no hay versiones empaquetadas. Para usarla ya, ejecútala desde el código fuente (más abajo).

## Diferencias con la versión web

- Funciona sin conexión: no hay enlaces a las otras herramientas.
- Un modelo enviado por Mapper llega como archivo (`.json` con `"format": "model-handoff"`): ábrelo con **Abrir** en el panel Modelo.
- «Recordar en este equipo» guarda el trabajo en los ajustes de la aplicación, hasta que lo borres.
- **Guardar** pregunta dónde guardar el resultado; varios archivos se guardan en un `.zip`.

## Ejecutar en local

Requisitos: Python 3.11 o posterior.

```bash
cd desktop
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -e ".[dev]"
python -m pytest                   # tests (casos compartidos de shared/test-cases/)
ruff check .                       # análisis estático
python -m model2db                 # abrir la aplicación
```

## Generar el ejecutable

```bash
pip install -e ".[build]"
pyinstaller packaging/model2db.spec
dist/Model2DB.app/Contents/MacOS/Model2DB --smoke-test   # macOS; dist/Model2DB/Model2DB en los demás
```

El resultado queda en `dist/`: `Model2DB.app` en macOS y una carpeta `Model2DB` con el ejecutable en Windows y Linux. PyInstaller no compila para otros sistemas: cada uno se genera en su propio sistema operativo. `--smoke-test` abre la ventana, carga todos los ejemplos, lee un documento YAML y otro XML, escribe todas las salidas y guarda un proyecto, para comprobar que no falta nada en el paquete.

## Estructura

```
model2db/
  core/          La misma lógica que web/src/core/, módulo a módulo: modelo, parsers, diseño, esquema físico,
                 salidas, proyectos y envíos entre herramientas; workspace.py equivale a web/src/app/
  ui/            La ventana (PySide6): paneles de modelo, diseño y resultado, barra de proyecto, textos y tema
  examples.py    Los ejemplos incluidos, los mismos que web/src/examples/
packaging/       Spec de PyInstaller, lanzador, prueba de arranque e iconos
tests/           Casos compartidos (llamadas, salidas, variantes) y la ventana
```

## Desarrollador

**Raul Estevez**

- [Web personal](https://raulesteveza.github.io/)
- [Perfil de LinkedIn](https://www.linkedin.com/in/raulesteveza/)

## Licencia

[MIT](../LICENSE)
