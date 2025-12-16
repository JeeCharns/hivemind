# Architecture Decision Records (ADRs)

Use ADRs for changes that affect architecture, infrastructure, or long-term maintainability (anything that is hard to reverse).

## When an ADR is required

Create an ADR when you:

- Introduce a new dependency that affects runtime, build, or deployment
- Change data storage strategy or schema/migration approach
- Introduce a new cross-cutting pattern (auth, logging, validation, routing conventions)
- Make a decision that changes system boundaries or module ownership

## How to write one

- Copy `docs/decisions/adr-template.md` into `docs/decisions/adr-000X-<slug>.md`
- Keep it short; link to the relevant code

