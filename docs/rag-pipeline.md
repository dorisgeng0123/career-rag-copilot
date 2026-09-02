# RAG Pipeline

## 1. Document Ingestion

The system treats Markdown files as structured knowledge assets. It preserves file path, title, asset type, and metadata.

## 2. Chunking Strategy

Chunking is asset-aware:

- Resume content is chunked by capability and positioning.
- Project content is chunked by business context, product action, result, and trade-off.
- Interview recaps are chunked by question, feedback, and improvement note.
- AI knowledge articles are chunked by concept and method.

## 3. Ontology and Metadata

Each chunk receives ontology labels and tags. This allows retrieval to combine semantic similarity with structured filters.

## 4. Retrieval

Each task mode defines preferred asset types and tags. The retrieval layer scores chunks by query overlap, task fit, tag fit, and ontology relevance.

## 5. Reranking

Retrieved chunks are reranked by relevance to the JD, question, task mode, and candidate positioning.

## 6. Context Assembly

The selected chunks are grouped into facts, concepts, and boundaries before generation.

## 7. Grounded Generation

The answer should use retrieved evidence, cite sources, and separate direct experience from conceptual knowledge.

## 8. Evaluation and Guardrails

The demo checks:

- Factual accuracy
- Source grounding
- Intent recognition
- JD relevance
- Interview answer quality
- Project claim boundaries
- Candidate positioning fit
