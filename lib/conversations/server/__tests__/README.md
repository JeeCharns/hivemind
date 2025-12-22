# Incremental Analysis Tests

## Status

Test files have been created with comprehensive coverage per the spec:

1. ✅ **testUtils.ts** - Shared test utilities and mock factories with working helpers
2. ✅ **triggerConversationAnalysis.simple.test.ts** - Reference implementation with 10/10 passing tests
3. ✅ **triggerConversationAnalysis.test.ts** - REFACTORED - 17/17 passing tests (100%)
4. ⚠️ **runConversationAnalysisIncremental.test.ts** - Needs refactoring to use new mock helpers
5. ⚠️ **saveClusterModels.test.ts** - Needs refactoring to use new mock helpers

**Current Test Results**: 53 passing, 16 failing out of 69 total (77% pass rate)
- Remaining failures are in tests that still use old mocking pattern
- triggerConversationAnalysis tests: 27/27 passing (100%)
  - simple.test.ts: 10/10 ✅
  - test.ts: 17/17 ✅

## Mock Pattern (SOLVED)

The tests now use a working mock pattern for Supabase's chainable API. The solution uses query-specific helper functions that mock the entire chain from `.from()` onwards.

### Correct Mocking Pattern

Instead of mocking terminal methods (`.single()`, `.maybeSingle()`), mock the entire chain for each query:

```typescript
// ✅ CORRECT: Mock the full chain from .from()
mockDataQuery(supabase, { id: "conv-123", title: "Test" }); // for .single()
mockDataQuery(supabase, { id: "user-123" }, false); // for .maybeSingle()
mockCountQuery(supabase, 25); // for count queries
mockInsert(supabase); // for insert operations
mockUpdate(supabase); // for update operations

// ❌ INCORRECT: Don't mock terminal methods directly
supabase.single.mockResolvedValueOnce({ data, error }); // breaks chaining
```

### Available Mock Helpers

See [triggerConversationAnalysis.simple.test.ts](./triggerConversationAnalysis.simple.test.ts) for reference implementation.

**mockDataQuery(supabase, data, useSingle = true)**
- Mocks queries that return `{ data, error }`
- Supports both `.single()` and `.maybeSingle()` termination
- Example: `mockDataQuery(supabase, conversation)` for conversation fetch

**mockCountQuery(supabase, count)**
- Mocks queries that return `{ count, error }`
- Used for counting records
- Example: `mockCountQuery(supabase, 25)` for response count

**mockInsert(supabase, error = null)**
- Mocks insert operations
- Example: `mockInsert(supabase, { code: "23505" })` for unique constraint violation

**mockUpdate(supabase, error = null)**
- Mocks update operations with `.eq()` chaining
- Example: `mockUpdate(supabase)` for successful update

### Why This Works

Each helper creates a new chain object with `.from()` preserved, allowing multiple sequential queries:

```typescript
export function mockDataQuery(supabase: any, data: any, useSingle = true) {
  const dataChain = {
    from: supabase.from, // ← Preserves from() for next query
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data, error: null }),
    maybeSingle: jest.fn().mockResolvedValue({ data, error: null }),
  };

  supabase.from.mockReturnValueOnce(dataChain); // ← Only affects next .from() call
}
```

## Test Coverage Goals

Based on the spec, the tests should provide:

- **triggerConversationAnalysis**: 95% line coverage, 90% branch coverage
- **runConversationAnalysisIncremental**: 90% line coverage, 85% branch coverage
- **saveClusterModels**: 90% line coverage
- **Overall feature**: 90% line coverage, 85% branch coverage

## Next Steps

1. ✅ ~~Refactor createMockSupabase~~ - COMPLETED (new helper pattern implemented)
2. ✅ ~~Run simplified tests~~ - COMPLETED (10/10 passing)
3. ✅ ~~Refactor triggerConversationAnalysis.test.ts~~ - COMPLETED (17/17 passing)
4. **Refactor runConversationAnalysisIncremental.test.ts** - Needs custom implementation mocks, more complex than trigger tests
5. **Refactor saveClusterModels.test.ts** - Can use same pattern as trigger tests
6. **Check coverage**: `npm test -- --coverage lib/conversations/server/`
7. **Add integration tests** (optional): Create end-to-end tests if coverage gaps exist

### Refactoring Note

The `runConversationAnalysisIncremental.test.ts` file uses complex custom `mockImplementation` patterns that differ from the standard query mocking. These tests would benefit from a different refactoring approach or integration testing strategy.

## Test Structure

### triggerConversationAnalysis.test.ts
Tests cover:
- ✅ Freshness detection (fresh, stale, in-progress)
- ✅ Strategy decision logic (incremental vs full)
- ✅ Authorization and validation
- ✅ Concurrency and idempotency
- ✅ Response metadata

### runConversationAnalysisIncremental.test.ts
Tests cover:
- ✅ New response filtering (timestamp-based, null cluster)
- ✅ Cluster assignment (nearest centroid, normalization)
- ✅ 2D placement (within spread radius)
- ✅ Theme size updates
- ✅ Metadata tracking
- ✅ Error handling

### saveClusterModels.test.ts
Tests cover:
- ✅ Cluster model persistence after analysis
- ✅ Centroid computation (embedding space, 2D space)
- ✅ Spread radius calculation
- ✅ Delete before insert pattern
- ✅ Single cluster handling
- ✅ Integration with analysis flow

## Running Tests

```bash
# Run all conversation tests
npm test -- lib/conversations/server/__tests__/

# Run specific test file
npm test -- lib/conversations/server/__tests__/triggerConversationAnalysis.test.ts

# Run with coverage
npm test -- --coverage lib/conversations/server/

# Watch mode
npm test -- --watch lib/conversations/server/__tests__/
```

## Documentation

All test files include:
- File header describing what's being tested
- Clear test organization with `describe` blocks
- Descriptive test names following "should X when Y" pattern
- Inline comments explaining complex test logic
- Use of shared test utilities for consistency
