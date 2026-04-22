import React from 'react';
import { ScheduleLayout } from '../components/ScheduleLayout';

/** Template page: siding, roofing, gutters, and other envelope finishes (not a dedicated exterior paint schedule). */
export const ExteriorPaintSchedule: React.FC = () => {
  return (
    <ScheduleLayout title="Selection Schedule: Exterior Finishes" pageNumber={3}>
      <h2 className="text-2xl font-semibold text-gray-900 mb-6">Exterior Finishes</h2>
      <p className="text-sm text-gray-600 mb-4">
        Siding, roofing, gutters, soffit/fascia, and related envelope selections.
      </p>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse border border-gray-300">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-gray-900">Area / Scope</th>
              <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-gray-900">Product / System</th>
              <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-gray-900">Color / Profile</th>
              <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-gray-900">Qty</th>
              <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-gray-900">Supplier / Link</th>
              <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-gray-900">Notes</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border border-gray-300 px-4 py-3 text-sm">Siding — main walls</td>
              <td className="border border-gray-300 px-4 py-3 text-sm">Fiber cement lap</td>
              <td className="border border-gray-300 px-4 py-3 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 bg-slate-600 border border-gray-300 rounded shrink-0" />
                  <span>HC-166 Kendall Charcoal</span>
                </div>
              </td>
              <td className="border border-gray-300 px-4 py-3 text-sm">—</td>
              <td className="border border-gray-300 px-4 py-3 text-sm">—</td>
              <td className="border border-gray-300 px-4 py-3 text-sm">6&quot; exposure</td>
            </tr>
            <tr>
              <td className="border border-gray-300 px-4 py-3 text-sm">Roof</td>
              <td className="border border-gray-300 px-4 py-3 text-sm">Architectural shingle</td>
              <td className="border border-gray-300 px-4 py-3 text-sm">Weathered Wood</td>
              <td className="border border-gray-300 px-4 py-3 text-sm">—</td>
              <td className="border border-gray-300 px-4 py-3 text-sm">—</td>
              <td className="border border-gray-300 px-4 py-3 text-sm">Ice & water per code</td>
            </tr>
            <tr>
              <td className="border border-gray-300 px-4 py-3 text-sm">Gutters & downspouts</td>
              <td className="border border-gray-300 px-4 py-3 text-sm">6&quot; K-style aluminum</td>
              <td className="border border-gray-300 px-4 py-3 text-sm">Dark bronze</td>
              <td className="border border-gray-300 px-4 py-3 text-sm">—</td>
              <td className="border border-gray-300 px-4 py-3 text-sm">—</td>
              <td className="border border-gray-300 px-4 py-3 text-sm">Hidden hangers</td>
            </tr>
            {Array.from({ length: 9 }).map((_, i) => (
              <tr key={i}>
                <td className="border border-gray-300 px-4 py-3 text-sm h-12"></td>
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
          Coordinate siding, trim, soffit, and gutter colors. Confirm manufacturer warranty requirements and
          ventilation details with roofing and siding subs.
        </p>
      </div>
    </ScheduleLayout>
  );
};
