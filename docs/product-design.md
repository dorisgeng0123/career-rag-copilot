# Product Design

## Positioning

Career RAG Copilot is an ontology-aware RAG workspace for grounded interview preparation.

The first version is a public demo aimed at recruiters, hiring managers, and AI product interviewers. It shows how a career knowledge base can support JD matching, self introduction, project deep dives, defense questions, and closing questions.

## User Value

Before an interview, the user can input a JD and a question. The system retrieves relevant evidence from synthetic career assets and produces an interview-ready answer with source references and quality checks.

## Main Surface

The product uses a dense AI workspace layout:

- Left: knowledge asset overview cards. Each card opens a secondary asset page for upload, file list review, and file preview.
- Center: main interview flow. The user selects a task mode, uploads a JD screenshot, enters a question, and clicks the answer button.
- Right: generated answer, secondary-flow entry points, and final quality review.

## Secondary Flows

From the main answer flow, the user can open:

- RAG Pipeline
- Supporting Evidence
- Answer Boundary

## Final Review

The final quality review contains three scored checks:

- Intent Match
- RAG Grounding
- Answer Quality

Each score can be expanded to show the reasoning behind the evaluation.

## First Version Scope

The first version uses deterministic demo mode. It does not call an external model or embedding API. This keeps the public demo stable, private, and easy to run.

Future live mode can replace the demo retrieval and generation layers with embeddings, a vector index, and model calls.
