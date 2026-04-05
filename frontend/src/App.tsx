import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Home }            from "./pages/Home";
import { Game }            from "./pages/Game";
import { LeaderboardPage } from "./pages/LeaderboardPage";
import "./index.css";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/"                 element={<Home />} />
        <Route path="/game/:matchId"    element={<Game />} />
        <Route path="/leaderboard"      element={<LeaderboardPage />} />
        <Route path="*"                 element={<Home />} />
      </Routes>
    </BrowserRouter>
  );
}
