import React from 'react';
import { ScheduleLayout } from '../components/ScheduleLayout';
import { ImageWithFallback } from '../components/figma/ImageWithFallback';

export const OtherSelectionsSchedule: React.FC = () => {
  return (
    <ScheduleLayout title="Selection Schedule: Other Selections" pageNumber={12}>
      <h2 className="text-2xl font-semibold text-gray-900 mb-6">Other Selections</h2>
      
      <div className="overflow-x-auto">
        <table className="w-full border-collapse border border-gray-300">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-gray-900">Room/Area</th>
              <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-gray-900">Category</th>
              <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-gray-900">Item</th>
              <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-gray-900">Image</th>
              <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-gray-900">Product</th>
              <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-gray-900">Spec/Finish</th>
              <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-gray-900">Qty</th>
              <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-gray-900">Supplier/Link</th>
              <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-gray-900">Lead Time</th>
              <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-gray-900">Notes</th>
            </tr>
          </thead>
          <tbody>
            {/* Example Row */}
            <tr>
              <td className="border border-gray-300 px-4 py-3 text-sm">Living Room</td>
              <td className="border border-gray-300 px-4 py-3 text-sm">Fireplace</td>
              <td className="border border-gray-300 px-4 py-3 text-sm">Surround Material</td>
              <td className="border border-gray-300 px-4 py-3 text-sm">
                <div className="w-16 h-16 bg-gray-200 border border-gray-300 rounded flex items-center justify-center text-xs text-gray-500">
                  Image
                </div>
              </td>
              <td className="border border-gray-300 px-4 py-3 text-sm">Limestone Slab</td>
              <td className="border border-gray-300 px-4 py-3 text-sm">Honed Finish</td>
              <td className="border border-gray-300 px-4 py-3 text-sm">1 set</td>
              <td className="border border-gray-300 px-4 py-3 text-sm">Stone Elegance</td>
              <td className="border border-gray-300 px-4 py-3 text-sm">4-5 weeks</td>
              <td className="border border-gray-300 px-4 py-3 text-sm">Custom fabrication required</td>
            </tr>
            {/* Empty rows */}
            {Array.from({ length: 9 }).map((_, i) => (
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
          Miscellaneous selections to be confirmed with design team before ordering. Custom items require additional lead time and may be non-refundable.
        </p>
      </div>
    </ScheduleLayout>
  );
};
