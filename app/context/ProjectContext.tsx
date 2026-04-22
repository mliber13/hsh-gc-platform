import React, { createContext, useContext, useState, ReactNode } from 'react';

export interface ProjectData {
  projectName: string;
  projectAddress: string;
  clientName: string;
  preparedDate: string;
  preparedBy: string;
  revision: string;
  companyName: string;
  companyLogo: string;
}

interface ProjectContextType {
  projectData: ProjectData;
  updateProjectData: (data: Partial<ProjectData>) => void;
}

const defaultProjectData: ProjectData = {
  projectName: 'Oakwood Residence',
  projectAddress: '2847 Mountain View Drive, Riverside, CA 92506',
  clientName: 'Michael & Sarah Thompson',
  preparedDate: 'March 24, 2026',
  preparedBy: 'Jennifer Martinez, Project Manager',
  revision: 'Rev. 2.1',
  companyName: 'Prestige Custom Homes',
  companyLogo: 'PCH'
};

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

export const ProjectProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [projectData, setProjectData] = useState<ProjectData>(defaultProjectData);

  const updateProjectData = (data: Partial<ProjectData>) => {
    setProjectData(prev => ({ ...prev, ...data }));
  };

  return (
    <ProjectContext.Provider value={{ projectData, updateProjectData }}>
      {children}
    </ProjectContext.Provider>
  );
};

export const useProject = () => {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error('useProject must be used within ProjectProvider');
  }
  return context;
};
