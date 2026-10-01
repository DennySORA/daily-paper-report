"""Main static JSON renderer orchestrator."""

import time
from datetime import UTC, datetime
from pathlib import Path

import structlog

from src.features.config.schemas.entities import EntityConfig
from src.ranker.models import RankerOutput
from src.renderer.json_renderer import JsonRenderer
from src.renderer.metrics import RendererMetrics
from src.renderer.models import (
    RenderManifest,
    RenderResult,
    RunInfo,
    SourceStatus,
)
from src.renderer.state_machine import RenderState, RenderStateMachine


logger = structlog.get_logger()


class StaticRenderer:
    """Orchestrates static JSON API rendering.

    Implements the rendering state machine:
        RENDER_PENDING -> RENDERING_JSON -> RENDER_DONE|RENDER_FAILED

    Produces:
        - api/day/YYYY-MM-DD.json
        - api/daily.json
    """

    def __init__(
        self,
        run_id: str,
        output_dir: Path,
        metrics: RendererMetrics | None = None,
        entity_configs: list[EntityConfig] | None = None,
        translations: dict[str, object] | None = None,
    ) -> None:
        """Initialize the static renderer.

        Args:
            run_id: Unique run identifier.
            output_dir: Output directory for rendered files.
            metrics: Optional metrics instance.
            entity_configs: Optional entity configurations for entity catalog.
            translations: Optional translation map (story_id -> TranslationEntry).
        """
        self._run_id = run_id
        self._output_dir = Path(output_dir)
        self._metrics = metrics or RendererMetrics.get_instance()
        self._entity_configs = entity_configs or []
        self._translations = translations

        self._state_machine = RenderStateMachine(run_id)
        self._log = logger.bind(run_id=run_id, component="renderer")

    @property
    def state(self) -> RenderState:
        """Get current render state."""
        return self._state_machine.state

    def render(
        self,
        ranker_output: RankerOutput,
        sources_status: list[SourceStatus],
        run_info: RunInfo,
        target_date: str | None = None,
    ) -> RenderResult:
        """Render the JSON API files.

        Args:
            ranker_output: Output from the ranker.
            sources_status: Per-source status list.
            run_info: Current run information.
            target_date: Optional target date (YYYY-MM-DD) for backfill rendering.
                        If not provided, uses current UTC date.

        Returns:
            RenderResult indicating success/failure and manifest.
        """
        start_time = time.perf_counter()
        run_date = (
            target_date if target_date else datetime.now(UTC).strftime("%Y-%m-%d")
        )
        generated_at = datetime.now(UTC).isoformat()

        manifest = RenderManifest(
            run_id=self._run_id,
            run_date=run_date,
            generated_at=generated_at,
        )

        self._log.info(
            "render_started",
            run_date=run_date,
            output_dir=str(self._output_dir),
        )

        try:
            # Collect archive dates from existing per-date JSON before rendering
            archive_dates = self._get_archive_dates(run_date)

            self._state_machine.to_rendering_json()
            json_renderer = JsonRenderer(
                run_id=self._run_id,
                output_dir=self._output_dir,
                metrics=self._metrics,
                entity_configs=self._entity_configs,
                translations=self._translations,
            )
            json_file = json_renderer.render(
                ranker_output=ranker_output,
                sources_status=sources_status,
                run_info=run_info,
                run_date=run_date,
                archive_dates=archive_dates,
            )
            manifest.add_file(json_file)

            # Complete
            self._state_machine.to_done()
            duration_ms = (time.perf_counter() - start_time) * 1000
            manifest.duration_ms = duration_ms
            self._metrics.record_render_duration(duration_ms)

            self._log.info(
                "render_complete",
                file_count=len(manifest.files),
                total_bytes=manifest.total_bytes,
                duration_ms=round(duration_ms, 2),
            )

            return RenderResult(
                success=True,
                manifest=manifest,
            )

        except Exception as e:
            self._state_machine.to_failed()
            self._metrics.record_failure()

            error_summary = f"{type(e).__name__}: {e}"
            self._log.error(
                "render_failed",
                error=error_summary,
            )

            return RenderResult(
                success=False,
                manifest=manifest,
                error_summary=error_summary,
            )

    def _get_archive_dates(self, current_date: str) -> list[str]:
        """Get list of existing archive dates.

        Scans api/day/*.json files to find dates that have actual data.
        Only includes dates where JSON data exists.

        Args:
            current_date: Current run date (will be included).

        Returns:
            List of date strings in descending order.
        """
        api_day_dir = self._output_dir / "api" / "day"
        dates: set[str] = {current_date}

        if api_day_dir.exists():
            for json_file in api_day_dir.glob("*.json"):
                # Extract date from filename (YYYY-MM-DD.json)
                date_str = json_file.stem
                if self._is_valid_date(date_str):
                    dates.add(date_str)

        return sorted(dates, reverse=True)

    def _is_valid_date(self, date_str: str) -> bool:
        """Check if string is a valid YYYY-MM-DD date.

        Args:
            date_str: String to check.

        Returns:
            True if valid date format.
        """
        try:
            datetime.strptime(date_str, "%Y-%m-%d")
            return True
        except ValueError:
            return False


def render_static(  # noqa: PLR0913
    ranker_output: RankerOutput,
    output_dir: Path,
    run_id: str,
    sources_status: list[SourceStatus] | None = None,
    run_info: RunInfo | None = None,
    entity_configs: list[EntityConfig] | None = None,
) -> RenderResult:
    """Pure function API for static rendering.

    Args:
        ranker_output: Output from the ranker.
        output_dir: Output directory for rendered files.
        run_id: Unique run identifier.
        sources_status: Per-source status list.
        run_info: Current run information.
        entity_configs: Optional entity configurations for entity catalog.

    Returns:
        RenderResult indicating success/failure.
    """
    if sources_status is None:
        sources_status = []

    if run_info is None:
        run_info = RunInfo(
            run_id=run_id,
            started_at=datetime.now(UTC),
        )

    renderer = StaticRenderer(
        run_id=run_id,
        output_dir=output_dir,
        entity_configs=entity_configs,
    )

    return renderer.render(
        ranker_output=ranker_output,
        sources_status=sources_status,
        run_info=run_info,
    )
