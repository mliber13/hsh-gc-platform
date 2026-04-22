import React from 'react';
import { ScheduleLayout } from '../components/ScheduleLayout';
import { ImageWithFallback } from '../components/figma/ImageWithFallback';

export const PlumbingSchedule: React.FC = () => {
  return (
    <ScheduleLayout title="Selection Schedule: Plumbing Fixtures + Hardware" pageNumber={9}>
      <h2 className="text-2xl font-semibold text-gray-900 mb-6">Plumbing Fixtures + Hardware</h2>
      
      <div className="overflow-x-auto">
        <table className="w-full border-collapse border border-gray-300">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-gray-900">Room/Area</th>
              <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-gray-900">Fixture Type</th>
              <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-gray-900">Image</th>
              <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-gray-900">Product Name</th>
              <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-gray-900">Finish</th>
              <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-gray-900">Qty</th>
              <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-gray-900">Supplier/Link</th>
              <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-gray-900">Lead Time</th>
              <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-gray-900">Install Notes</th>
            </tr>
          </thead>
          <tbody>
            {/* Example Row */}
            <tr>
              <td className="border border-gray-300 px-4 py-3 text-sm">Primary Bath</td>
              <td className="border border-gray-300 px-4 py-3 text-sm">Vanity Faucet</td>
              <td className="border border-gray-300 px-4 py-3 text-sm">
                <ImageWithFallback
                  src="https://images.unsplash.com/photo-1773177930149-48a2f5df9e07?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxiYXRocm9vbSUyMGZhdWNldCUyMGZpeHR1cmV8ZW58MXx8fHwxNzc0MzU0MDkzfDA&ixlib=rb-4.1.0&q=80&w=1080"
                  alt="Faucet sample"
                  className="w-16 h-16 object-cover rounded"
                />
              </td>
              <td className="border border-gray-300 px-4 py-3 text-sm">Kohler Purist Widespread</td>
              <td className="border border-gray-300 px-4 py-3 text-sm">Matte Black</td>
              <td className="border border-gray-300 px-4 py-3 text-sm">2</td>
              <td className="border border-gray-300 px-4 py-3 text-sm">Ferguson</td>
              <td className="border border-gray-300 px-4 py-3 text-sm">2-3 weeks</td>
              <td className="border border-gray-300 px-4 py-3 text-sm">8" widespread, pop-up drain included</td>
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
          All fixtures to meet local plumbing codes. Water-efficient models preferred. Verify rough-in dimensions before installation. Matching finish across all fixtures in same space.
        </p>
      </div>
    </ScheduleLayout>
  );
};
