import { useState } from 'react';
import { createHashRouter, RouterProvider } from 'react-router-dom';
import { ProjectProvider } from './context/ProjectContext';
import { WorkspaceProvider } from './context/WorkspaceContext';
import Layout from './components/layout/Layout';
import ProjectsPage from './pages/ProjectsPage';
import CollectionsPage from './pages/CollectionsPage';
import PostListPage from './pages/PostListPage';
import PostEditorPage from './pages/PostEditorPage';
import SingleEditorPage from './pages/SingleEditorPage';

// A data router so the editor can warn before leaving with unsaved changes
const routes = [
  {
    element: <Layout />,
    children: [
      { path: '/', element: <ProjectsPage /> },
      { path: '/:owner/:repo', element: <CollectionsPage /> },
      { path: '/:owner/:repo/single/:single', element: <SingleEditorPage /> },
      { path: '/:owner/:repo/:collection', element: <PostListPage /> },
      { path: '/:owner/:repo/:collection/new', element: <PostEditorPage /> },
      { path: '/:owner/:repo/:collection/edit/:slug', element: <PostEditorPage /> },
    ],
  },
];

export default function App() {
  // Created once per mount so it starts from the current URL hash
  const [router] = useState(() => createHashRouter(routes));
  return (
    <ProjectProvider>
      <WorkspaceProvider>
        <RouterProvider router={router} />
      </WorkspaceProvider>
    </ProjectProvider>
  );
}
