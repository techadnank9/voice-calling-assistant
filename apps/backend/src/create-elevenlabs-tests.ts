/**
 * One-time script: creates all 5 test scenarios as native ElevenLabs simulation tests.
 * Run once with:  npx tsx src/create-elevenlabs-tests.ts
 *
 * Tests will appear in the ElevenLabs dashboard under your agent's Tests tab.
 */

import { config as dotenvConfig } from 'dotenv';
dotenvConfig();

const AGENT_ID = process.env.ELEVENLABS_AGENT_ID!;
const API_KEY  = process.env.ELEVENLABS_API_KEY!;

if (!AGENT_ID || !API_KEY) {
  console.error('Missing ELEVENLABS_AGENT_ID or ELEVENLABS_API_KEY in .env');
  process.exit(1);
}

const BASE = 'https://api.elevenlabs.io';

interface SimulationTestPayload {
  type: 'simulation';
  name: string;
  simulation_scenario: string;
  simulation_max_turns: number;
  success_condition: string;
  dynamic_variables?: Record<string, string>;
}

const TESTS: SimulationTestPayload[] = [
  {
    type: 'simulation',
    name: 'Chicken Dum Biryani — lunch service',
    simulation_scenario:
      'You are a hungry customer calling Mom\'s Biryani restaurant to place a takeout order. ' +
      'You want 1 Chicken Dum Biryani. You have no food allergies. Your name is Test User. ' +
      'Confirm the order when the agent reads it back. Say yes to any confirmation questions.',
    simulation_max_turns: 14,
    success_condition:
      'The agent confirms a Chicken Dum Biryani order has been placed and gives a pickup time. ' +
      'Return True if the agent confirmed the order, False otherwise.',
    dynamic_variables: {
      current_time: '1:00 PM',
      caller_phone_number: '+15550001234'
    }
  },
  {
    type: 'simulation',
    name: 'Mutton Dum Biryani — lunch service',
    simulation_scenario:
      'You are a customer calling Mom\'s Biryani to order 1 Mutton Dum Biryani. ' +
      'No allergies. Your name is Test User. Confirm the order when asked.',
    simulation_max_turns: 14,
    success_condition:
      'The agent confirms a Mutton Dum Biryani order and provides a pickup time. ' +
      'Return True if the agent confirmed the order, False otherwise.',
    dynamic_variables: {
      current_time: '1:00 PM',
      caller_phone_number: '+15550001234'
    }
  },
  {
    type: 'simulation',
    name: 'Veg order — Palak Paneer + Basmati Rice',
    simulation_scenario:
      'You are a vegetarian customer calling Mom\'s Biryani. You want to order 1 Palak Paneer and 1 Basmati Rice. ' +
      'No food allergies. Your name is Test User. Confirm the order when the agent reads it back.',
    simulation_max_turns: 14,
    success_condition:
      'The agent confirms both a Palak Paneer and a Basmati Rice in the order and gives a pickup time. ' +
      'Return True if both items are confirmed, False otherwise.',
    dynamic_variables: {
      current_time: '1:00 PM',
      caller_phone_number: '+15550001234'
    }
  },
  {
    type: 'simulation',
    name: 'Multi-item — Biryani + Mango Lassi + 2 Garlic Naans',
    simulation_scenario:
      'You are a customer calling Mom\'s Biryani for a large order: 1 Chicken Dum Biryani, 1 Mango Lassi, and 2 Garlic Naans. ' +
      'No allergies. Your name is Test User. Confirm the order when the agent reads it back.',
    simulation_max_turns: 16,
    success_condition:
      'The agent confirms all three items (Chicken Dum Biryani, Mango Lassi, and Garlic Naan) and gives a pickup time. ' +
      'Return True if all items are in the confirmed order, False otherwise.',
    dynamic_variables: {
      current_time: '1:00 PM',
      caller_phone_number: '+15550001234'
    }
  },
  {
    type: 'simulation',
    name: 'Advance order — before hours (9 AM)',
    simulation_scenario:
      'You are a customer calling Mom\'s Biryani at 9 AM, before they open. ' +
      'You want to place an advance order for 1 Chicken Dum Biryani. ' +
      'No allergies. Your name is Test User. Accept whatever pickup time the agent offers.',
    simulation_max_turns: 14,
    success_condition:
      'The agent either accepts an advance order for Chicken Dum Biryani with a future pickup time, ' +
      'OR clearly explains kitchen hours and offers to take the order anyway. ' +
      'Return True if the agent handles the before-hours scenario gracefully and confirms or schedules the order, False otherwise.',
    dynamic_variables: {
      current_time: '9:00 AM',
      caller_phone_number: '+15550001234'
    }
  }
];

async function createTest(payload: SimulationTestPayload): Promise<string> {
  const res = await fetch(`${BASE}/v1/convai/agent-testing/create`, {
    method: 'POST',
    headers: {
      'xi-api-key': API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HTTP ${res.status}: ${body}`);
  }

  const data = await res.json() as { id: string };
  return data.id;
}

async function main() {
  console.log(`Creating ${TESTS.length} simulation tests for agent ${AGENT_ID}...\n`);

  const created: { name: string; id: string }[] = [];

  for (const test of TESTS) {
    try {
      const id = await createTest(test);
      console.log(`✅  ${test.name}\n    id: ${id}`);
      created.push({ name: test.name, id });
    } catch (err) {
      console.error(`❌  ${test.name}\n    ${String(err)}`);
    }
  }

  console.log(`\nDone. ${created.length}/${TESTS.length} tests created.`);
  console.log(`\nView them at: https://elevenlabs.io/app/agents/${AGENT_ID}/testing`);
}

main().catch(console.error);
