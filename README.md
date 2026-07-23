# Hardware Store ERP (Vardhman ERP)

A modern, mobile-responsive ERP built to manage hardware inventory, purchase history, material issue slips, and store logs. Built with Next.js 16, PostgreSQL (Prisma), and Tailwind CSS.

## Tech Stack
- **Framework:** [Next.js 16](https://nextjs.org/) (App Router)
- **Database:** PostgreSQL via [Prisma 7](https://www.prisma.io/)
- **Authentication:** [Better Auth](https://better-auth.com/)
- **UI & Styling:** [Tailwind CSS](https://tailwindcss.com/) + [shadcn/ui](https://ui.shadcn.com/)
- **Tables:** [TanStack Table](https://tanstack.com/table/latest)

## Local Development Setup

### 1. Environment Variables
Copy the `.env.example` file to create your local `.env`:
```bash
cp .env.example .env
```
Open `.env` and fill in your PostgreSQL connection strings (`DATABASE_URL` and `DIRECT_URL`), and a secure string for `BETTER_AUTH_SECRET`.

### 2. Install Dependencies
```bash
npm install
```

### 3. Initialize Database & Seed
Push the Prisma schema to your database and run the initial seed to set up basic attributes and units:
```bash
npx prisma db push
npx prisma db seed
```

### 4. Setup Initial Administrator
To create your initial admin account, start the dev server and hit the setup endpoint in your browser:
```bash
npm run dev
```
Navigate to: `http://localhost:3000/api/setup-admin`
This will generate an admin user with the email `admin@hardware.local` and a randomly generated secure password displayed on the screen. **Save this password immediately.**

### 5. Start Developing
You can now log in at `http://localhost:3000/login`.
```bash
npm run dev
```

## Deployment
This app is optimized for seamless deployment on [Vercel](https://vercel.com).
1. Connect your GitHub repository to Vercel.
2. Ensure you add all 5 environment variables from your `.env` to the Vercel Dashboard settings.
3. Deploy!
