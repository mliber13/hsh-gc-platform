import React from 'react';
import { ScheduleLayout } from '../components/ScheduleLayout';
import { ImageWithFallback } from '../components/figma/ImageWithFallback';

export const CabinetrySchedule: React.FC = () => {
  return (
    <ScheduleLayout title="Selection Schedule: Cabinetry / Millwork" pageNumber={7}>
      <h2 className="text-2xl font-semibold text-gray-900 mb-6">Cabinetry / Millwork</h2>
      
      <div className="overflow-x-auto">
        <table className="w-full border-collapse border border-gray-300">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-gray-900">Room/Area</th>
              <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-gray-900">Element</th>
              <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-gray-900">Image</th>
              <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-gray-900">Material/Product</th>
              <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-gray-900">Color/Finish</th>
              <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-gray-900">Hardware</th>
              <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-gray-900">Qty</th>
              <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-gray-900">Supplier/Link</th>
              <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-gray-900">Lead Time</th>
              <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-gray-900">Notes</th>
            </tr>
          </thead>
          <tbody>
            {/* Example Row */}
            <tr>
              <td className="border border-gray-300 px-4 py-3 text-sm">Kitchen</td>
              <td className="border border-gray-300 px-4 py-3 text-sm">Base Cabinets</td>
              <td className="border border-gray-300 px-4 py-3 text-sm">
                <ImageWithFallback
                  src="https://images.unsplash.com/photo-1715249891396-653a32ff2d39?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxraXRjaGVuJTIwY2FiaW5ldCUyMGRldGFpbHxlbnwxfHx8fDE3NzQzNTQwOTJ8MA&ixlib=rb-4.1.0&q=80&w=1080"
                  alt="Cabinet sample"
                  className="w-16 h-16 object-cover rounded"
                />
              </td>
              <td className="border border-gray-300 px-4 py-3 text-sm">Shaker Style Maple</td>
              <td className="border border-gray-300 px-4 py-3 text-sm">Navy Blue / Satin</td>
              <td className="border border-gray-300 px-4 py-3 text-sm">Brushed Brass Pulls</td>
              <td className="border border-gray-300 px-4 py-3 text-sm">18 units</td>
              <td className="border border-gray-300 px-4 py-3 text-sm">Custom Cabinets Co</td>
              <td className="border border-gray-300 px-4 py-3 text-sm">8-10 weeks</td>
              <td className="border border-gray-300 px-4 py-3 text-sm">Soft-close hinges included</td>
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
          All cabinetry to be custom-built to specifications. Installation by licensed contractor required. Final measurements to be confirmed on-site before fabrication.
        </p>
      </div>
    </ScheduleLayout>
  );
};
