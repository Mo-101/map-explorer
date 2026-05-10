FROM python:3.10-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential libeccodes0 libnetcdf19 curl \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY engines/mostar-graphcast-engine/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Vendored GraphCast source from repo root
COPY graphcast-main/ /app/graphcast-main/
RUN pip install --no-cache-dir /app/graphcast-main/

COPY engines/mostar-graphcast-engine/ /app/

ENV PYTHONUNBUFFERED=1

CMD ["python", "worker.py"]
