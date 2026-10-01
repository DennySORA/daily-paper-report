import { HashRouter, Route, Routes } from 'react-router'
import { ArchiveView } from '../views/ArchiveView'
import { DigestView } from '../views/DigestView'
import { NotFoundView } from '../views/NotFoundView'
import { ReportView, ReportsIndexView } from '../views/ReportViews'
import { SavedView } from '../views/SavedView'
import { SearchView } from '../views/SearchView'
import { SourcesView } from '../views/SourcesView'
import { Shell } from './Shell'

export function App() {
  return (
    <HashRouter>
      <Shell>
        <Routes>
          <Route index element={<DigestView />} />
          <Route path="day/:date" element={<DigestView />} />
          <Route path="archive" element={<ArchiveView />} />
          <Route path="reports" element={<ReportsIndexView />} />
          <Route path="weekly/:period" element={<ReportView type="weekly" />} />
          <Route path="monthly/:period" element={<ReportView type="monthly" />} />
          <Route path="search" element={<SearchView />} />
          <Route path="saved" element={<SavedView />} />
          <Route path="sources" element={<SourcesView />} />
          <Route path="*" element={<NotFoundView />} />
        </Routes>
      </Shell>
    </HashRouter>
  )
}
