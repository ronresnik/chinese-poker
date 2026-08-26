import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout.jsx'
import Home from './pages/Home.jsx'
import LocalGame from './pages/LocalGame.jsx'
import OnlineGame from './pages/OnlineGame.jsx'
import Leaderboard from './pages/Leaderboard.jsx'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/local" element={<LocalGame />} />
        <Route path="/online/:roomId" element={<OnlineGame />} />
        <Route path="/leaderboard" element={<Leaderboard />} />
      </Route>
    </Routes>
  )
}
