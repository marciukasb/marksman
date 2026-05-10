import { HashRouter, Routes, Route } from 'react-router-dom';
import { ProjectProvider } from './context/ProjectContext';
import ProjectsPage from './pages/ProjectsPage';
import CollectionsPage from './pages/CollectionsPage';
import PostListPage from './pages/PostListPage';
import PostEditorPage from './pages/PostEditorPage';

export default function App() {
  return (
    <ProjectProvider>
      <HashRouter>
        <Routes>
          <Route path="/" element={<ProjectsPage />} />
          <Route path="/:owner/:repo" element={<CollectionsPage />} />
          <Route path="/:owner/:repo/:collection" element={<PostListPage />} />
          <Route path="/:owner/:repo/:collection/new" element={<PostEditorPage />} />
          <Route path="/:owner/:repo/:collection/edit/:slug" element={<PostEditorPage />} />
        </Routes>
      </HashRouter>
    </ProjectProvider>
  );
}
