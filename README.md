# Career RAG Copilot

An ontology-aware RAG interview preparation workspace built with synthetic demo data.

This project demonstrates how a Markdown or Obsidian-style career knowledge base can be turned into a grounded interview assistant. It is designed as a public portfolio project: the repository includes demo content only and does not require an API key.

## What It Shows

- Markdown knowledge ingestion concepts
- Asset-aware chunking strategy
- Ontology and metadata modeling
- Task-specific retrieval filters
- Reranking and context assembly
- Grounded answer generation
- Evaluation checks for factual accuracy, intent match, answer quality, and source grounding

## Demo Modes

- **JD Match**: map a JD to candidate capabilities and evidence
- **Self Pitch**: generate a role-specific self introduction
- **Project Deep Dive**: prepare project stories and follow-up questions
- **Defense Q&A**: handle sensitive interview questions with risk boundaries
- **Closing Questions**: generate thoughtful questions to ask the interviewer

## Privacy

This repository ships with synthetic data only.

Do not commit private resumes, interview transcripts, recordings, real company communication records, or screenshots from job platforms. A future live mode should read private vault data locally and keep `.env`, private indexes, and private vault paths out of Git.

## Run Locally

Open `index.html` in a browser, or serve the folder with any static file server.

```bash
npx serve .
```

## Project Structure

```text
career-rag-copilot/
  index.html
  src/
    app.js
    rag.js
    styles.css
    data/
      sampleData.js
  docs/
    product-design.md
    rag-pipeline.md
    ontology-schema.md
```

## Roadmap

- Live embedding mode
- Local vector index
- Obsidian vault connector
- LLM-powered generation
- LLM-as-judge evaluation
- Exportable interview preparation packs
