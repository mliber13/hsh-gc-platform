import React, { useState } from 'react';
import { useProject } from '../context/ProjectContext';
import { Settings, X } from 'lucide-react';

export const ProjectSettings: React.FC = () => {
  const { projectData, updateProjectData } = useProject();
  const [isOpen, setIsOpen] = useState(false);

  const handleChange = (field: keyof typeof projectData, value: string) => {
    updateProjectData({ [field]: value });
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed top-6 right-6 p-3 bg-gray-900 text-white rounded-full shadow-lg hover:bg-gray-800 transition-colors z-50 print:hidden"
        title="Edit Project Info"
      >
        <Settings className="w-5 h-5" />
      </button>
    );
  }

  return (
    <>
      <div
        className="fixed inset-0 bg-black/20 z-40 print:hidden"
        onClick={() => setIsOpen(false)}
      ></div>
      <div className="fixed top-6 right-6 bg-white border border-gray-300 rounded-lg shadow-xl z-50 w-96 max-h-[80vh] overflow-y-auto print:hidden">
        <div className="sticky top-0 bg-white border-b border-gray-300 px-6 py-4 flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">Project Settings</h3>
          <button
            onClick={() => setIsOpen(false)}
            className="p-1 hover:bg-gray-100 rounded transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Project Name
            </label>
            <input
              type="text"
              value={projectData.projectName}
              onChange={(e) => handleChange('projectName', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Project Address
            </label>
            <input
              type="text"
              value={projectData.projectAddress}
              onChange={(e) => handleChange('projectAddress', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Client Name
            </label>
            <input
              type="text"
              value={projectData.clientName}
              onChange={(e) => handleChange('clientName', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Prepared Date
            </label>
            <input
              type="text"
              value={projectData.preparedDate}
              onChange={(e) => handleChange('preparedDate', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Prepared By
            </label>
            <input
              type="text"
              value={projectData.preparedBy}
              onChange={(e) => handleChange('preparedBy', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Revision
            </label>
            <input
              type="text"
              value={projectData.revision}
              onChange={(e) => handleChange('revision', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Company Name
            </label>
            <input
              type="text"
              value={projectData.companyName}
              onChange={(e) => handleChange('companyName', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Company Logo (Initials)
            </label>
            <input
              type="text"
              value={projectData.companyLogo}
              onChange={(e) => handleChange('companyLogo', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-gray-900"
              maxLength={4}
            />
          </div>

          <div className="pt-4 border-t border-gray-200">
            <p className="text-xs text-gray-600">
              Changes will be reflected across all schedule pages. Use your browser's print function (Ctrl/Cmd + P) to export as PDF.
            </p>
          </div>
        </div>
      </div>
    </>
  );
};
