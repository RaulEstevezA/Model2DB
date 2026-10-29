"""Entry script for PyInstaller: model2db/__main__.py uses relative imports, so it can't be the script itself."""

import sys

if "--smoke-test" in sys.argv:
    from smoke_test import main
else:
    from model2db.__main__ import main

main()
