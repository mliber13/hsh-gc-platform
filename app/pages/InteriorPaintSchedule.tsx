import React from 'react';
import { ScheduleLayout } from '../components/ScheduleLayout';
import { ImageWithFallback } from '../components/figma/ImageWithFallback';

export const InteriorPaintSchedule: React.FC = () => {
  return (
    <ScheduleLayout title="Selection Schedule: Interior Paint" pageNumber={2}>
      <h2 className="text-2xl font-semibold text-gray-900 mb-6">Interior Paint</h2>
      
      <div className="overflow-x-auto">
        <table className="w-full border-collapse border border-gray-300">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-gray-900">Room/Area</th>
              <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-gray-900">Walls</th>
              <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-gray-900">Trims</th>
              <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-gray-900">Ceiling</th>
              <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-gray-900">Doors</th>
              <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-gray-900">Finish</th>
              <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-gray-900">Supplier/Link</th>
              <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-gray-900">Notes</th>
            </tr>
          </thead>
          <tbody>
            {/* Example Row */}
            <tr>
              <td className="border border-gray-300 px-4 py-3 text-sm">Living Room</td>
              <td className="border border-gray-300 px-4 py-3 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-blue-100 border border-gray-300 rounded"></div>
                  <span>SW 7015 Repose Gray</span>
                </div>
              </td>
              <td className="border border-gray-300 px-4 py-3 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-white border border-gray-300 rounded"></div>
                  <span>SW 7006 Extra White</span>
                </div>
              </td>
              <td className="border border-gray-300 px-4 py-3 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-gray-50 border border-gray-300 rounded"></div>
                  <span>SW 7006 Extra White</span>
                </div>
              </td>
              <td className="border border-gray-300 px-4 py-3 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-white border border-gray-300 rounded"></div>
                  <span>SW 7006 Extra White</span>
                </div>
              </td>
              <td className="border border-gray-300 px-4 py-3 text-sm">Eggshell</td>
              <td className="border border-gray-300 px-4 py-3 text-sm">Sherwin-Williams</td>
              <td className="border border-gray-300 px-4 py-3 text-sm">Accent wall in navy</td>
            </tr>
            {/* Empty rows for duplication */}
            {Array.from({ length: 8 }).map((_, i) => (
              <tr key={i}>
                <td className="border border-gray-300 px-4 py-3 text-sm h-12"></td>
                <td className="border border-gray-300 px-4 py-3 text-sm"></td>
                <td className="border border-gray-300 px-4 py-3 text-sm"></td>
                <td className="border border-gray-300 px-4 py-3 text-sm"></td>
                <td className="border border-gray-300 px-4 py-3 text-sm"></td>
                <td className="border border-gray-300 px-4 py-3 text-sm"></td>
                <td className="border border-gray-300 px-4 py-3 text-sm"></td>
                <td className="border border-gray-300 px-4 py-3 text-sm"></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-6 p-4 bg-gray-50 border border-gray-300 rounded">
        <h3 className="text-sm font-semibold text-gray-900 mb-2">Notes</h3>
        <p className="text-sm text-gray-600">
          All paint to be premium grade. Two coats minimum. Touch-up paint to be provided to homeowner upon completion.
        </p>
      </div>
    </ScheduleLayout>
  );
};
