# All-in-one image: builds the frontend, installs locked Python deps, serves the range.
# The deliberately vulnerable tools (e.g. shell command injection) run inside the
# container — isolation from the host is a security feature here.

FROM node:24-slim AS frontend
WORKDIR /build
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install
COPY frontend/ ./
RUN npm run build

FROM python:3.13-slim
WORKDIR /app
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

COPY pyproject.toml uv.lock README.md ./
COPY src/ ./src/
RUN uv sync --frozen --no-dev

COPY scenarios/ ./scenarios/
COPY data/seeds/ ./data/seeds/
COPY --from=frontend /build/dist ./frontend/dist

# 0.0.0.0 inside the container; publish to 127.0.0.1 on the host:
#   docker run --rm -p 127.0.0.1:8600:8600 -e ASL_LLM_API_KEY=... agent-security-lab
ENV ASL_HOST=0.0.0.0 ASL_PORT=8600
EXPOSE 8600
CMD ["uv", "run", "--no-sync", "asl", "serve"]
