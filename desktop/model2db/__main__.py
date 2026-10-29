"""Entry point: `python -m model2db` or the `model2db` command."""


def main() -> None:
    from .ui.app import run

    raise SystemExit(run())


if __name__ == "__main__":
    main()
