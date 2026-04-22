import React from 'react';
import { ScheduleLayout } from '../components/ScheduleLayout';
import { ImageWithFallback } from '../components/figma/ImageWithFallback';

export const FlooringSchedule: React.FC = () => {
  return (
    <ScheduleLayout title="Selection Schedule: Flooring" pageNumber={4}>
      <h2 className="text-2xl font-semibold text-gray-900 mb-6">Flooring</h2>
      
      <div className="overflow-x-auto">
        <table className="w-full border-collapse border border-gray-300">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-gray-900">Room/Area</th>
              <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-gray-900">Image</th>
              <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-gray-900">Product Name</th>
              <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-gray-900">Type</th>
              <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-gray-900">Color/Finish</th>
              <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-gray-900">Qty (sqft)</th>
              <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-gray-900">Install Pattern</th>
              <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-gray-900">Supplier/Link</th>
              <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-gray-900">Lead Time</th>
              <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-gray-900">Notes</th>
            </tr>
          </thead>
          <tbody>
            {/* Example Row */}
            <tr>
              <td className="border border-gray-300 px-4 py-3 text-sm">Main Living Area</td>
              <td className="border border-gray-300 px-4 py-3 text-sm">
                <ImageWithFallback
                  src="https://images.unsplash.com/photo-1608702529091-f3b4fab4b97e?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxoYXJkd29vZCUyMGZsb29yaW5nJTIwc2FtcGxlfGVufDF8fHx8MTc3NDM1NDA5MXww&ixlib=rb-4.1.0&q=80&w=1080"
                  alt="Flooring sample"
                  className="w-16 h-16 object-cover rounded"
                />
              </td>
              <td className="border border-gray-300 px-4 py-3 text-sm">European Oak Heritage</td>
              <td className="border border-gray-300 px-4 py-3 text-sm">Engineered Hardwood</td>
              <td className="border border-gray-300 px-4 py-3 text-sm">Natural / Matte</td>
              <td className="border border-gray-300 px-4 py-3 text-sm">1,240</td>
              <td className="border border-gray-300 px-4 py-3 text-sm">Random Width</td>
              <td className="border border-gray-300 px-4 py-3 text-sm">Floor & Decor</td>
              <td className="border border-gray-300 px-4 py-3 text-sm">3-4 weeks</td>
              <td className="border border-gray-300 px-4 py-3 text-sm">Includes underlayment</td>
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
          All flooring materials to be acclimated on-site for 72 hours before installation. Extra 10% ordered for waste and future repairs.
        </p>
      </div>
    </ScheduleLayout>
  );
};
