FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for caching
COPY streamlit-legacy/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy app files (Streamlit app relocated to streamlit-legacy/)
COPY streamlit-legacy/app.py .
COPY streamlit-legacy/api_client.py .
COPY streamlit-legacy/auth.py .
COPY streamlit-legacy/.streamlit .streamlit

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK CMD curl --fail http://localhost:8080/_stcore/health || exit 1

# Run Streamlit
CMD ["streamlit", "run", "app.py", "--server.port=8080", "--server.address=0.0.0.0", "--server.headless=true"]
