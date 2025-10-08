import { useState } from 'react'

function App() {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-8">
        <header className="mb-8">
          <h1 className="text-4xl font-bold text-foreground mb-2">
            HSH GC Platform
          </h1>
          <p className="text-muted-foreground">
            General Contractor Estimating, Budgeting & Project Management
          </p>
        </header>
        
        <div className="bg-card rounded-lg border p-6 shadow-sm">
          <h2 className="text-2xl font-semibold mb-4">Welcome!</h2>
          <p className="text-muted-foreground">
            This is your new GC platform. Ready to build the estimate-to-execution feedback loop.
          </p>
        </div>
      </div>
    </div>
  )
}

export default App

