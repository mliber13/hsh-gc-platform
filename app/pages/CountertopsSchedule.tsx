import React from 'react';
import { ScheduleLayout } from '../components/ScheduleLayout';
import { ImageWithFallback } from '../components/figma/ImageWithFallback';

export const CountertopsSchedule: React.FC = () => {
  return (
    <ScheduleLayout title="Selection Schedule: Countertops + Slab" pageNumber={8}>
      <h2 className="text-2xl font-semibold text-gray-900 mb-6">Countertops + Slab</h2>
      
      <div className="overflow-x-auto">
        <table className="w-full border-collapse border border-gray-300">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-gray-900">Room/Area</th>
              <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-gray-900">Surface</th>
              <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-gray-900">Image</th>
              <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-gray-900">Material/Product</th>
              <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-gray-900">Color/Finish</th>
              <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-gray-900">Thickness</th>
              <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-gray-900">Edge Profile</th>
              <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-gray-900">Backsplash</th>
              <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-gray-900">Qty (sqft)</th>
              <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-gray-900">Supplier/Link</th>
              <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-gray-900">Lead Time</th>
              <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-gray-900">Notes</th>
            </tr>
          </thead>
          <tbody>
            {/* Example Row */}
            <tr>
              <td className="border border-gray-300 px-4 py-3 text-sm">Kitchen</td>
              <td className="border border-gray-300 px-4 py-3 text-sm">Island + Perimeter</td>
              <td className="border border-gray-300 px-4 py-3 text-sm">
                <ImageWithFallback
                  src="https://images.unsplash.com/photo-1768039049614-f3c2bae3f1db?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxtYXJibGUlMjBjb3VudGVydG9wJTIwa2l0Y2hlbnxlbnwxfHx8fDE3NzQyODgwNDV8MA&ixlib=rb-4.1.0&q=80&w=1080"
                  alt="Countertop sample"
                  className="w-16 h-16 object-cover rounded"
                />
              </td>
              <td className="border border-gray-300 px-4 py-3 text-sm">Calacatta Quartz</td>
              <td className="border border-gray-300 px-4 py-3 text-sm">White with Gold Veining / Polished</td>
              <td className="border border-gray-300 px-4 py-3 text-sm">3cm</td>
              <td className="border border-gray-300 px-4 py-3 text-sm">Eased Edge</td>
              <td className="border border-gray-300 px-4 py-3 text-sm">4" Height, Same Material</td>
              <td className="border border-gray-300 px-4 py-3 text-sm">92</td>
              <td className="border border-gray-300 px-4 py-3 text-sm">Stone Elegance</td>
              <td className="border border-gray-300 px-4 py-3 text-sm">5-6 weeks</td>
              <td className="border border-gray-300 px-4 py-3 text-sm">Template after cabinets installed</td>
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
          Final templating to occur after cabinet installation. Seams to be minimized and approved by client. Sink cutouts and cooktop openings per appliance specifications.
        </p>
      </div>
    </ScheduleLayout>
  );
};
