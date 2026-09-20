// Features the team's backend already implements. The map UI exposes a button for each one.
// Nothing here calls the backend yet: see INTEGRATION_PLAN.md for the phase that wires each one up.

export type Feature = {
  id: string;
  label: string;
  blurb: string;
  /** Team backend routes this button will call once integrated. */
  endpoints: string[];
  /** Label of the matching tab in the team's Vite app (frontend/), which works today. */
  teamNav: string;
  /** Integration phase from INTEGRATION_PLAN.md. */
  phase: number;
  /** True once the button is really wired to the backend (its panel shows live content, not the placeholder). */
  ready?: boolean;
};

export const GLOBAL_FEATURES: Feature[] = [
  {
    id: "talk",
    label: "Talk to me",
    blurb: "Speak with a voice agent that knows your network and your goal, hands-free.",
    endpoints: ["WS /voice/session?mode=network&goal_id=…"],
    teamNav: "Talk to your network",
    phase: 5,
  },
  {
    id: "ask",
    label: "Ask your network",
    blurb: "Chat with a copilot that answers questions about the people and relationships on your map.",
    endpoints: ["POST /copilot/turn"],
    teamNav: "Talk to your network",
    phase: 4,
  },
  {
    id: "meeting",
    label: "New meeting",
    blurb: "Record or transcribe a live meeting, then confirm what it learned about the people in it.",
    endpoints: [
      "POST /meetings",
      "POST /meetings/{id}/chunks",
      "POST /meetings/{id}/end",
      "POST /meetings/{id}/confirm",
      "POST /meetings/ask/query",
    ],
    teamNav: "Meetings · New Meeting",
    phase: 5,
  },
  {
    id: "braindump",
    label: "Brain dump",
    blurb: "Type or say everything you remember; it extracts people, follow-ups and reminders for you.",
    endpoints: ["POST /brain-dumps/extract", "POST /brain-dumps/confirm", "GET /brain-dumps/who-next"],
    teamNav: "Goal views (then Brain dump on a person)",
    phase: 3,
    ready: true,
  },
  {
    id: "suggest",
    label: "Suggest people",
    blurb: "Break your goal into sub-goals and the kinds of people worth meeting next.",
    endpoints: ["POST /agents/goal-network", "GET /agents/goal-network/{id}"],
    teamNav: "Goal agent",
    phase: 2,
    ready: true,
  },
  {
    id: "goalviews",
    label: "Goal views",
    blurb: "See who on your map matches your goal, sorted by company, club or area.",
    endpoints: ["GET /goals/{id}/graph", "GET /network/tracker"],
    teamNav: "Goal views",
    phase: 2,
    ready: true,
  },
];

export const PERSON_FEATURES: Feature[] = [
  {
    id: "research",
    label: "Research",
    blurb: "Pull public background on this person and get thoughtful questions to ask them.",
    endpoints: ["POST /research", "GET /research/people/{id}", "POST /research/briefs/{id}/questions"],
    teamNav: "Research",
    phase: 3,
    ready: true,
  },
  {
    id: "practice",
    label: "Practice conversation",
    blurb: "Rehearse talking to this person with an AI stand-in, then get feedback on how it went.",
    endpoints: ["POST /copilot/practice/turn", "POST /copilot/practice/feedback"],
    teamNav: "Talk to your network (then Practice)",
    phase: 3,
    ready: true,
  },
  {
    id: "person-braindump",
    label: "Brain dump",
    blurb: "Capture what you remember about this person and turn it into notes and reminders.",
    endpoints: ["POST /brain-dumps/extract", "POST /brain-dumps/confirm", "POST /brain-dumps/reminders"],
    teamNav: "Goal views (Brain dump on a person)",
    phase: 3,
    ready: true,
  },
  {
    id: "person-meeting",
    label: "Log a meeting",
    blurb: "Start or review a meeting with this person and see your history with them.",
    endpoints: ["POST /meetings", "GET /meetings/people/{id}/timeline"],
    teamNav: "Meetings · New Meeting",
    phase: 5,
  },
];
