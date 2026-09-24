# Backend pipeline image, run as a Cloud Run Job on a Cloud Scheduler trigger.
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY scrape.py insights.py countries_extra.py export_bigquery.py run_pipeline.sh ./
RUN chmod +x run_pipeline.sh && useradd --create-home app
USER app

CMD ["./run_pipeline.sh"]
