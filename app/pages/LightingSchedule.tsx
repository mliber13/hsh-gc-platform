import React from 'react';
import { ScheduleLayout } from '../components/ScheduleLayout';
import { ImageWithFallback } from '../components/figma/ImageWithFallback';

export const LightingSchedule: React.FC = () => {
  return (
    <ScheduleLayout title="Selection Schedule: Lighting + Electrical" pageNumber={6}>
      <h2 className="text-2xl font-semibold text-gray-900 mb-6">Lighting + Electrical</h2>
      
      <div className="overflow-x-auto">
        <table className="w-full border-collapse border border-gray-300">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-gray-900">Room/Area</th>
              <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-gray-900">Fixture Type</th>
              <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-gray-900">Image</th>
              <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-gray-900">Product Name</th>
              <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-gray-900">Finish/Color</th>
              <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-gray-900">Qty</th>
              <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-gray-900">Location Notes</th>
              <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-gray-900">Supplier/Link</th>
              <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-gray-900">Lead Time</th>
              <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-gray-900">Install Notes</th>
            </tr>
          </thead>
          <tbody>
            {/* Example Row */}
            <tr>
              <td className="border border-gray-300 px-4 py-3 text-sm">Kitchen</td>
              <td className="border border-gray-300 px-4 py-3 text-sm">Pendant</td>
              <td className="border border-gray-300 px-4 py-3 text-sm">
                <ImageWithFallback
                  src="https://images.unsplash.com/photo-1758945630632-7a8f1caffc6d?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxtb2Rlcm4lMjBwZW5kYW50JTIwbGlnaHQlMjBmaXh0dXJlfGVufDF8fHx8MTc3NDM1NDA5Mnww&ixlib=rb-4.1.0&q=80&w=1080"
                  alt="Lighting fixture"
                  className="w-16 h-16 object-cover rounded"
                />
              </td>
              <td className="border border-gray-300 px-4 py-3 text-sm">Beacon Globe Pendant</td>
              <td className="border border-gray-300 px-4 py-3 text-sm">Matte Black / Clear Glass</td>
              <td className="border border-gray-300 px-4 py-3 text-sm">3</td>
              <td className="border border-gray-300 px-4 py-3 text-sm">Over island, evenly spaced</td>
              <td className="border border-gray-300 px-4 py-3 text-sm">Rejuvenation</td>
              <td className="border border-gray-300 px-4 py-3 text-sm">4-6 weeks</td>
              <td className="border border-gray-300 px-4 py-3 text-sm">Dimmer switch required</td>
            </tr>
            {/* Empty rows */}
            {Array.from({ length: 7 }).map((_, i) => (
              <tr key={i}>
                <td className="border border-gray-300 px-4 py-3 text-sm h-20"></td>
                <td className="border border-gray-300 px-4 py-3 text-sm"></td>
                <td className="border border-gray-300 px-4 py-3 text-sm"></td>
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
          All fixtures to be LED compatible. Dimmer switches to be installed per lighting plan. Ensure proper junction box support for heavy fixtures.
        </p>
      </div>
    </ScheduleLayout>
  );
};
