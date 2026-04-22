import React from 'react';
import { ScheduleHeader } from '../components/ScheduleHeader';
import { ScheduleFooter } from '../components/ScheduleFooter';

interface ScheduleLayoutProps {
  title: string;
  pageNumber: number;
  children: React.ReactNode;
  className?: string;
}

export const ScheduleLayout: React.FC<ScheduleLayoutProps> = ({ 
  title, 
  pageNumber, 
  children,
  className = '' 
}) => {
  return (
    <div className={`min-h-screen bg-white p-12 ${className}`}>
      <div className="max-w-[1400px] mx-auto">
        <ScheduleHeader />
        
        <main className="my-6">
          {children}
        </main>
        
        <ScheduleFooter scheduleTitle={title} pageNumber={pageNumber} />
      </div>
    </div>
  );
};
