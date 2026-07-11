# Stage 1
FROM python:3.12-slim AS builder

WORKDIR /app

COPY requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt

# Stage 2
FROM python:3.12-slim

WORKDIR /app

COPY --from=builder /usr/local /usr/local

COPY . .

RUN useradd -m appuser

RUN chown -R appuser:appuser /app

USER appuser

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s \
CMD curl -f http://localhost:5000/health || exit 1

CMD ["python","app.py"]
