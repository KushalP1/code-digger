# Engineering Playbook: Understand Massive AI-Written Codebases Fast

This playbook is the operating method for engineers using Code Digger.

## Objective

Reduce cognitive load, not just search time.

The target state is:

- You know system boundaries quickly
- You know critical flows quickly
- You know blast radius before making changes

## Step-by-step protocol

1. **Global orientation**
   - Run `summarize_scope` (repo level).
   - Note top domains by file count and top symbols.
   - If no question yet, run `auto_understand_codebase` first.

2. **Mission framing**
   - Ask one concrete question with `ask_codebase`.
   - Example: "Where are retries and circuit breakers in checkout?"

3. **Flow reconstruction**
   - Run `trace_feature` for the same feature.
   - Build a minimal path: entrypoint -> domain logic -> side effects.

4. **Depth zoom**
   - Re-run `summarize_scope` on top 1-2 folders or files returned.
   - Read only those files first.
   - For Python-heavy modules, run `python_symbol_insight` on core classes/functions.

5. **Safe execution**
   - Before changing anything, run `impact_analysis` on candidate files.
   - If risk score is high, stage rollout and add integration tests.

6. **Knowledge capture**
   - Save key findings into your team docs:
     - business intent
     - domain owner
     - unsafe assumptions

## Role-specific mode

- **Beginner**
  - Follow `learning_path(beginner)` exactly.
  - Focus on flows and boundaries, not implementation details first.

- **Senior Engineer**
  - Use `learning_path(senior)`.
  - Prioritize reliability paths and coupling hotspots.

- **Architect**
  - Use `learning_path(architect)`.
  - Focus on domain drift and simplification opportunities.

## Query style guide for better answers

Good:

- "How does onboarding send welcome emails and analytics?"
- "Which code paths update invoice status after Stripe webhooks?"

Weak:

- "Explain this repo."
- "Where is bug?"

Specific intent produces higher-precision traces.

## Low-token mode

For minimum output tokens:

- Use `auto_understand_codebase` with `style: caveman` and `tokenBudget: 250-400`.
- Use `architecture_diagram` with `maxNodes: 8-12` and `style: caveman`.
- Use focused feature names in `trace_feature`.

## Operational cadence

- Re-index after major merges or generated-code updates.
- Run architecture summary weekly.
- Use impact analysis for every shared/module-core change.
