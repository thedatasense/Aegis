# 🛡️ Aegis - Intelligent Personal Assistant

Aegis is an intelligent personal assistant that manages tasks, workouts, nutrition, and fasting through natural conversation. It's designed specifically to help achieve critical September 2025 deadlines while maintaining strict health goals.

## 🎯 Core Features

- **Goal Management**: Tracks PhD and work goals with September 2025 deadline focus
- **Nutrition Tracking**: Strict 1100 calorie daily limit with warnings
- **Fasting Tracker**: Monitor fasting windows with automatic tracking
- **Task Intelligence**: Parse duration from task titles and prioritize by deadlines
- **Health Monitoring**: Daily 3-mile run tracking with streak counting
- **Smart Planning**: AI-powered daily time allocation based on deadline urgency

## 📋 Prerequisites

- Node.js 18+ 
- TypeScript 5+
- Neon Postgres database
- Environment variables configured

## 🚀 Quick Start

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/aegis.git
   cd aegis
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` with your values:
   ```
   DATABASE_URL=postgresql://user:password@host/database
   USER_ID=your-user-uuid
   ```

4. **Initialize database**
   
   First, ensure your Neon database has all required tables. The schema is already set up with:
   - users, high_level_goals, nutrition_logs, fasting_sessions
   - activities, task_completions, conversation_state, etc.

   Add your user and goals:
   ```sql
   -- Insert user (if not exists)
   INSERT INTO users (id, name) VALUES ('your-uuid', 'Your Name');
   
   -- Insert September 2025 goals
   INSERT INTO high_level_goals (user_id, category, goal_name, deadline, priority) VALUES
   ('your-uuid', 'phd', 'Complete VSF Med Paper', '2025-09-30', 100),
   ('your-uuid', 'phd', 'Attention Map Visualization', '2025-09-30', 100),
   ('your-uuid', 'phd', 'Dissertation Proposal', '2025-09-30', 100),
   ('your-uuid', 'work', 'LLM for NSLC Prediction', '2025-09-30', 90),
   ('your-uuid', 'work', 'Granta Deployment', '2025-09-30', 90);
   ```

5. **Build and run**
   ```bash
   npm run build
   npm start
   ```

## 💬 Usage Examples

### Morning Routine
```
Aegis> good morning
Good morning! Here's your status:
- Fasting for 14 hours (great job!)
- Critical September deadlines:
  • VSF Med Paper: 29 days left
  • Dissertation Proposal: 29 days left
- Today's focus: 3 hours on VSF paper, 2 hours on NSLC prep
- Weather is perfect for your 3-mile run at 4pm
- Calorie budget: 1,100 for the day
What would you like to tackle first?
```

### Nutrition Logging
```
Aegis> log breakfast: oatmeal with berries, 400 calories
Logged breakfast: 400 calories (16-hour fast completed!)
Daily budget: 700 calories remaining
Suggestion: Light lunch (300 cal) + dinner (400 cal) to stay on target
```

### Task Management
```
Aegis> add task Review VSF paper section 3 (2h)
Added task: "Review VSF paper section 3" (2h)
📌 Linked to: Complete VSF Med Paper (29 days until deadline)
💡 Suggestion: Best done in the morning when you're fresh
```

### Health Tracking
```
Aegis> ran 3.2 miles
✅ Logged 3.2 mile run (30 minutes, ~320 calories burned)
🎯 Daily 3-mile goal achieved! Great job!
🔥 7-day running streak!
⏱️ Pace: 9:23 min/mile
```

## 🏗️ Architecture

```
aegis/
├── src/
│   ├── core/           # Core system components
│   ├── modules/        # Feature modules (nutrition, tasks, health)
│   ├── services/       # External service integrations
│   ├── utils/          # Utility functions
│   └── index.ts        # Main entry point
```

## 🔧 Development

### Run in development mode
```bash
npm run dev
```

### Run tests
```bash
npm test
```

### Lint code
```bash
npm run lint
```

### Type checking
```bash
npm run typecheck
```

## 🎯 September 2025 Focus

The system is optimized for achieving critical September 2025 deadlines:

- **PhD Goals**: VSF Paper, Attention Map Visualization, Dissertation Proposal
- **Work Goals**: LLM NSLC Presentation, Granta Deployment
- **Health Goals**: Daily 3-mile run, 1100 calorie limit (for 15 lb weight loss)

## 🔐 Security Notes

- Never commit `.env` files
- Keep database credentials secure
- Use environment variables for all sensitive data

## 🤝 Future MCP Integration

While currently using direct Neon database connection, the system is designed to integrate with MCP servers:
- TickTick MCP for task management
- Strava MCP for workout tracking
- Google Calendar for scheduling

## 📝 License

MIT

---

Built to help achieve ambitious goals while maintaining health. September 2025, here we come! 💪