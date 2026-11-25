import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Home } from './pages/Home';
import { CreateMeeting } from './pages/CreateMeeting';
import { JoinMeeting } from './pages/JoinMeeting';
import { MeetingRoom } from './pages/MeetingRoom';
import { RequireCreateAccess } from './components/common/RequireCreateAccess';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route
          path="/create"
          element={
            <RequireCreateAccess>
              <CreateMeeting />
            </RequireCreateAccess>
          }
        />
        <Route path="/meeting/:roomId" element={<JoinMeeting />} />
        <Route path="/meeting/:roomId/live" element={<MeetingRoom />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
