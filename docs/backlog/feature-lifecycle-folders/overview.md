# Feature Lifecycle Folders

Reorganize the `docs/` folder structure to reflect the lifecycle state of features using three top-level folders: `backlog/`, `in-progress/`, and `completed/`. All Claude skills (product-manager, engineer, tech-lead, test-engineer) and the Ptah orchestrator code must be updated to read/write feature artifacts from these lifecycle-based paths. Features are unnumbered in both backlog and in-progress. They receive a sequential NNN prefix only when promoted to completed, providing a permanent record of completion order.
