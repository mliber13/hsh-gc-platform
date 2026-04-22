import React from 'react';
import { ScheduleLayout } from '../components/ScheduleLayout';
import { ImageWithFallback } from '../components/figma/ImageWithFallback';

export const TilingSchedule: React.FC = () => {
  return (
    <ScheduleLayout title="Selection Schedule: Tiling" pageNumber={5}>
      <h2 className="text-2xl font-semibold text-gray-900 mb-6">Tiling</h2>
      
      <div className="overflow-x-auto">
        <table className="w-full border-collapse border border-gray-300">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-gray-900">Room/Area</th>
              <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-gray-900">Application</th>
              <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-gray-900">Image</th>
              <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-gray-900">Product Name</th>
              <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-gray-900">Size</th>
              <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-gray-900">Color/Finish</th>
              <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-gray-900">Qty (sqft)</th>
              <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-gray-900">Install Pattern</th>
              <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-gray-900">Grout Color</th>
              <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-gray-900">Supplier/Link</th>
              <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-gray-900">Lead Time</th>
              <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-gray-900">Notes</th>
            </tr>
          </thead>
          <tbody>
            {/* Example Row */}
            <tr>
              <td className="border border-gray-300 px-4 py-3 text-sm">Primary Bath</td>
              <td className="border border-gray-300 px-4 py-3 text-sm">Shower Walls</td>
              <td className="border border-gray-300 px-4 py-3 text-sm">
                <ImageWithFallback
                  src="https://images.unsplash.com/photo-1641220171683-c19c23a901b9?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxiYXRocm9vbSUyMHRpbGUlMjBtb3NhaWN8ZW58MXx8fHwxNzc0MzU0MDkxfDA&ixlib=rb-4.1.0&q=80&w=1080"
                  alt="Tile sample"
                  className="w-16 h-16 object-cover rounded"
                />
              </td>
              <td className="border border-gray-300 px-4 py-3 text-sm">Carrara Marble Hex</td>
              <td className="border border-gray-300 px-4 py-3 text-sm">2" Hexagon</td>
              <td className="border border-gray-300 px-4 py-3 text-sm">White / Polished</td>
              <td className="border border-gray-300 px-4 py-3 text-sm">85</td>
              <td className="border border-gray-300 px-4 py-3 text-sm">Straight Lay</td>
              <td className="border border-gray-300 px-4 py-3 text-sm">Bright White</td>
              <td className="border border-gray-300 px-4 py-3 text-sm">TileBar</td>
              <td className="border border-gray-300 px-4 py-3 text-sm">2-3 weeks</td>
              <td className="border border-gray-300 px-4 py-3 text-sm">Waterproof membrane required</td>
            </tr>
            {/* Empty rows */}
            {Array.from({ length: 6 }).map((_, i) => (
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
          All wet areas require proper waterproofing per local code. Epoxy grout recommended for shower areas. Extra material ordered for breakage and future repairs.
        </p>
      </div>
    </ScheduleLayout>
  );
};
