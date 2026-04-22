import React from 'react';

interface ScheduleFooterProps {
  scheduleTitle: string;
  pageNumber: number;
  className?: string;
}

export const ScheduleFooter: React.FC<ScheduleFooterProps> = ({ 
  scheduleTitle, 
  pageNumber,
  className = '' 
}) => {
  return (
    <footer className={`flex items-center justify-between border-t border-gray-300 pt-3 mt-4 ${className}`}>
      <div className="text-sm text-gray-600">{scheduleTitle}</div>
      <div className="text-sm text-gray-600">Page {pageNumber}</div>
    </footer>
  );
};
