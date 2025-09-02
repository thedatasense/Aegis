import { Aegis } from './core/aegis';
import dotenv from 'dotenv';
import readline from 'readline';

// Load environment variables
dotenv.config();

// Create readline interface for CLI interaction
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: 'Aegis> '
});

async function main() {
  // Check required environment variables
  const userId = process.env.USER_ID;
  const databaseUrl = process.env.DATABASE_URL;

  if (!userId || !databaseUrl) {
    console.error('Error: Missing required environment variables.');
    console.error('Please set USER_ID and DATABASE_URL in your .env file.');
    process.exit(1);
  }

  console.log('=�  Initializing Aegis...\n');

  try {
    // Initialize Aegis
    const aegis = new Aegis(userId, databaseUrl);
    await aegis.initialize();

    console.log(' Aegis is ready! Type "help" for commands or start chatting.\n');

    // Show initial greeting
    const greeting = await aegis.processCommand('good morning');
    console.log(greeting);
    console.log();

    // Start interactive prompt
    rl.prompt();

    rl.on('line', async (input) => {
      const trimmedInput = input.trim();

      if (trimmedInput.toLowerCase() === 'exit' || trimmedInput.toLowerCase() === 'quit') {
        console.log('\nGoodbye! Keep working towards your goals! =�');
        rl.close();
        process.exit(0);
      }

      if (trimmedInput.toLowerCase() === 'help') {
        showHelp();
        rl.prompt();
        return;
      }

      try {
        const response = await aegis.processCommand(trimmedInput);
        console.log('\n' + response + '\n');
      } catch (error) {
        console.error('\n❌ Error:', error instanceof Error ? error.message : String(error));
        console.log('Please try again.\n');
      }

      rl.prompt();
    });

  } catch (error) {
    console.error('❌ Failed to initialize Aegis:', error instanceof Error ? error.message : String(error));
    console.error('\nPlease check your database connection and user setup.');
    process.exit(1);
  }
}

function showHelp() {
  console.log(`
=�  Aegis Commands:

=� Task Management:
  - "Add task [title] (duration)" - Add a new task with optional duration
  - "Complete [task name]" - Mark a task as completed
  - "What should I work on?" - Get task recommendations
  - "Show September deadlines" - List all September 2025 deadlines

<}  Nutrition & Fasting:
  - "Log [meal]: [description] [calories]" - Log a meal
  - "Start fasting" - Begin a fasting session
  - "End fast" - End current fasting session
  - "How many calories left?" - Check remaining calorie budget
  - "Am I over budget?" - Check if exceeded 1100 calorie limit

<� Health & Fitness:
  - "Ran [X] miles" - Log a run
  - "Did I run today?" - Check if you've completed your daily run
  - "Weekly running stats" - See your weekly running summary

=� Planning:
  - "Plan my day" - Get daily time allocation recommendations
  - "How much time for PhD today?" - Check time allocation for specific category

=� Status:
  - "Status" - Get overall daily status
  - "Good morning/afternoon/evening" - Get comprehensive status update

=� General:
  - "help" - Show this help message
  - "exit" or "quit" - Exit Aegis

Remember: 
- Daily goals: 3-mile run, stay under 1100 calories
- September 2025: Critical deadlines for PhD and work projects
  `);
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\nShutting down Aegis...');
  rl.close();
  process.exit(0);
});

// Start the application
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});