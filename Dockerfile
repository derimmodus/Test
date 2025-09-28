# Multi-stage build für optimierte Container-Größe
FROM python:3.12-slim AS builder

# Arbeitsverzeichnis setzen
WORKDIR /app

# System-Dependencies installieren
RUN apt-get update && apt-get install -y \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Python-Dependencies installieren
COPY requirements.txt .
RUN pip install --user --no-cache-dir -r requirements.txt

# Production Stage
FROM python:3.12-slim

WORKDIR /app

# Non-root User erstellen
RUN groupadd -r appuser && useradd -r -g appuser appuser

# Python und pip aus builder stage kopieren
COPY --from=builder /root/.local /home/appuser/.local
ENV PATH=/home/appuser/.local/bin:$PATH

# Flask-CORS installieren (fehlt in requirements.txt)
RUN pip install --no-cache-dir flask-cors

# Anwendung kopieren
COPY app/main.py app/main.py
COPY data/ data/
COPY static/ static/

# Berechtigungen setzen
RUN chown -R appuser:appuser /app
USER appuser

# Health Check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python -c "import socket; s = socket.socket(); s.connect(('localhost', 5411)); s.close()" || exit 1

# Port freigeben
EXPOSE 5411

# Anwendung starten
CMD ["python", "app/main.py"]