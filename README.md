# Finance Dashboard Frontend

Simple Next.js + shadcn UI frontend to interact with the backend assignment APIs.

## Setup

1. Create environment file:

   - copy `.env.example` to `.env.local`

2. Make sure it has:

   - `NEXT_PUBLIC_API_BASE_URL=http://localhost:4000/api`

3. Run frontend:

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Demo users

Use seeded users from backend:

- `admin@student.local / admin123`
- `analyst@student.local / analyst123`
- `viewer@student.local / viewer123`

## What this frontend shows

- login/logout with token in `sessionStorage`
- dashboard summary cards and recent activity
- records table with pagination and filters
- admin-only create record
- admin-only revert record
- admin-only soft delete

## Notes

- Session timeout/inactivity is enforced by backend.
- This UI is intentionally simple for assignment demo and interaction testing.
