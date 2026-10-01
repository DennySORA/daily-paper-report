"""Renderer metrics collection."""

from dataclasses import dataclass, field


@dataclass
class RendererMetrics:
    """Metrics for the static JSON renderer.

    Collects render_duration_ms, render_failures_total, render_bytes_total.
    """

    _render_duration_ms: float = 0.0
    _render_failures_total: int = 0
    _render_bytes_total: int = 0
    _files_generated: int = 0
    _json_render_ms: float = 0.0

    _instance: "RendererMetrics | None" = field(default=None, repr=False)

    @classmethod
    def get_instance(cls) -> "RendererMetrics":
        """Get or create the singleton instance.

        Returns:
            The singleton RendererMetrics instance.
        """
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    @classmethod
    def reset(cls) -> None:
        """Reset the singleton instance for testing."""
        cls._instance = None

    def record_render_duration(self, duration_ms: float) -> None:
        """Record total render duration.

        Args:
            duration_ms: Duration in milliseconds.
        """
        self._render_duration_ms = duration_ms

    def record_failure(self) -> None:
        """Record a render failure."""
        self._render_failures_total += 1

    def record_bytes(self, bytes_written: int) -> None:
        """Record bytes written.

        Args:
            bytes_written: Number of bytes written.
        """
        self._render_bytes_total += bytes_written

    def record_file_generated(self) -> None:
        """Record a file was generated."""
        self._files_generated += 1

    def record_json_duration(self, duration_ms: float) -> None:
        """Record JSON rendering duration.

        Args:
            duration_ms: Duration in milliseconds.
        """
        self._json_render_ms = duration_ms

    @property
    def render_duration_ms(self) -> float:
        """Get total render duration."""
        return self._render_duration_ms

    @property
    def render_failures_total(self) -> int:
        """Get total render failures."""
        return self._render_failures_total

    @property
    def render_bytes_total(self) -> int:
        """Get total bytes rendered."""
        return self._render_bytes_total

    @property
    def files_generated(self) -> int:
        """Get number of files generated."""
        return self._files_generated

    def get_summary(self) -> dict[str, object]:
        """Get metrics summary.

        Returns:
            Dictionary of metric name to value.
        """
        return {
            "render_duration_ms": self._render_duration_ms,
            "render_failures_total": self._render_failures_total,
            "render_bytes_total": self._render_bytes_total,
            "files_generated": self._files_generated,
            "json_render_ms": self._json_render_ms,
        }
