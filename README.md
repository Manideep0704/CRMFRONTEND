# Timely Health - Multi-Website CRM Frontend

Modern, high-performance Customer Relationship Management (CRM) frontend built with **Next.js 16**, **React 19**, and **TypeScript**.

## 🚀 Key Features

- **Executive Overview & Analytics Dashboard:** Real-time metrics for Total Leads, Active Pipeline Value, Conversion Rates, Average Response Time, and website lead attribution breakdown.
- **Interactive Kanban Pipeline Board:** Smooth HTML5 drag-and-drop lead stage management with real-time audit logging and role-based stage movement.
- **Leads Directory & Search:** Full-text search by name, email, phone, and company; multi-attribute filtering (stage, source, website, agent, date range); and CSV export.
- **One-Tap Phone Dialer & Direct Email:** Clickable `tel:` call badges and `mailto:` links with touch isolation (`e.stopPropagation()`) for seamless mobile operation.
- **Bulk Spreadsheet Importer:** Automatic column header matching for CSV and XLSX files, duplicate detection, email/phone format validation, and downloadable error reports.
- **Role-Based Access Control (RBAC):**
  - **Administrators (`admin`):** Full control over lead assignment, pipeline diversion, team role management, website connection, integration credentials, and audit log deletion.
  - **Agents (`agent`):** One-click lead claiming/acceptance, conversation tracking, note addition, and follow-up scheduling.
- **Self-Healing API Proxy (`/api/...`):** Next.js App Router edge/node proxy routing requests to the backend with automatic header forwarding, role persistence, and network cross-origin support (`allowedDevOrigins`).

## 🛠️ Tech Stack

- **Framework:** Next.js 16 (App Router with Turbopack)
- **UI Library:** React 19
- **Icons:** Lucide React
- **Styles:** Vanilla CSS with Timely Health design tokens (Inter & Manrope typography, glassmorphism, responsive grid layouts)
- **Type Safety:** TypeScript 5.7+

## 📦 Getting Started

### 1. Installation

```bash
npm install
```

### 2. Environment Configuration

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

Configure your backend URL:

```env
API_INTERNAL_URL=https://crmbackend.iryax.com
```

### 3. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) or your local network IP (e.g. `http://192.168.x.x:3000`) on your mobile device.

### 4. Build for Production

```bash
npm run build
npm start
```

## 🐳 Docker Deployment

A standalone `Dockerfile` is included for containerized production deployments:

```bash
docker build -t timely-crm-frontend .
docker run -p 3000:3000 -e API_INTERNAL_URL=https://crmbackend.iryax.com timely-crm-frontend
```
