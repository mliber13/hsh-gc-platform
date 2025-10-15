# HSH GC Platform

**General Contractor Estimating, Budgeting & Project Management System**

## 🎉 Status: Phase 1 Complete - Live in Production!

**Deployment:** [Vercel](https://hsh-gc-platform.vercel.app)  
**Database:** Supabase (Multi-user with Role-based Access)  
**Features:** Estimates, Actuals, Schedules, Change Orders, Reports, Multi-user  

📄 See [PHASE_1_COMPLETE.md](./PHASE_1_COMPLETE.md) for full details  
🚀 See [PHASE_2_ROADMAP.md](./PHASE_2_ROADMAP.md) for upcoming features

---

## Overview

This application is designed to create a complete feedback loop for general contractors:

```
Estimate/Takeoff → Execute Project → Collect Actuals → Improve Future Estimates
     ↑____________________________________________________________↓
```

Unlike traditional systems that keep estimating and execution separate, this platform integrates both phases to continuously improve accuracy based on real project data.

## Core Modules

### 1. Pre-Construction
- **Estimating**: Comprehensive estimate workflow based on proven Excel methodology
- **Takeoff**: Quantity measurements and material lists
- **Budgeting**: Labor hours, material costs, subcontractor management
- **Baseline Creation**: Establishes project baseline for variance tracking

### 2. Project Execution
- **Cost Tracking**: Track actual labor hours, materials, and subcontractor costs
- **Progress Tracking**: Monitor completion percentages and milestone dates
- **Change Orders**: Manage scope changes with cost impact analysis
- **Daily Logs**: Document site conditions, issues, and decisions

### 3. Intelligence & Analysis
- **Variance Analysis**: Compare estimated vs. actual costs by trade and scope
- **Historical Database**: Build a library of actual costs by project type
- **Productivity Rates**: Track real labor productivity rates
- **Material Waste**: Analyze actual waste percentages

### 4. Feedback Loop
- **Smart Estimates**: Auto-populate future estimates with historical rates
- **Risk Identification**: Flag high-variance items for closer attention
- **Competitive Intelligence**: Understand your real costs vs. market rates

## Technology Stack

- **React 18** with TypeScript
- **Vite** for fast development and building
- **Tailwind CSS** for styling
- **Radix UI** for accessible component primitives
- **Framer Motion** for animations
- **jsPDF** for document generation
- **date-fns** for date management

## Getting Started

### Installation

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

### Development

The app will be available at `http://localhost:5173`

## Project Structure

```
hsh-gc-platform/
├── src/
│   ├── components/          # React components
│   │   └── ui/             # Reusable UI components
│   ├── hooks/              # Custom React hooks
│   ├── services/           # Business logic and API services
│   ├── lib/                # Utility functions
│   ├── types/              # TypeScript type definitions
│   ├── App.tsx             # Main application component
│   ├── main.tsx            # Application entry point
│   └── index.css           # Global styles and Tailwind setup
├── public/                 # Static assets
├── index.html             # HTML entry point
├── vite.config.ts         # Vite configuration
├── tailwind.config.js     # Tailwind configuration
├── tsconfig.json          # TypeScript configuration
└── package.json           # Dependencies and scripts
```

## Key Features (Planned)

### Phase 1: Foundation
- [ ] Project creation and setup
- [ ] Estimate builder interface
- [ ] Basic job dashboard
- [ ] Data persistence (localStorage initially)

### Phase 2: Execution Tracking
- [ ] Cost entry interface
- [ ] Labor tracking
- [ ] Material tracking
- [ ] Estimated vs. Actual views

### Phase 3: Intelligence
- [ ] Historical rate calculations
- [ ] Variance analysis dashboard
- [ ] Smart estimate suggestions
- [ ] Reporting and analytics

### Phase 4: Advanced Features
- [ ] Multi-user support
- [ ] Mobile interface
- [ ] Integration with accounting software
- [ ] Document management
- [ ] Client portal

## Data Model Philosophy

The system is built around a **Cost Breakdown Structure (CBS)** that links estimates to actuals at every level:

- **Project** → Contains estimates and actuals
- **Trade/Scope** → Tracks variance by construction activity
- **Historical Rates** → Feeds future estimates with real data
- **Confidence Levels** → Indicates data reliability based on sample size

## Development Guidelines

- Use TypeScript for type safety
- Follow React best practices (hooks, functional components)
- Keep components small and focused
- Use custom hooks for business logic
- Maintain consistent styling with Tailwind
- Write reusable UI components in `components/ui`

## Future Integrations

- QuickBooks Online for accounting
- Procore/Buildertrend for project management
- Takeoff software integration
- Mobile apps for field data collection
- Cloud storage for documents

## Contributing

This is a private project for HSH operations.

## License

Proprietary - All rights reserved

---

**Built with the goal of making every estimate smarter than the last.**

