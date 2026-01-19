import 'dotenv/config';
import { createAgent, tool } from "langchain";
import { z } from "zod";

const getWeather = tool((input) => `It's always sunny in ${input.city}!`, {
  name: "get_weather",
  description: "Get the weather for a given city",
  schema: z.object({
    city: z.string().describe("The city to get the weather for"),
  }),
});

const agent = createAgent({
  model: "openai:gpt-3.5-turbo",
  tools: [getWeather],
});

// Run the agent
(async () => {
  try {
    const result = await agent.invoke({
      messages: [{ role: "user", content: "What's the weather in San Francisco?" }],
    });
    console.log('Agent result:', result);
  } catch (err) {
    console.error('Agent failed:', err);
  }
})();
