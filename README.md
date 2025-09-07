# Aegis - Personal Fitness & Productivity Dashboard

<div align="center">
  <img src="https://img.shields.io/badge/Python-3.8+-blue.svg" alt="Python">
  <img src="https://img.shields.io/badge/FastAPI-0.104+-green.svg" alt="FastAPI">
  <img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="MIT License">
</div>

## 🚀 Overview

Aegis is a unified personal dashboard that brings together your fitness data from Strava and productivity metrics from TickTick into a single, coherent interface. Built with privacy-first principles, it stores all your data in your own PostgreSQL database while providing powerful analytics and insights.

### Why Aegis?

In our digital age, personal data is scattered across multiple platforms:
- Fitness activities locked in Strava
- Tasks and productivity metrics trapped in TickTick
- Health metrics manually tracked in various apps

Aegis solves this by creating **your personal data lake** - a single source of truth for your quantified self, enabling:
- Cross-platform insights (correlate workout performance with task completion)
- Historical trend analysis across all life metrics
- Data ownership and portability
- Custom analytics and reporting
- AI-powered insights via Claude Desktop integration

## ✨ Features

### 🏃‍♂️ Fitness Tracking
- Automatic sync of all Strava activities
- Detailed metrics: distance, elevation, heart rate, power
- Performance trend analysis
- Activity type breakdowns

### ✅ Productivity Management
- Sync tasks and projects from TickTick
- Create tasks programmatically
- Track completion rates and productivity trends
- Project-based analytics

### 📊 Health Metrics
- Track daily nutrition (calories, protein)
- Monitor weight trends
- Custom metric tracking
- Correlation analysis between fitness and health

### 🤖 AI Integration
- Native MCP (Model Context Protocol) server for Claude Desktop
- Natural language queries about your data
- Intelligent insights and recommendations
- Automated task creation and metric updates

## 🛠️ Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│     Strava      │     │    TickTick     │     │  Manual Input   │
│      API        │     │      API        │     │   (Gradio UI)   │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                         │
         └───────────────────────┴─────────────────────────┘
                                 │
                    ┌────────────┴────────────┐
                    │     FastAPI Server      │
                    │   (Data Ingestion)      │
                    └────────────┬────────────┘
                                 │
                    ┌────────────┴────────────┐
                    │   PostgreSQL Database   │
                    │    (Your Data Lake)     │
                    └────────────┬────────────┘
                                 │
                    ┌────────────┴────────────┐
                    │    MCP Server for       │
                    │    Claude Desktop       │
                    └─────────────────────────┘
```

## 🚦 Getting Started

### Prerequisites

- Python 3.8+
- PostgreSQL database (local or cloud-hosted like Neon)
- Strava API application ([create here](https://www.strava.com/settings/api))
- TickTick developer account ([apply here](https://developer.ticktick.com/))
- Node.js 16+ (for MCP server)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/aegis.git
   cd aegis
   ```

2. **Set up Python environment**
   ```bash
   python -m venv .venv
   source .venv/bin/activate  # On Windows: .venv\Scripts\activate
   pip install -r requirements.txt
   ```

3. **Configure environment variables**
   ```bash
   cp .env.sample .env
   # Edit .env with your credentials
   ```

   Required variables:
   - `DATABASE_URL`: PostgreSQL connection string
   - `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `STRAVA_REFRESH_TOKEN`
   - `TICKTICK_CLIENT_ID`, `TICKTICK_CLIENT_SECRET`

4. **Initialize database**
   ```bash
   # The app will auto-create tables on first run
   python -m uvicorn app.main:app
   ```

5. **Set up MCP server (optional, for Claude Desktop)**
   ```bash
   cd aegis-mcp
   npm install
   # Follow instructions in aegis-mcp/README.md
   ```

## 🔧 Usage

### Web Interface

Start the server:
```bash
uvicorn app.main:app --reload
```

Access the Gradio UI at `http://localhost:8000/ui`

Features available:
- Sync data from Strava/TickTick
- View activity summaries
- Update daily health metrics
- Check API connectivity

### Automated Synchronization

Set up automatic data syncing with cron:

```bash
# Quick setup for hourly syncs
crontab -e
# Add: 0 * * * * /path/to/aegis/scripts/cron_wrapper.sh

# Or use the provided example
crontab scripts/crontab.example
```

See [docs/CRON_SETUP.md](docs/CRON_SETUP.md) for detailed configuration options.

### API Endpoints

The FastAPI server provides REST endpoints:

```bash
# Health check
GET /health

# Sync Strava activities
POST /sync/strava

# Get activities
GET /strava/activities?limit=10&type=Run

# Create TickTick task
POST /ticktick/task

# Update daily metrics
POST /metrics
```

Full API documentation available at `http://localhost:8000/docs`

### Claude Desktop Integration

Once configured, ask Claude natural questions like:
- "What was my total running distance last month?"
- "Show me my productivity trends this week"
- "Create a task to review my training plan"
- "What's the correlation between my sleep and running performance?"

## 🔐 Security & Privacy

- **No data leaves your control**: All data stored in your database
- **Credentials secured**: OAuth tokens encrypted and stored safely
- **Open source**: Full transparency on data handling
- **API keys protected**: Never committed to version control

## 🤝 Contributing

We welcome contributions! Areas of interest:

- Additional data source integrations (Garmin, Apple Health, Todoist)
- Enhanced analytics and visualizations
- Mobile app development
- Machine learning models for pattern detection

Please read our [Contributing Guidelines](CONTRIBUTING.md) before submitting PRs.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

Built with:
- [FastAPI](https://fastapi.tiangolo.com/) - Modern web framework
- [Gradio](https://gradio.app/) - UI components
- [MCP SDK](https://modelcontextprotocol.io/) - Claude Desktop integration
- [psycopg](https://www.psycopg.org/) - PostgreSQL adapter

## 📮 Support

- 📧 Email: your.email@example.com
- 💬 Discord: [Join our community](https://discord.gg/yourinvite)
- 🐛 Issues: [GitHub Issues](https://github.com/yourusername/aegis/issues)

---

<div align="center">
  <p>Built with ❤️ for the quantified self community</p>
  <p>⭐ Star us on GitHub if you find this useful!</p>
</div>