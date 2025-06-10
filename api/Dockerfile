FROM python:3.11-slim

# Arbeitsverzeichnis setzen
WORKDIR /app

# Abhängigkeiten definieren und installieren
COPY requirements.txt .
RUN apt-get update && apt-get install -y build-essential && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir -r requirements.txt

# Datenverzeichnis für DB und Uploads erstellen
RUN mkdir -p /app/data

# Anwendungscode kopieren
COPY . .

EXPOSE 5000
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "5000"]