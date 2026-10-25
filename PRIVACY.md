# Privacy Policy

Taste Check collects as little as it can and stores it inside Reddit's own infrastructure.

## What is stored

Inside the app's Devvit Redis namespace for each installation:

| Key | Contents |
| --- | --- |
| `round:{id}` | A generated round: six public titles, their Qloo IDs, and their rank bands |
| `round:{id}:done` | Map of Reddit username → that player's score for the round |
| `leaderboard`, `leaderboard:rounds` | Cumulative score and games-played per Reddit username |
| `stats:*` | Aggregate counters: rounds, votes, correct answers, per-card misses |

## What is not stored

- No email addresses, no IP addresses, no device identifiers.
- No private messages, no comments, no moderator mail.
- No cross-subreddit profile. Redis in Devvit is namespaced per installation, so two subreddits
  running the app cannot see each other's data.
- No Qloo API key in any client-visible place. It is a global secret setting read only by the server.

## Third parties

The only outbound request is to `https://hackathon.api.qloo.com` (the Qloo API), sending titles and
entity IDs to retrieve related entities and their ranking. No user identifiers are sent to Qloo.

Reddit data is read through Devvit's built-in, permission-scoped Reddit client
(`permissions.reddit`): the app reads public post titles and the moderator list of the subreddit it is
installed in. Nothing else.

## Retention and removal

Scores and rounds live for the life of the installation. Uninstalling the app removes its Redis
namespace. To have a specific score removed sooner, ask a moderator of the subreddit; deleting the
`round:{id}:done` field for your username removes it.

## Children

The app is not directed at children under 13 and stores no age data.

## Changes

Material changes will be reflected in this file in the repository that hosts the project.
