# 017 Framework Extensibility

Ptah is currently a monolithic CLI (`@ohenak/ptah`) with no library exports, no plugin hooks, and no standard protocol support. This milestone restructures Ptah into a reusable framework: a core library with programmatic API, a plugin system for custom agent types and workflow hooks, and interoperability via MCP (tool integration) and A2A (agent-to-agent communication).

After completion, developers can embed Ptah's orchestration into their own applications, extend it with custom agent types without forking, and interoperate with agents built on other frameworks.
