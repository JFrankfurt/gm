import './App.css'
import { Route, Routes } from 'react-router-dom'
import { HomePage } from './pages/HomePage'
import { WorkspacePage } from './pages/WorkspacePage'
import { SnapshotPage } from './pages/SnapshotPage'

function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/w/:workspaceId" element={<WorkspacePage />} />
      <Route path="/s/:payload" element={<SnapshotPage />} />
    </Routes>
  )
}

export default App
