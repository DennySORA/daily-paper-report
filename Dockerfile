FROM ghcr.io/astral-sh/uv:0.8.15 AS uv

FROM python:3.13-slim-bookworm AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_LINK_MODE=copy
RUN groupadd --gid 10001 app && useradd --uid 10001 --gid app --create-home app
WORKDIR /app
COPY --from=uv /uv /uvx /bin/
COPY pyproject.toml uv.lock README.md ./
RUN uv sync --frozen --no-dev
COPY src ./src
COPY main.py ./main.py
COPY config ./config
RUN chown -R app:app /app
USER app
ENTRYPOINT ["uv", "run", "python", "main.py"]
