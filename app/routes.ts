import { createBrowserRouter } from 'react-router';
import { Layout } from './components/Layout';
import { CoverPage } from './components/CoverPage';
import { InteriorPaintSchedule } from './pages/InteriorPaintSchedule';
import { ExteriorPaintSchedule } from './pages/ExteriorPaintSchedule';
import { FlooringSchedule } from './pages/FlooringSchedule';
import { TilingSchedule } from './pages/TilingSchedule';
import { LightingSchedule } from './pages/LightingSchedule';
import { CabinetrySchedule } from './pages/CabinetrySchedule';
import { CountertopsSchedule } from './pages/CountertopsSchedule';
import { PlumbingSchedule } from './pages/PlumbingSchedule';
import { DoorsWindowsSchedule } from './pages/DoorsWindowsSchedule';
import { AppliancesSchedule } from './pages/AppliancesSchedule';
import { OtherSelectionsSchedule } from './pages/OtherSelectionsSchedule';

export const router = createBrowserRouter([
  {
    path: '/',
    Component: Layout,
    children: [
      {
        index: true,
        Component: CoverPage,
      },
      {
        path: 'interior-paint',
        Component: InteriorPaintSchedule,
      },
      {
        path: 'exterior-finishes',
        Component: ExteriorPaintSchedule,
      },
      {
        path: 'flooring',
        Component: FlooringSchedule,
      },
      {
        path: 'tiling',
        Component: TilingSchedule,
      },
      {
        path: 'lighting',
        Component: LightingSchedule,
      },
      {
        path: 'cabinetry',
        Component: CabinetrySchedule,
      },
      {
        path: 'countertops',
        Component: CountertopsSchedule,
      },
      {
        path: 'plumbing',
        Component: PlumbingSchedule,
      },
      {
        path: 'doors-windows',
        Component: DoorsWindowsSchedule,
      },
      {
        path: 'appliances',
        Component: AppliancesSchedule,
      },
      {
        path: 'other',
        Component: OtherSelectionsSchedule,
      },
    ],
  },
]);