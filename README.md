# HelpTool - Docker Optimized

A comprehensive help desk and management tool with ticket system, phonebook, calendar, and network management features.

## Features

- **Ticket Management**: Create, edit, and track support tickets with status and priority management
- **Phonebook**: Manage contacts and phone numbers
- **Calendar**: Schedule appointments and events
- **Network Tools**: Network device and settings management
- **Offline Support**: Works with local storage fallback

## Quick Start

### Using Docker (Recommended)

1. **Clone and navigate to the project:**

   ```bash
   cd greptile-docker
   ```

2. **Build and run with Docker Compose:**

   ```bash
   docker-compose up --build
   ```

3. **Access the application:**

   - Open your browser to `http://localhost:5411`

### Development Setup

1. **Install dependencies:**

   ```bash
   pip install -r requirements.txt
   ```

2. **Run the application:**

   ```bash
   python app/main.py
   ```

## Project Structure

```text
greptile-docker/
├── app/                    # Python backend application
│   ├── api/               # API endpoints
│   ├── core/              # Core functionality
│   ├── models/            # Data models
│   ├── services/          # Business logic
│   └── utils/             # Utility functions
├── static/                # Static web assets
│   ├── css/               # Stylesheets
│   ├── js/                # JavaScript files
│   └── *.html             # HTML templates
├── data/                  # JSON data storage
├── logs/                  # Application logs
├── tests/                 # Test files
├── docs/                  # Documentation
└── docker/                # Docker-related files
```

## API Endpoints

- `GET/POST /api/<module>` - CRUD operations for different modules
- `GET/POST /api/<module>/<id>` - Individual item operations

Available modules: tickets, contacts, network_devices, etc.

## Configuration

The application uses JSON files for data storage located in the `data/` directory. Configuration can be modified through the web interface or by editing the JSON files directly.

## Docker Commands

```bash
# Build the image
docker-compose build

# Run in background
docker-compose up -d

# View logs
docker-compose logs -f

# Stop the application
docker-compose down

# Rebuild after changes
docker-compose up --build --force-recreate
```

## Health Check

The application includes a health check endpoint at `/api/system/info` that can be used for monitoring.

## Contributing

1. Make changes to the codebase
2. Test locally
3. Ensure Docker build works
4. Submit a pull request

## License

This project is proprietary software.
