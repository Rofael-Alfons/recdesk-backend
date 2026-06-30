/**
 * Smoke-test the configured AI provider/key WITHOUT booting the whole app.
 *
 * Why: CV parsing and candidate scoring are the core of the demo. If the
 * production AI provider/key is misconfigured, uploads succeed but every CV
 * silently fails to parse/score. This script mirrors AiService's provider
 * selection (AI_PROVIDER + OPENAI_API_KEY / GROQ_API_KEY + GROQ_MODEL) and
 * makes one tiny live call to prove the credentials work.
 *
 * Usage (run with the target environment's variables loaded):
 *   npx ts-node -r tsconfig-paths/register src/scripts/verify-ai.ts
 *
 * Exit code 0 = AI is working. Non-zero = misconfigured (do not demo until fixed).
 */

import OpenAI from 'openai';
import Groq from 'groq-sdk';
import * as dotenv from 'dotenv';

dotenv.config();

async function main() {
  const provider = (process.env.AI_PROVIDER || 'groq').toLowerCase();
  const prompt = 'Reply with exactly the word: OK';

  console.log(`AI_PROVIDER = ${provider}`);

  if (provider === 'openai') {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.error('ERROR: OPENAI_API_KEY is not set but AI_PROVIDER=openai.');
      process.exit(1);
    }
    const model = 'gpt-5.4-mini'; // matches AiService
    console.log(`Testing OpenAI (model: ${model})...`);
    const openai = new OpenAI({ apiKey });
    // Mirrors AiService: uses the Responses API with developer/user roles.
    const res = await openai.responses.create({
      model,
      input: [
        {
          role: 'developer',
          content: [
            { type: 'input_text', text: 'You are a connectivity smoke test.' },
          ],
        },
        {
          role: 'user',
          content: [{ type: 'input_text', text: prompt }],
        },
      ],
      text: { format: { type: 'text' }, verbosity: 'low' },
      reasoning: { effort: 'low', summary: 'auto' },
      store: true,
    });
    const content = res.output_text?.trim();
    if (!content) {
      console.error('ERROR: OpenAI returned an empty response.');
      process.exit(1);
    }
    console.log(`OpenAI responded: "${content}"`);
  } else {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      console.error('ERROR: GROQ_API_KEY is not set but AI_PROVIDER=groq.');
      process.exit(1);
    }
    const model = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile'; // matches AiService
    console.log(`Testing Groq (model: ${model})...`);
    const groq = new Groq({ apiKey });
    const res = await groq.chat.completions.create({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
      max_tokens: 5,
    });
    const content = res.choices[0]?.message?.content?.trim();
    if (!content) {
      console.error('ERROR: Groq returned an empty response.');
      process.exit(1);
    }
    console.log(`Groq responded: "${content}"`);
  }

  console.log('\nAI provider is reachable and the key works. Safe to demo scoring.');
}

main().catch((err) => {
  console.error('\nAI smoke test FAILED:', err?.message || err);
  console.error('Do not run the scoring demo until this passes.');
  process.exit(1);
});
