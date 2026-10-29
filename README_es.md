# Model2DB

Model2DB convierte un modelo de datos en un diseño de base de datos que revisas antes de escribir código, y después escribe ese código: el esquema SQL, las colecciones de MongoDB o los modelos de tu ORM con su migración. Todo ocurre en tu lado, en el navegador: lo que pegas o abres no se envía a ningún sitio, y el código se analiza, nunca se ejecuta.

```text
Pegar o abrir los modelos  →  Revisar el diseño propuesto  →  Elegir la base de datos o el ORM  →  Copiar el esquema
```

## Qué hace

1. **Lee los modelos** en cualquier formato admitido, o los recibe de Mapper. Detecta el formato y lo que la entrada ya dice sobre la persistencia: `@Id`, `@ManyToOne`, `@Column(length = 80)`, `unique=True`, `[MaxLength]`, `@relation`, `@db.VarChar`… Un dato declarado se toma tal cual.
2. **Propone un diseño** para una base de datos relacional o para MongoDB:
   - qué modelos tienen tabla o colección propia y cuáles solo viven dentro de otros;
   - la clave primaria: un campo que lo parece, o una clave nueva que rellena la base de datos (entero, UUID u ObjectId);
   - cómo se guarda cada campo que contiene otro modelo: clave foránea, columnas en la misma tabla (`address_city`), tabla hija, tabla intermedia, columna JSON o array, documento embebido o referencia;
   - listas y mapas de valores simples, enums (CHECK, tipo nativo o tabla de consulta), columnas únicas e índices.
3. **Dice cuánto de seguro está y por qué.** Cada propuesta tiene una confianza (Exacta, Alta, Probable, Revisar, Conflicto) y una razón en palabras sencillas: «“id” tiene nombre de identificador», «“Address” no tiene clave: es un valor que pertenece a este modelo».
4. **Nunca decide una ambigüedad.** «¿`email` es único?» o «¿qué campo identifica un producto si ninguno se llama `id`?» te esperan, en una lista al principio del diseño. Mientras no decides, el resultado deja un `TODO` donde va la decisión.
5. **Te deja cambiarlo todo:** cualquier decisión, los nombres de tablas y columnas, el tipo de una columna (`VARCHAR(80)`), índices, campos o modelos que se dejan fuera; con deshacer, rehacer y restablecer.
6. **Escribe el resultado** para la salida elegida, siempre al día con el diseño, con notas donde la salida no puede guardar algo exactamente como está diseñado.

## Salidas

| Grupo | Salidas | Migración |
|---|---|---|
| SQL | PostgreSQL, MySQL, MariaDB, SQLite, SQL Server, Oracle Database | El propio script |
| Documentos | MongoDB (script de `mongosh`: colecciones con validadores `$jsonSchema` e índices) | |
| Python | Django ORM, SQLAlchemy, SQLModel, Tortoise ORM | Django y Alembic |
| | PyMongo, MongoEngine, Beanie | |
| TypeScript / JavaScript | Prisma, TypeORM, Sequelize, Drizzle ORM | TypeORM y Sequelize |
| | Mongoose | |
| Java / Kotlin | JPA (Jakarta Persistence), Hibernate, Spring Data JPA | Flyway |
| | Spring Data MongoDB | |
| C# | Entity Framework Core (entidades y `DbContext`) | |
| PHP | Laravel Eloquent, Doctrine ORM | Laravel y Doctrine Migrations |

Un ORM escribe para el motor de base de datos que elijas (los tipos, las migraciones y la conexión dependen de él). Las demás opciones son los nombres de tabla (plural, singular o como el modelo), los de columna (`snake_case` o como el campo) y el tipo de los textos sin longitud.

Cada salida se ha comprobado con la herramienta real: el SQL y el script de MongoDB se ejecutan en servidores reales, los modelos de Python y TypeScript se cargan en sus librerías y crean su esquema, las migraciones se aplican, las clases de Java, C# y PHP compilan o se validan contra Hibernate, Spring Data, EF Core y Doctrine, y Prisma valida su esquema en cada motor que admite.

## Entradas

| | |
|---|---|
| Código | TypeScript (también esquemas Zod), JavaScript, Python, Java, C#, Kotlin, Dart, Swift, Go, Rust, PHP, Scala |
| Esquemas | JSON Schema, OpenAPI / Swagger, GraphQL, Protocol Buffers, Smithy, Prisma, esquema de modelos (Api2Class, Mapper) |
| Documentos de ejemplo | JSON, YAML, XML, CSV |

Los parsers son los de Mapper: Model2DB lee todo lo que lee Mapper y todo lo que escribe Api2Class.

## Trabajar con otras herramientas

- **Desde Mapper:** el modelo de destino de un mapeo se abre en Model2DB tal cual, listo para diseñar su base de datos.
- **Proyectos:** «Guardar proyecto» descarga el modelo, tus decisiones para los dos tipos de base de datos y los ajustes de la salida; «Abrir proyecto» continúa más tarde. «Recordar en este navegador» guarda el trabajo solo ahí, hasta que lo borres.

Los formatos están documentados en [docs/interoperability.md](docs/interoperability.md) (en inglés).

## Versiones

| | Web | Escritorio |
|---|---|---|
| Tecnología | React + TypeScript + Vite | Python + PySide6 |
| Se ejecuta en | El navegador | Aplicación instalable (Windows, macOS, Linux) |
| Estado | Aún sin publicar | En desarrollo |

## Comportamiento compartido

Las dos versiones se escriben por separado (TypeScript y Python), pero **se comportan igual**: la carpeta [`shared/`](./shared/README.md) guarda los casos de prueba que definen qué debe hacer cada parte del núcleo, desde leer cada formato de entrada hasta las propuestas de diseño, las ediciones, los archivos de proyecto y los archivos exactos que escribe cada salida para cada ejemplo. Los tests de la web y del escritorio leen los mismos archivos, así que una diferencia en cualquiera de las dos versiones hace fallar sus tests.

## Desarrollo

La versión web está en [`web/`](./web): React, TypeScript y Vite, sin librerías de componentes; su aspecto sigue el diseño común del portfolio y de las otras herramientas.

```bash
cd web
npm install
npm run dev      # servidor de desarrollo
npm run check    # tipos, lint, formato y tests
npm run build    # compilación de producción en web/dist
```

Los tests cubren los parsers, las propuestas y ediciones del diseño, los esquemas físicos, cada salida (snapshots de los cuatro ejemplos), los archivos de proyecto, los casos compartidos y los flujos principales de la interfaz.

La versión de escritorio está en [`desktop/`](./desktop):

```bash
cd desktop
python3 -m venv .venv
.venv/bin/pip install -e ".[dev]"
.venv/bin/python -m pytest -q
```

## Estructura del repositorio

```
web/                     Versión web (React + TypeScript + Vite)
  src/core/              Lógica sin interfaz: modelo, parsers, diseño, esquema físico, salidas, proyectos
  src/components/        Interfaz React
desktop/                 Versión de escritorio (Python + PySide6)
  model2db/core/         La misma lógica que web/src/core/, en Python
shared/                  Comportamiento común a las dos versiones
  test-cases/            Llamadas al núcleo y los archivos que escribe cada salida
docs/                    Documentación técnica (en inglés) e imágenes
```

## Documentación

| Documento | Contenido |
|---|---|
| [architecture.md](docs/architecture.md) | Etapas, carpetas y principios |
| [design.md](docs/design.md) | Decisiones, confianza, cómo se hacen las propuestas y cómo se convierten en tablas o colecciones |
| [outputs.md](docs/outputs.md) | Qué escribe cada salida, sus opciones y notas |
| [interoperability.md](docs/interoperability.md) | Envío desde Mapper y archivos de proyecto |
| [adding-an-output.md](docs/adding-an-output.md) | Paso a paso para una salida nueva o un tipo de base de datos nuevo |
| [decisions.md](docs/decisions.md) | Decisiones de diseño y sus motivos |

## Sugerencias

Ideas de mejora, errores o una base de datos para la que te gustaría que Model2DB escribiera: escribe a [contact.raulesteveza@gmail.com](mailto:contact.raulesteveza@gmail.com).

## Desarrollador

**Raul Estevez**

- [Web personal](https://raulesteveza.github.io/)
- [Perfil de LinkedIn](https://www.linkedin.com/in/raulesteveza/)

## Licencia

[MIT](./LICENSE)
