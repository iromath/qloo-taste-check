import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

export function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    'taste_profile_from_description',
    {
      title: 'Taste profile from a description',
      description:
        'Turn a free-text description of a person, audience or brand into a resolved Qloo taste profile and a ranked shortlist.',
      argsSchema: {
        description: z.string().min(1).describe('Who is being profiled, in their own words.'),
        category: z.string().optional().describe('What to recommend, e.g. "movies", "podcasts", "weekend destinations".'),
      },
    },
    ({ description, category }) => ({
      description: 'Resolve a described audience into Qloo IDs, then recommend from it.',
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: [
              'Build a Qloo taste profile for this description:',
              '',
              `"""${description}"""`,
              '',
              'Work in this order, and do not skip a step:',
              '',
              '1. Extract 3–5 concrete tastes (titles, artists, places, genres) from the description. Reject vague adjectives; a phrase like "good vibes" resolves to nothing.',
              '2. Call `qloo_build_taste_profile` with those tastes. If it reports `profile.unresolved`, rewrite those phrases as concrete works rather than guessing IDs.',
              '3. Call `qloo_recommend` with `profile.anchors` as `entities` and `profile.tags` as `tags`.' +
                (category ? ` Recommend type: ${category}.` : ' Pick the most useful entity type for the category the user cares about.'),
              '4. Call `qloo_explain` on the top result to get a `target.reason` line.',
              '',
              'Report: the resolved anchors (names, not bare UUIDs), the ranked shortlist, and one explanation line. ' +
                'If Qloo returns zero results, say so and quote the HTTP 400 message if the call was rejected — do not invent recommendations.',
            ].join('\n'),
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    'cultural_diet_plan',
    {
      title: 'Cultural diet plan',
      description:
        'Build a cross-domain cultural plan (watch / read / listen / visit / shop) from one taste profile, using Qloo ranking and trend data.',
      argsSchema: {
        description: z.string().min(1).describe('The person or audience and what they like.'),
        days: z.string().optional().describe('How long the plan should cover, e.g. "7 days".'),
      },
    },
    ({ description, days }) => ({
      description: 'A cross-domain plan grounded in Qloo rankings.',
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: [
              `Create a${days ? ` ${days}` : ' one-week'} cultural diet for:`,
              '',
              `"""${description}"""`,
              '',
              'Method:',
              '',
              '1. `qloo_build_taste_profile` on the concrete tastes in the description.',
              '2. Run `qloo_recommend` once per domain you cover: movie, tv_show, book, artist, podcast, place, brand. Use the same profile anchors for every call.',
              '3. Use `qloo_trending` for at least one domain, passing the profile anchors as `entities` (the endpoint requires a seed), so the plan can distinguish a rising pick from a safe classic.',
              '4. Use `qloo_compare_tastes` only if the description contains two distinct audiences.',
              '',
              'Output a day-by-day plan. For every item give the title, the domain, its rank for this profile, and a one-sentence reason taken from `qloo_explain` ' +
                '(quote the contributor names and scores). Never invent an item that Qloo did not return; if a domain comes back empty, say which domain and why.',
            ].join('\n'),
          },
        },
      ],
    }),
  );
}
