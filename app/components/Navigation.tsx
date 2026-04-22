import React from 'react';
import { Link, useLocation } from 'react-router';
import { ChevronLeft, ChevronRight, Home, Menu } from 'lucide-react';

const schedulePages = [
  { path: '/', title: 'Cover', pageNum: 1 },
  { path: '/interior-paint', title: 'Interior Paint', pageNum: 2 },
  { path: '/exterior-finishes', title: 'Exterior Finishes', pageNum: 3 },
  { path: '/flooring', title: 'Flooring', pageNum: 4 },
  { path: '/tiling', title: 'Tiling', pageNum: 5 },
  { path: '/lighting', title: 'Lighting + Electrical', pageNum: 6 },
  { path: '/cabinetry', title: 'Cabinetry / Millwork', pageNum: 7 },
  { path: '/countertops', title: 'Countertops + Slab', pageNum: 8 },
  { path: '/plumbing', title: 'Plumbing Fixtures', pageNum: 9 },
  { path: '/doors-windows', title: 'Doors / Windows / Trim', pageNum: 10 },
  { path: '/appliances', title: 'Appliances', pageNum: 11 },
  { path: '/other', title: 'Other Selections', pageNum: 12 },
];

export const Navigation: React.FC = () => {
  const location = useLocation();
  const [isOpen, setIsOpen] = React.useState(false);

  const currentIndex = schedulePages.findIndex(page => page.path === location.pathname);
  const prevPage = currentIndex > 0 ? schedulePages[currentIndex - 1] : null;
  const nextPage = currentIndex < schedulePages.length - 1 ? schedulePages[currentIndex + 1] : null;

  return (
    <>
      {/* Fixed Navigation Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-300 shadow-lg z-50 print:hidden">
        <div className="max-w-[1400px] mx-auto px-6 py-3 flex items-center justify-between">
          {/* Previous Button */}
          {prevPage ? (
            <Link
              to={prevPage.path}
              className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-gray-100 rounded transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              <span className="hidden sm:inline">{prevPage.title}</span>
            </Link>
          ) : (
            <div className="w-24"></div>
          )}

          {/* Center Navigation */}
          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="p-2 hover:bg-gray-100 rounded transition-colors"
              title="Home"
            >
              <Home className="w-5 h-5" />
            </Link>
            
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="flex items-center gap-2 px-4 py-2 hover:bg-gray-100 rounded transition-colors"
            >
              <Menu className="w-5 h-5" />
              <span className="text-sm">
                Page {schedulePages[currentIndex]?.pageNum || 1} of {schedulePages.length}
              </span>
            </button>
          </div>

          {/* Next Button */}
          {nextPage ? (
            <Link
              to={nextPage.path}
              className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-gray-100 rounded transition-colors"
            >
              <span className="hidden sm:inline">{nextPage.title}</span>
              <ChevronRight className="w-4 h-4" />
            </Link>
          ) : (
            <div className="w-24"></div>
          )}
        </div>
      </div>

      {/* Navigation Menu Overlay */}
      {isOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/20 z-40 print:hidden"
            onClick={() => setIsOpen(false)}
          ></div>
          <div className="fixed bottom-20 left-1/2 -translate-x-1/2 bg-white border border-gray-300 rounded-lg shadow-xl z-50 w-96 max-h-96 overflow-y-auto print:hidden">
            <div className="p-4">
              <h3 className="font-semibold text-gray-900 mb-3">Document Pages</h3>
              <nav className="space-y-1">
                {schedulePages.map((page) => (
                  <Link
                    key={page.path}
                    to={page.path}
                    onClick={() => setIsOpen(false)}
                    className={`block px-3 py-2 text-sm rounded transition-colors ${
                      location.pathname === page.path
                        ? 'bg-gray-900 text-white'
                        : 'hover:bg-gray-100 text-gray-700'
                    }`}
                  >
                    <span className="font-medium">Page {page.pageNum}:</span> {page.title}
                  </Link>
                ))}
              </nav>
            </div>
          </div>
        </>
      )}
    </>
  );
};
