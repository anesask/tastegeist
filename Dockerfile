# Tastegeist: one image, FastAPI serves the API and the built React app.
FROM node:22-slim AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npx vite build

FROM python:3.13-slim
WORKDIR /app/backend
ENV PYTHONUNBUFFERED=1 PYTHONIOENCODING=utf-8
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/app ./app
COPY --from=web /web/dist ./static
# Qloo responses, LLM output, images and campaigns live here. Mount a volume; never commit it (Qloo terms).
VOLUME ["/app/backend/data"]
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]
