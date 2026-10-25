import { z } from 'zod';
import { AGE_BANDS, GENDERS, INSIGHTS_TYPES, SEARCH_TYPES, SORT_MODES } from '@taste/qloo';

/** Types accepted as `filter.type` by /v2/insights. */
export const insightsTypeSchema = z.enum(INSIGHTS_TYPES);
export const searchTypeSchema = z.enum(SEARCH_TYPES);

const entityId = z.string().min(1).describe('A Qloo entity ID obtained from qloo_search_entities.');
const tagId = z.string().min(1).describe('A Qloo tag ID obtained from qloo_search_tags (not free text).');
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use ISO 8601 YYYY-MM-DD.');

export const searchEntitiesShape = {
  query: z.string().min(1).describe('Free-text name or description, e.g. "Blade Runner 2049", "A24", "Tokyo".'),
  types: z
    .array(searchTypeSchema)
    .min(1)
    .max(5)
    .optional()
    .describe('Entity types to search. Omit to search all. /search also accepts actor, album, author, director, locality.'),
  location: z.string().optional().describe('Latitude/longitude, WKT, or a Qloo location ID.'),
  radiusMiles: z.number().min(0).max(100).optional().describe('Radius in MILES (default 10, max 100).'),
  take: z.number().int().min(1).max(20).optional().describe('Number of candidates to return (default 5).'),
};

export const searchTagsShape = {
  query: z.string().optional().describe('Concept to look up, e.g. "neo-noir", "slow living".'),
  nameContains: z.string().optional().describe('Partial match on the tag name.'),
  tagTypes: z.array(z.string()).max(10).optional().describe('Restrict to tag types (exact match).'),
  semantic: z.boolean().optional().describe('Semantic tag search (beta). Requires query.'),
  take: z.number().int().min(1).max(50).optional().describe('Maximum results (default 20, max 50).'),
};

export const recommendShape = {
  type: insightsTypeSchema.describe(
    'What to recommend: artist, book, brand, destination, movie, person, place, podcast or tv_show. Anything else returns HTTP 400.',
  ),
  entities: z.array(entityId).max(20).optional().describe('Seed tastes as Qloo entity IDs — the taste graph signal.'),
  tags: z.array(tagId).max(20).optional().describe('Seed concepts as Qloo tag IDs.'),
  audiences: z
    .array(z.string().min(1))
    .max(10)
    .optional()
    .describe('Audience UUIDs from qloo_search_audiences. Nudges the taste signal toward a demographic or lifestyle group.'),
  take: z.number().int().min(1).max(50).optional().describe('Number of recommendations (default 6 for the game).'),
  explain: z.boolean().optional().describe('Include per-result contributor scores (default true).'),
  sortBy: z.enum(SORT_MODES).optional().describe('Ranking mode. Default is affinity order.'),
  filterTags: z.array(tagId).max(10).optional().describe('Keep only results carrying these tags.'),
  excludeTags: z.array(tagId).max(10).optional().describe('Drop results carrying these tags.'),
  locationQuery: z.string().optional().describe('Fuzzy place name applied to results (not to the taste signal).'),
  age: z.enum(AGE_BANDS).optional(),
  gender: z.enum(GENDERS).optional(),
  diversifyBy: z.string().optional().describe('Qloo diversify dimension, e.g. "urn:tag:genre".'),
};

export const compareShape = {
  type: insightsTypeSchema.describe('Entity type compared across both taste profiles.'),
  a: z.array(entityId).min(1).max(20).describe('Taste profile A: entity IDs.'),
  b: z.array(entityId).min(1).max(20).describe('Taste profile B: entity IDs.'),
  take: z.number().int().min(1).max(50).optional(),
};

export const trendingShape = {
  type: insightsTypeSchema.describe('Entity type whose popularity trend is measured.'),
  startDate: isoDate.describe('Window start, ISO 8601 (YYYY-MM-DD). Use at least six months.'),
  endDate: isoDate.describe('Window end, ISO 8601 (YYYY-MM-DD).'),
  entities: z
    .array(entityId)
    .min(1)
    .max(20)
    .describe('Seed entities. Required by the endpoint: omitting it returns HTTP 400.'),
  take: z.number().int().min(1).max(50).optional(),
};

export const getEntitiesShape = {
  ids: z
    .array(entityId)
    .min(1)
    .max(20)
    .describe('Qloo entity IDs. URNs such as `urn:entity:movie:<uuid>` are reduced to bare UUIDs automatically.'),
};

export const searchAudiencesShape = {
  query: z.string().optional().describe('Free-text search across audience names, e.g. "music festival", "sneakerheads".'),
  parentTypes: z
    .array(z.string())
    .max(5)
    .optional()
    .describe('Entity types the audience applies to, e.g. urn:entity:movie.'),
  audienceTypes: z
    .array(z.string())
    .max(5)
    .optional()
    .describe('Audience types, e.g. urn:audience:leisure. Get valid values from qloo_list_types.'),
  take: z.number().int().min(1).max(50).optional().describe('Maximum results (default 20, max 50).'),
};

export const listTypesShape = {
  kind: z
    .enum(['tag', 'audience'])
    .optional()
    .describe('Which taxonomy to list: tag types (default) or audience types.'),
  type: z.string().optional().describe('Restrict to one exact type, e.g. urn:tag:genre:qloo.'),
  parentTypes: z
    .array(z.string())
    .max(5)
    .optional()
    .describe('Restrict to types that apply to these entity types, e.g. urn:entity:movie.'),
};

export const profileShape = {
  likes: z
    .array(z.string().min(1))
    .min(1)
    .max(5)
    .describe('Free-text tastes, e.g. ["neo-noir", "Aphex Twin", "Kyoto"].'),
  types: z
    .array(searchTypeSchema)
    .min(1)
    .max(6)
    .optional()
    .describe('Restrict resolution to these entity types. Defaults to movie, artist, tv_show, book, place, podcast.'),
  tagLimit: z.number().int().min(0).max(10).optional().describe('Max tags to resolve per like (default 3).'),
};

export const explainShape = {
  type: insightsTypeSchema.describe('Entity type of the candidate.'),
  entities: z.array(entityId).min(1).max(20).describe('Seed tastes the candidate was ranked against.'),
  candidateId: entityId.optional().describe('The result to explain. Omit for the top result.'),
  take: z.number().int().min(1).max(50).optional().describe('How deep to rank before explaining (default 20).'),
};

export type SearchEntitiesInput = z.infer<z.ZodObject<typeof searchEntitiesShape>>;
export type SearchTagsInput = z.infer<z.ZodObject<typeof searchTagsShape>>;
export type RecommendInput = z.infer<z.ZodObject<typeof recommendShape>>;
export type CompareInput = z.infer<z.ZodObject<typeof compareShape>>;
export type TrendingInput = z.infer<z.ZodObject<typeof trendingShape>>;
export type ProfileInput = z.infer<z.ZodObject<typeof profileShape>>;
export type ExplainInput = z.infer<z.ZodObject<typeof explainShape>>;
export type GetEntitiesInput = z.infer<z.ZodObject<typeof getEntitiesShape>>;
export type SearchAudiencesInput = z.infer<z.ZodObject<typeof searchAudiencesShape>>;
export type ListTypesInput = z.infer<z.ZodObject<typeof listTypesShape>>;
