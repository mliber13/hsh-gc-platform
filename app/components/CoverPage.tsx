import React from 'react';
import { useProject } from '../context/ProjectContext';
import { ImageWithFallback } from './figma/ImageWithFallback';
import { Link } from 'react-router';
import companyLogo from 'figma:asset/649590dea469edcc01cef1c5d78c3c9a9fa4b8af.png';

export const CoverPage: React.FC = () => {
  const { projectData } = useProject();

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header */}
      <div className="p-12 flex items-start justify-between">
        <div className="flex items-center gap-3">
          <img 
            src={companyLogo} 
            alt={projectData.companyName}
            className="h-32 w-auto object-contain"
          />
        </div>
        
        <div className="text-right">
          <h1 className="text-3xl font-semibold text-gray-900">{projectData.projectName}</h1>
          <div className="text-base text-gray-600 mt-2">{projectData.projectAddress}</div>
          <div className="text-base text-gray-600 mt-2">
            {projectData.preparedDate} | {projectData.revision}
          </div>
        </div>
      </div>

      {/* Hero Image */}
      <div className="flex-1 px-12 pb-12">
        <div className="relative h-full min-h-[600px] rounded-lg overflow-hidden">
          <ImageWithFallback
            src="https://images.unsplash.com/photo-1762245832997-d214d359c0d7?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxtb2Rlcm4lMjByZXNpZGVudGlhbCUyMGhvdXNlJTIwZXh0ZXJpb3J8ZW58MXx8fHwxNzc0MjY5MDA1fDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral"
            alt="House exterior"
            className="w-full h-full object-cover"
          />
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-12">
            <h2 className="text-5xl font-light text-white tracking-wide">Selections Schedule</h2>
            <p className="text-xl text-white/90 mt-4">Client: {projectData.clientName}</p>
            <p className="text-base text-white/80 mt-2">Prepared by: {projectData.preparedBy}</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="px-12 pb-8">
        <Link 
          to="/interior-paint"
          className="inline-flex items-center justify-center px-8 py-3 bg-gray-900 text-white hover:bg-gray-800 transition-colors rounded"
        >
          View Schedule Pages →
        </Link>
      </div>
    </div>
  );
};