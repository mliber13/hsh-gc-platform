import React from 'react';
import { ScheduleLayout } from '../components/ScheduleLayout';
import { ImageWithFallback } from '../components/figma/ImageWithFallback';

export const AppliancesSchedule: React.FC = () => {
  return (
    <ScheduleLayout title="Selection Schedule: Appliances" pageNumber={11}>
      <h2 className="text-2xl font-semibold text-gray-900 mb-6">Appliances</h2>
      
      <div className="overflow-x-auto">
        <table className="w-full border-collapse border border-gray-300">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-gray-900">Room/Area</th>
              <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-gray-900">Appliance</th>
              <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-gray-900">Image</th>
              <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-gray-900">Brand/Model</th>
              <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-gray-900">Finish</th>
              <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-gray-900">Qty</th>
              <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-gray-900">Supplier/Link</th>
              <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-gray-900">Lead Time</th>
              <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-gray-900">Install/Utility Notes</th>
            </tr>
          </thead>
          <tbody>
            {/* Example Row */}
            <tr>
              <td className="border border-gray-300 px-4 py-3 text-sm">Kitchen</td>
              <td className="border border-gray-300 px-4 py-3 text-sm">Refrigerator</td>
              <td className="border border-gray-300 px-4 py-3 text-sm">
                <ImageWithFallback
                  src="https://images.unsplash.com/photo-1740803292814-13d2e35924c3?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxzdGFpbmxlc3MlMjBzdGVlbCUyMGFwcGxpYW5jZXN8ZW58MXx8fHwxNzc0MzU0MDk0fDA&ixlib=rb-4.1.0&q=80&w=1080"
                  alt="Appliance sample"
                  className="w-16 h-16 object-cover rounded"
                />
              </td>
              <td className="border border-gray-300 px-4 py-3 text-sm">Bosch B36CL80ENS 36" Counter-Depth</td>
              <td className="border border-gray-300 px-4 py-3 text-sm">Stainless Steel</td>
              <td className="border border-gray-300 px-4 py-3 text-sm">1</td>
              <td className="border border-gray-300 px-4 py-3 text-sm">Best Buy</td>
              <td className="border border-gray-300 px-4 py-3 text-sm">2-3 weeks</td>
              <td className="border border-gray-300 px-4 py-3 text-sm">Water line required, 110V outlet</td>
            </tr>
            {/* Empty rows */}
            {Array.from({ length: 8 }).map((_, i) => (
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-6 p-4 bg-gray-50 border border-gray-300 rounded">
        <h3 className="text-sm font-semibold text-gray-900 mb-2">Notes</h3>
        <p className="text-sm text-gray-600">
          Verify electrical and utility requirements before installation. All appliances to be delivered and installed by licensed professionals. Extended warranties recommended for major appliances.
        </p>
      </div>
    </ScheduleLayout>
  );
};
