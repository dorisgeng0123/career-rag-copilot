# Ontology Schema

The demo uses a lightweight career knowledge ontology rather than a full knowledge graph.

## Entity Types

| Entity | Meaning |
| --- | --- |
| `CandidateProfile` | Candidate positioning, strengths, and boundaries |
| `ProjectEvidence` | Project facts, product decisions, outcomes, and trade-offs |
| `Capability` | Skills and capability areas such as AI product, data platform, and workflow design |
| `JobRequirement` | JD requirements and opportunity criteria |
| `InterviewQuestion` | Question types, interviewer concerns, and answer patterns |
| `KnowledgeConcept` | General AI, RAG, agent, and workflow concepts |
| `RiskBoundary` | Claims that require caution or evidence |

## Why Ontology Helps RAG

Plain vector retrieval can find semantically similar text, but interview preparation needs more control. A generated answer may need project facts, conceptual AI knowledge, and risk boundaries at the same time.

Ontology labels help the retrieval layer choose the right mix of evidence for each task mode.
