// A small, realistic "toolbox" of function/tool definitions (OpenAI-style),
// plus example model outputs — most of them subtly broken in the ways models
// actually break them. All scenarios are validated against this same toolbox.

import type { ToolDef } from "../lib/types";

export const TOOLS: ToolDef[] = [
  {
    name: "search_flights",
    description: "Search available flights between two airports on a date.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["origin", "destination", "date", "passengers", "cabin"],
      properties: {
        origin: { type: "string", description: "3-letter IATA origin code" },
        destination: { type: "string", description: "3-letter IATA destination code" },
        date: { type: "string", format: "date", description: "YYYY-MM-DD departure date" },
        passengers: { type: "integer", minimum: 1, maximum: 9 },
        cabin: { type: "string", enum: ["economy", "premium", "business", "first"] },
      },
    },
  },
  {
    name: "send_email",
    description: "Send an email to one recipient.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["to", "subject", "body"],
      properties: {
        to: { type: "string", format: "email" },
        subject: { type: "string", maxLength: 120 },
        body: { type: "string" },
        cc: { type: "array", items: { type: "string", format: "email" }, maxItems: 10 },
      },
    },
  },
  {
    name: "set_thermostat",
    description: "Set a zone's thermostat.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["zone", "temperature_c", "mode"],
      properties: {
        zone: { type: "string", enum: ["living_room", "bedroom", "kitchen", "office"] },
        temperature_c: { type: "number", minimum: 10, maximum: 30 },
        mode: { type: "string", enum: ["heat", "cool", "auto"] },
      },
    },
  },
  {
    name: "create_calendar_event",
    description: "Create a calendar event.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["title", "start", "duration_minutes"],
      properties: {
        title: { type: "string" },
        start: { type: "string", format: "date-time" },
        duration_minutes: { type: "integer", minimum: 5, maximum: 480 },
        attendees: { type: "array", items: { type: "string", format: "email" } },
      },
    },
  },
  {
    name: "get_stock_quote",
    description: "Get the latest quote for a ticker symbol.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["symbol"],
      properties: {
        symbol: { type: "string", pattern: "^[A-Z]{1,5}$" },
      },
    },
  },
];

export interface Scenario {
  id: string;
  label: string;
  /** One-line hint about what is wrong (shown under the picker). */
  hint: string;
  raw: string;
}

export const SCENARIOS: Scenario[] = [
  {
    id: "flights-messy",
    label: "Flights · fenced JSON, string int, enum typo",
    hint: "Prose + code fence + trailing comma; passengers is a string, cabin misspelled — all safely repairable.",
    raw:
      'Sure — searching those flights now.\n\n```json\n{\n  "name": "search_flights",\n  "arguments": {\n    "origin": "SFO",\n    "destination": "JFK",\n    "date": "2026-08-14",\n    "passengers": "2",\n    "cabin": "buisness",\n  }\n}\n```',
  },
  {
    id: "name-typo",
    label: "Flights · misspelled tool name",
    hint: 'Calls "search_flght" — a one-edit typo for a real tool. Arguments are clean.',
    raw:
      '{ "name": "search_flght", "arguments": { "origin": "DEL", "destination": "BLR", "date": "2026-09-01", "passengers": 1, "cabin": "economy" } }',
  },
  {
    id: "openai-stringified",
    label: "Thermostat · OpenAI tool_calls, stringified args",
    hint: "Real OpenAI shape with arguments as a JSON string; zone missing an underscore, temperature is a string.",
    raw:
      '{\n  "tool_calls": [\n    {\n      "id": "call_1",\n      "type": "function",\n      "function": {\n        "name": "set_thermostat",\n        "arguments": "{\\"zone\\": \\"livingroom\\", \\"temperature_c\\": \\"22\\", \\"mode\\": \\"auto\\"}"\n      }\n    }\n  ]\n}',
  },
  {
    id: "single-quotes",
    label: "Stock quote · single quotes + Python None",
    hint: "Python-flavoured JSON: single quotes, None, trailing comma, plus an argument the schema forbids.",
    raw: "{ 'name': 'get_stock_quote', 'arguments': { 'symbol': 'MSFT', 'exchange': None, } }",
  },
  {
    id: "missing-required",
    label: "Email · missing a required field",
    hint: '"body" is required and absent with no default — this one cannot be safely repaired.',
    raw: '{ "name": "send_email", "arguments": { "to": "team@example.com", "subject": "Q3 numbers" } }',
  },
  {
    id: "out-of-range",
    label: "Thermostat · value out of range",
    hint: "temperature_c is 45, above the schema maximum of 30 — a real constraint break we won't guess a fix for.",
    raw: '{ "name": "set_thermostat", "arguments": { "zone": "bedroom", "temperature_c": 45, "mode": "heat" } }',
  },
  {
    id: "clean",
    label: "Calendar · already valid",
    hint: "A well-formed call — validates clean with nothing to repair.",
    raw:
      '{ "name": "create_calendar_event", "arguments": { "title": "Design review", "start": "2026-08-01T15:00:00Z", "duration_minutes": 30, "attendees": ["a@corp.com", "b@corp.com"] } }',
  },
];
