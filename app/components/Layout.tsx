import { Outlet } from 'react-router';
import { Navigation } from './Navigation';
import { ProjectSettings } from './ProjectSettings';

export const Layout = () => {
  return (
    <>
      <Outlet />
      <Navigation />
      <ProjectSettings />
    </>
  );
};
