import React from "react";
import { useProject } from "../context/ProjectContext";
import companyLogo from "figma:asset/649590dea469edcc01cef1c5d78c3c9a9fa4b8af.png";

interface ScheduleHeaderProps {
  className?: string;
}

export const ScheduleHeader: React.FC<ScheduleHeaderProps> = ({
  className = "",
}) => {
  const { projectData } = useProject();

  return (
    <header
      className={`flex items-start justify-between border-b border-gray-300 pb-4 ${className}`}
    >
      <div className="flex items-center gap-3">
        <img
          src={companyLogo}
          alt={projectData.companyName}
          className="h-24 w-auto object-contain"
        />
      </div>

      <div className="text-right">
        <h1 className="text-xl font-semibold text-gray-900">
          {projectData.projectName}
        </h1>
        <div className="text-sm text-gray-600 mt-1">
          {projectData.projectAddress}
        </div>
        <div className="text-sm text-gray-600 mt-1">
          {projectData.preparedDate} | {projectData.revision}
        </div>
      </div>
    </header>
  );
};