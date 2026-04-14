Implement a new feature for the Orbya SaaS platform.

Before starting:
1. Read @docs/tasks/todo.md to find the next unchecked task
2. Read @docs/prd.md for context on the feature requirements
3. Read @docs/database-schema.md if the feature touches the database

Implementation steps:
1. Create a plan and describe it briefly
2. If database changes needed: create migration in supabase/migrations/
3. If new API endpoint: create tRPC router in src/server/routers/
4. If business logic: create service in src/server/services/
5. If UI needed: create components in src/components/ using shadcn/ui
6. Write tests for the new functionality
7. Run: npm run typecheck && npm run lint && npm run test
8. Commit with conventional commit message
9. Update docs/tasks/todo.md marking the task as complete

Rules:
- All user-facing text in Portuguese (pt-BR)
- Use shadcn/ui components, don't build custom UI from scratch
- Every tRPC route must validate input with Zod
- Every database query must respect RLS (use Supabase client with user context)
