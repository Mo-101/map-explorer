FROM python:3.10-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libeccodes0 \
    libnetcdf19 \
    curl \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Vendored GraphCast source (copy from repo root before building image)
COPY graphcast-main/ /app/graphcast-main/
RUN pip install --no-cache-dir /app/graphcast-main/

COPY mostar-graphcast-engine/ /app/

ENV PYTHONUNBUFFERED=1

CMD ["python", "-m", "engine.worker"]
