"""Explicit offline assistant export/import/replay CLI; never calls model APIs."""

from pathlib import Path

import click

from src.features.assistant_review.workflow import (
    export_snapshot,
    fetch_requests,
    rank_day,
    render_day,
)


@click.group()
def cli() -> None:
    """Review historical candidates with an assistant and validated JSON artifacts."""


@cli.command("export")
@click.option("--workspace", type=click.Path(path_type=Path), required=True)
@click.option("--state", type=click.Path(exists=True, path_type=Path), required=True)
@click.option("--archive", type=click.Path(exists=True, path_type=Path), required=True)
def export(workspace: Path, state: Path, archive: Path) -> None:
    """Export all candidates from the matching historical state snapshot."""
    export_snapshot(workspace, state, archive)


@cli.command("fetch")
@click.option(
    "--workspace", type=click.Path(exists=True, path_type=Path), required=True
)
def fetch(workspace: Path) -> None:
    """Resume fulltext retrieval and original-rubric request export."""
    fetch_requests(workspace)


@cli.command("select")
@click.option(
    "--workspace", type=click.Path(exists=True, path_type=Path), required=True
)
@click.option("--date", "day", required=True)
def select(workspace: Path, day: str) -> None:
    """Validate every candidate scorecard, then export selected guide requests."""
    rank_day(workspace, day)


@cli.command("render")
@click.option(
    "--workspace", type=click.Path(exists=True, path_type=Path), required=True
)
@click.option("--date", "day", required=True)
@click.option("--out", "output", type=click.Path(path_type=Path), required=True)
def render(workspace: Path, day: str, output: Path) -> None:
    """Validate selected bilingual entries and replay into staging output."""
    render_day(workspace, day, output)


if __name__ == "__main__":
    cli()
