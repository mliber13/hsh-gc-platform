import React from 'react';
import { ScheduleLayout } from '../components/ScheduleLayout';
import { ImageWithFallback } from '../components/figma/ImageWithFallback';

export const DoorsWindowsSchedule: React.FC = () => {
  return (
    <ScheduleLayout title="Selection Schedule: Doors / Windows / Trim" pageNumber={10}>
      <h2 className="text-2xl font-semibold text-gray-900 mb-6">Doors / Windows / Trim</h2>
      
      <div className="overflow-x-auto">
        <table className="w-full border-collapse border border-gray-300">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-gray-900">Room/Area</th>
              <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-gray-900">Element</th>
              <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-gray-900">Image</th>
              <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-gray-900">Product/Style</th>
              <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-gray-900">Color/Finish</th>
              <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-gray-900">Qty</th>
              <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-gray-900">Supplier/Link</th>
              <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-gray-900">Lead Time</th>
              <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-gray-900">Notes</th>
            </tr>
          </thead>
          <tbody>
            {/* Example Row */}
            <tr>
              <td className="border border-gray-300 px-4 py-3 text-sm">Throughout</td>
              <td className="border border-gray-300 px-4 py-3 text-sm">Interior Doors</td>
              <td className="border border-gray-300 px-4 py-3 text-sm">
                <ImageWithFallback
                  src="https://images.unsplash.com/photo-1724054808250-30ad6aabd42b?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxpbnRlcmlvciUyMGRvb3IlMjB0cmltfGVufDF8fHx8MTc3NDM1NDA5M3ww&ixlib=rb-4.1.0&q=80&w=1080"
                  alt="Door sample"
                  className="w-16 h-16 object-cover rounded"
                />
              </td>
              <td className="border border-gray-300 px-4 py-3 text-sm">5-Panel Shaker</td>
              <td className="border border-gray-300 px-4 py-3 text-sm">White Primed</td>
              <td className="border border-gray-300 px-4 py-3 text-sm">14</td>
              <td className="border border-gray-300 px-4 py-3 text-sm">Masonite</td>
              <td className="border border-gray-300 px-4 py-3 text-sm">3-4 weeks</td>
              <td className="border border-gray-300 px-4 py-3 text-sm">2'8" standard height, hardware separate</td>
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
          All windows to be dual-pane, energy-efficient glass. Door hardware to match finish throughout home. Verify opening sizes before ordering. Trim to be paint-grade poplar unless specified.
        </p>
      </div>
    </ScheduleLayout>
  );
};
