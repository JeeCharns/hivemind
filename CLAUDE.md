# Claude Code Instructions (Hivemind)

This section tells Claude Code how to orient in this repo and how to keep documentation in sync with changes.

## Read First (Repo Context)

Before making changes, skim these in order:

1. `docs/README.md` (repo map)
2. `docs/ARCHITECTURE.md` (layers + invariants)
3. `docs/feature-map.md` (flow → code pointers)
4. `docs/setup/README.md` (env, migrations, worker)
5. `docs/decisions/README.md` (ADRs and when required)
6. `docs/examples/golden-path-api.md` (copyable reference patterns)

Then consult module READMEs as needed:

- Auth: `lib/auth/README.md`
- Conversations: `lib/conversations/README.md`
- Shared `lib/` conventions: `lib/README.md`
- Shared contracts: `types/README.md`
- Worker ops: `scripts/README.md`
- Supabase schema/migrations: `supabase/README.md`
- Route groups: `app/(auth)/README.md`, `app/(hives)/README.md`

## Documentation Ownership (Source of Truth)

When something changes, update the _closest_ owner doc rather than adding new one-off docs.

- Repo navigation and “where to look”: `docs/README.md`
- System boundaries/invariants: `docs/ARCHITECTURE.md`
- User-facing flows and wiring: `docs/feature-map.md`
- Setup steps (env/migrations/worker): `docs/setup/README.md`
- Auth behavior and middleware decisions: `lib/auth/README.md`
- Conversation lifecycle and new session flow: `lib/conversations/README.md`
- Worker runbook: `scripts/README.md`
- DB migrations overview: `supabase/README.md`

## Documentation Update Rules (Required)

Before finishing any task, perform a “doc impact scan”:

1. Did I change a user-facing flow, route, or API shape?
   - Update `docs/feature-map.md` (add/adjust pointers).
2. Did I add/change a module boundary, invariant, or architectural rule?
   - Update `docs/ARCHITECTURE.md` (keep it short; link to code).
3. Did I change how to run/setup/deploy something?
   - Update `docs/setup/README.md` (and the specific owner doc below).
4. Did I change auth/session/middleware behavior?
   - Update `lib/auth/README.md`.
5. Did I change new-session/conversation lifecycle, analysis, or reporting?
   - Update `lib/conversations/README.md`.
6. Did I add/change migrations?
   - Update `supabase/README.md` and `docs/setup/README.md`.
7. Did I add/change scripts/worker behavior or env vars?
   - Update `scripts/README.md` and `docs/setup/README.md`.
8. Did I make an architecture/infra decision that’s hard to reverse?
   - Add an ADR under `docs/decisions/` and list it in `docs/decisions/README.md`.

If none apply, explicitly state “No doc updates needed” and why.

## Quality Bar (Production-Ready)

- Keep routes thin: authenticate/authorize, validate, call `lib/**/server/*`, return stable responses.
- Avoid `any` in production code; prefer `unknown` + narrowing. Localize unavoidable `any` to tests/mocks.
- Validate boundaries with Zod (request bodies, uploads, CSV) and keep stable error shapes (`{ error, code? }`).
- Prefer deterministic tests with mocked IO; avoid network calls in unit/integration tests.
- Update the closest owner README and `docs/feature-map.md` when flows/routes change; avoid one-off docs.

## Completion Checklist (Required in Final Output)

When you finish an implementation, your final response must include:

- `Tests`: what you ran (or why you did not run tests)
- `Docs`: which docs you updated (or “no doc changes needed”)
- `Risks`: any behavior changes or follow-ups

Before finishing, ensure the right gates were run:

- Always: `npm run lint`, `npm test`
- Always (fast signal): `npm run typecheck`
- If touching routing/build tooling: `npm run build`
- If changing real user journeys: `npm run test:e2e`
- If formatting changed: `npm run format` (and apply via `npm run format:write` when needed)
- If you want a faster local check (and CI uses this): `npm run lint:staged`

## Engineering Guardrails (Repo-Specific)

- Keep route handlers and `page.tsx` thin: authenticate/authorize, validate, call `lib/**/server/*`, return.
- Validate external boundaries with Zod (request bodies, uploads): `lib/**/schemas.ts` / `lib/**/data/*`.
- Put business logic in `lib/` (server services, domain helpers, clients/hooks); keep UI presentational.
- Prefer updating documentation by linking to real code (files/functions) over duplicating logic in prose.

## Additional Guardrails

- API contracts: for `app/api/**`, validate inputs with Zod and return stable `{ error, code? }` errors (use `jsonError` from `lib/api/errors.ts`); centralize request/response types in `types/<domain>-api.ts` (shared in `types/api.ts`).
- Authz checklist: session → id resolution (slug/UUID) → membership/admin gate → DB ops.
- Observability: log with consistent prefixes (`[route]` / `[service]`), never log secrets/tokens/cookies.
- UI baseline: semantic elements, input labels, keyboard support for menus/modals; avoid `alert()` for production UX.
- Routing hygiene: avoid duplicate route trees unless intentional; document canonical paths in `docs/ARCHITECTURE.md`.
- CI note: GitHub Actions runs `lint-staged` on PR diffs for fast, consistent formatting/lint checks (`.github/workflows/quality.yml`).
- Node version: keep local Node aligned with CI (see `.nvmrc`).

---

## Complete Guide for Coding Best Practices: Testability, Security, and Scalability

This guide provides a comprehensive approach to ensuring your application is maintainable, scalable, testable, and secure. By following these principles, your code will be easier to manage, extend, and debug as your application grows.

### 1.  Modularity & Single Responsibility Principle (SRP)

**Goal:** Break the application into small, self-contained components or functions, each responsible for a single task.

#### Implementation Considerations
:
**Separate Concerns:**

UI vs. Business Logic: Keep UI components (e.g., buttons, forms, dropdowns) separate from business logic (e.g., state management, API calls). Use presentational components for rendering UI and container components for handling state, data fetching, and logic.

Example: The AuthProvider should handle authentication logic separately from the UI components like login form and error messages.

**File and Folder Organization:**

Organize files so each file handles one responsibility. For instance, useCurrentUser should manage the user’s session data, while AuthGuard handles the UI flow for authentication.

Reusable Functions: Refactor large functions into smaller, focused functions or components. This improves readability, testability, and maintainability.

**Example:**

```ts
// Refactor large functions into smaller pieces:
const processData = (data: any) => { /_ process data _/ };
const validateData = (data: any) => { /_ validate data _/ };
const saveData = (data: any) => { /_ save data _/ };
```

**Testing for SRP:**

Unit Tests: Write unit tests that target small functions or components. Ensure each unit can be independently tested. Isolate the logic from external dependencies like API calls to make the unit test reliable.

### 2.  SOLID Principles

**Goal:** Use the SOLID principles to design systems that are easier to maintain, extend, and test.

#### Implementation Considerations
:
**Single Responsibility Principle (SRP):**

Ensure that classes/functions handle only one responsibility. For example, useCurrentUser should only be responsible for fetching session information, not for error handling or state management.

**Open/Closed Principle (OCP):**

Code should be open for extension, but closed for modification. For example, when adding new authentication methods, extend AuthProvider instead of modifying it.

**Example:**

```ts
class AuthProvider {
authenticate() { /_ authentication logic _/ }
}

class GoogleAuthProvider extends AuthProvider {
authenticate() { /_ Google auth logic _/ }
}
```

**Liskov Substitution Principle (LSP):**

Ensure that subclasses can replace their parent classes without affecting functionality. For example, the CustomAuthProvider should work anywhere AuthProvider is used.

**Interface Segregation Principle (ISP):**

Avoid forcing clients to implement interfaces they don’t need. For example, UserGetter for fetching user data and UserUpdater for updating user info. Clients implement only what they need.

**Dependency Inversion Principle (DIP):**

High-level modules should not depend on low-level modules. Both should depend on abstractions. For example, use an interface like IDataFetcher to abstract how data is fetched, allowing you to easily swap out different implementations (e.g., REST API, GraphQL).

**Example:**

```ts
interface IDataFetcher {
fetchData(endpoint: string): Promise<any>;
}

class RestFetcher implements IDataFetcher {
async fetchData(endpoint: string) {
const response = await fetch(endpoint);
return response.json();
}
}
```

### 3.  Design Patterns

**Goal:** Use proven design patterns to structure the code efficiently and maintainably.

#### Implementation Considerations
:
**Factory Pattern:** Use this pattern to create objects in a consistent way, abstracting the object creation logic.

**Example:**

```ts
class UserFactory {
createUser(role: string): User {
if (role === "admin") {
return new AdminUser();
}
return new RegularUser();
}
}
```

Observer Pattern: This pattern is ideal when multiple components need to react to a single event. For example, when useCurrentUser updates, components like AuthGuard and Navbar should react to the session changes.

Strategy Pattern: Define interchangeable algorithms for runtime selection. For instance, switch between different data-fetching strategies.

**Example:**

```ts
class DataFetcher {
fetchData() {
if (this.strategy === 'REST') {
return new RestFetcher().fetchData();
}
return new GraphQLFetcher().fetchData();
}
}
```

### 4.  Abstraction

**Goal:** Simplify complex implementations behind clear, understandable interfaces.

#### Implementation Considerations
:
**Abstract Complex Logic:** Hide complex logic behind services, like StorageService for handling file uploads.

**Example:**

```ts
class StorageService {
uploadFile(file: File): Promise<string> {
// abstract file upload logic
}
}
```

Use Interfaces: Define interfaces for dependencies to ensure flexibility. For example, define a UserRepository interface that abstracts the data fetching logic, so the code can easily swap between different data sources.

**Example:**

```ts
interface UserRepository {
getUser(id: string): Promise<User>;
}

class ApiUserRepository implements UserRepository {
async getUser(id: string) {
// fetch user from API
}
}
```

Component Composition: Keep components focused on UI rendering. Delegate complex logic to hooks or services.

**Example:**

```ts
const OrgSelector = () => {
const { data, error } = useFetchOrganizations(); // useFetchOrganizations abstracts API calls
return <div>{/_ render organizations _/}</div>;
};
```

### 5.  Error Handling

**Goal:** Handle errors gracefully and ensure users get meaningful feedback.

#### Implementation Considerations
:
**Try-Catch Blocks:** Use try-catch blocks for error-prone asynchronous code and provide fallback logic.

**Example:**

```ts
try {
const data = await fetchData();
} catch (err) {
if (err instanceof NetworkError) {
console.error("Network error:", err.message);
}
}
```

Error Boundaries: In React, use ErrorBoundaries to catch errors in components and provide a user-friendly fallback UI.

**Example:**

```ts
class ErrorBoundary extends React.Component {
componentDidCatch(error, info) {
logErrorToMyService(error, info);
}
render() {
return this.props.children;
}
}
```

Logging: Implement logging (e.g., using Sentry or LogRocket) to track errors and debug effectively.

### 6.  Scalability & Performance

**Goal:** Build an application that performs well even as it scales.

#### Implementation Considerations
:
**Async Programming:** Use async/await to handle asynchronous code non-blocking. For parallel tasks, use Promise.all.

**Example:**

```ts
const [data1, data2] = await Promise.all([fetchData1(), fetchData2()]);
```

Efficient Data Structures: Use Set for uniqueness checks or Map for fast lookups.

Lazy Loading: Defer loading of non-essential components or data for improved performance.

Database Optimization: Index frequently queried fields and optimize queries to improve performance.

### 7.  Code Testability

**Goal:** Ensure the code is easy to test to guarantee reliable performance.

#### Implementation Considerations
:
**Mock Dependencies:** Use dependency injection to allow easy mocking of services or APIs during testing.

Unit Tests: Focus on small, isolated functions and test them independently using tools like Jest or Mocha.

Integration Tests: Test how components interact with each other.

End-to-End Tests: Simulate real user interactions to ensure the application functions correctly.

### 8.  Security Best Practices

**Goal:** Ensure security is integrated from the start.

#### Implementation Considerations
:
**Sanitize Input:** Always validate user input and sanitize data to prevent injection attacks.

Use HTTPS: Enforce HTTPS to protect data in transit. Implement HSTS to instruct browsers to always use HTTPS.

Authentication & Authorization: Use secure authentication methods like JWT and implement role-based access control (RBAC) to restrict access.

Secure Storage: Store sensitive data like passwords securely using encryption algorithms like bcrypt or argon2.

Logging & Monitoring: Use logging tools like Sentry or Datadog to monitor security events.

CSRF Prevention: Use anti-CSRF tokens to prevent cross-site request forgery.

Security Headers: Set headers like CSP, X-Frame-Options, and X-XSS-Protection to improve security.

### 9.  Process and Tools

**Goal:** Ensure consistent code quality and streamline the development process.

#### Implementation Considerations
:
**Linters & Formatters:** Use ESLint to enforce coding standards and Prettier for consistent formatting.

**Example:**

```bash
npm install --save-dev eslint prettier husky lint-staged
```

CI/CD Integration: Integrate linting, testing, and formatting checks into the CI/CD pipeline to automatically run before merging.

### Summary of Key Considerations for Implementing Best Practices

Modular Code: Break code into small, reusable components and apply the Single Responsibility Principle for easy maintenance and testability.

Scalability & Performance: Implement asynchronous programming, optimize data structures and database queries, and plan for future growth.

Security: Integrate security from day one, ensuring sensitive data is protected, user authentication is handled securely, and security best practices like HTTPS and RBAC are implemented.

Testability: Write unit, integration, and end-to-end tests to ensure the system behaves correctly and is easy to modify and extend.

By following these considerations, you will create an application that is maintainable, scalable, secure, and reliable. This approach will help ensure that the codebase remains flexible and extensible as your application grows and evolves.
